import { AgentIssue } from "../scanners/types.js";
import { verificationMissingTestsRule } from "../rules/verification-missing-tests.js";
import { FixOutcome } from "./types.js";

// Facade — delegates to per-ruleId Rule.
export function fixVerificationRules(
  content: string,
  issues: AgentIssue[],
  filePath: string,
): FixOutcome {
  return verificationMissingTestsRule.applyFix!(content, issues, filePath);
}
