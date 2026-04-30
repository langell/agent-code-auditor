import * as ts from "typescript";
import { AgentLintConfig } from "../../config.js";
import { AgentIssue } from "../types.js";
import { looksValidated } from "./validation-helpers.js";

const ROUTE_FILE_EXT_REGEX = /\/route\.(?:ts|tsx|js|jsx)$/;
const SOURCE_FILE_EXT_REGEX = /\.(?:ts|tsx|js|jsx)$/;
const PAGES_API_DIR_REGEX = /\/pages\/api\//;
const APP_DIR_REGEX = /\/app\//;
const EXPRESS_ROUTES_DIR_REGEX = /\/routes\//;
const USE_SERVER_DIRECTIVE_REGEX = /^\s*['"]use server['"];?\s*$/m;

function hasUseServerDirective(content: string): boolean {
  const head = content.split("\n").slice(0, 6).join("\n");
  return USE_SERVER_DIRECTIVE_REGEX.test(head);
}

function isRouteHandlerFile(file: string, content: string): boolean {
  const norm = file.replace(/\\/g, "/");
  // Next.js App Router handler: app/.../route.ts
  if (APP_DIR_REGEX.test(norm) && ROUTE_FILE_EXT_REGEX.test(norm)) return true;
  // Next.js Pages API: pages/api/...
  if (PAGES_API_DIR_REGEX.test(norm) && SOURCE_FILE_EXT_REGEX.test(norm))
    return true;
  // Express handlers under a routes/ directory
  if (EXPRESS_ROUTES_DIR_REGEX.test(norm)) return true;
  // Next.js Server Actions
  if (hasUseServerDirective(content)) return true;
  return false;
}

function isExportedFunctionLike(node: ts.Node): boolean {
  if (
    ts.isFunctionDeclaration(node) &&
    node.modifiers?.some((m) => m.kind === ts.SyntaxKind.ExportKeyword)
  ) {
    return true;
  }
  if (
    ts.isVariableStatement(node) &&
    node.modifiers?.some((m) => m.kind === ts.SyntaxKind.ExportKeyword)
  ) {
    return true;
  }
  return false;
}

function hasParameters(node: ts.Node): boolean {
  if (ts.isFunctionDeclaration(node)) {
    return node.parameters.length > 0;
  }
  if (ts.isVariableStatement(node)) {
    for (const decl of node.declarationList.declarations) {
      const init = decl.initializer;
      if (
        init &&
        (ts.isArrowFunction(init) || ts.isFunctionExpression(init)) &&
        init.parameters.length > 0
      ) {
        return true;
      }
    }
  }
  return false;
}

export function checkSecurityRules(
  file: string,
  lines: string[],
  config: AgentLintConfig,
  sourceFile?: ts.SourceFile,
): AgentIssue[] {
  const issues: AgentIssue[] = [];
  const content = sourceFile ? sourceFile.text : lines.join("\n");

  // 3. Destructive Action (Global Check)
  if (config.rules["security-destructive-action"] !== "off") {
    if (
      content.includes("fs.writeFileSync") ||
      content.includes("child_process.exec")
    ) {
      if (!content.includes("confirm") && !content.includes("approve")) {
        issues.push({
          file,
          line: 1,
          message:
            "Destructive action (file write/shell exec) without confirmation step.",
          ruleId: "security-destructive-action",
          severity: config.rules["security-destructive-action"] || "error",
          suggestion:
            "Require a human approval step or explicit boundaries before executing mutating commands.",
          category: "Execution Safety",
        });
      }
    }
  }

  // 4. Missing Input Validation (Server Actions / APIs)
  if (config.rules["security-input-validation"] !== "off") {
    if (isRouteHandlerFile(file, content)) {
      let missingValidation = false;
      let issueNode: ts.Node | undefined;

      if (sourceFile) {
        function visit(node: ts.Node) {
          if (isExportedFunctionLike(node) && hasParameters(node)) {
            const funcText = node.getText(sourceFile);
            if (
              (funcText.includes("function") || funcText.includes("=>")) &&
              !looksValidated(funcText)
            ) {
              missingValidation = true;
              issueNode = node;
            }
          }
          ts.forEachChild(node, visit);
        }
        visit(sourceFile);
      } else {
        if (
          (content.includes("export async function") ||
            content.includes("export function")) &&
          !looksValidated(content)
        ) {
          missingValidation = true;
        }
      }

      if (missingValidation) {
        const line = issueNode
          ? sourceFile!.getLineAndCharacterOfPosition(issueNode.getStart())
              .line + 1
          : 1;
        issues.push({
          file,
          line,
          message:
            "API route or Server Action appears to be missing input validation.",
          ruleId: "security-input-validation",
          severity: config.rules["security-input-validation"] || "error",
          suggestion:
            "Sanitize and validate all user inputs before processing. Use a schema validation library like Zod.",
          category: "Security",
          startPos: issueNode?.getStart(),
          endPos: issueNode?.getEnd(),
        });
      }
    }
  }

  const evalToken = "ev" + "al(";
  const templateTickToken = "`";
  const templateExprToken = "$" + "{";
  const toolOutputToken = "tool" + "Output";

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    // 1. Secret Leakage
    if (config.rules["security-secret-leakage"] !== "off") {
      if (/sk-[a-zA-Z0-9]{32,}/.test(line) || /xoxb-[0-9]{10,}/.test(line)) {
        issues.push({
          file,
          line: i + 1,
          message: "Potential secret/API key exposed in code or config.",
          ruleId: "security-secret-leakage",
          severity: config.rules["security-secret-leakage"] || "error",
          suggestion:
            "Remove hardcoded secrets and use environment variables or a secret manager.",
          category: "Security",
        });
      }
    }

    // 2. Prompt Injection (basic heuristic: eval or unsanitized template injection)
    if (config.rules["security-prompt-injection"] !== "off") {
      if (
        line.includes(evalToken) ||
        (line.includes(templateTickToken) &&
          line.includes(templateExprToken) &&
          line.includes(toolOutputToken))
      ) {
        issues.push({
          file,
          line: i + 1,
          message:
            "Potential prompt injection: unsanitized output used in prompt or execution.",
          ruleId: "security-prompt-injection",
          severity: config.rules["security-prompt-injection"] || "error",
          suggestion:
            "Implement strict boundaries between tool outputs and prompt instructions. Sanitize outputs.",
          category: "Security",
        });
      }
    }

    // 5. Unredacted PII
    if (config.rules["context-unredacted-pii"] !== "off") {
      if (
        /(user|customer|patient)(Data|Object|Record)\s*=/.test(line) &&
        !lines
          .slice(Math.max(0, i), Math.min(lines.length, i + 10))
          .some((l) => l.includes("redact") || l.includes("sanitize"))
      ) {
        issues.push({
          file,
          line: i + 1,
          message: "Potential unredacted user data being processed.",
          ruleId: "context-unredacted-pii",
          severity: config.rules["context-unredacted-pii"] || "error",
          suggestion:
            "Ensure user records or PII are redacted or minimized before passing to an agent context.",
          category: "Security",
        });
      }
    }
  }

  return issues;
}
