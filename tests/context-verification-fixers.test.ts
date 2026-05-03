import assert from "node:assert/strict";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import test from "node:test";

import { observabilityMissingTraceIdRule } from "../src/rules/observability-missing-trace-id.js";
import { verificationMissingTestsRule } from "../src/rules/verification-missing-tests.js";
import type { AgentIssue } from "../src/scanners/types.js";

test("observabilityMissingTraceIdRule.applyFix injects traceId into Agent initialization", () => {
  const original = `
const agent = new Agent({
  name: 'TestAgent',
  tools: []
});
`;

  const issues: AgentIssue[] = [
    {
      file: "agent.ts",
      line: 1,
      message:
        "Agent initialization found without an explicit Trace ID or Run ID.",
      ruleId: "observability-missing-trace-id",
      severity: "warn",
      category: "Context",
    },
  ];

  const { content, fixes } = observabilityMissingTraceIdRule.applyFix!(
    original,
    issues,
    "agent.ts",
  );

  assert.ok(fixes.length > 0);
  assert.strictEqual(fixes[0].ruleId, "observability-missing-trace-id");
  assert.match(content, /traceId/);
});

test("observabilityMissingTraceIdRule.applyFix handles file with Agent.init", () => {
  const original = `
const agent = Agent.init({
  name: 'TestAgent'
});
`;

  const issues: AgentIssue[] = [
    {
      file: "agent.ts",
      line: 1,
      message:
        "Agent initialization found without an explicit Trace ID or Run ID.",
      ruleId: "observability-missing-trace-id",
      severity: "warn",
      category: "Context",
    },
  ];

  const { fixes } = observabilityMissingTraceIdRule.applyFix!(
    original,
    issues,
    "agent.ts",
  );

  assert.ok(fixes.length > 0);
});

test("observabilityMissingTraceIdRule.applyFix returns no fixes when no matching issues", () => {
  const original = "const x = 1;";
  const { content, fixes } = observabilityMissingTraceIdRule.applyFix!(
    original,
    [],
    "irrelevant.ts",
  );

  assert.strictEqual(fixes.length, 0);
  assert.strictEqual(content, original);
});

test("verificationMissingTestsRule.applyFix scaffolds new test file", () => {
  const tempDir = fs.mkdtempSync(
    path.join(os.tmpdir(), "agentlint-verification-fixer-test-"),
  );
  const filePath = path.join(tempDir, "utils.ts");
  fs.writeFileSync(filePath, "export function helper() {}", "utf8");

  const issues: AgentIssue[] = [
    {
      file: filePath,
      line: 1,
      message: "Missing corresponding test file for business logic module.",
      ruleId: "verification-missing-tests",
      severity: "warn",
      category: "Verification/Security",
    },
  ];

  const { fixes, newFiles } = verificationMissingTestsRule.applyFix!(
    "export function helper() {}",
    issues,
    filePath,
  );

  assert.ok(fixes.length > 0);
  assert.strictEqual(fixes[0].ruleId, "verification-missing-tests");
  assert.ok(newFiles && newFiles.length > 0);

  const expectedTestPath = path.join(tempDir, "utils.test.ts");
  assert.strictEqual(newFiles![0].path, expectedTestPath);
  assert.match(newFiles![0].content, /utils/);

  fs.rmSync(tempDir, { recursive: true, force: true });
});

test("verificationMissingTestsRule.applyFix skips if test file already exists", () => {
  const tempDir = fs.mkdtempSync(
    path.join(os.tmpdir(), "agentlint-verification-fixer-exists-test-"),
  );
  const filePath = path.join(tempDir, "utils.ts");
  const testFilePath = path.join(tempDir, "utils.test.ts");
  fs.writeFileSync(filePath, "export function helper() {}", "utf8");
  fs.writeFileSync(testFilePath, "// existing test", "utf8");

  const issues: AgentIssue[] = [
    {
      file: filePath,
      line: 1,
      message: "Missing corresponding test file for business logic module.",
      ruleId: "verification-missing-tests",
      severity: "warn",
      category: "Verification/Security",
    },
  ];

  const { fixes, newFiles } = verificationMissingTestsRule.applyFix!(
    "export function helper() {}",
    issues,
    filePath,
  );

  assert.strictEqual(fixes.length, 0);
  assert.ok(!newFiles || newFiles.length === 0);

  fs.rmSync(tempDir, { recursive: true, force: true });
});

test("verificationMissingTestsRule.applyFix handles empty issues array", () => {
  const { fixes } = verificationMissingTestsRule.applyFix!(
    "// any",
    [],
    "/tmp/test.ts",
  );
  assert.strictEqual(fixes.length, 0);
});

test("observabilityMissingTraceIdRule.applyFix non-AST fallback fixes all Agent occurrences", () => {
  const original = [
    "const a = new Agent({ tools: [] });",
    "const b = new Agent({ model: 'x' });",
    "",
  ].join("\n");

  const issues: AgentIssue[] = [
    {
      file: "agents.ts",
      line: 1,
      message: "missing trace",
      ruleId: "observability-missing-trace-id",
      severity: "warn",
      category: "Context",
    },
    {
      file: "agents.ts",
      line: 2,
      message: "missing trace",
      ruleId: "observability-missing-trace-id",
      severity: "warn",
      category: "Context",
    },
  ];

  const { content } = observabilityMissingTraceIdRule.applyFix!(
    original,
    issues,
    "agents.ts",
  );

  // Both Agent inits should have traceId injected
  const traceIdCount = (content.match(/traceId:/g) || []).length;
  assert.equal(traceIdCount, 2);
});
