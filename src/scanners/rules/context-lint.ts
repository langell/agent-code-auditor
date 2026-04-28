import * as ts from "typescript";
import { AgentLintConfig } from "../../config.js";
import { AgentIssue } from "../types.js";

export function checkContextRules(
  file: string,
  lines: string[],
  config: AgentLintConfig,
  sourceFile?: ts.SourceFile,
): AgentIssue[] {
  const issues: AgentIssue[] = [];

  if (sourceFile) {
    function visit(node: ts.Node) {
      if (config.rules["context-oversized"] !== "off") {
        if (
          node.kind === ts.SyntaxKind.StringLiteral ||
          node.kind === ts.SyntaxKind.NoSubstitutionTemplateLiteral ||
          node.kind === ts.SyntaxKind.TemplateExpression
        ) {
          if (node.getText(sourceFile).length > 5000) {
            const { line } = sourceFile!.getLineAndCharacterOfPosition(node.getStart());
            issues.push({
              file,
              line: line + 1,
              message: "Oversized hardcoded context or noisy string block detected.",
              ruleId: "context-oversized",
              severity: config.rules["context-oversized"] || "warn",
              suggestion: "Extract large context blocks to separate documents and ensure relevance via RAG or strict filtering.",
              category: "Context",
              startPos: node.getStart(),
              endPos: node.getEnd(),
            });
          }
        }
      }

      if (config.rules["observability-missing-trace-id"] !== "off") {
        let isAgentInit = false;
        
        if (node.kind === ts.SyntaxKind.NewExpression) {
          const expr = node as ts.NewExpression;
          if (expr.expression.getText(sourceFile) === "Agent") {
            isAgentInit = true;
          }
        } else if (node.kind === ts.SyntaxKind.CallExpression) {
          const expr = node as ts.CallExpression;
          if (expr.expression.getText(sourceFile) === "Agent.init") {
            isAgentInit = true;
          }
        }

        if (isAgentInit) {
          const initText = node.getText(sourceFile);
          if (!/traceId|runId|sessionId|correlationId/i.test(initText)) {
            const { line } = sourceFile!.getLineAndCharacterOfPosition(node.getStart());
            issues.push({
              file,
              line: line + 1,
              message: "Agent initialization found without an explicit Trace ID or Run ID.",
              ruleId: "observability-missing-trace-id",
              severity: config.rules["observability-missing-trace-id"] || "warn",
              suggestion: "Ensure a traceId or runId is passed into the agent context for observability and debugging.",
              category: "Context",
              startPos: node.getStart(),
              endPos: node.getEnd(),
            });
          }
        }
      }

      ts.forEachChild(node, visit);
    }
    visit(sourceFile);
  } else {
    // Non-AST fallback
    if (config.rules["context-oversized"] !== "off") {
      for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        if (
          line.length > 5000 &&
          (line.includes("`") || line.includes('"') || line.includes("'"))
        ) {
          issues.push({
            file,
            line: i + 1,
            message: "Oversized hardcoded context or noisy string block detected.",
            ruleId: "context-oversized",
            severity: config.rules["context-oversized"] || "warn",
            suggestion:
              "Extract large context blocks to separate documents and ensure relevance via RAG or strict filtering.",
            category: "Context",
          });
        }
      }
    }

    if (config.rules["observability-missing-trace-id"] !== "off") {
      const content = lines.join("\n");
      if (/new Agent\(|Agent\.init/.test(content)) {
        if (!/traceId|runId|sessionId|correlationId/i.test(content)) {
          issues.push({
            file,
            line: 1,
            message:
              "Agent initialization found without an explicit Trace ID or Run ID.",
            ruleId: "observability-missing-trace-id",
            severity: config.rules["observability-missing-trace-id"] || "warn",
            suggestion:
              "Ensure a traceId or runId is passed into the agent context for observability and debugging.",
            category: "Context",
          });
        }
      }
    }
  }

  return issues;
}
