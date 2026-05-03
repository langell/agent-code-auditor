import { AgentIssue } from "../scanners/types.js";
import { observabilityMissingTraceIdRule } from "../rules/observability-missing-trace-id.js";
import { FixOutcome } from "./types.js";

// Facade — delegates to per-ruleId Rule.
export function fixContextRules(
  content: string,
  issues: AgentIssue[],
  filePath: string,
): FixOutcome {
  return observabilityMissingTraceIdRule.applyFix!(content, issues, filePath);
}
