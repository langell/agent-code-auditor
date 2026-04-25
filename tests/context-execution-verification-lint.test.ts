import assert from "node:assert/strict";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import test from "node:test";

import { checkContextRules } from "../src/scanners/rules/context-lint.js";
import { checkExecutionRules } from "../src/scanners/rules/execution-lint.js";
import { checkVerificationRules } from "../src/scanners/rules/verification-lint.js";
import { loadConfig } from "../src/config.js";

test("checkContextRules detects oversized context", () => {
  const config = loadConfig(".");
  const longString = "x".repeat(5001);
  const lines = [`const context = "${longString}";`];
  const issues = checkContextRules("agent.ts", lines, config);

  const sizeIssues = issues.filter((i) => i.ruleId === "context-oversized");
  assert.ok(sizeIssues.length > 0);
});

test("checkContextRules ignores normal-sized strings", () => {
  const config = loadConfig(".");
  const lines = ['const context = "This is a normal context string";'];
  const issues = checkContextRules("agent.ts", lines, config);

  const sizeIssues = issues.filter((i) => i.ruleId === "context-oversized");
  assert.strictEqual(sizeIssues.length, 0);
});

test("checkContextRules detects missing trace ID in agent init", () => {
  const config = loadConfig(".");
  const lines = [
    "const agent = new Agent({",
    "  name: 'MyAgent',",
    "  tools: []",
    "});",
  ];
  const issues = checkContextRules("agent.ts", lines, config);

  const traceIssues = issues.filter((i) => i.ruleId === "observability-missing-trace-id");
  assert.ok(traceIssues.length > 0);
});

test("checkContextRules accepts agent with trace ID", () => {
  const config = loadConfig(".");
  const lines = [
    "const agent = new Agent({",
    "  name: 'MyAgent',",
    "  traceId: 'trace-123',",
    "  tools: []",
    "});",
  ];
  const issues = checkContextRules("agent.ts", lines, config);

  const traceIssues = issues.filter((i) => i.ruleId === "observability-missing-trace-id");
  assert.strictEqual(traceIssues.length, 0);
});

test("checkExecutionRules detects infinite loop without max-steps", () => {
  const config = loadConfig(".");
  const lines = [
    "while (true) {",
    "  console.log('Running...');",
    "}",
  ];
  const issues = checkExecutionRules("agent.ts", lines, config);

  const maxStepsIssues = issues.filter((i) => i.ruleId === "execution-missing-max-steps");
  assert.ok(maxStepsIssues.length > 0);
});

test("checkExecutionRules allows loop with max-steps", () => {
  const config = loadConfig(".");
  const lines = [
    "const maxSteps = 10;",
    "let step = 0;",
    "while (true && step < maxSteps) {",
    "  step++;",
    "}",
  ];
  const issues = checkExecutionRules("agent.ts", lines, config);

  const maxStepsIssues = issues.filter((i) => i.ruleId === "execution-missing-max-steps");
  assert.strictEqual(maxStepsIssues.length, 0);
});

test("checkExecutionRules detects multiple mutations without transaction", () => {
  const config = loadConfig(".");
  const lines = [
    "db.insert({ id: 1 });",
    "db.update({ id: 1, name: 'Updated' });",
  ];
  const issues = checkExecutionRules("db.ts", lines, config);

  const transactionIssues = issues.filter((i) => i.ruleId === "architecture-atomic-transactions");
  assert.ok(transactionIssues.length > 0);
});

test("checkExecutionRules allows multiple mutations in transaction", () => {
  const config = loadConfig(".");
  const lines = [
    "db.transaction(() => {",
    "  db.insert({ id: 1 });",
    "  db.update({ id: 1, name: 'Updated' });",
    "});",
  ];
  const issues = checkExecutionRules("db.ts", lines, config);

  const transactionIssues = issues.filter((i) => i.ruleId === "architecture-atomic-transactions");
  assert.strictEqual(transactionIssues.length, 0);
});

test("checkExecutionRules detects mutating operations without dry-run", () => {
  const config = loadConfig(".");
  const lines = [
    "child_process.exec('rm -rf /data');",
  ];
  const issues = checkExecutionRules("dangerous.ts", lines, config);

  const dryRunIssues = issues.filter((i) => i.ruleId === "execution-no-dry-run");
  assert.ok(dryRunIssues.length > 0);
});

test("checkExecutionRules allows mutating operations with dry-run", () => {
  const config = loadConfig(".");
  const lines = [
    "if (dryRun) {",
    "  console.log('Would execute: rm -rf /data');",
    "} else {",
    "  child_process.exec('rm -rf /data');",
    "}",
  ];
  const issues = checkExecutionRules("dangerous.ts", lines, config);

  const dryRunIssues = issues.filter((i) => i.ruleId === "execution-no-dry-run");
  assert.strictEqual(dryRunIssues.length, 0);
});

test("checkVerificationRules detects missing test file for business logic", () => {
  const tempDir = fs.mkdtempSync(
    path.join(os.tmpdir(), "agentlint-verification-test-")
  );
  const libDir = path.join(tempDir, "src", "lib");
  fs.mkdirSync(libDir, { recursive: true });
  const filePath = path.join(libDir, "utils.ts");
  fs.writeFileSync(filePath, "export function helper() {}", "utf8");

  const config = loadConfig(".");
  const issues = checkVerificationRules(
    "src/lib/utils.ts",
    ["export function helper() {}"],
    config,
    tempDir
  );

  const testIssues = issues.filter((i) => i.ruleId === "verification-missing-tests");
  assert.ok(testIssues.length > 0);

  fs.rmSync(tempDir, { recursive: true, force: true });
});

test("checkVerificationRules allows business logic with test file", () => {
  const tempDir = fs.mkdtempSync(
    path.join(os.tmpdir(), "agentlint-verification-test-")
  );
  const libDir = path.join(tempDir, "src", "lib");
  fs.mkdirSync(libDir, { recursive: true });
  const filePath = path.join(libDir, "utils.ts");
  const testPath = path.join(libDir, "utils.test.ts");
  fs.writeFileSync(filePath, "export function helper() {}", "utf8");
  fs.writeFileSync(testPath, "test('helper', () => {})", "utf8");

  const config = loadConfig(".");
  const issues = checkVerificationRules(
    "src/lib/utils.ts",
    ["export function helper() {}"],
    config,
    tempDir
  );

  const testIssues = issues.filter((i) => i.ruleId === "verification-missing-tests");
  assert.strictEqual(testIssues.length, 0);

  fs.rmSync(tempDir, { recursive: true, force: true });
});
