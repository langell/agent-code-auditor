import * as ts from "typescript";
import { AgentLintConfig } from "../../config.js";
import { AgentIssue } from "../types.js";

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
    if (content.includes("fs.writeFileSync") || content.includes("child_process.exec")) {
      if (!content.includes("confirm") && !content.includes("approve")) {
        issues.push({
          file,
          line: 1,
          message: "Destructive action (file write/shell exec) without confirmation step.",
          ruleId: "security-destructive-action",
          severity: config.rules["security-destructive-action"] || "error",
          suggestion: "Require a human approval step or explicit boundaries before executing mutating commands.",
          category: "Execution Safety",
        });
      }
    }
  }

  // 4. Missing Input Validation (Server Actions / APIs)
  if (config.rules["security-input-validation"] !== "off") {
    if (file.includes("/api/") || file.includes("/actions/")) {
      let missingValidation = false;
      let issueNode: ts.Node | undefined;
      
      if (sourceFile) {
        function visit(node: ts.Node) {
          if (
            (ts.isFunctionDeclaration(node) && node.modifiers?.some((m) => m.kind === ts.SyntaxKind.ExportKeyword)) ||
            (ts.isVariableStatement(node) && node.modifiers?.some((m) => m.kind === ts.SyntaxKind.ExportKeyword))
          ) {
            const funcText = node.getText(sourceFile);
            // Ignore non-functions in exported variables roughly
            if (funcText.includes("function") || funcText.includes("=>")) {
              if (
                !funcText.includes(".parse(") &&
                !funcText.includes("z.object") &&
                !funcText.includes("validate(")
              ) {
                missingValidation = true;
                issueNode = node;
              }
            }
          }
          ts.forEachChild(node, visit);
        }
        visit(sourceFile);
      } else {
        if (content.includes("export async function") || content.includes("export function")) {
          if (!content.includes(".parse(") && !content.includes("z.object") && !content.includes("validate(")) {
            missingValidation = true;
          }
        }
      }

      if (missingValidation) {
        const line = issueNode ? sourceFile!.getLineAndCharacterOfPosition(issueNode.getStart()).line + 1 : 1;
        issues.push({
          file,
          line,
          message: "API route or Server Action appears to be missing input validation.",
          ruleId: "security-input-validation",
          severity: config.rules["security-input-validation"] || "error",
          suggestion: "Sanitize and validate all user inputs before processing. Use a schema validation library like Zod.",
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
          suggestion: "Remove hardcoded secrets and use environment variables or a secret manager.",
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
          message: "Potential prompt injection: unsanitized output used in prompt or execution.",
          ruleId: "security-prompt-injection",
          severity: config.rules["security-prompt-injection"] || "error",
          suggestion: "Implement strict boundaries between tool outputs and prompt instructions. Sanitize outputs.",
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
          suggestion: "Ensure user records or PII are redacted or minimized before passing to an agent context.",
          category: "Security",
        });
      }
    }
  }

  return issues;
}
