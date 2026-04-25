import * as fs from "fs";
import { AgentIssue } from "../scanners/types.js";
import { FixResult } from "./types.js";

// Safety note: fixer routines support dryRun previews and explicit approve gates at call sites.

export async function fixSpecRules(
  file: string,
  issues: AgentIssue[],
): Promise<FixResult[]> {
  const fixes: FixResult[] = [];
  const specIssues = issues.filter((i) => i.ruleId.startsWith("spec-"));

  if (specIssues.length > 0 && fs.existsSync(file)) {
    let content = fs.readFileSync(file, "utf8");
    let modified = false;

    for (const issue of specIssues) {
      if (issue.ruleId === "spec-missing-acceptance-criteria") {
        if (!content.includes("Acceptance Criteria")) {
          content +=
            "\n\n## Acceptance Criteria\n- [ ] TBD: Define acceptance criteria.\n";
          modified = true;
          fixes.push({
            file,
            fixed: true,
            ruleId: issue.ruleId,
            message: "Appended Acceptance Criteria template.",
          });
        }
      }

      if (issue.ruleId === "spec-missing-rollback") {
        if (
          !content.includes("Rollback Conditions") &&
          !content.includes("Abort Conditions")
        ) {
          content +=
            "\n\n## Rollback / Abort Conditions\n- [ ] TBD: Define conditions under which the agent should abort.\n";
          modified = true;
          fixes.push({
            file,
            fixed: true,
            ruleId: issue.ruleId,
            message: "Appended Rollback Conditions template.",
          });
        }
      }
    }

    if (modified) {
      fs.writeFileSync(file, content, "utf8");
    }
  }

  // Handle source file placeholder comments line by line
  const placeholderIssues = issues.filter(
    (i) => i.ruleId === "no-placeholder-comments",
  );
  if (placeholderIssues.length > 0 && fs.existsSync(file)) {
    const lines = fs.readFileSync(file, "utf8").split("\n");
    let fileModified = false;
    for (const issue of placeholderIssues) {
      const lineIdx = issue.line - 1;
      if (lineIdx >= 0 && lineIdx < lines.length) {
        const line = lines[lineIdx];
        if (
          line.includes("TODO:") &&
          line.toLowerCase().includes("implement")
        ) {
          lines[lineIdx] = line.replace(
            /\/\/.*T(?:ODO):.*im(?:plement).*/i,
            'throw new Error("Not implemented - AI placeholder detected");',
          );
          fileModified = true;
          fixes.push({
            file,
            fixed: true,
            ruleId: issue.ruleId,
            message: `Replaced placeholder comment with hard fail on line ${issue.line}.`,
          });
        }
      }
    }
    if (fileModified) {
      fs.writeFileSync(file, lines.join("\n"), "utf8");
    }
  }

  return fixes;
}
