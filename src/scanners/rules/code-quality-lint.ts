import { AgentLintConfig } from "../../config.js";
import { AgentIssue } from "../types.js";

export function checkCodeQualityRules(
  file: string,
  lines: string[],
  config: AgentLintConfig,
): AgentIssue[] {
  const issues: AgentIssue[] = [];

  // 1. No `any` type
  if (config.rules["code-quality-no-any"] !== "off") {
    if (file.endsWith(".ts") || file.endsWith(".tsx")) {
      for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        // Basic heuristic to catch explicit loose types.
        // Examples include type annotation, generic cast, and type assertion forms.
        if (/(:\s*any\b|<\s*any\s*>|\bas\s+any\b)/.test(line)) {
          issues.push({
            file,
            line: i + 1,
            message: "Use of 'any' type detected.",
            ruleId: "code-quality-no-any",
            severity: config.rules["code-quality-no-any"] || "error",
            suggestion:
              "Zero 'any' types allowed. Define explicit interfaces or types to ensure type safety.",
            category: "Code Quality",
          });
        }
      }
    }
  }

  return issues;
}
