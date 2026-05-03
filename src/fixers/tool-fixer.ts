import { AgentIssue } from "../scanners/types.js";
import { toolWeakSchemaRule } from "../rules/tool-weak-schema.js";
import { toolMissingExamplesRule } from "../rules/tool-missing-examples.js";
import { toolOverlappingRule } from "../rules/tool-overlapping.js";
import { FixOutcome, FixRecord } from "./types.js";

// Facade — aggregates the tool-family per-ruleId Rules' applyFix outputs.
export function fixToolRules(
  content: string,
  issues: AgentIssue[],
  filePath: string,
): FixOutcome {
  let next = content;
  const fixes: FixRecord[] = [];

  for (const rule of [
    toolWeakSchemaRule,
    toolMissingExamplesRule,
    toolOverlappingRule,
  ]) {
    if (!rule.applyFix) continue;
    const outcome = rule.applyFix(next, issues, filePath);
    next = outcome.content;
    fixes.push(...outcome.fixes);
  }

  return { content: next, fixes };
}
