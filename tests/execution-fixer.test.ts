import test from "node:test";

import { executionMissingMaxStepsRule } from "../src/rules/execution-missing-max-steps.js";
import { executionNoDryRunRule } from "../src/rules/execution-no-dry-run.js";
import { expectFix, expectNoFix, makeIssue } from "./_helpers.js";

const maxStepsIssue = makeIssue({
  ruleId: "execution-missing-max-steps",
  file: "agent.ts",
  severity: "warn",
  category: "Execution Safety",
});

const dryRunIssue = makeIssue({
  ruleId: "execution-no-dry-run",
  file: "runner.ts",
  severity: "error",
  category: "Execution Safety",
});

test("executionMissingMaxStepsRule.applyFix replaces all while(true) loops with bounded loops", () => {
  expectFix(executionMissingMaxStepsRule, {
    before: [
      "function run() {",
      "  while (true) {",
      "    doWork();",
      "  }",
      "  while(true){",
      "    doMoreWork();",
      "  }",
      "}",
    ].join("\n"),
    after: [
      "function run() {",
      "  for (let __agentStep = 0; __agentStep < 100; __agentStep++) {",
      "    doWork();",
      "  }",
      "  for (let __agentStep = 0; __agentStep < 100; __agentStep++){",
      "    doMoreWork();",
      "  }",
      "}",
    ].join("\n"),
    issues: [maxStepsIssue],
    filePath: "agent.ts",
    fixCount: 2,
  });
});

test("executionMissingMaxStepsRule.applyFix is a no-op when rule issue is absent", () => {
  expectNoFix(executionMissingMaxStepsRule, {
    before: ["function run() {", "  while (true) {", "    doWork();", "  }", "}"].join(
      "\n",
    ),
    issues: [
      makeIssue({
        ruleId: "tool-overlapping",
        file: "agent.ts",
        severity: "error",
        category: "Tool",
      }),
    ],
    filePath: "agent.ts",
  });
});

test("executionNoDryRunRule.applyFix injects dry-run guards for mutating calls", () => {
  expectFix(executionNoDryRunRule, {
    before: [
      'import * as fs from "fs";',
      "function run() {",
      '  fs.writeFileSync("x.txt", "data");',
      "}",
    ].join("\n"),
    after: [
      'import * as fs from "fs";',
      'const dryRun = process.env.DRY_RUN === "1";',
      "function run() {",
      '  if (!dryRun) fs.writeFileSync("x.txt", "data");',
      "}",
    ].join("\n"),
    issues: [dryRunIssue],
    filePath: "runner.ts",
    fixCount: 2,
  });
});

test("executionNoDryRunRule.applyFix skips when dryRun helper already present", () => {
  expectNoFix(executionNoDryRunRule, {
    before: [
      'const dryRun = process.env.DRY_RUN === "1";',
      "function run() {",
      '  fs.writeFileSync("x.txt", "data");',
      "}",
    ].join("\n"),
    issues: [dryRunIssue],
    filePath: "runner.ts",
  });
});

test("executionNoDryRunRule.applyFix does not wrap multi-line mutation calls (avoids broken syntax)", () => {
  // The dryRun guard prefix would corrupt a multi-line call like:
  //   if (!dryRun) db.insert({\n  ...
  // so the rule deliberately skips multi-line mutation calls.
  expectFix(executionNoDryRunRule, {
    before: [
      "function run() {",
      "  db.insert({",
      "    id: 1,",
      '    name: "x",',
      "  });",
      "}",
    ].join("\n"),
    after: [
      'const dryRun = process.env.DRY_RUN === "1";',
      "function run() {",
      "  db.insert({",
      "    id: 1,",
      '    name: "x",',
      "  });",
      "}",
    ].join("\n"),
    issues: [
      makeIssue({
        ruleId: "execution-no-dry-run",
        file: "tools.ts",
        severity: "error",
        category: "Execution Safety",
      }),
    ],
    filePath: "tools.ts",
    fixCount: 1, // Only the dryRun helper insertion; no per-line wraps
  });
});
