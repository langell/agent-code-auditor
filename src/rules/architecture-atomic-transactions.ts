import * as ts from "typescript";
import { AgentIssue } from "../scanners/types.js";
import { Rule } from "./types.js";

const MUTATION_VERB_REGEX =
  /^(?:insert|update|delete|upsert|create|save|destroy|remove)$/;
const TRANSACTION_VERB_REGEX = /^(?:transaction|\$transaction)$/;

function getMutationVerb(callExpr: ts.CallExpression): string | undefined {
  const expr = callExpr.expression;
  if (ts.isPropertyAccessExpression(expr)) {
    const name = expr.name.text;
    if (MUTATION_VERB_REGEX.test(name)) return name;
  }
  return undefined;
}

function isTransactionCall(callExpr: ts.CallExpression): boolean {
  const expr = callExpr.expression;
  if (ts.isPropertyAccessExpression(expr)) {
    return TRANSACTION_VERB_REGEX.test(expr.name.text);
  }
  return false;
}

type FunctionScope =
  | ts.FunctionDeclaration
  | ts.FunctionExpression
  | ts.ArrowFunction
  | ts.MethodDeclaration
  | ts.SourceFile;

function nearestFunctionScope(node: ts.Node): FunctionScope {
  let cur: ts.Node | undefined = node.parent;
  while (cur) {
    if (
      ts.isFunctionDeclaration(cur) ||
      ts.isFunctionExpression(cur) ||
      ts.isArrowFunction(cur) ||
      ts.isMethodDeclaration(cur) ||
      ts.isSourceFile(cur)
    ) {
      return cur as FunctionScope;
    }
    cur = cur.parent;
  }
  return node.getSourceFile();
}

export const architectureAtomicTransactionsRule: Rule = {
  id: "architecture-atomic-transactions",
  appliesTo: "source",
  check(ctx) {
    const issues: AgentIssue[] = [];

    if (ctx.ast) {
      const sourceFile = ctx.ast;
      const mutationsByScope = new Map<FunctionScope, ts.CallExpression[]>();
      const transactionsByScope = new Map<FunctionScope, boolean>();
      const transactionCallbackRanges: Array<{ start: number; end: number }> =
        [];

      function visit(node: ts.Node) {
        if (ts.isCallExpression(node)) {
          if (getMutationVerb(node)) {
            const scope = nearestFunctionScope(node);
            const list = mutationsByScope.get(scope) ?? [];
            list.push(node);
            mutationsByScope.set(scope, list);
          }

          if (isTransactionCall(node)) {
            const scope = nearestFunctionScope(node);
            transactionsByScope.set(scope, true);
            // The first callback argument range is "inside the transaction"
            for (const arg of node.arguments) {
              if (ts.isArrowFunction(arg) || ts.isFunctionExpression(arg)) {
                transactionCallbackRanges.push({
                  start: arg.getStart(),
                  end: arg.getEnd(),
                });
              }
            }
          }
        }
        ts.forEachChild(node, visit);
      }
      visit(sourceFile);

      for (const [scope, calls] of mutationsByScope) {
        const effective = calls.filter(
          (c) =>
            !transactionCallbackRanges.some(
              (r) => c.getStart() >= r.start && c.getEnd() <= r.end,
            ),
        );
        if (effective.length <= 1) continue;
        if (transactionsByScope.get(scope)) continue;
        const first = effective[0];
        const { line } = sourceFile.getLineAndCharacterOfPosition(
          first.getStart(),
        );
        issues.push({
          file: ctx.filePath,
          line: line + 1,
          message:
            "Multiple database mutations detected without an atomic transaction.",
          ruleId: "architecture-atomic-transactions",
          severity: "error",
          suggestion:
            "Wrap multiple database mutations in an atomic transaction (e.g., db.transaction(), prisma.$transaction).",
          category: "Execution Safety",
        });
      }
    } else {
      // Non-AST fallback: file-wide heuristic, broadened to any object.
      const content = ctx.content;
      const mutationMatches =
        content.match(
          /\b\w+\.(?:insert|update|delete|upsert|create|save|destroy|remove)\s*\(/g,
        ) || [];
      const hasTransaction = /\b\w+\.(?:transaction|\$transaction)\s*\(/.test(
        content,
      );
      if (mutationMatches.length > 1 && !hasTransaction) {
        issues.push({
          file: ctx.filePath,
          line: 1,
          message:
            "Multiple database mutations detected without an atomic transaction.",
          ruleId: "architecture-atomic-transactions",
          severity: "error",
          suggestion:
            "Wrap multiple database mutations in an atomic transaction (e.g., db.transaction(), prisma.$transaction).",
          category: "Execution Safety",
        });
      }
    }

    return issues;
  },
};
