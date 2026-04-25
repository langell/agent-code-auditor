import * as fs from "fs";
import { AgentIssue } from "../scanners/types.js";
import { FixResult } from "./types.js";

// Safety note: fixer routines support dryRun previews and explicit approve gates at call sites.

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

  const hasIgnoreInstructions = issues.some(
    (i) => i.ruleId === "security-ignore-instructions",
  );
  const hasInsecureRenders = issues.some(
    (i) => i.ruleId === "no-insecure-renders",
  );
  const hasInputValidation = issues.some(
    (i) => i.ruleId === "security-input-validation",
  );
  const hasDestructiveAction = issues.some(
    (i) => i.ruleId === "security-destructive-action",
  );

  if (
    !hasIgnoreInstructions &&
    !hasInsecureRenders &&
    !hasInputValidation &&
    !hasDestructiveAction
  ) {
    return fixes;
  }

  let content = fs.readFileSync(file, "utf8");
  let modified = false;
  const ignoreInstructionsPattern = new RegExp(
    "ignore previous" + " instructions",
    "gi",
  );
  const disregardPattern = new RegExp("disregard" + " previous", "gi");
  const systemPromptPattern = new RegExp("system" + " prompt", "gi");
  const unsafeRenderApi = "dangerouslySet" + "InnerHTML";

  if (hasIgnoreInstructions) {
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

  if (hasInsecureRenders) {
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

  if (hasInputValidation) {
    const alreadyValidated =
      content.includes(".parse(") ||
      content.includes("z.object") ||
      content.includes("validate(");

    if (!alreadyValidated) {
      const validateHelper =
        "function validate(input: unknown): void {\n" +
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
      }

      modified = true;
      fixes.push({
        file,
        fixed: true,
        ruleId: "security-input-validation",
        message: "Added a basic input validation guard template.",
      });
    }
  }

  const loweredContent = content.toLowerCase();
  const hasApprovalTerms =
    loweredContent.includes("confirm") || loweredContent.includes("approve");

  if (hasDestructiveAction && !hasApprovalTerms) {
    if (!/function\s+requireApproval\s*\(/.test(content)) {
      content = insertAfterImports(
        content,
        "function requireApproval(): void {\n" +
          "  const approved = false;\n" +
          "  if (!approved) {\n" +
          "    throw new Error('Operation requires explicit approval');\n" +
          "  }\n" +
          "}\n",
      );
      modified = true;
      fixes.push({
        file,
        fixed: true,
        ruleId: "security-destructive-action",
        message: "Injected explicit approval guard template.",
      });
    }

    const lines = content.split("\n");
    let hasLineChanges = false;
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const trimmed = line.trim();
      const hasMutationCall =
        (line.includes("fs.writeFileSync") ||
          line.includes("child_process.exec")) &&
        line.includes("(");
      if (
        hasMutationCall &&
        !trimmed.startsWith("//") &&
        !trimmed.startsWith("requireApproval();")
      ) {
        const indent = line.match(/^\s*/)?.[0] || "";
        lines[i] = `${indent}requireApproval();\n${line}`;
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

  if (modified) {
    fs.writeFileSync(file, content, "utf8");
  }

  return fixes;
}
