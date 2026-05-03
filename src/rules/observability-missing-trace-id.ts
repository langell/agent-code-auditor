import * as ts from "typescript";
import { AgentIssue } from "../scanners/types.js";
import { FixRecord, Rule } from "./types.js";

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
const TRACE_ID_REGEX = /traceId|runId|sessionId|correlationId/i;

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

export const observabilityMissingTraceIdRule: Rule = {
  id: "observability-missing-trace-id",
  appliesTo: "all",
  check(ctx) {
    const issues: AgentIssue[] = [];

    if (ctx.ast) {
      const sourceFile = ctx.ast;
      function visit(node: ts.Node) {
        if (looksLikeLlmAgentInit(node, sourceFile)) {
          const initText = node.getText(sourceFile);
          if (!TRACE_ID_REGEX.test(initText)) {
            const { line } = sourceFile.getLineAndCharacterOfPosition(
              node.getStart(),
            );
            issues.push({
              file: ctx.filePath,
              line: line + 1,
              message:
                "Agent initialization found without an explicit Trace ID or Run ID.",
              ruleId: "observability-missing-trace-id",
              severity: "warn",
              suggestion:
                "Ensure a traceId or runId is passed into the agent context for observability and debugging.",
              category: "Context",
              startPos: node.getStart(),
              endPos: node.getEnd(),
            });
          }
        }
        ts.forEachChild(node, visit);
      }
      visit(sourceFile);
    } else {
      // Non-AST fallback
      const content = ctx.content;
      if (/new Agent\(|Agent\.init/.test(content)) {
        if (!TRACE_ID_REGEX.test(content)) {
          issues.push({
            file: ctx.filePath,
            line: 1,
            message:
              "Agent initialization found without an explicit Trace ID or Run ID.",
            ruleId: "observability-missing-trace-id",
            severity: "warn",
            suggestion:
              "Ensure a traceId or runId is passed into the agent context for observability and debugging.",
            category: "Context",
          });
        }
      }
    }

    return issues;
  },
  applyFix(content, issues) {
    const fixes: FixRecord[] = [];
    const traceIssues = issues.filter(
      (i) => i.ruleId === "observability-missing-trace-id",
    );
    if (traceIssues.length === 0) {
      return { content, fixes };
    }

    let next = content;
    const astIssues = traceIssues.filter(
      (i) => i.startPos !== undefined && i.endPos !== undefined,
    );

    if (astIssues.length > 0) {
      astIssues.sort((a, b) => b.startPos! - a.startPos!);
      for (const issue of astIssues) {
        const nodeText = next.slice(issue.startPos!, issue.endPos!);

        // Find the first `{` inside the Agent initialization
        const blockStartIndex = nodeText.indexOf("{");
        if (blockStartIndex !== -1) {
          const injection = `{ traceId: "TODO: inject-trace-id", `;
          const replacedText =
            nodeText.slice(0, blockStartIndex) +
            injection +
            nodeText.slice(blockStartIndex + 1);

          if (replacedText !== nodeText) {
            next =
              next.slice(0, issue.startPos!) +
              replacedText +
              next.slice(issue.endPos!);
            fixes.push({
              fixed: true,
              ruleId: "observability-missing-trace-id",
              message: `Injected missing traceId exactly at offset ${issue.startPos}.`,
            });
          }
        } else {
          // If no object is passed, like `new Agent()`, inject it into the parenthesis
          const parenIndex = nodeText.indexOf("(");
          if (parenIndex !== -1) {
            const injection = `({ traceId: "TODO: inject-trace-id" }`;
            const replacedText =
              nodeText.slice(0, parenIndex) +
              injection +
              nodeText.slice(parenIndex + 1);
            if (replacedText !== nodeText) {
              next =
                next.slice(0, issue.startPos!) +
                replacedText +
                next.slice(issue.endPos!);
              fixes.push({
                fixed: true,
                ruleId: "observability-missing-trace-id",
                message: `Injected missing traceId exactly at offset ${issue.startPos}.`,
              });
            }
          }
        }
      }
    } else {
      const lines = next.split("\n");
      let modified = false;
      for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        if (
          (line.includes("new Agent({") || line.includes("Agent.init({")) &&
          !line.includes("traceId")
        ) {
          lines[i] = line.replace("{", '{ traceId: "TODO: inject-trace-id", ');
          modified = true;
          fixes.push({
            fixed: true,
            ruleId: "observability-missing-trace-id",
            message: `Injected missing traceId on line ${i + 1}.`,
          });
        }
      }
      if (modified) next = lines.join("\n");
    }

    return { content: next, fixes };
  },
};
