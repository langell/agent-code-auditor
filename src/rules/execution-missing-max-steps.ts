import * as ts from "typescript";
import { AgentIssue } from "../scanners/types.js";
import { FixRecord, Rule } from "./types.js";

const MAX_STEPS_PATTERN = /\b(?:maxSteps|maxIterations)\b/;
const DEFAULT_MAX_STEPS = 100;

export const executionMissingMaxStepsRule: Rule = {
  id: "execution-missing-max-steps",
  appliesTo: "source",
  check(ctx) {
    const issues: AgentIssue[] = [];

    if (ctx.ast) {
      const sourceFile = ctx.ast;
      const whileTrueNodes: ts.WhileStatement[] = [];

      function visit(node: ts.Node) {
        if (node.kind === ts.SyntaxKind.WhileStatement) {
          const whileStmt = node as ts.WhileStatement;
          if (whileStmt.expression.kind === ts.SyntaxKind.TrueKeyword) {
            whileTrueNodes.push(whileStmt);
          }
        }
        ts.forEachChild(node, visit);
      }
      visit(sourceFile);

      for (const node of whileTrueNodes) {
        const bodyText = node.statement.getText(sourceFile);
        if (MAX_STEPS_PATTERN.test(bodyText)) continue;
        const { line } = sourceFile.getLineAndCharacterOfPosition(
          node.getStart(),
        );
        issues.push({
          file: ctx.filePath,
          line: line + 1,
          message:
            "Agent loop detected without explicit max-steps or retry budget.",
          ruleId: "execution-missing-max-steps",
          severity: "warn",
          suggestion:
            "Add a max-steps limit or timeout to prevent runaway autonomy and infinite loops.",
          category: "Execution Safety",
          startPos: node.getStart(),
          endPos: node.getEnd(),
        });
      }
    } else {
      // Non-AST fallback: locate each `while (true) { ... }` block and check
      // the body in isolation rather than the whole file.
      const content = ctx.content;
      const whilePattern = /while\s*\(\s*true\s*\)\s*\{/g;
      let m: RegExpExecArray | null;
      while ((m = whilePattern.exec(content)) !== null) {
        const bodyStart = m.index + m[0].length - 1; // position of opening brace
        let depth = 0;
        let i = bodyStart;
        for (; i < content.length; i++) {
          if (content[i] === "{") depth++;
          else if (content[i] === "}") {
            depth--;
            if (depth === 0) break;
          }
        }
        const body = content.slice(bodyStart + 1, i);
        if (!MAX_STEPS_PATTERN.test(body)) {
          const linesBefore = content.slice(0, m.index).split("\n").length;
          issues.push({
            file: ctx.filePath,
            line: linesBefore,
            message:
              "Agent loop detected without explicit max-steps or retry budget.",
            ruleId: "execution-missing-max-steps",
            severity: "warn",
            suggestion:
              "Add a max-steps limit or timeout to prevent runaway autonomy and infinite loops.",
            category: "Execution Safety",
          });
        }
      }
    }

    return issues;
  },
  applyFix(content, issues) {
    const fixes: FixRecord[] = [];
    const maxStepIssues = issues.filter(
      (i) => i.ruleId === "execution-missing-max-steps",
    );
    if (
      maxStepIssues.length === 0 ||
      content.includes("maxSteps") ||
      content.includes("maxIterations")
    ) {
      return { content, fixes };
    }

    let next = content;
    let loopVar = "__agentStep";
    let suffix = 1;
    while (next.includes(loopVar)) {
      loopVar = `__agentStep${suffix}`;
      suffix += 1;
    }
    const replacement = `for (let ${loopVar} = 0; ${loopVar} < ${DEFAULT_MAX_STEPS}; ${loopVar}++)`;

    const astIssues = maxStepIssues.filter(
      (i) => i.startPos !== undefined && i.endPos !== undefined,
    );

    if (astIssues.length > 0) {
      astIssues.sort((a, b) => b.startPos! - a.startPos!);
      for (const issue of astIssues) {
        const nodeText = next.slice(issue.startPos!, issue.endPos!);
        const replacedText = nodeText.replace(
          /while\s*\(\s*true\s*\)/,
          replacement,
        );

        if (replacedText !== nodeText) {
          next =
            next.slice(0, issue.startPos!) +
            replacedText +
            next.slice(issue.endPos!);
          fixes.push({
            fixed: true,
            ruleId: "execution-missing-max-steps",
            message: `Bounded loop at offset ${issue.startPos} with max ${DEFAULT_MAX_STEPS} steps.`,
          });
        }
      }
    } else {
      const pattern = /while\s*\(\s*true\s*\)/g;
      const matches = Array.from(next.matchAll(pattern));
      if (matches.length > 0) {
        const original = next;
        next = next.replace(pattern, replacement);
        for (const match of matches) {
          const index = match.index ?? 0;
          const line = original.slice(0, index).split("\n").length;
          fixes.push({
            fixed: true,
            ruleId: "execution-missing-max-steps",
            message: `Bounded loop on line ${line} with max ${DEFAULT_MAX_STEPS} steps.`,
          });
        }
      }
    }

    return { content: next, fixes };
  },
};
