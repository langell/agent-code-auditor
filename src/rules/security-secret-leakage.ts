import { AgentIssue } from "../scanners/types.js";
import { Rule } from "./types.js";

const OPENAI_KEY_REGEX = /sk-[a-zA-Z0-9]{32,}/;
const SLACK_TOKEN_REGEX = /xoxb-[0-9]{10,}/;

export const securitySecretLeakageRule: Rule = {
  id: "security-secret-leakage",
  appliesTo: "all",
  check(ctx) {
    const issues: AgentIssue[] = [];
    for (let i = 0; i < ctx.lines.length; i++) {
      const line = ctx.lines[i];
      if (OPENAI_KEY_REGEX.test(line) || SLACK_TOKEN_REGEX.test(line)) {
        issues.push({
          file: ctx.filePath,
          line: i + 1,
          message: "Potential secret/API key exposed in code or config.",
          ruleId: "security-secret-leakage",
          severity: "error",
          suggestion:
            "Remove hardcoded secrets and use environment variables or a secret manager.",
          category: "Security",
        });
      }
    }
    return issues;
  },
};
