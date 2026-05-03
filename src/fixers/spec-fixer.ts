import { AgentIssue } from "../scanners/types.js";
import { specMissingAcceptanceCriteriaRule } from "../rules/spec-missing-acceptance-criteria.js";
import { specMissingRollbackRule } from "../rules/spec-missing-rollback.js";
import { placeholderCommentsRule } from "../rules/legacy/placeholder-comments.js";
import { FixOutcome, FixRecord, NewFile } from "./types.js";

// Facade — see scanners/rules/spec-lint.ts for the matching detection
// facade. Aggregates the per-ruleId Rules' applyFix outputs so existing
// callers that fed all spec-family issues into one function keep working.
export function fixSpecRules(
  content: string,
  issues: AgentIssue[],
  filePath: string,
): FixOutcome {
  let next = content;
  const fixes: FixRecord[] = [];
  const newFiles: NewFile[] = [];

  const rules = [
    specMissingAcceptanceCriteriaRule,
    specMissingRollbackRule,
    placeholderCommentsRule,
  ];

  for (const rule of rules) {
    if (!rule.applyFix) continue;
    const outcome = rule.applyFix(next, issues, filePath);
    next = outcome.content;
    fixes.push(...outcome.fixes);
    if (outcome.newFiles) newFiles.push(...outcome.newFiles);
  }

  return newFiles.length > 0
    ? { content: next, fixes, newFiles }
    : { content: next, fixes };
}
