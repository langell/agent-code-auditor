import * as ts from "typescript";
import { AgentLintConfig } from "../../config.js";
import { AgentIssue } from "../types.js";

const AGENT_CTOR_NAME_REGEX = /(?:^|\.)(?:Agent|createAgent|AgentExecutor)$/;
const AGENT_INIT_NAME_REGEX = /(?:^|\.)Agent\.init$/;
const AGENT_SHAPE_PROPS = new Set([
  "tools",
  "model",
  "instructions",
  "systemPrompt",
  "system_prompt",
  "tasks",
]);

function objectHasAgentShape(obj: ts.ObjectLiteralExpression): boolean {
  for (const prop of obj.properties) {
    if (
      ts.isPropertyAssignment(prop) &&
      prop.name &&
      ts.isIdentifier(prop.name) &&
      AGENT_SHAPE_PROPS.has(prop.name.text)
    ) {
      return true;
    }
  }
  return false;
}

function looksLikeLlmAgentInit(
  node: ts.Node,
  sourceFile: ts.SourceFile,
): boolean {
  let exprText: string;
  let args: ts.NodeArray<ts.Expression> | undefined;

  if (ts.isNewExpression(node)) {
    exprText = node.expression.getText(sourceFile);
    args = node.arguments;
  } else if (ts.isCallExpression(node)) {
    exprText = node.expression.getText(sourceFile);
    args = node.arguments;
  } else {
    return false;
  }

  const nameMatch =
    AGENT_CTOR_NAME_REGEX.test(exprText) ||
    AGENT_INIT_NAME_REGEX.test(exprText);
  if (!nameMatch) return false;

  // Require an LLM-agent-shaped property so domain "Agent" classes don't trip the rule
  if (!args || args.length === 0) return false;
  const firstArg = args[0];
  if (!ts.isObjectLiteralExpression(firstArg)) return false;
  return objectHasAgentShape(firstArg);
}

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
            const { line } = sourceFile!.getLineAndCharacterOfPosition(
              node.getStart(),
            );
            issues.push({
              file,
              line: line + 1,
              message:
                "Oversized hardcoded context or noisy string block detected.",
              ruleId: "context-oversized",
              severity: config.rules["context-oversized"] || "warn",
              suggestion:
                "Extract large context blocks to separate documents and ensure relevance via RAG or strict filtering.",
              category: "Context",
              startPos: node.getStart(),
              endPos: node.getEnd(),
            });
          }
        }
      }

      if (config.rules["observability-missing-trace-id"] !== "off") {
        const isAgentInit = looksLikeLlmAgentInit(node, sourceFile!);

        if (isAgentInit) {
          const initText = node.getText(sourceFile);
          if (!/traceId|runId|sessionId|correlationId/i.test(initText)) {
            const { line } = sourceFile!.getLineAndCharacterOfPosition(
              node.getStart(),
            );
            issues.push({
              file,
              line: line + 1,
              message:
                "Agent initialization found without an explicit Trace ID or Run ID.",
              ruleId: "observability-missing-trace-id",
              severity:
                config.rules["observability-missing-trace-id"] || "warn",
              suggestion:
                "Ensure a traceId or runId is passed into the agent context for observability and debugging.",
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
            message:
              "Oversized hardcoded context or noisy string block detected.",
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
