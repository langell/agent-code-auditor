import assert from "node:assert/strict";
import test from "node:test";

import { printCsvReport } from "../src/report/csv.js";
import type { VulnerabilityReport } from "../src/scanners/vulnerabilities.js";
import type { LinterReport } from "../src/scanners/linter.js";
import type { AgentIssue } from "../src/scanners/types.js";

// Capture console.log output across a callback. Restores the original at the
// end (even on throw).
function captureStdout(fn: () => void): string[] {
  const lines: string[] = [];
  const original = console.log;
  console.log = (...args: unknown[]) => {
    lines.push(args.map(String).join(" "));
  };
  try {
    fn();
  } finally {
    console.log = original;
  }
  return lines;
}

test("printCsvReport writes the schema header followed by rows", () => {
  const vuln: VulnerabilityReport = {
    issues: 1,
    details: "Found 1 known vulnerability.",
    vulnerabilities: [
      {
        package: "lodash",
        severity: "high",
        suggestion: "pnpm update lodash",
      },
    ],
  };
  const lint: LinterReport = {
    available: true,
    errorCount: 0,
    warningCount: 0,
    messages: [],
  };
  const ast: AgentIssue[] = [];

  const lines = captureStdout(() =>
    printCsvReport(vuln, lint, ast, "/tmp/target"),
  );

  assert.equal(lines[0], "Type,File,Line,Severity,Rule,Message,Suggestion");
  // One vuln row, no lint rows, no AST rows
  assert.equal(lines.length, 2);
  assert.match(
    lines[1],
    /^"Vulnerability","package\.json","-","high","npm-audit","lodash","pnpm update lodash"$/,
  );
});

test("printCsvReport escapes embedded double quotes", () => {
  const vuln: VulnerabilityReport = { issues: 0, details: "", vulnerabilities: [] };
  const lint: LinterReport = {
    available: true,
    errorCount: 0,
    warningCount: 0,
    messages: [],
  };
  const ast: AgentIssue[] = [
    {
      file: "code.ts",
      line: 7,
      message: 'Use of "any" type detected.',
      ruleId: "code-quality-no-any",
      severity: "error",
      category: "Code Quality",
    },
  ];

  const lines = captureStdout(() =>
    printCsvReport(vuln, lint, ast, "/tmp/target"),
  );

  // Quotes within message are doubled per CSV escaping rules
  const dataRow = lines[1];
  assert.ok(dataRow.includes(`""any""`));
});

test("printCsvReport emits an eslint-unavailable row when linter could not run", () => {
  const vuln: VulnerabilityReport = { issues: 0, details: "", vulnerabilities: [] };
  const lint: LinterReport = {
    available: false,
    failureMessage: "ESLint config missing.",
    errorCount: 0,
    warningCount: 0,
    messages: [],
  };
  const ast: AgentIssue[] = [];

  const lines = captureStdout(() =>
    printCsvReport(vuln, lint, ast, "/tmp/target"),
  );

  assert.equal(lines.length, 2);
  assert.match(lines[1], /eslint-unavailable/);
  assert.match(lines[1], /ESLint config missing/);
});

test("printCsvReport relativizes lint paths to targetDir", () => {
  const vuln: VulnerabilityReport = { issues: 0, details: "", vulnerabilities: [] };
  const lint: LinterReport = {
    available: true,
    errorCount: 1,
    warningCount: 0,
    messages: [
      {
        filePath: "/tmp/target/src/file.ts",
        errorCount: 1,
        warningCount: 0,
        messages: [
          {
            ruleId: "no-unused-vars",
            severity: 2,
            message: "Unused variable",
            line: 3,
          },
        ],
      },
    ],
  };
  const ast: AgentIssue[] = [];

  const lines = captureStdout(() =>
    printCsvReport(vuln, lint, ast, "/tmp/target"),
  );

  // Path is relative to target ("src/file.ts"), not absolute
  assert.match(lines[1], /"Linter","src\/file\.ts","3"/);
});

test("printCsvReport emits AI Smell rows for each AgentIssue", () => {
  const vuln: VulnerabilityReport = { issues: 0, details: "", vulnerabilities: [] };
  const lint: LinterReport = {
    available: true,
    errorCount: 0,
    warningCount: 0,
    messages: [],
  };
  const ast: AgentIssue[] = [
    {
      file: "agent.ts",
      line: 12,
      message: "missing trace",
      ruleId: "observability-missing-trace-id",
      severity: "warn",
      category: "Context",
      suggestion: "Pass traceId.",
    },
    {
      file: "tools.ts",
      line: 5,
      message: "weak schema",
      ruleId: "tool-weak-schema",
      severity: "error",
      category: "Tool",
    },
  ];

  const lines = captureStdout(() =>
    printCsvReport(vuln, lint, ast, "/tmp/target"),
  );

  assert.equal(lines.length, 3); // header + 2 issues
  assert.match(lines[1], /"AI Smell","agent\.ts","12","warn","observability-missing-trace-id"/);
  assert.match(lines[2], /"AI Smell","tools\.ts","5","error","tool-weak-schema"/);
});
