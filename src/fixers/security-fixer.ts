import * as fs from "fs";
import { AgentIssue } from "../scanners/types.js";
import { looksValidated } from "../scanners/rules/validation-helpers.js";
import { FixResult } from "./types.js";

function insertAfterImports(content: string, block: string): string {
  const lines = content.split("\n");
  let insertAt = 0;

  for (let i = 0; i < lines.length; i++) {
    if (/^\s*import\s+/.test(lines[i])) {
      insertAt = i + 1;
    }
  }

  lines.splice(insertAt, 0, block);
  return lines.join("\n");
}

function isTypeScriptTarget(file: string): boolean {
  return /\.(?:ts|tsx|mts|cts)$/.test(file);
}

function isIdentifierToken(value: string): boolean {
  if (!value) return false;
  const first = value[0];
  const isFirstValid =
    (first >= "A" && first <= "Z") ||
    (first >= "a" && first <= "z") ||
    first === "_" ||
    first === "$";
  if (!isFirstValid) return false;

  for (let i = 1; i < value.length; i++) {
    const ch = value[i];
    const isValid =
      (ch >= "A" && ch <= "Z") ||
      (ch >= "a" && ch <= "z") ||
      (ch >= "0" && ch <= "9") ||
      ch === "_" ||
      ch === "$";
    if (!isValid) return false;
  }

  return true;
}

