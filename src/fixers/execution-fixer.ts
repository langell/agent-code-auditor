import * as fs from "fs";
import { AgentIssue } from "../scanners/types.js";
import { FixResult } from "./types.js";

const DEFAULT_MAX_STEPS = 100;

// Safety note: fixer routines support dryRun previews and explicit approve gates at call sites.

function insertAfterImports(content: string, block: string): string {
  const lines = content.split("\n");
  let insertAt = 0;

  for (let i = 0; i < lines.length; i++) {
    if (/^\s*import\s+/.test(lines[i])) {
      insertAt = i + 1;
    }
  }

  lines.splice(insertAt, 0, block);
  return lines.join("\n");
}

export async function fixExecutionRules(
  file: string,
  issues: AgentIssue[],
): Promise<FixResult[]> {
  const fixes: FixResult[] = [];
  const maxStepIssues = issues.filter(
    (i) => i.ruleId === "execution-missing-max-steps",
  );
  const dryRunIssues = issues.filter(
    (i) => i.ruleId === "execution-no-dry-run",
  );
  if (maxStepIssues.length === 0 && dryRunIssues.length === 0) return fixes;
  if (!fs.existsSync(file)) return fixes;

  const originalContent = fs.readFileSync(file, "utf8");
  let content = originalContent;

  if (
    maxStepIssues.length > 0 &&
    !content.includes("maxSteps") &&
    !content.includes("maxIterations")
  ) {
    const pattern = /while\s*\(\s*true\s*\)/g;
    const matches = Array.from(content.matchAll(pattern));

    if (matches.length > 0) {
      let loopVar = "__agentStep";
      let suffix = 1;
      while (content.includes(loopVar)) {
        loopVar = `__agentStep${suffix}`;
        suffix += 1;
      }

      const replacement = `for (let ${loopVar} = 0; ${loopVar} < ${DEFAULT_MAX_STEPS}; ${loopVar}++)`;
      content = content.replace(pattern, replacement);

      for (const match of matches) {
        const index = match.index ?? 0;
        const line = originalContent.slice(0, index).split("\n").length;
        fixes.push({
          file,
          fixed: true,
          ruleId: "execution-missing-max-steps",
          message: `Bounded loop on line ${line} with max ${DEFAULT_MAX_STEPS} steps.`,
        });
      }
    }
  }

  if (dryRunIssues.length > 0 && !/dryRun|simulate/i.test(content)) {
    if (!/const\s+dryRun\s*=/.test(content)) {
      content = insertAfterImports(
        content,
        'const dryRun = process.env.DRY_RUN === "1";',
      );
      fixes.push({
        file,
        fixed: true,
        ruleId: "execution-no-dry-run",
        message: "Injected DRY_RUN guard template.",
      });
    }

    const lines = content.split("\n");
    const mutationPattern =
      /(fs\.writeFileSync|child_process\.exec|db\.(insert|update|delete))\s*\(/;
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const trimmed = line.trim();
      if (
        mutationPattern.test(line) &&
        !trimmed.startsWith("//") &&
        !trimmed.startsWith("if (!dryRun)")
      ) {
        const indent = line.match(/^\s*/)?.[0] || "";
        lines[i] = `${indent}if (!dryRun) ${trimmed}`;
        fixes.push({
          file,
          fixed: true,
          ruleId: "execution-no-dry-run",
          message: `Guarded mutating call with dry-run on line ${i + 1}.`,
        });
      }
    }
    content = lines.join("\n");
  }

  if (content !== originalContent) {
    fs.writeFileSync(file, content, "utf8");
  }

  return fixes;
}
