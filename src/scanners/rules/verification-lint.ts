import * as fs from "fs";
import * as path from "path";
import { AgentLintConfig } from "../../config.js";
import { AgentIssue } from "../types.js";

import * as ts from "typescript";

export function checkVerificationRules(
  file: string,
  lines: string[],
  config: AgentLintConfig,
  dir: string,
  sourceFile?: ts.SourceFile,
): AgentIssue[] {
  const issues: AgentIssue[] = [];

  // 1. Missing tests for business logic
  if (config.rules["verification-missing-tests"] !== "off") {
    // Only apply to TS/JS files in common business logic folders
    if (
      (file.includes("src/lib/") ||
        file.includes("src/services/") ||
        file.includes("src/actions/")) &&
      (file.endsWith(".ts") || file.endsWith(".js"))
    ) {
      // Skip test files themselves
      if (!file.includes(".test.") && !file.includes(".spec.")) {
        // Check if a corresponding .test.ts or .spec.ts exists
        const ext = path.extname(file);
        const base = file.substring(0, file.length - ext.length);
        const testFileTs = path.join(dir, `${base}.test.ts`);
        const specFileTs = path.join(dir, `${base}.spec.ts`);
        const testFileJs = path.join(dir, `${base}.test.js`);
        const specFileJs = path.join(dir, `${base}.spec.js`);

        if (
          !fs.existsSync(testFileTs) &&
          !fs.existsSync(specFileTs) &&
          !fs.existsSync(testFileJs) &&
          !fs.existsSync(specFileJs)
        ) {
          issues.push({
            file,
            line: 1,
            message: `Missing corresponding test file for business logic module.`,
            ruleId: "verification-missing-tests",
            severity: config.rules["verification-missing-tests"] === "warn" ? "warn" : "error",
            suggestion:
              "Every core business logic file MUST include a corresponding test file.",
            category: "Verification/Security",
          });
        }
      }
    }
  }

  return issues;
}
