import * as ts from "typescript";
import { AgentIssue } from "../src/scanners/types.js";
import { Rule, RuleContext } from "../src/rules/types.js";

// Construct a minimal RuleContext for a test. Pass `withAst: true` to parse
// the content as TypeScript so AST-path branches in rules get exercised.
export function buildCtx(
  filePath: string,
  content: string,
  withAst = false,
  targetDir = "",
): RuleContext {
  return {
    filePath,
    content,
    lines: content.split("\n"),
    ast: withAst
      ? ts.createSourceFile(filePath, content, ts.ScriptTarget.Latest, true)
      : undefined,
    targetDir,
    globalTools: [],
  };
}

// Run multiple rules against the same context and concatenate their issues —
// used by tests that previously called a family `checkXxxRules` aggregator.
export function checkAll(
  ctx: RuleContext,
  ...rules: Rule[]
): AgentIssue[] {
  return rules.flatMap((r) => r.check(ctx));
}
