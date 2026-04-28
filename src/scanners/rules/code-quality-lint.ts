import * as ts from "typescript";
import { AgentLintConfig } from "../../config.js";
import { AgentIssue } from "../types.js";

export function checkCodeQualityRules(
  file: string,
  lines: string[],
  config: AgentLintConfig,
  sourceFile?: ts.SourceFile,
): AgentIssue[] {
  const issues: AgentIssue[] = [];

  if (config.rules["code-quality-no-any"] !== "off") {
    if (sourceFile) {
      function visit(node: ts.Node) {
        if (node.kind === ts.SyntaxKind.AnyKeyword) {
          const { line } = sourceFile!.getLineAndCharacterOfPosition(
            node.getStart(),
          );
          issues.push({
            file,
            line: line + 1,
            message: "Use of 'any' type detected.",
            ruleId: "code-quality-no-any",
            severity: config.rules["code-quality-no-any"] === "warn" ? "warn" : "error",
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
      if (file.endsWith(".ts") || file.endsWith(".tsx")) {
        for (let i = 0; i < lines.length; i++) {
          const line = lines[i];
          if (/(:\s*any\b|<\s*any\s*>|\bas\s+any\b)/.test(line)) {
            issues.push({
              file,
              line: i + 1,
              message: "Use of 'any' type detected.",
              ruleId: "code-quality-no-any",
              severity: config.rules["code-quality-no-any"] === "warn" ? "warn" : "error",
              suggestion:
                "Zero 'any' types allowed. Define explicit interfaces or types to ensure type safety.",
              category: "Code Quality",
            });
          }
        }
      }
    }
  }

  return issues;
}
