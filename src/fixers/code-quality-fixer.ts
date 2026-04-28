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
    let content = fs.readFileSync(file, "utf8");
    let modified = false;

    // Sort issues by startPos descending to apply replacements without offset shifting
    const astIssues = cqIssues.filter(i => i.startPos !== undefined && i.endPos !== undefined);
    const lineIssues = cqIssues.filter(i => i.startPos === undefined);

    if (astIssues.length > 0) {
      astIssues.sort((a, b) => b.startPos! - a.startPos!);
      for (const issue of astIssues) {
        // any keyword text is "any"
        content = content.slice(0, issue.startPos!) + "unknown" + content.slice(issue.endPos!);
        modified = true;
        fixes.push({
          file,
          fixed: true,
          ruleId: issue.ruleId,
          message: `Replaced 'any' with 'unknown' exactly at offset ${issue.startPos}.`,
        });
      }
    }

    if (lineIssues.length > 0) {
      const lines = content.split("\n");
      for (const issue of lineIssues) {
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
      content = lines.join("\n");
    }

    if (modified) {
      fs.writeFileSync(file, content, "utf8");
    }
  }

  return fixes;
}
