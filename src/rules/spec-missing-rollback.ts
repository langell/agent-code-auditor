import { AgentIssue } from "../scanners/types.js";
import { FixRecord, Rule } from "./types.js";

export const specMissingRollbackRule: Rule = {
  id: "spec-missing-rollback",
  appliesTo: "all",
  check(ctx) {
    const issues: AgentIssue[] = [];
    const content = ctx.content;
    const hasRollback = /rollback|abort condition|failure condition/i.test(
      content,
    );

    if (!hasRollback && /task|spec|prompt/i.test(ctx.filePath)) {
      issues.push({
        file: ctx.filePath,
        line: 1,
        message: "Missing rollback or abort conditions.",
        ruleId: "spec-missing-rollback",
        severity: "warn",
        suggestion:
          "Define explicit rollback or abort conditions for when the agent fails or encounters safety bounds.",
        category: "Spec",
      });
    }
    return issues;
  },
  applyFix(content, issues) {
    const fixes: FixRecord[] = [];
    let next = content;

    for (const issue of issues) {
      if (issue.ruleId !== "spec-missing-rollback") continue;
      if (
        !next.includes("Rollback Conditions") &&
        !next.includes("Abort Conditions")
      ) {
        next +=
          "\n\n## Rollback / Abort Conditions\n- [ ] TBD: Define conditions under which the agent should abort.\n";
        fixes.push({
          fixed: true,
          ruleId: issue.ruleId,
          message: "Appended Rollback Conditions template.",
        });
      }
    }

    return { content: next, fixes };
  },
};
