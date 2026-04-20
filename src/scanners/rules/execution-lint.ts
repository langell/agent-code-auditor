import * as fs from "fs";
import * as path from "path";
import { AgentLintConfig } from "../../config.js";
import { AgentIssue } from "../types.js";

export function checkExecutionRules(
  file: string,
  lines: string[],
  config: AgentLintConfig,
): AgentIssue[] {
  const issues: AgentIssue[] = [];
  if (config.rules["execution-missing-max-steps"] === "off") return issues;

  // Basic heuristic: While loop or agent init without limits.
  let hasWhileTrue = false;
  let hasMaxSteps = false;

  for (let i = 0; i < lines.length; i++) {
    if (/while\s*\(\s*true\s*\)/.test(lines[i])) hasWhileTrue = true;
    if (lines[i].includes("maxSteps") || lines[i].includes("maxIterations"))
      hasMaxSteps = true;
  }

  if (hasWhileTrue && !hasMaxSteps) {
    issues.push({
      file,
      line: 1,
      message:
        "Agent loop detected without explicit max-steps or retry budget.",
      ruleId: "execution-missing-max-steps",
      severity: config.rules["execution-missing-max-steps"] || "warn",
      suggestion:
        "Add a max-steps limit or timeout to prevent runaway autonomy and infinite loops.",
      category: "Execution Safety",
    });
  }

  // 2. Atomic Transactions
  if (config.rules["architecture-atomic-transactions"] !== "off") {
    const content = lines.join("\n");
    // Heuristic: If we see db.insert or db.update multiple times but no db.transaction
    const mutations = (content.match(/db\.(insert|update|delete)/g) || [])
      .length;
    if (mutations > 1 && !content.includes("db.transaction")) {
      issues.push({
        file,
        line: 1,
        message:
          "Multiple database mutations detected without an atomic transaction.",
        ruleId: "architecture-atomic-transactions",
        severity: config.rules["architecture-atomic-transactions"] || "error",
        suggestion:
          "Wrap multiple database mutations in an atomic transaction (e.g., db.transaction()) to ensure data integrity.",
        category: "Execution Safety",
      });
    }
  }

  // 3. Dry-run capabilities
  if (config.rules["execution-no-dry-run"] !== "off") {
    const content = lines.join("\n");
    if (
      /child_process\.exec|fs\.writeFileSync|db\.(insert|update|delete)/.test(
        content,
      ) &&
      !/dryRun|simulate/i.test(content)
    ) {
      issues.push({
        file,
        line: 1,
        message:
          "Mutating execution paths found without a dry-run or simulation mode.",
        ruleId: "execution-no-dry-run",
        severity: config.rules["execution-no-dry-run"] || "error",
        suggestion:
          "Implement a dry-run mode for dangerous tools to allow agents to preview side effects before committing.",
        category: "Execution Safety",
      });
    }
  }

  return issues;
}
