import * as ts from "typescript";
import { AgentLintConfig } from "../../config.js";
import { AgentIssue } from "../types.js";

const MUTATION_VERB_REGEX =
  /^(?:insert|update|delete|upsert|create|save|destroy|remove)$/;
const TRANSACTION_VERB_REGEX = /^(?:transaction|\$transaction)$/;

const AGENT_TOOL_DIR_REGEX = /\/(?:tools|agents)\//;
const LLM_SDK_IMPORT_REGEX =
  /from\s+['"](?:ai|@anthropic-ai\/sdk|@anthropic-ai\/claude|openai|@openai\/agents|@langchain\/[\w-]+|langchain|@vercel\/ai|@mastra\/[\w-]+)['"]/;

function looksLikeAgentToolFile(file: string, content: string): boolean {
  const norm = file.replace(/\\/g, "/");
  if (AGENT_TOOL_DIR_REGEX.test(norm)) return true;
  if (LLM_SDK_IMPORT_REGEX.test(content)) return true;
  return false;
}

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

export function checkExecutionRules(
  file: string,
  lines: string[],
  config: AgentLintConfig,
  sourceFile?: ts.SourceFile,
): AgentIssue[] {
  const issues: AgentIssue[] = [];

  let hasMutatingCall = false;
  const whileTrueNodes: ts.WhileStatement[] = [];
  const unboundedWhileBlocks: { start: number; end: number }[] = [];

  // Per-scope mutation tracking for atomic-transactions
  const mutationsByScope = new Map<FunctionScope, ts.CallExpression[]>();
  const transactionsByScope = new Map<FunctionScope, boolean>();
  // Ranges inside transaction-wrapper callbacks; mutations here don't count
  const transactionCallbackRanges: Array<{ start: number; end: number }> = [];

  const content = sourceFile ? sourceFile.text : lines.join("\n");
  const MAX_STEPS_PATTERN = /\b(?:maxSteps|maxIterations)\b/;

  if (sourceFile) {
    function visit(node: ts.Node) {
      if (node.kind === ts.SyntaxKind.WhileStatement) {
        const whileStmt = node as ts.WhileStatement;
        if (whileStmt.expression.kind === ts.SyntaxKind.TrueKeyword) {
          whileTrueNodes.push(whileStmt);
        }
      }

      if (ts.isCallExpression(node)) {
        const verb = getMutationVerb(node);
        if (verb) {
          hasMutatingCall = true;
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

        const exprText = node.expression.getText(sourceFile);
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
    // Fallback for non-TS files: locate each `while (true) { ... }` block
    // and check the body in isolation rather than the whole file.
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
        unboundedWhileBlocks.push({ start: m.index, end: i + 1 });
      }
    }
    hasMutatingCall =
      /child_process\.exec|fs\.writeFileSync|\b\w+\.(?:insert|update|delete|upsert|create|save|destroy|remove)\s*\(/.test(
        content,
      );
  }

  if (config.rules["execution-missing-max-steps"] !== "off") {
    // AST path: check each while(true) body in isolation
    for (const node of whileTrueNodes) {
      const bodyText = node.statement.getText(sourceFile!);
      if (MAX_STEPS_PATTERN.test(bodyText)) continue;
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

    // Non-AST path: each isolated unbounded while block
    for (const block of unboundedWhileBlocks) {
      const linesBefore = content.slice(0, block.start).split("\n").length;
      issues.push({
        file,
        line: linesBefore,
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

  // 2. Atomic Transactions
  if (config.rules["architecture-atomic-transactions"] !== "off") {
    if (sourceFile) {
      // Per-scope analysis: count mutations per enclosing function/scope.
      // Mutations that fall inside a transaction-callback range don't count.
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
          file,
          line: line + 1,
          message:
            "Multiple database mutations detected without an atomic transaction.",
          ruleId: "architecture-atomic-transactions",
          severity: config.rules["architecture-atomic-transactions"] || "error",
          suggestion:
            "Wrap multiple database mutations in an atomic transaction (e.g., db.transaction(), prisma.$transaction).",
          category: "Execution Safety",
        });
      }
    } else {
      // Non-AST fallback: keep file-wide heuristic, broadened to any object.
      const mutationMatches =
        content.match(
          /\b\w+\.(?:insert|update|delete|upsert|create|save|destroy|remove)\s*\(/g,
        ) || [];
      const hasTransaction = /\b\w+\.(?:transaction|\$transaction)\s*\(/.test(
        content,
      );
      if (mutationMatches.length > 1 && !hasTransaction) {
        issues.push({
          file,
          line: 1,
          message:
            "Multiple database mutations detected without an atomic transaction.",
          ruleId: "architecture-atomic-transactions",
          severity: config.rules["architecture-atomic-transactions"] || "error",
          suggestion:
            "Wrap multiple database mutations in an atomic transaction (e.g., db.transaction(), prisma.$transaction).",
          category: "Execution Safety",
        });
      }
    }
  }

  // 3. Dry-run capabilities — only relevant for files that look like
  // agent-tool implementations, not arbitrary code that happens to mutate.
  if (config.rules["execution-no-dry-run"] !== "off") {
    if (
      hasMutatingCall &&
      !/dryRun|simulate/i.test(content) &&
      looksLikeAgentToolFile(file, content)
    ) {
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
