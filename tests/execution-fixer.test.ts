import assert from "node:assert/strict";
import test from "node:test";

import { executionMissingMaxStepsRule } from "../src/rules/execution-missing-max-steps.js";
import { executionNoDryRunRule } from "../src/rules/execution-no-dry-run.js";
import type { AgentIssue } from "../src/scanners/types.js";

test("executionMissingMaxStepsRule.applyFix replaces all while(true) loops with bounded loops", () => {
  const original = [
    "function run() {",
    "  while (true) {",
    "    doWork();",
    "  }",
    "  while(true){",
    "    doMoreWork();",
    "  }",
    "}",
  ].join("\n");

  const issues: AgentIssue[] = [
    {
      file: "agent.ts",
      line: 1,
      message:
        "Agent loop detected without explicit max-steps or retry budget.",
      ruleId: "execution-missing-max-steps",
      severity: "warn",
      category: "Execution Safety",
    },
  ];

  const { content, fixes } = executionMissingMaxStepsRule.applyFix!(
    original,
    issues,
    "agent.ts",
  );

  assert.equal(fixes.length, 2);
  assert.doesNotMatch(content, /while\s*\(\s*true\s*\)/);
  assert.match(
    content,
    /for \(let __agentStep = 0; __agentStep < 100; __agentStep\+\+\)/,
  );
});

test("executionMissingMaxStepsRule.applyFix is a no-op when rule issue is absent", () => {
  const original = [
    "function run() {",
    "  while (true) {",
    "    doWork();",
    "  }",
    "}",
  ].join("\n");

  const issues: AgentIssue[] = [
    {
      file: "agent.ts",
      line: 1,
      message: "Different issue.",
      ruleId: "tool-overlapping",
      severity: "error",
      category: "Tool",
    },
  ];

  const { content, fixes } = executionMissingMaxStepsRule.applyFix!(
    original,
    issues,
    "agent.ts",
  );

  assert.equal(fixes.length, 0);
  assert.equal(content, original);
});

test("executionNoDryRunRule.applyFix injects dry-run guards for mutating calls", () => {
  const original = [
    'import * as fs from "fs";',
    "function run() {",
    '  fs.writeFileSync("x.txt", "data");',
    "}",
  ].join("\n");

  const issues: AgentIssue[] = [
    {
      file: "runner.ts",
      line: 1,
      message:
        "Mutating execution paths found without a dry-run or simulation mode.",
      ruleId: "execution-no-dry-run",
      severity: "error",
      category: "Execution Safety",
    },
  ];

  const { content, fixes } = executionNoDryRunRule.applyFix!(
    original,
    issues,
    "runner.ts",
  );

  assert.ok(fixes.length >= 2);
  assert.match(content, /const dryRun = process\.env\.DRY_RUN === "1";/);
  assert.match(
    content,
    /if \(!dryRun\) fs\.writeFileSync\("x\.txt", "data"\);/,
  );
});

test("executionNoDryRunRule.applyFix skips when dryRun helper already present", () => {
  const original = [
    'const dryRun = process.env.DRY_RUN === "1";',
    "function run() {",
    '  fs.writeFileSync("x.txt", "data");',
    "}",
  ].join("\n");

  const issues: AgentIssue[] = [
    {
      file: "runner.ts",
      line: 1,
      message:
        "Mutating execution paths found without a dry-run or simulation mode.",
      ruleId: "execution-no-dry-run",
      severity: "error",
      category: "Execution Safety",
    },
  ];

  const { content, fixes } = executionNoDryRunRule.applyFix!(
    original,
    issues,
    "runner.ts",
  );

  assert.equal(fixes.length, 0);
  assert.equal(content, original);
});

test("executionNoDryRunRule.applyFix does not wrap multi-line mutation calls (avoids broken syntax)", () => {
  const original = [
    "function run() {",
    "  db.insert({",
    "    id: 1,",
    '    name: "x",',
    "  });",
    "}",
  ].join("\n");

  const issues: AgentIssue[] = [
    {
      file: "tools.ts",
      line: 1,
      message:
        "Mutating execution paths found without a dry-run or simulation mode.",
      ruleId: "execution-no-dry-run",
      severity: "error",
      category: "Execution Safety",
    },
  ];

  const { content } = executionNoDryRunRule.applyFix!(
    original,
    issues,
    "tools.ts",
  );

  // The dryRun helper is added at the top
  assert.match(content, /const dryRun = process\.env\.DRY_RUN/);
  // But the multi-line db.insert is left untouched
  assert.match(content, /^\s+db\.insert\(\{/m);
  assert.doesNotMatch(content, /if \(!dryRun\) db\.insert\(\{/);
});
