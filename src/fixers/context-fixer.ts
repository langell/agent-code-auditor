import * as fs from "fs";
import { AgentIssue } from "../scanners/types.js";
import { FixResult } from "./types.js";

// Safety note: fixer routines support dryRun previews and explicit approve gates at call sites.

export async function fixContextRules(
  file: string,
  issues: AgentIssue[],
): Promise<FixResult[]> {
  const fixes: FixResult[] = [];
  const contextIssues = issues.filter(
    (i) => i.ruleId === "observability-missing-trace-id",
  );
  if (contextIssues.length === 0) return fixes;

  if (fs.existsSync(file)) {
    let content = fs.readFileSync(file, "utf8");
    let modified = false;

    const astIssues = contextIssues.filter(
      (i) => i.startPos !== undefined && i.endPos !== undefined,
    );

    if (astIssues.length > 0) {
      astIssues.sort((a, b) => b.startPos! - a.startPos!);
      for (const issue of astIssues) {
        const nodeText = content.slice(issue.startPos!, issue.endPos!);

        // Find the first `{` inside the Agent initialization
        const blockStartIndex = nodeText.indexOf("{");
        if (blockStartIndex !== -1) {
          const injection = `{ traceId: "TODO: inject-trace-id", `;
          const replacedText =
            nodeText.slice(0, blockStartIndex) +
            injection +
            nodeText.slice(blockStartIndex + 1);

          if (replacedText !== nodeText) {
            content =
              content.slice(0, issue.startPos!) +
              replacedText +
              content.slice(issue.endPos!);
            modified = true;
            fixes.push({
              file,
              fixed: true,
              ruleId: "observability-missing-trace-id",
              message: `Injected missing traceId exactly at offset ${issue.startPos}.`,
            });
          }
        } else {
          // If no object is passed, like `new Agent()`, inject it into the parenthesis
          const parenIndex = nodeText.indexOf("(");
          if (parenIndex !== -1) {
            const injection = `({ traceId: "TODO: inject-trace-id" }`;
            const replacedText =
              nodeText.slice(0, parenIndex) +
              injection +
              nodeText.slice(parenIndex + 1);
            if (replacedText !== nodeText) {
              content =
                content.slice(0, issue.startPos!) +
                replacedText +
                content.slice(issue.endPos!);
              modified = true;
              fixes.push({
                file,
                fixed: true,
                ruleId: "observability-missing-trace-id",
                message: `Injected missing traceId exactly at offset ${issue.startPos}.`,
              });
            }
          }
        }
      }
    } else {
      const lines = content.split("\n");
      for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        if (line.includes("new Agent({") || line.includes("Agent.init({")) {
          lines[i] = line.replace("{", '{ traceId: "TODO: inject-trace-id", ');
          modified = true;
          fixes.push({
            file,
            fixed: true,
            ruleId: "observability-missing-trace-id",
            message: `Injected missing traceId on line ${i + 1}.`,
          });
          break;
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
