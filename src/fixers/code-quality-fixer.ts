import * as fs from "fs";
import { AgentIssue } from "../scanners/types.js";
import { FixResult } from "./types.js";

// Safety note: fixer routines support dryRun previews and explicit approve gates at call sites.

export async function fixCodeQualityRules(
  file: string,
  issues: AgentIssue[],
): Promise<FixResult[]> {
  const fixes: FixResult[] = [];
  const cqIssues = issues.filter((i) => i.ruleId === "code-quality-no-any");
  if (cqIssues.length === 0) return fixes;

  if (fs.existsSync(file)) {
    const lines = fs.readFileSync(file, "utf8").split("\n");
    let modified = false;

    // Apply fixes line by line based on the issues reported.
    // Mirrors scanner patterns for loose type annotation, assertion, and generic cast forms.
    for (const issue of cqIssues) {
      const lineIdx = issue.line - 1;
      if (lineIdx >= 0 && lineIdx < lines.length) {
        const originalLine = lines[lineIdx];
        const fixedLine = originalLine
          .replace(/:\s*any\b/g, ": unknown")
          .replace(/\bas\s+any\b/g, "as unknown")
          .replace(/<\s*any\s*>/g, "<unknown>");

        if (fixedLine !== originalLine) {
          lines[lineIdx] = fixedLine;
          modified = true;
          fixes.push({
            file,
            fixed: true,
            ruleId: issue.ruleId,
            message: `Replaced 'any' with 'unknown' on line ${issue.line}.`,
          });
        }
      }
    }

    if (modified) {
      fs.writeFileSync(file, lines.join("\n"), "utf8");
    }
  }

  return fixes;
}
