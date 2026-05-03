import { AgentIssue } from "../scanners/types.js";
import { FixRecord, Rule } from "./types.js";

const IGNORE_PREV_PATTERN = "ignore previous" + " instructions";
const DISREGARD_PATTERN = "disregard" + " previous";
const SYSTEM_PROMPT_PATTERN = "system" + " prompt";

const JAILBREAK_REGEX = new RegExp(
  `${IGNORE_PREV_PATTERN}|${DISREGARD_PATTERN}|${SYSTEM_PROMPT_PATTERN}`,
  "i",
);

// Despite the `security-` prefix, this rule is paired with the spec
// family conceptually because it scans prompt/spec/markdown content for
// jailbreak phrases. Lives in the spec-lint facade aggregation.
export const securityIgnoreInstructionsRule: Rule = {
  id: "security-ignore-instructions",
  appliesTo: "all",
  check(ctx) {
    const issues: AgentIssue[] = [];
    if (JAILBREAK_REGEX.test(ctx.content)) {
      issues.push({
        file: ctx.filePath,
        line: 1,
        message: "Found potential jailbreak phrases in specification/prompt.",
        ruleId: "security-ignore-instructions",
        severity: "error",
        suggestion:
          "Ensure prompts or string templates do not contain common prompt injection evasion techniques.",
        category: "Security",
      });
    }
    return issues;
  },
  applyFix(content, issues) {
    const fixes: FixRecord[] = [];
    const ignoreIssues = issues.filter(
      (i) => i.ruleId === "security-ignore-instructions",
    );
    if (ignoreIssues.length === 0) {
      return { content, fixes };
    }

    const ignoreInstructionsPattern = /ignore previous\s+instructions/gi;
    const disregardPattern = /disregard\s+previous/gi;
    const systemPromptPattern = /system\s+prompt/gi;

    const before = content;
    const next = content
      .replace(ignoreInstructionsPattern, "follow the project instructions")
      .replace(disregardPattern, "follow current")
      .replace(systemPromptPattern, "instruction context");

    if (next !== before) {
      fixes.push({
        fixed: true,
        ruleId: "security-ignore-instructions",
        message: "Rewrote prompt-injection-like instruction phrases.",
      });
    }

    return { content: next, fixes };
  },
};
