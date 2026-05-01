import assert from "node:assert/strict";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import test from "node:test";

import { fixExecutionRules } from "../src/fixers/execution-fixer.js";
import type { AgentIssue } from "../src/scanners/types.js";

test("fixExecutionRules replaces all while(true) loops with bounded loops", async () => {
  const tempDir = fs.mkdtempSync(
    path.join(os.tmpdir(), "agentlint-exec-fixer-"),
  );
  const filePath = path.join(tempDir, "agent.ts");
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

  fs.writeFileSync(filePath, original, "utf8");

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

  const fixes = await fixExecutionRules(filePath, issues);
  const updated = fs.readFileSync(filePath, "utf8");

  assert.equal(fixes.length, 2);
  assert.doesNotMatch(updated, /while\s*\(\s*true\s*\)/);
  assert.match(
    updated,
    /for \(let __agentStep = 0; __agentStep < 100; __agentStep\+\+\)/,
  );

  fs.rmSync(tempDir, { recursive: true, force: true });
});

test("fixExecutionRules leaves file unchanged when rule issue is absent", async () => {
  const tempDir = fs.mkdtempSync(
    path.join(os.tmpdir(), "agentlint-exec-fixer-"),
  );
  const filePath = path.join(tempDir, "agent.ts");
  const original = [
    "function run() {",
    "  while (true) {",
    "    doWork();",
    "  }",
    "}",
  ].join("\n");

  fs.writeFileSync(filePath, original, "utf8");

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

  const fixes = await fixExecutionRules(filePath, issues);
  const updated = fs.readFileSync(filePath, "utf8");

  assert.equal(fixes.length, 0);
  assert.equal(updated, original);

  fs.rmSync(tempDir, { recursive: true, force: true });
});

test("fixExecutionRules injects dry-run guards for mutating calls", async () => {
  const tempDir = fs.mkdtempSync(
    path.join(os.tmpdir(), "agentlint-exec-fixer-"),
  );
  const filePath = path.join(tempDir, "runner.ts");
  const original = [
    'import * as fs from "fs";',
    "function run() {",
    '  fs.writeFileSync("x.txt", "data");',
    "}",
  ].join("\n");

  fs.writeFileSync(filePath, original, "utf8");

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

  const fixes = await fixExecutionRules(filePath, issues);
  const updated = fs.readFileSync(filePath, "utf8");

  assert.ok(fixes.length >= 2);
  assert.match(updated, /const dryRun = process\.env\.DRY_RUN === "1";/);
  assert.match(
    updated,
    /if \(!dryRun\) fs\.writeFileSync\("x\.txt", "data"\);/,
  );

  fs.rmSync(tempDir, { recursive: true, force: true });
});

test("fixExecutionRules skips dry-run injection when already present", async () => {
  const tempDir = fs.mkdtempSync(
    path.join(os.tmpdir(), "agentlint-exec-fixer-"),
  );
  const filePath = path.join(tempDir, "runner.ts");
  const original = [
    'const dryRun = process.env.DRY_RUN === "1";',
    "function run() {",
    '  fs.writeFileSync("x.txt", "data");',
    "}",
  ].join("\n");

  fs.writeFileSync(filePath, original, "utf8");

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

  const fixes = await fixExecutionRules(filePath, issues);
  const updated = fs.readFileSync(filePath, "utf8");

  assert.equal(fixes.length, 0);
  assert.equal(updated, original);

  fs.rmSync(tempDir, { recursive: true, force: true });
});

test("fixExecutionRules does not wrap multi-line mutation calls (avoids broken syntax)", async () => {
  const tempDir = fs.mkdtempSync(
    path.join(os.tmpdir(), "agentlint-dryrun-multiline-")
  );
  const filePath = path.join(tempDir, "tools.ts");
  const original = [
    "function run() {",
    "  db.insert({",
    "    id: 1,",
    '    name: "x",',
    "  });",
    "}",
  ].join("\n");
  fs.writeFileSync(filePath, original, "utf8");

  const issues: AgentIssue[] = [
    {
      file: "tools.ts",
      line: 1,
      message: "Mutating execution paths found without a dry-run or simulation mode.",
      ruleId: "execution-no-dry-run",
      severity: "error",
      category: "Execution Safety",
    },
  ];

  await fixExecutionRules(filePath, issues);
  const updated = fs.readFileSync(filePath, "utf8");

  // The dryRun helper is added at the top
  assert.match(updated, /const dryRun = process\.env\.DRY_RUN/);
  // But the multi-line db.insert is left untouched (the line "  db.insert({"
  // would otherwise be wrapped, breaking the call)
  assert.match(updated, /^\s+db\.insert\(\{/m);
  assert.doesNotMatch(updated, /if \(!dryRun\) db\.insert\(\{/);

  fs.rmSync(tempDir, { recursive: true, force: true });
});
