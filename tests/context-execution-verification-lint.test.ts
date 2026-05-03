import assert from "node:assert/strict";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import test from "node:test";

import { contextOversizedRule } from "../src/rules/context-oversized.js";
import { observabilityMissingTraceIdRule } from "../src/rules/observability-missing-trace-id.js";
import { executionMissingMaxStepsRule } from "../src/rules/execution-missing-max-steps.js";
import { architectureAtomicTransactionsRule } from "../src/rules/architecture-atomic-transactions.js";
import { executionNoDryRunRule } from "../src/rules/execution-no-dry-run.js";
import { verificationMissingTestsRule } from "../src/rules/verification-missing-tests.js";
import { buildCtx } from "./_helpers.js";

test("contextOversizedRule detects oversized context", () => {
  const longString = "x".repeat(5001);
  const issues = contextOversizedRule.check(
    buildCtx("agent.ts", `const context = "${longString}";`),
  );
  assert.ok(issues.length > 0);
});

test("contextOversizedRule ignores normal-sized strings", () => {
  const issues = contextOversizedRule.check(
    buildCtx("agent.ts", 'const context = "This is a normal context string";'),
  );
  assert.strictEqual(issues.length, 0);
});

test("observabilityMissingTraceIdRule detects missing trace ID in agent init", () => {
  const content = [
    "const agent = new Agent({",
    "  name: 'MyAgent',",
    "  tools: []",
    "});",
  ].join("\n");
  const issues = observabilityMissingTraceIdRule.check(
    buildCtx("agent.ts", content),
  );
  assert.ok(issues.length > 0);
});

test("observabilityMissingTraceIdRule accepts agent with trace ID", () => {
  const content = [
    "const agent = new Agent({",
    "  name: 'MyAgent',",
    "  traceId: 'trace-123',",
    "  tools: []",
    "});",
  ].join("\n");
  const issues = observabilityMissingTraceIdRule.check(
    buildCtx("agent.ts", content),
  );
  assert.strictEqual(issues.length, 0);
});

test("executionMissingMaxStepsRule detects infinite loop without max-steps", () => {
  const content = ["while (true) {", "  console.log('Running...');", "}"].join(
    "\n",
  );
  const issues = executionMissingMaxStepsRule.check(
    buildCtx("agent.ts", content),
  );
  assert.ok(issues.length > 0);
});

test("executionMissingMaxStepsRule allows loop with max-steps", () => {
  const content = [
    "const maxSteps = 10;",
    "let step = 0;",
    "while (true && step < maxSteps) {",
    "  step++;",
    "}",
  ].join("\n");
  const issues = executionMissingMaxStepsRule.check(
    buildCtx("agent.ts", content),
  );
  assert.strictEqual(issues.length, 0);
});

test("architectureAtomicTransactionsRule detects multiple mutations without transaction", () => {
  const content = [
    "db.insert({ id: 1 });",
    "db.update({ id: 1, name: 'Updated' });",
  ].join("\n");
  const issues = architectureAtomicTransactionsRule.check(
    buildCtx("db.ts", content),
  );
  assert.ok(issues.length > 0);
});

test("architectureAtomicTransactionsRule allows multiple mutations in transaction", () => {
  const content = [
    "db.transaction(() => {",
    "  db.insert({ id: 1 });",
    "  db.update({ id: 1, name: 'Updated' });",
    "});",
  ].join("\n");
  const issues = architectureAtomicTransactionsRule.check(
    buildCtx("db.ts", content),
  );
  assert.strictEqual(issues.length, 0);
});

test("executionNoDryRunRule detects mutating operations without dry-run", () => {
  const issues = executionNoDryRunRule.check(
    buildCtx("src/tools/dangerous.ts", "child_process.exec('rm -rf /data');"),
  );
  assert.ok(issues.length > 0);
});

test("executionNoDryRunRule allows mutating operations with dry-run", () => {
  const content = [
    "if (dryRun) {",
    "  console.log('Would execute: rm -rf /data');",
    "} else {",
    "  child_process.exec('rm -rf /data');",
    "}",
  ].join("\n");
  const issues = executionNoDryRunRule.check(
    buildCtx("src/tools/dangerous.ts", content),
  );
  assert.strictEqual(issues.length, 0);
});

test("executionNoDryRunRule does not flag mutating ops outside agent-tool contexts", () => {
  // Plain build script — not under tools/ or agents/, no LLM SDK imports.
  const issues = executionNoDryRunRule.check(
    buildCtx("scripts/move.ts", "child_process.exec('mv /tmp/foo /tmp/bar');"),
  );
  assert.strictEqual(issues.length, 0);
});

test("verificationMissingTestsRule detects missing test file for business logic", () => {
  const tempDir = fs.mkdtempSync(
    path.join(os.tmpdir(), "agentlint-verification-test-"),
  );
  const libDir = path.join(tempDir, "src", "lib");
  fs.mkdirSync(libDir, { recursive: true });
  const filePath = path.join(libDir, "utils.ts");
  fs.writeFileSync(filePath, "export function helper() {}", "utf8");

  const issues = verificationMissingTestsRule.check(
    buildCtx(
      "src/lib/utils.ts",
      "export function helper() {}",
      false,
      tempDir,
    ),
  );

  assert.ok(issues.length > 0);
  fs.rmSync(tempDir, { recursive: true, force: true });
});

test("verificationMissingTestsRule allows business logic with test file", () => {
  const tempDir = fs.mkdtempSync(
    path.join(os.tmpdir(), "agentlint-verification-test-"),
  );
  const libDir = path.join(tempDir, "src", "lib");
  fs.mkdirSync(libDir, { recursive: true });
  const filePath = path.join(libDir, "utils.ts");
  const testPath = path.join(libDir, "utils.test.ts");
  fs.writeFileSync(filePath, "export function helper() {}", "utf8");
  fs.writeFileSync(testPath, "test('helper', () => {})", "utf8");

  const issues = verificationMissingTestsRule.check(
    buildCtx(
      "src/lib/utils.ts",
      "export function helper() {}",
      false,
      tempDir,
    ),
  );

  assert.strictEqual(issues.length, 0);
  fs.rmSync(tempDir, { recursive: true, force: true });
});
