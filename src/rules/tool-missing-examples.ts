import * as ts from "typescript";
import { AgentIssue } from "../scanners/types.js";
import { FixRecord, Rule } from "./types.js";

const OBJECT_TYPE_PATTERN = /type:\s*["']object["']/;

export const toolMissingExamplesRule: Rule = {
  id: "tool-missing-examples",
  appliesTo: "source",
  check(ctx) {
    const issues: AgentIssue[] = [];

    if (ctx.ast) {
      const sourceFile = ctx.ast;
      function visit(node: ts.Node) {
        if (ts.isObjectLiteralExpression(node)) {
          let hasTypeObject = false;
          let hasExamples = false;

          for (const prop of node.properties) {
            if (
              ts.isPropertyAssignment(prop) &&
              prop.name &&
              ts.isIdentifier(prop.name)
            ) {
              const propName = prop.name.text;
              if (
                propName === "type" &&
                ts.isStringLiteral(prop.initializer) &&
                prop.initializer.text === "object"
              ) {
                hasTypeObject = true;
              }
              if (propName === "examples") {
                hasExamples = true;
              }
            }
          }

          if (hasTypeObject && !hasExamples) {
            const { line } = sourceFile.getLineAndCharacterOfPosition(
              node.getStart(),
            );
            issues.push({
              file: ctx.filePath,
              line: line + 1,
              message: "Tool object missing examples.",
              ruleId: "tool-missing-examples",
              severity: "warn",
              suggestion:
                "Provide examples of valid and invalid tool calls to improve agent reliability.",
              category: "Tool",
              startPos: node.getStart(),
              endPos: node.getEnd(),
            });
          }
        }
        ts.forEachChild(node, visit);
      }
      visit(sourceFile);
    } else {
      for (let i = 0; i < ctx.lines.length; i++) {
        const line = ctx.lines[i];
        if (
          OBJECT_TYPE_PATTERN.test(line) &&
          !ctx.lines
            .slice(Math.max(0, i - 10), Math.min(ctx.lines.length, i + 15))
            .some((l) => l.includes("examples"))
        ) {
          issues.push({
            file: ctx.filePath,
            line: i + 1,
            message: "Tool object missing examples.",
            ruleId: "tool-missing-examples",
            severity: "warn",
            suggestion:
              "Provide examples of valid and invalid tool calls to improve agent reliability.",
            category: "Tool",
          });
        }
      }
    }

    return issues;
  },
  applyFix(content, issues) {
    const fixes: FixRecord[] = [];
    const exampleIssues = issues.filter(
      (i) => i.ruleId === "tool-missing-examples",
    );
    if (exampleIssues.length === 0) {
      return { content, fixes };
    }

    const lines = content.split("\n");
    let modified = false;

    for (const issue of exampleIssues) {
      const startIdx = Math.max(0, issue.line - 1);
      const endIdx = Math.min(lines.length, startIdx + 5);

      for (let j = startIdx; j < endIdx; j++) {
        const line = lines[j];
        if (OBJECT_TYPE_PATTERN.test(line)) {
          lines[j] =
            line + ' examples: ["TBD: valid example", "TBD: invalid example"],';
          modified = true;
          fixes.push({
            fixed: true,
            ruleId: issue.ruleId,
            message: `Injected missing examples template on line ${j + 1}.`,
          });
          break; // Only fix the first one near the issue
        }
      }
    }

    return { content: modified ? lines.join("\n") : content, fixes };
  },
};
