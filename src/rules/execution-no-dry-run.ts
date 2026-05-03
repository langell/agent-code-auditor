import { AgentIssue } from "../scanners/types.js";
import { insertAfterImports } from "./_helpers.js";
import { FixRecord, Rule } from "./types.js";

const AGENT_TOOL_DIR_REGEX = /\/(?:tools|agents)\//;
const LLM_SDK_IMPORT_REGEX =
  /from\s+['"](?:ai|@anthropic-ai\/sdk|@anthropic-ai\/claude|openai|@openai\/agents|@langchain\/[\w-]+|langchain|@vercel\/ai|@mastra\/[\w-]+)['"]/;

const MUTATING_CALL_REGEX =
  /child_process\.exec|fs\.writeFileSync|\b\w+\.(?:insert|update|delete|upsert|create|save|destroy|remove)\s*\(/;

const DRY_RUN_REGEX = /dryRun|simulate/i;

function looksLikeAgentToolFile(file: string, content: string): boolean {
  const norm = file.replace(/\\/g, "/");
  if (AGENT_TOOL_DIR_REGEX.test(norm)) return true;
  if (LLM_SDK_IMPORT_REGEX.test(content)) return true;
  return false;
}

export const executionNoDryRunRule: Rule = {
  id: "execution-no-dry-run",
  appliesTo: "source",
  check(ctx) {
    const issues: AgentIssue[] = [];
    const content = ctx.content;
    const hasMutatingCall = MUTATING_CALL_REGEX.test(content);

    if (
      hasMutatingCall &&
      !DRY_RUN_REGEX.test(content) &&
      looksLikeAgentToolFile(ctx.filePath, content)
    ) {
      issues.push({
        file: ctx.filePath,
        line: 1,
        message:
          "Mutating execution paths found without a dry-run or simulation mode.",
        ruleId: "execution-no-dry-run",
        severity: "error",
        suggestion:
          "Implement a dry-run mode for dangerous tools to allow agents to preview side effects before committing.",
        category: "Execution Safety",
      });
    }

    return issues;
  },
  applyFix(content, issues) {
    const fixes: FixRecord[] = [];
    const dryRunIssues = issues.filter(
      (i) => i.ruleId === "execution-no-dry-run",
    );
    if (dryRunIssues.length === 0 || /dryRun|simulate/i.test(content)) {
      return { content, fixes };
    }

    let next = content;

    if (!/const\s+dryRun\s*=/.test(next)) {
      next = insertAfterImports(
        next,
        'const dryRun = process.env.DRY_RUN === "1";',
      );
      fixes.push({
        fixed: true,
        ruleId: "execution-no-dry-run",
        message: "Injected DRY_RUN guard template.",
      });
    }

    const lines = next.split("\n");
    // Only wrap when the entire mutation call fits on one line. Multi-line
    // calls (e.g. db.insert({\n  ... }\n)) would be corrupted by an inline
    // `if (!dryRun)` prefix.
    const SINGLE_LINE_MUTATION_REGEX =
      /^(\s*)(?:(?:fs(?:\.promises)?)\.(?:writeFile|writeFileSync|rm|rmSync|unlink|unlinkSync|rmdir|rmdirSync|truncate|truncateSync|copyFile|copyFileSync|rename|renameSync)|child_process\.(?:exec|execSync|execFile|execFileSync|spawn|spawnSync|fork)|\w+\.(?:insert|update|delete|upsert|create|save|destroy|remove))\s*\([^)]*\)\s*;?\s*$/;
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const trimmed = line.trim();
      if (
        SINGLE_LINE_MUTATION_REGEX.test(line) &&
        !trimmed.startsWith("//") &&
        !trimmed.startsWith("if (!dryRun)")
      ) {
        const indent = line.match(/^\s*/)?.[0] || "";
        lines[i] = `${indent}if (!dryRun) ${trimmed}`;
        fixes.push({
          fixed: true,
          ruleId: "execution-no-dry-run",
          message: `Guarded mutating call with dry-run on line ${i + 1}.`,
        });
      }
    }
    next = lines.join("\n");

    return { content: next, fixes };
  },
};
