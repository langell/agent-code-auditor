import * as ts from "typescript";
import { AgentIssue } from "../scanners/types.js";
import { FixRecord, Rule } from "./types.js";

export const codeQualityNoAnyRule: Rule = {
  id: "code-quality-no-any",
  appliesTo: "source",
  check(ctx) {
    const issues: AgentIssue[] = [];

    if (ctx.ast) {
      const sourceFile = ctx.ast;
      function visit(node: ts.Node) {
        if (node.kind === ts.SyntaxKind.AnyKeyword) {
          const { line } = sourceFile.getLineAndCharacterOfPosition(
            node.getStart(),
          );
          issues.push({
            file: ctx.filePath,
            line: line + 1,
            message: "Use of 'any' type detected.",
            ruleId: "code-quality-no-any",
            severity: "error",
            suggestion:
              "Zero 'any' types allowed. Define explicit interfaces or types to ensure type safety.",
            category: "Code Quality",
            startPos: node.getStart(),
            endPos: node.getEnd(),
          });
        }
        ts.forEachChild(node, visit);
      }
      visit(sourceFile);
    } else {
      // Fallback for files without an AST (though TS/JS are the ones with 'any')
      if (ctx.filePath.endsWith(".ts") || ctx.filePath.endsWith(".tsx")) {
        for (let i = 0; i < ctx.lines.length; i++) {
          const line = ctx.lines[i];
          if (/(:\s*any\b|<\s*any\s*>|\bas\s+any\b)/.test(line)) {
            issues.push({
              file: ctx.filePath,
              line: i + 1,
              message: "Use of 'any' type detected.",
              ruleId: "code-quality-no-any",
              severity: "error",
              suggestion:
                "Zero 'any' types allowed. Define explicit interfaces or types to ensure type safety.",
              category: "Code Quality",
            });
          }
        }
      }
    }

    return issues;
  },
  applyFix(content, issues) {
    const fixes: FixRecord[] = [];
    const cqIssues = issues.filter((i) => i.ruleId === "code-quality-no-any");
    if (cqIssues.length === 0) {
      return { content, fixes };
    }

    let next = content;

    // Sort issues by startPos descending to apply replacements without offset shifting
    const astIssues = cqIssues.filter(
      (i) => i.startPos !== undefined && i.endPos !== undefined,
    );
    const lineIssues = cqIssues.filter((i) => i.startPos === undefined);

    if (astIssues.length > 0) {
      astIssues.sort((a, b) => b.startPos! - a.startPos!);
      for (const issue of astIssues) {
        next =
          next.slice(0, issue.startPos!) +
          "unknown" +
          next.slice(issue.endPos!);
        fixes.push({
          fixed: true,
          ruleId: issue.ruleId,
          message: `Replaced 'any' with 'unknown' exactly at offset ${issue.startPos}.`,
        });
      }
    }

    if (lineIssues.length > 0) {
      // Skip lines that contain string literals or comments — without AST
      // positions we can't tell whether `: any` lives in code or inside a
      // string/comment, and rewriting the latter corrupts the file.
      const isUnsafeLine = (line: string) => /["'`]|\/\/|\/\*|\*\//.test(line);
      const lines = next.split("\n");
      for (const issue of lineIssues) {
        const lineIdx = issue.line - 1;
        if (lineIdx < 0 || lineIdx >= lines.length) continue;
        const originalLine = lines[lineIdx];
        if (isUnsafeLine(originalLine)) continue;

        const fixedLine = originalLine
          .replace(/:\s*any\b/g, ": unknown")
          .replace(/\bas\s+any\b/g, "as unknown")
          .replace(/<\s*any\s*>/g, "<unknown>");

        if (fixedLine !== originalLine) {
          lines[lineIdx] = fixedLine;
          fixes.push({
            fixed: true,
            ruleId: issue.ruleId,
            message: `Replaced 'any' with 'unknown' on line ${issue.line}.`,
          });
        }
      }
      next = lines.join("\n");
    }

    return { content: next, fixes };
  },
};
