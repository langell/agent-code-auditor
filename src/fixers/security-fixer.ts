import { AgentIssue } from "../scanners/types.js";
import { securityIgnoreInstructionsRule } from "../rules/security-ignore-instructions.js";
import { insecureRendersRule } from "../rules/legacy/insecure-renders.js";
import { securityInputValidationRule } from "../rules/security-input-validation.js";
import { securityDestructiveActionRule } from "../rules/security-destructive-action.js";
import { FixOutcome, FixRecord } from "./types.js";

// Facade — aggregates the security-family per-ruleId Rules' applyFix outputs.
export function fixSecurityRules(
  content: string,
  issues: AgentIssue[],
  filePath: string,
): FixOutcome {
  let next = content;
  const fixes: FixRecord[] = [];

  for (const rule of [
    securityIgnoreInstructionsRule,
    insecureRendersRule,
    securityInputValidationRule,
    securityDestructiveActionRule,
  ]) {
    if (!rule.applyFix) continue;
    const outcome = rule.applyFix(next, issues, filePath);
    next = outcome.content;
    fixes.push(...outcome.fixes);
  }

  return { content: next, fixes };
}
