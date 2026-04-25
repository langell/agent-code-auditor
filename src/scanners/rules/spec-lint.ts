import { AgentLintConfig } from "../../config.js";
import { AgentIssue } from "../types.js";

export function checkSpecRules(
  file: string,
  lines: string[],
  config: AgentLintConfig,
): AgentIssue[] {
  const issues: AgentIssue[] = [];
  const content = lines.join("\n");
  const ignorePrevPattern = "ignore previous" + " instructions";
  const disregardPattern = "disregard" + " previous";
  const systemPromptPattern = "system" + " prompt";
  const hasCriteria = /Acceptance Criteria|Success Criteria/i.test(content);

  // For this basic stub, we'll flag any markdown file with "Task" or "Spec" in its name
  // that lacks acceptance criteria.
  if (config.rules["spec-missing-acceptance-criteria"] !== "off") {
    if (!hasCriteria && /task|spec|prompt/i.test(file)) {
      issues.push({
        file,
        line: 1, // File level issue
        message: "Missing explicit acceptance criteria or success conditions.",
        ruleId: "spec-missing-acceptance-criteria",
        severity: config.rules["spec-missing-acceptance-criteria"] || "warn",
        suggestion:
          'Add an "Acceptance Criteria" section to define clear intent and stop conditions.',
        category: "Spec",
      });
    }
  }

  if (config.rules["spec-missing-rollback"] !== "off") {
    const hasRollback = /rollback|abort condition|failure condition/i.test(
      content,
    );
    if (!hasRollback && /task|spec|prompt/i.test(file)) {
      issues.push({
        file,
        line: 1,
        message: "Missing rollback or abort conditions.",
        ruleId: "spec-missing-rollback",
        severity: config.rules["spec-missing-rollback"] || "warn",
        suggestion:
          "Define explicit rollback or abort conditions for when the agent fails or encounters safety bounds.",
        category: "Spec",
      });
    }
  }

  if (config.rules["security-ignore-instructions"] !== "off") {
    if (
      new RegExp(
        `${ignorePrevPattern}|${disregardPattern}|${systemPromptPattern}`,
        "i",
      ).test(content)
    ) {
      issues.push({
        file,
        line: 1, // Using line 1 for simplicity of whole-file match here
        message: "Found potential jailbreak phrases in specification/prompt.",
        ruleId: "security-ignore-instructions",
        severity: config.rules["security-ignore-instructions"] || "error",
        suggestion:
          "Ensure prompts or string templates do not contain common prompt injection evasion techniques.",
        category: "Security",
      });
    }
  }

  return issues;
}