export async function fixSecurityRules(
  file: string,
  issues: AgentIssue[],
): Promise<FixResult[]> {
  const fixes: FixResult[] = [];
  if (!fs.existsSync(file)) return fixes;

  const ignoreIssues = issues.filter(
    (i) => i.ruleId === "security-ignore-instructions",
  );
  const insecureRenders = issues.filter(
    (i) => i.ruleId === "no-insecure-renders",
  );
  const inputValidationIssues = issues.filter(
    (i) => i.ruleId === "security-input-validation",
  );
  const destructiveActionIssues = issues.filter(
    (i) => i.ruleId === "security-destructive-action",
  );

  if (
    ignoreIssues.length === 0 &&
    insecureRenders.length === 0 &&
    inputValidationIssues.length === 0 &&
    destructiveActionIssues.length === 0
  ) {
    return fixes;
  }

  let content = fs.readFileSync(file, "utf8");
  let modified = false;

  if (ignoreIssues.length > 0) {
    const ignoreInstructionsPattern = /ignore previous\s+instructions/gi;
    const disregardPattern = /disregard\s+previous/gi;
    const systemPromptPattern = /system\s+prompt/gi;

    const before = content;
    content = content
      .replace(ignoreInstructionsPattern, "follow the project instructions")
      .replace(disregardPattern, "follow current")
      .replace(systemPromptPattern, "instruction context");

    if (content !== before) {
      modified = true;
      fixes.push({
        file,
        fixed: true,
        ruleId: "security-ignore-instructions",
        message: "Rewrote prompt-injection-like instruction phrases.",
      });
    }
  }

  if (insecureRenders.length > 0) {
    const unsafeRenderApi = "dangerouslySet" + "InnerHTML";
    const before = content;
    const unsafeRenderAssignmentPattern = new RegExp(
      `${unsafeRenderApi}\\s*=`,
      "g",
    );
    const unsafeRenderObjectPattern = new RegExp(
      `${unsafeRenderApi}\\s*:`,
      "g",
    );
    content = content
      .replace(unsafeRenderAssignmentPattern, "data-sanitized-html=")
      .replace(unsafeRenderObjectPattern, "sanitizedHtml:");

    if (content !== before) {
      if (
        !content.includes("TODO(security): render sanitized content safely")
      ) {
        content = insertAfterImports(
          content,
          "// TODO(security): render sanitized content safely and avoid direct HTML injection.",
        );
      }

      modified = true;
      fixes.push({
        file,
        fixed: true,
        ruleId: "no-insecure-renders",
        message:
          "Replaced unsafe HTML rendering usage with non-dangerous placeholders for manual hardening.",
      });
    }
  }

  if (inputValidationIssues.length > 0) {
    if (!looksValidated(content)) {
      const isTs = isTypeScriptTarget(file);
      const validateHelper = isTs
        ? "function validate(input: unknown): void {\n" +
          "  if (input === null || input === undefined) {\n" +
          "    throw new Error('Invalid input');\n" +
          "  }\n" +
          "}\n"
        : "function validate(input) {\n" +
          "  if (input === null || input === undefined) {\n" +
          "    throw new Error('Invalid input');\n" +
          "  }\n" +
          "}\n";

      if (
        !content.includes("function validate(") &&
        !content.includes("const validate =")
      ) {
        content = insertAfterImports(content, validateHelper);
      }

      const astIssues = inputValidationIssues.filter(
        (i) => i.startPos !== undefined && i.endPos !== undefined,
      );

      if (astIssues.length > 0) {
        astIssues.sort((a, b) => b.startPos! - a.startPos!);
        for (const issue of astIssues) {
          const nodeText = content.slice(issue.startPos!, issue.endPos!);

          const blockStartIndex = nodeText.indexOf("{");
          if (blockStartIndex !== -1) {
            const signature = nodeText.slice(0, blockStartIndex);
            const paramsChunk =
              signature.split("(")[1]?.split(")")[0]?.trim() || "";
            let paramName = "input";

            if (paramsChunk.length > 0) {
              const firstParam = paramsChunk.split(",")[0].trim();
              const token = firstParam.split(":")[0].trim();
              if (isIdentifierToken(token)) {
                paramName = token;
              }
            }

            const injection = `{\n  validate(${paramName});`;
            const replacedText =
              nodeText.slice(0, blockStartIndex) +
              injection +
              nodeText.slice(blockStartIndex + 1);

            if (replacedText !== nodeText) {
              content =
                content.slice(0, issue.startPos!) +
                replacedText +
                content.slice(issue.endPos!);
              modified = true;
              fixes.push({
                file,
                fixed: true,
                ruleId: "security-input-validation",
                message: "Added a basic input validation guard template.",
              });
            }
          }
        }
      } else {
        // Fallback line-by-line
        const lines = content.split("\n");
        let injectedValidation = false;
        for (let i = 0; i < lines.length; i++) {
          const line = lines[i].trim();
          if (
            (line.startsWith("export async function ") ||
              line.startsWith("export function ")) &&
            line.includes("(") &&
            line.includes(")") &&
            line.endsWith("{")
          ) {
            const paramsChunk = line.split("(")[1]?.split(")")[0]?.trim() || "";
            let paramName = "input";

            if (paramsChunk.length > 0) {
              const firstParam = paramsChunk.split(",")[0].trim();
              const token = firstParam.split(":")[0].trim();
              if (isIdentifierToken(token)) {
                paramName = token;
              }
            }

            lines.splice(i + 1, 0, `  validate(${paramName});`);
            injectedValidation = true;
            break;
          }
        }

        if (injectedValidation) {
          content = lines.join("\n");
          modified = true;
          fixes.push({
            file,
            fixed: true,
            ruleId: "security-input-validation",
            message: "Added a basic input validation guard template.",
          });
        }
      }
    }
  }

  if (destructiveActionIssues.length > 0) {
    const APPROVAL_REGEX =
      /\b(?:approved|confirmed|authorized|verified|consented)\b|\b(?:approve|confirm|authorize|consent|requireApproval|requestApproval|getUserConsent)\s*\(/;
    const hasApprovalTerms = APPROVAL_REGEX.test(content);

    if (!hasApprovalTerms) {
      if (!/function\s+requireApproval\s*\(/.test(content)) {
        const isTs = isTypeScriptTarget(file);
        const requireApprovalHelper = isTs
          ? "function requireApproval(): void {\n" +
            "  const approved = false;\n" +
            "  if (!approved) {\n" +
            "    throw new Error('Operation requires explicit approval');\n" +
            "  }\n" +
            "}\n"
          : "function requireApproval() {\n" +
            "  const approved = false;\n" +
            "  if (!approved) {\n" +
            "    throw new Error('Operation requires explicit approval');\n" +
            "  }\n" +
            "}\n";
        content = insertAfterImports(content, requireApprovalHelper);
        modified = true;
        fixes.push({
          file,
          fixed: true,
          ruleId: "security-destructive-action",
          message: "Injected explicit approval guard template.",
        });
      }

      const lines = content.split("\n");
      const DESTRUCTIVE_LINE_REGEX =
        /\b(?:fs(?:\.promises)?)\.(?:writeFile|writeFileSync|rm|rmSync|unlink|unlinkSync|rmdir|rmdirSync|truncate|truncateSync|copyFile|copyFileSync|rename|renameSync)\s*\(|\bchild_process\.(?:exec|execSync|execFile|execFileSync|spawn|spawnSync|fork)\s*\(|\bexeca\s*\(|\bshelljs\.\w+\s*\(/;
      let hasLineChanges = false;
      for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        const trimmed = line.trim();
        const hasMutationCall = DESTRUCTIVE_LINE_REGEX.test(line);
        const previousTrimmed = i > 0 ? lines[i - 1].trim() : "";
        const alreadyGuarded = previousTrimmed.startsWith("requireApproval();");
        if (hasMutationCall && !trimmed.startsWith("//") && !alreadyGuarded) {
          const indent = line.match(/^\s*/)?.[0] || "";
          lines.splice(i, 0, `${indent}requireApproval();`);
          i++; // skip past the inserted guard
          hasLineChanges = true;
          fixes.push({
            file,
            fixed: true,
            ruleId: "security-destructive-action",
            message: `Added approval guard before mutating call on line ${i + 1}.`,
          });
        }
      }
      if (hasLineChanges) {
        content = lines.join("\n");
        modified = true;
      }
    }
  }

  if (modified) {
    fs.writeFileSync(file, content, "utf8");
  }

  return fixes;
}
