import * as ts from "typescript";
import { AgentLintConfig } from "../../config.js";
import { AgentIssue } from "../types.js";
import { RuleContext } from "../../rules/types.js";
import { executionMissingMaxStepsRule } from "../../rules/execution-missing-max-steps.js";
import { architectureAtomicTransactionsRule } from "../../rules/architecture-atomic-transactions.js";
import { executionNoDryRunRule } from "../../rules/execution-no-dry-run.js";

// Facade — see spec-lint.ts header.
export function checkExecutionRules(
  file: string,
  lines: string[],
  _config?: AgentLintConfig,
  sourceFile?: ts.SourceFile,
): AgentIssue[] {
  const ctx: RuleContext = {
    filePath: file,
    content: sourceFile ? sourceFile.text : lines.join("\n"),
    lines,
    ast: sourceFile,
    targetDir: "",
    globalTools: [],
  };
  return [
    ...executionMissingMaxStepsRule.check(ctx),
    ...architectureAtomicTransactionsRule.check(ctx),
    ...executionNoDryRunRule.check(ctx),
  ];
}
