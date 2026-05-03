import { AgentIssue } from "../scanners/types.js";
import { FixRecord, Rule } from "./types.js";

export const specMissingAcceptanceCriteriaRule: Rule = {
  id: "spec-missing-acceptance-criteria",
  appliesTo: "all",
  check(ctx) {
    const issues: AgentIssue[] = [];
    const content = ctx.content;
    const hasCriteria = /Acceptance Criteria|Success Criteria/i.test(content);

    if (!hasCriteria && /task|spec|prompt/i.test(ctx.filePath)) {
      issues.push({
        file: ctx.filePath,
        line: 1,
        message: "Missing explicit acceptance criteria or success conditions.",
        ruleId: "spec-missing-acceptance-criteria",
        severity: "warn",
        suggestion:
          'Add an "Acceptance Criteria" section to define clear intent and stop conditions.',
        category: "Spec",
      });
    }
    return issues;
  },
  applyFix(content, issues) {
    const fixes: FixRecord[] = [];
    let next = content;

    for (const issue of issues) {
      if (issue.ruleId !== "spec-missing-acceptance-criteria") continue;
      if (!next.includes("Acceptance Criteria")) {
        next +=
          "\n\n## Acceptance Criteria\n- [ ] TBD: Define acceptance criteria.\n";
        fixes.push({
          fixed: true,
          ruleId: issue.ruleId,
          message: "Appended Acceptance Criteria template.",
        });
      }
    }

    return { content: next, fixes };
  },
};
