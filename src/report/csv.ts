import * as path from "path";
import { VulnerabilityReport } from "../scanners/vulnerabilities.js";
import { LinterReport } from "../scanners/linter.js";
import { AgentIssue } from "../scanners/types.js";

function escapeCsv(value: string | number | null | undefined): string {
  return `"${String(value).replace(/"/g, '""')}"`;
}

// Emit a single CSV stream covering vulnerabilities, linter messages, and
// agentic issues. Suitable for piping into spreadsheets or grep pipelines.
//
// Schema:
//   Type,File,Line,Severity,Rule,Message,Suggestion
export function printCsvReport(
  vuln: VulnerabilityReport,
  lint: LinterReport,
  ast: AgentIssue[],
  targetDir: string,
): void {
  console.log("Type,File,Line,Severity,Rule,Message,Suggestion");

  for (const v of vuln.vulnerabilities) {
    console.log(
      [
        "Vulnerability",
        "package.json",
        "-",
        v.severity,
        "npm-audit",
        v.package,
        v.suggestion,
      ]
        .map(escapeCsv)
        .join(","),
    );
  }

  for (const result of lint.messages) {
    const relativePath = path.relative(targetDir, result.filePath);
    for (const msg of result.messages) {
      const sevStr = msg.severity === 2 ? "error" : "warning";
      const suggestion = msg.fix
        ? "Auto-fix available via 'agentlint fix'."
        : `Review ESLint rule '${msg.ruleId}' to resolve this issue.`;
      console.log(
        [
          "Linter",
          relativePath,
          msg.line,
          sevStr,
          msg.ruleId || "",
          msg.message,
          suggestion,
        ]
          .map(escapeCsv)
          .join(","),
      );
    }
  }

  if (!lint.available) {
    console.log(
      [
        "Linter",
        "-",
        "-",
        "warning",
        "eslint-unavailable",
        lint.failureMessage ||
          "The target project's ESLint setup could not be executed.",
        "Run ESLint directly in the target project to fix its local configuration or dependency graph.",
      ]
        .map(escapeCsv)
        .join(","),
    );
  }

  for (const issue of ast) {
    console.log(
      [
        "AI Smell",
        issue.file,
        issue.line,
        issue.severity,
        issue.ruleId,
        issue.message,
        issue.suggestion || "",
      ]
        .map(escapeCsv)
        .join(","),
    );
  }
}
