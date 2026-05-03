import { AgentIssue } from "../scanners/types.js";
import { insertAfterImports, isTypeScriptTarget } from "./_helpers.js";
import { FixRecord, Rule } from "./types.js";

const DESTRUCTIVE_API_REGEX =
  /\b(?:fs(?:\.promises)?)\.(?:writeFile|writeFileSync|rm|rmSync|unlink|unlinkSync|rmdir|rmdirSync|truncate|truncateSync|copyFile|copyFileSync|rename|renameSync)\s*\(|\bchild_process\.(?:exec|execSync|execFile|execFileSync|spawn|spawnSync|fork)\s*\(|\bexeca\s*\(|\bshelljs\.\w+\s*\(/;

const APPROVAL_REGEX =
  /\b(?:approved|confirmed|authorized|verified|consented)\b|\b(?:approve|confirm|authorize|consent|requireApproval|requestApproval|getUserConsent)\s*\(/;

const DESTRUCTIVE_LINE_REGEX =
  /\b(?:fs(?:\.promises)?)\.(?:writeFile|writeFileSync|rm|rmSync|unlink|unlinkSync|rmdir|rmdirSync|truncate|truncateSync|copyFile|copyFileSync|rename|renameSync)\s*\(|\bchild_process\.(?:exec|execSync|execFile|execFileSync|spawn|spawnSync|fork)\s*\(|\bexeca\s*\(|\bshelljs\.\w+\s*\(/;

export const securityDestructiveActionRule: Rule = {
  id: "security-destructive-action",
  appliesTo: "all",
  check(ctx) {
    const issues: AgentIssue[] = [];
    const content = ctx.content;

    if (DESTRUCTIVE_API_REGEX.test(content) && !APPROVAL_REGEX.test(content)) {
      issues.push({
        file: ctx.filePath,
        line: 1,
        message:
          "Destructive action (file write/shell exec) without confirmation step.",
        ruleId: "security-destructive-action",
        severity: "error",
        suggestion:
          "Require a human approval step or explicit boundaries before executing mutating commands.",
        category: "Execution Safety",
      });
    }

    return issues;
  },
  applyFix(content, issues, filePath) {
    const fixes: FixRecord[] = [];
    const destructiveIssues = issues.filter(
      (i) => i.ruleId === "security-destructive-action",
    );
    if (destructiveIssues.length === 0 || APPROVAL_REGEX.test(content)) {
      return { content, fixes };
    }

    let next = content;

    if (!/function\s+requireApproval\s*\(/.test(next)) {
      const isTs = isTypeScriptTarget(filePath);
      const requireApprovalHelper = isTs
        ? "function requireApproval(): void {\n" +
          "  const approved = false;\n" +
          "  if (!approved) {\n" +
          "    throw new Error('Operation requires explicit approval');\n" +
          "  }\n" +
          "}\n"
        : "function requireApproval() {\n" +
          "  const approved = false;\n" +
          "  if (!approved) {\n" +
          "    throw new Error('Operation requires explicit approval');\n" +
          "  }\n" +
          "}\n";
      next = insertAfterImports(next, requireApprovalHelper);
      fixes.push({
        fixed: true,
        ruleId: "security-destructive-action",
        message: "Injected explicit approval guard template.",
      });
    }

    const lines = next.split("\n");
    let hasLineChanges = false;
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const trimmed = line.trim();
      const hasMutationCall = DESTRUCTIVE_LINE_REGEX.test(line);
      const previousTrimmed = i > 0 ? lines[i - 1].trim() : "";
      const alreadyGuarded = previousTrimmed.startsWith("requireApproval();");
      if (hasMutationCall && !trimmed.startsWith("//") && !alreadyGuarded) {
        const indent = line.match(/^\s*/)?.[0] || "";
        lines.splice(i, 0, `${indent}requireApproval();`);
        i++; // skip past the inserted guard
        hasLineChanges = true;
        fixes.push({
          fixed: true,
          ruleId: "security-destructive-action",
          message: `Added approval guard before mutating call on line ${i + 1}.`,
        });
      }
    }
    if (hasLineChanges) next = lines.join("\n");

    return { content: next, fixes };
  },
};
