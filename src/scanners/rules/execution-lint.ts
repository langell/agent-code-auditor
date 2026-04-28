import * as ts from "typescript";
import { AgentLintConfig } from "../../config.js";
import { AgentIssue } from "../types.js";

export function checkExecutionRules(
  file: string,
  lines: string[],
  config: AgentLintConfig,
  sourceFile?: ts.SourceFile,
): AgentIssue[] {
  const issues: AgentIssue[] = [];

  let hasWhileTrue = false;
  let hasMaxSteps = false;
  let mutations = 0;
  let hasTransaction = false;
  let hasMutatingCall = false;
  const whileTrueNodes: ts.Node[] = [];

  const content = sourceFile ? sourceFile.text : lines.join("\n");
  hasMaxSteps = content.includes("maxSteps") || content.includes("maxIterations");

  if (sourceFile) {
    function visit(node: ts.Node) {
      if (node.kind === ts.SyntaxKind.WhileStatement) {
        const whileStmt = node as ts.WhileStatement;
        if (whileStmt.expression.kind === ts.SyntaxKind.TrueKeyword) {
          hasWhileTrue = true;
          whileTrueNodes.push(whileStmt);
        }
      }

      if (node.kind === ts.SyntaxKind.CallExpression) {
        const callExpr = node as ts.CallExpression;
        const exprText = callExpr.expression.getText(sourceFile);
        
        if (
          exprText === "db.insert" ||
          exprText === "db.update" ||
          exprText === "db.delete"
        ) {
          mutations++;
          hasMutatingCall = true;
        }

        if (exprText === "db.transaction") {
          hasTransaction = true;
        }

        if (
          exprText === "fs.writeFileSync" ||
          exprText === "child_process.exec"
        ) {
          hasMutatingCall = true;
        }
      }
      ts.forEachChild(node, visit);
    }
    visit(sourceFile);
  } else {
    // Fallback for non-TS files
    hasWhileTrue = /while\s*\(\s*true\s*\)/.test(content);
    const dbMatches = content.match(/db\.(insert|update|delete)/g) || [];
    mutations = dbMatches.length;
    hasTransaction = content.includes("db.transaction");
    hasMutatingCall =
      /child_process\.exec|fs\.writeFileSync|db\.(insert|update|delete)/.test(
        content,
      );
  }

  if (config.rules["execution-missing-max-steps"] !== "off") {
    if (hasWhileTrue && !hasMaxSteps) {
      if (whileTrueNodes.length > 0) {
        for (const node of whileTrueNodes) {
          const { line } = sourceFile!.getLineAndCharacterOfPosition(
            node.getStart(),
          );
          issues.push({
            file,
            line: line + 1,
            message:
              "Agent loop detected without explicit max-steps or retry budget.",
            ruleId: "execution-missing-max-steps",
            severity: config.rules["execution-missing-max-steps"] || "warn",
            suggestion:
              "Add a max-steps limit or timeout to prevent runaway autonomy and infinite loops.",
            category: "Execution Safety",
            startPos: node.getStart(),
            endPos: node.getEnd(),
          });
        }
      } else {
        issues.push({
          file,
          line: 1,
          message:
            "Agent loop detected without explicit max-steps or retry budget.",
          ruleId: "execution-missing-max-steps",
          severity: config.rules["execution-missing-max-steps"] || "warn",
          suggestion:
            "Add a max-steps limit or timeout to prevent runaway autonomy and infinite loops.",
          category: "Execution Safety",
        });
      }
    }
  }

  // 2. Atomic Transactions
  if (config.rules["architecture-atomic-transactions"] !== "off") {
    if (mutations > 1 && !hasTransaction) {
      issues.push({
        file,
        line: 1,
        message:
          "Multiple database mutations detected without an atomic transaction.",
        ruleId: "architecture-atomic-transactions",
        severity: config.rules["architecture-atomic-transactions"] || "error",
        suggestion:
          "Wrap multiple database mutations in an atomic transaction (e.g., db.transaction()) to ensure data integrity.",
        category: "Execution Safety",
      });
    }
  }

  // 3. Dry-run capabilities
  if (config.rules["execution-no-dry-run"] !== "off") {
    if (hasMutatingCall && !/dryRun|simulate/i.test(content)) {
      issues.push({
        file,
        line: 1,
        message:
          "Mutating execution paths found without a dry-run or simulation mode.",
        ruleId: "execution-no-dry-run",
        severity: config.rules["execution-no-dry-run"] || "error",
        suggestion:
          "Implement a dry-run mode for dangerous tools to allow agents to preview side effects before committing.",
        category: "Execution Safety",
      });
    }
  }

  return issues;
}
