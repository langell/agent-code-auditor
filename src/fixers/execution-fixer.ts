import { AgentIssue } from "../scanners/types.js";
import { executionMissingMaxStepsRule } from "../rules/execution-missing-max-steps.js";
import { executionNoDryRunRule } from "../rules/execution-no-dry-run.js";
import { FixOutcome, FixRecord } from "./types.js";

// Facade — aggregates the execution-family per-ruleId Rules' applyFix outputs.
export function fixExecutionRules(
  content: string,
  issues: AgentIssue[],
  filePath: string,
): FixOutcome {
  let next = content;
  const fixes: FixRecord[] = [];

  for (const rule of [executionMissingMaxStepsRule, executionNoDryRunRule]) {
    if (!rule.applyFix) continue;
    const outcome = rule.applyFix(next, issues, filePath);
    next = outcome.content;
    fixes.push(...outcome.fixes);
  }

  return { content: next, fixes };
}
