import * as ts from "typescript";
import { AgentIssue } from "../scanners/types.js";
import { Rule } from "./types.js";

const OVERSIZED_THRESHOLD = 5000;

export const contextOversizedRule: Rule = {
  id: "context-oversized",
  appliesTo: "all",
  check(ctx) {
    const issues: AgentIssue[] = [];

    if (ctx.ast) {
      const sourceFile = ctx.ast;
      function visit(node: ts.Node) {
        if (
          node.kind === ts.SyntaxKind.StringLiteral ||
          node.kind === ts.SyntaxKind.NoSubstitutionTemplateLiteral ||
          node.kind === ts.SyntaxKind.TemplateExpression
        ) {
          if (node.getText(sourceFile).length > OVERSIZED_THRESHOLD) {
            const { line } = sourceFile.getLineAndCharacterOfPosition(
              node.getStart(),
            );
            issues.push({
              file: ctx.filePath,
              line: line + 1,
              message:
                "Oversized hardcoded context or noisy string block detected.",
              ruleId: "context-oversized",
              severity: "warn",
              suggestion:
                "Extract large context blocks to separate documents and ensure relevance via RAG or strict filtering.",
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
      for (let i = 0; i < ctx.lines.length; i++) {
        const line = ctx.lines[i];
        if (
          line.length > OVERSIZED_THRESHOLD &&
          (line.includes("`") || line.includes('"') || line.includes("'"))
        ) {
          issues.push({
            file: ctx.filePath,
            line: i + 1,
            message:
              "Oversized hardcoded context or noisy string block detected.",
            ruleId: "context-oversized",
            severity: "warn",
            suggestion:
              "Extract large context blocks to separate documents and ensure relevance via RAG or strict filtering.",
            category: "Context",
          });
        }
      }
    }

    return issues;
  },
};
