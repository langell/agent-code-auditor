import { AgentIssue } from "../scanners/types.js";
import { codeQualityNoAnyRule } from "../rules/code-quality-no-any.js";
import { FixOutcome } from "./types.js";

// Facade — delegates to per-ruleId Rule.
export function fixCodeQualityRules(
  content: string,
  issues: AgentIssue[],
  filePath: string,
): FixOutcome {
  return codeQualityNoAnyRule.applyFix!(content, issues, filePath);
}
