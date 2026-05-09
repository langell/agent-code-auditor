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
import { expectCheck, expectNoIssues } from "./_helpers.js";

test("contextOversizedRule detects oversized context", () => {
  const longString = "x".repeat(5001);
  expectCheck(contextOversizedRule, {
    content: `const context = "${longString}";`,
    filePath: "agent.ts",
    expectIssues: [{ ruleId: "context-oversized" }],
  });
});

test("contextOversizedRule ignores normal-sized strings", () => {
  expectNoIssues(contextOversizedRule, {
    content: 'const context = "This is a normal context string";',
    filePath: "agent.ts",
  });
});

test("observabilityMissingTraceIdRule detects missing trace ID in agent init", () => {
  expectCheck(observabilityMissingTraceIdRule, {
    content: [
      "const agent = new Agent({",
      "  name: 'MyAgent',",
      "  tools: []",
      "});",
    ].join("\n"),
    filePath: "agent.ts",
    expectIssues: [{ ruleId: "observability-missing-trace-id" }],
  });
});

test("observabilityMissingTraceIdRule accepts agent with trace ID", () => {
  expectNoIssues(observabilityMissingTraceIdRule, {
    content: [
      "const agent = new Agent({",
      "  name: 'MyAgent',",
      "  traceId: 'trace-123',",
      "  tools: []",
      "});",
    ].join("\n"),
    filePath: "agent.ts",
  });
});

test("executionMissingMaxStepsRule detects infinite loop without max-steps", () => {
  expectCheck(executionMissingMaxStepsRule, {
    content: ["while (true) {", "  console.log('Running...');", "}"].join("\n"),
    filePath: "agent.ts",
    expectIssues: [{ ruleId: "execution-missing-max-steps" }],
  });
});

test("executionMissingMaxStepsRule allows loop with max-steps", () => {
  expectNoIssues(executionMissingMaxStepsRule, {
    content: [
      "const maxSteps = 10;",
      "let step = 0;",
      "while (true && step < maxSteps) {",
      "  step++;",
      "}",
    ].join("\n"),
    filePath: "agent.ts",
  });
});

test("architectureAtomicTransactionsRule detects multiple mutations without transaction", () => {
  expectCheck(architectureAtomicTransactionsRule, {
    content: [
      "db.insert({ id: 1 });",
      "db.update({ id: 1, name: 'Updated' });",
    ].join("\n"),
    filePath: "db.ts",
    expectIssues: [{ ruleId: "architecture-atomic-transactions" }],
  });
});

test("architectureAtomicTransactionsRule allows multiple mutations in transaction", () => {
  expectNoIssues(architectureAtomicTransactionsRule, {
    content: [
      "db.transaction(() => {",
      "  db.insert({ id: 1 });",
      "  db.update({ id: 1, name: 'Updated' });",
      "});",
    ].join("\n"),
    filePath: "db.ts",
  });
});

test("executionNoDryRunRule detects mutating operations without dry-run", () => {
  expectCheck(executionNoDryRunRule, {
    content: "child_process.exec('rm -rf /data');",
    filePath: "src/tools/dangerous.ts",
    expectIssues: [{ ruleId: "execution-no-dry-run" }],
  });
});

test("executionNoDryRunRule allows mutating operations with dry-run", () => {
  expectNoIssues(executionNoDryRunRule, {
    content: [
      "if (dryRun) {",
      "  console.log('Would execute: rm -rf /data');",
      "} else {",
      "  child_process.exec('rm -rf /data');",
      "}",
    ].join("\n"),
    filePath: "src/tools/dangerous.ts",
  });
});

test("executionNoDryRunRule does not flag mutating ops outside agent-tool contexts", () => {
  // Plain build script — not under tools/ or agents/, no LLM SDK imports.
  expectNoIssues(executionNoDryRunRule, {
    content: "child_process.exec('mv /tmp/foo /tmp/bar');",
    filePath: "scripts/move.ts",
  });
});

test("verificationMissingTestsRule detects missing test file for business logic", () => {
  // Verification needs a real workspace — the rule probes the filesystem
  // for a sibling test file, so a temp dir is required.
  const tempDir = fs.mkdtempSync(
    path.join(os.tmpdir(), "agentlint-verification-test-"),
  );
  const libDir = path.join(tempDir, "src", "lib");
  fs.mkdirSync(libDir, { recursive: true });
  fs.writeFileSync(
    path.join(libDir, "utils.ts"),
    "export function helper() {}",
    "utf8",
  );

  expectCheck(verificationMissingTestsRule, {
    content: "export function helper() {}",
    filePath: "src/lib/utils.ts",
    targetDir: tempDir,
    expectIssues: [{ ruleId: "verification-missing-tests" }],
  });

  fs.rmSync(tempDir, { recursive: true, force: true });
});

test("verificationMissingTestsRule allows business logic with test file", () => {
  const tempDir = fs.mkdtempSync(
    path.join(os.tmpdir(), "agentlint-verification-test-"),
  );
  const libDir = path.join(tempDir, "src", "lib");
  fs.mkdirSync(libDir, { recursive: true });
  fs.writeFileSync(
    path.join(libDir, "utils.ts"),
    "export function helper() {}",
    "utf8",
  );
  fs.writeFileSync(
    path.join(libDir, "utils.test.ts"),
    "test('helper', () => {})",
    "utf8",
  );

  expectNoIssues(verificationMissingTestsRule, {
    content: "export function helper() {}",
    filePath: "src/lib/utils.ts",
    targetDir: tempDir,
  });

  fs.rmSync(tempDir, { recursive: true, force: true });
});
