import * as fs from "fs";
import * as path from "path";
import { glob } from "glob";
import * as ts from "typescript";
import { AgentLintConfig } from "../config.js";
import { AgentIssue, ToolDeclaration } from "./types.js";

import { checkSpecRules } from "./rules/spec-lint.js";
import { checkContextRules } from "./rules/context-lint.js";
import { checkToolRules } from "./rules/tool-lint.js";
import { checkExecutionRules } from "./rules/execution-lint.js";
import { checkSecurityRules } from "./rules/security-lint.js";
import { checkCodeQualityRules } from "./rules/code-quality-lint.js";
import { checkVerificationRules } from "./rules/verification-lint.js";

function extractCommentText(line: string): string | null {
  const trimmed = line.trim();

  if (trimmed.startsWith("*")) {
    return trimmed.slice(1).trim();
  }

  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    const previousChar = i > 0 ? line[i - 1] : "";

    if (char === '"' || char === "'" || char === "`") {
      let j = i + 1;

      while (j < line.length) {
        if (line[j] === char && line[j - 1] !== "\\") {
          i = j;
          break;
        }

        j += 1;
      }

      continue;
    }

    if (char === "/" && line[i + 1] === "/" && previousChar !== ":") {
      return line.slice(i + 2).trim();
    }

    if (char === "/" && line[i + 1] === "*") {
      return line
        .slice(i + 2)
        .replace(/\*\/\s*$/, "")
        .trim();
    }

    if (line.startsWith("<!--", i)) {
      return line
        .slice(i + 4)
        .replace(/-->\s*$/, "")
        .trim();
    }
  }

  return null;
}

function isPlaceholderComment(line: string): boolean {
  const commentText = extractCommentText(line);

  if (!commentText) {
    return false;
  }

  const placeholderPatterns = [
    /\bTODO\b[:\s-]*(?:implement|complete|finish|fill\s+in|write\s+the\s+implementation|replace\s+with\s+actual)\b/i,
    /\b(?:implement|insert|add|fill\s+in|replace\s+with\s+actual|write)\b.{0,100}?\b(?:here|code|logic|implementation)\b/i,
    /\byour\s+code\s+here\b/i,
    /\bplaceholder\b/i,
    /\[(?:[^\]]*\b(?:insert|implement|fill\s+in|placeholder|your\s+code|add\s+logic)\b[^\]]*)\]/i,
  ];

  return placeholderPatterns.some((pattern) => pattern.test(commentText));
}

export async function runASTAnalyzer(
  dir: string,
  config: AgentLintConfig,
): Promise<AgentIssue[]> {
  const issues: AgentIssue[] = [];
  const unsafeRenderApi = "dangerouslySet" + "InnerHTML";
  const hallucinatedImportMarker =
    "import * as unknown from " + "'non-existent-lib'";

  const files = await glob("**/*.{js,ts,jsx,tsx,md,prompt}", {
    cwd: dir,
    ignore: ["node_modules/**", "dist/**"],
  });

  const globalTools: ToolDeclaration[] = [];

  for (const file of files) {
    const fullPath = path.join(dir, file);
    const content = fs.readFileSync(fullPath, "utf8");
    const lines = content.split("\n");

    let sourceFile: ts.SourceFile | undefined;
    if (
      file.endsWith(".ts") ||
      file.endsWith(".tsx") ||
      file.endsWith(".js") ||
      file.endsWith(".jsx")
    ) {
      sourceFile = ts.createSourceFile(
        file,
        content,
        ts.ScriptTarget.Latest,
        true,
      );
    }

    const isSourceFile =
      file.endsWith(".ts") ||
      file.endsWith(".tsx") ||
      file.endsWith(".js") ||
      file.endsWith(".jsx") ||
      file.endsWith(".mts") ||
      file.endsWith(".cts") ||
      file.endsWith(".mjs") ||
      file.endsWith(".cjs");

    // Spec, context, and security rules apply to both source and prose files
    // (e.g. secret leakage and prompt injection still matter in .md/.prompt).
    issues.push(...checkSpecRules(file, lines, config, sourceFile));
    issues.push(...checkContextRules(file, lines, config, sourceFile));
    issues.push(...checkSecurityRules(file, lines, config, sourceFile));

    // The remaining rule families are source-file-specific.
    if (isSourceFile) {
      issues.push(
        ...checkToolRules(file, lines, config, sourceFile, globalTools),
      );
      issues.push(...checkExecutionRules(file, lines, config, sourceFile));
      issues.push(...checkCodeQualityRules(file, lines, config, sourceFile));
      issues.push(...checkVerificationRules(file, lines, config, dir));
    }

    // Keep the original 3 rules for backward compatibility in the General/Tool categories
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];

      if (config.rules["no-placeholder-comments"] !== "off") {
        if (isPlaceholderComment(line)) {
          issues.push({
            file,
            line: i + 1,
            message: "Found AI placeholder indicating unwritten code.",
            ruleId: "no-placeholder-comments",
            severity: config.rules["no-placeholder-comments"] || "error",
            suggestion:
              "Replace this placeholder comment with the actual implementation.",
            category: "Spec",
          });
        }
      }

      if (config.rules["no-insecure-renders"] !== "off") {
        if (line.includes(unsafeRenderApi)) {
          issues.push({
            file,
            line: i + 1,
            message: "Insecure rendering method found (unsafe HTML API).",
            ruleId: "no-insecure-renders",
            severity: config.rules["no-insecure-renders"] || "error",
            suggestion:
              "Use a safer alternative like DOMPurify to sanitize the HTML before rendering, or avoid direct unsafe HTML rendering APIs.",
            category: "Security",
          });
        }
      }

      if (config.rules["no-hallucinated-imports"] !== "off") {
        if (line.includes(hallucinatedImportMarker)) {
          issues.push({
            file,
            line: i + 1,
            message: "Hallucinated library import detected.",
            ruleId: "no-hallucinated-imports",
            severity: config.rules["no-hallucinated-imports"] || "error",
            suggestion:
              "Verify the library exists in your package.json and the import path is correct.",
            category: "Execution",
          });
        }
      }
    }
  }

  if (config.rules["tool-overlapping"] !== "off") {
    const seenTools = new Map<string, string>();
    for (const tool of globalTools) {
      if (seenTools.has(tool.name)) {
        issues.push({
          file: tool.file,
          line: tool.line,
          message: `Tool '${tool.name}' overlaps with a tool defined in ${seenTools.get(tool.name)}.`,
          ruleId: "tool-overlapping",
          severity: config.rules["tool-overlapping"] || "error",
          suggestion:
            "Ensure each tool has a distinct name and purpose across the workspace.",
          category: "Tool",
        });
      } else {
        seenTools.set(tool.name, tool.file);
      }
    }
  }

  return issues;
}
