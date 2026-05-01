import assert from "node:assert/strict";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import test from "node:test";

import { fixContextRules } from "../src/fixers/context-fixer.js";
import { fixVerificationRules } from "../src/fixers/verification-fixer.js";

test("fixContextRules injects traceId into Agent initialization", async () => {
  const tempDir = fs.mkdtempSync(
    path.join(os.tmpdir(), "agentlint-context-fixer-test-")
  );
  const filePath = path.join(tempDir, "agent.ts");
  const originalContent = `
const agent = new Agent({
  name: 'TestAgent',
  tools: []
});
`;
  fs.writeFileSync(filePath, originalContent, "utf8");

  const issues = [
    {
      file: filePath,
      line: 1,
      message: "Agent initialization found without an explicit Trace ID or Run ID.",
      ruleId: "observability-missing-trace-id",
      severity: "warn" as const,
      suggestion: "Ensure a traceId or runId is passed into the agent context for observability and debugging.",
      category: "Context",
    },
  ];

  const fixes = await fixContextRules(filePath, issues);

  assert.ok(fixes.length > 0);
  assert.strictEqual(fixes[0].ruleId, "observability-missing-trace-id");

  const modifiedContent = fs.readFileSync(filePath, "utf8");
  assert.match(modifiedContent, /traceId/);

  fs.rmSync(tempDir, { recursive: true, force: true });
});

test("fixContextRules handles file with Agent.init", async () => {
  const tempDir = fs.mkdtempSync(
    path.join(os.tmpdir(), "agentlint-context-fixer-init-test-")
  );
  const filePath = path.join(tempDir, "agent.ts");
  const originalContent = `
const agent = Agent.init({
  name: 'TestAgent'
});
`;
  fs.writeFileSync(filePath, originalContent, "utf8");

  const issues = [
    {
      file: filePath,
      line: 1,
      message: "Agent initialization found without an explicit Trace ID or Run ID.",
      ruleId: "observability-missing-trace-id",
      severity: "warn" as const,
      suggestion: "Ensure a traceId or runId is passed into the agent context for observability and debugging.",
      category: "Context",
    },
  ];

  const fixes = await fixContextRules(filePath, issues);

  assert.ok(fixes.length > 0);

  fs.rmSync(tempDir, { recursive: true, force: true });
});

test("fixContextRules returns empty for non-existent file", async () => {
  const nonExistentFile = "/tmp/does-not-exist-agentlint.ts";
  const issues = [
    {
      file: nonExistentFile,
      line: 1,
      message: "Test issue",
      ruleId: "observability-missing-trace-id",
      severity: "warn" as const,
      suggestion: "Test suggestion",
      category: "Context",
    },
  ];

  const fixes = await fixContextRules(nonExistentFile, issues);

  assert.strictEqual(fixes.length, 0);
});

test("fixVerificationRules creates test file for missing verification", async () => {
  const tempDir = fs.mkdtempSync(
    path.join(os.tmpdir(), "agentlint-verification-fixer-test-")
  );
  const filePath = path.join(tempDir, "utils.ts");
  fs.writeFileSync(filePath, "export function helper() {}", "utf8");

  const issues = [
    {
      file: filePath,
      line: 1,
      message: "Missing corresponding test file for business logic module.",
      ruleId: "verification-missing-tests",
      severity: "warn" as const,
      suggestion: "Every core business logic file MUST include a corresponding test file.",
      category: "Verification/Security",
    },
  ];

  const fixes = await fixVerificationRules(filePath, issues);

  assert.ok(fixes.length > 0);
  assert.strictEqual(fixes[0].ruleId, "verification-missing-tests");

  const testFilePath = path.join(tempDir, "utils.test.ts");
  assert.ok(fs.existsSync(testFilePath));

  const testContent = fs.readFileSync(testFilePath, "utf8");
  assert.match(testContent, /utils/);

  fs.rmSync(tempDir, { recursive: true, force: true });
});

test("fixVerificationRules skips if test file already exists", async () => {
  const tempDir = fs.mkdtempSync(
    path.join(os.tmpdir(), "agentlint-verification-fixer-exists-test-")
  );
  const filePath = path.join(tempDir, "utils.ts");
  const testFilePath = path.join(tempDir, "utils.test.ts");
  fs.writeFileSync(filePath, "export function helper() {}", "utf8");
  fs.writeFileSync(testFilePath, "// existing test", "utf8");

  const issues = [
    {
      file: filePath,
      line: 1,
      message: "Missing corresponding test file for business logic module.",
      ruleId: "verification-missing-tests",
      severity: "warn" as const,
      suggestion: "Every core business logic file MUST include a corresponding test file.",
      category: "Verification/Security",
    },
  ];

  const fixes = await fixVerificationRules(filePath, issues);

  assert.strictEqual(fixes.length, 0);

  fs.rmSync(tempDir, { recursive: true, force: true });
});

test("fixVerificationRules handles empty issues array", async () => {
  const filePath = "/tmp/test.ts";
  const fixes = await fixVerificationRules(filePath, []);

  assert.strictEqual(fixes.length, 0);
});

test("fixContextRules non-AST fallback fixes all Agent occurrences in a file", async () => {
  const tempDir = fs.mkdtempSync(
    path.join(os.tmpdir(), "agentlint-context-multi-agent-")
  );
  const filePath = path.join(tempDir, "agents.ts");
  const original = [
    "const a = new Agent({ tools: [] });",
    "const b = new Agent({ model: 'x' });",
    "",
  ].join("\n");
  fs.writeFileSync(filePath, original, "utf8");

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

  await fixContextRules(filePath, issues);
  const updated = fs.readFileSync(filePath, "utf8");

  // Both Agent inits should have traceId injected
  const traceIdCount = (updated.match(/traceId:/g) || []).length;
  assert.equal(traceIdCount, 2);

  fs.rmSync(tempDir, { recursive: true, force: true });
});
