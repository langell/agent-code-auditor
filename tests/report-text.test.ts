import assert from "node:assert/strict";
import test from "node:test";

import {
  printScanHeader,
  printScanReport,
  printFixHeader,
  printFixReport,
} from "../src/report/text.js";
import { loadConfig } from "../src/config.js";
import type { VulnerabilityReport } from "../src/scanners/vulnerabilities.js";
import type { LinterReport } from "../src/scanners/linter.js";
import type { AgentIssue } from "../src/scanners/types.js";
import type { FixReport } from "../src/rules/types.js";

// Smoke-level coverage for the chalk-formatted reporter. The output content
// itself is volatile (emojis, ANSI colors, line counts), so these tests
// assert the high-level invariants: doesn't throw, produces non-empty
// output, and key markers appear.

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

const emptyVuln: VulnerabilityReport = {
  issues: 0,
  details: "",
  vulnerabilities: [],
};

const emptyLint: LinterReport = {
  available: true,
  errorCount: 0,
  warningCount: 0,
  messages: [],
};

test("printScanHeader prints target dir and rule-override count", () => {
  const config = loadConfig(".");
  const lines = captureStdout(() => printScanHeader("/tmp/target", config));
  const joined = lines.join("\n");
  assert.match(joined, /Scanning directory:.*\/tmp\/target/);
  assert.match(joined, /Loaded AgentLint config/);
});

test("printScanReport handles empty inputs (the all-clean path)", () => {
  const lines = captureStdout(() =>
    printScanReport(emptyVuln, emptyLint, []),
  );
  const joined = lines.join("\n");
  assert.match(joined, /AgentLint Report/);
  // Each section reports its happy path
  assert.match(joined, /No vulnerability issues/);
  assert.match(joined, /Code styling is clean/);
  assert.match(joined, /No agentic smells found/);
});

test("printScanReport renders vulnerabilities, lint errors, and AST issues", () => {
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

  const lines = captureStdout(() => printScanReport(vuln, lint, ast));
  const joined = lines.join("\n");

  assert.match(joined, /lodash/);
  assert.match(joined, /Unused variable/);
  assert.match(joined, /missing trace/);
  assert.match(joined, /weak schema/);
  // Summary line counts each axis
  assert.match(
    joined,
    /Found 1 vulnerabilities, 1 lint errors, 0 lint warnings, and 2 agentic smells/,
  );
});

test("printScanReport renders linter-unavailable troubleshooting block", () => {
  const lint: LinterReport = {
    available: false,
    failureMessage: "Could not resolve eslint.",
    errorCount: 0,
    warningCount: 0,
    messages: [],
  };

  const lines = captureStdout(() => printScanReport(emptyVuln, lint, []));
  const joined = lines.join("\n");
  assert.match(joined, /Linter could not run/);
  assert.match(joined, /Could not resolve eslint/);
  assert.match(joined, /linter unavailable/);
});

test("printFixHeader prints the fix banner", () => {
  const lines = captureStdout(() => printFixHeader("/tmp/x"));
  assert.match(lines.join("\n"), /Fixing directory:.*\/tmp\/x/);
});

test("printFixReport: empty report shows no-op message", () => {
  const report: FixReport = { fixes: [] };
  const lines = captureStdout(() => printFixReport(report));
  assert.match(lines.join("\n"), /No agentic smells could be auto-fixed/);
});

test("printFixReport: non-empty report lists each fix and counts them", () => {
  const report: FixReport = {
    fixes: [
      {
        file: "agent.ts",
        fixed: true,
        ruleId: "observability-missing-trace-id",
        message: "Injected missing traceId on line 1.",
      },
      {
        file: "tools.ts",
        fixed: true,
        ruleId: "tool-overlapping",
        message: "Renamed duplicate tool 'foo' to 'foo_2' on line 4.",
      },
    ],
  };
  const lines = captureStdout(() => printFixReport(report));
  const joined = lines.join("\n");
  assert.match(joined, /agent\.ts/);
  assert.match(joined, /tools\.ts/);
  assert.match(joined, /Applied 2 agentic smell fixes/);
});
