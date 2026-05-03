import { AgentIssue } from "../scanners/types.js";
import { Rule } from "./types.js";

const PII_VARIABLE_REGEX =
  /\b(?:user|customer|patient|account|member|person|client|employee|people)s?(?:Data|Object|Record|Info|Profile|Details|List|Map|Array)?\s*=/i;
const SANITIZATION_REGEX =
  /\b(?:redact|sanitize|sanitise|anonymize|anonymise|pseudonymize|pseudonymise|mask|obfuscate|hash|encrypt|scrub|strip|filter)\b/i;

// Despite the `context-` prefix, this rule lives in the security family
// aggregation because it scans for PII handling.
export const contextUnredactedPiiRule: Rule = {
  id: "context-unredacted-pii",
  appliesTo: "all",
  check(ctx) {
    const issues: AgentIssue[] = [];
    for (let i = 0; i < ctx.lines.length; i++) {
      const line = ctx.lines[i];
      if (
        PII_VARIABLE_REGEX.test(line) &&
        !ctx.lines
          .slice(Math.max(0, i), Math.min(ctx.lines.length, i + 10))
          .some((l) => SANITIZATION_REGEX.test(l))
      ) {
        issues.push({
          file: ctx.filePath,
          line: i + 1,
          message: "Potential unredacted user data being processed.",
          ruleId: "context-unredacted-pii",
          severity: "error",
          suggestion:
            "Ensure user records or PII are redacted or minimized before passing to an agent context.",
          category: "Security",
        });
      }
    }
    return issues;
  },
};
