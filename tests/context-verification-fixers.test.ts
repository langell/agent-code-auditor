import assert from "node:assert/strict";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import test from "node:test";

import { fixContextRules } from "../src/fixers/context-fixer.js";
import { fixVerificationRules } from "../src/fixers/verification-fixer.js";
import type { AgentIssue } from "../src/scanners/types.js";

test("fixContextRules injects traceId into Agent initialization", () => {
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
      suggestion:
        "Ensure a traceId or runId is passed into the agent context for observability and debugging.",
      category: "Context",
    },
  ];

  const { content, fixes } = fixContextRules(original, issues, "agent.ts");

  assert.ok(fixes.length > 0);
  assert.strictEqual(fixes[0].ruleId, "observability-missing-trace-id");
  assert.match(content, /traceId/);
});

test("fixContextRules handles file with Agent.init", () => {
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
      suggestion:
        "Ensure a traceId or runId is passed into the agent context for observability and debugging.",
      category: "Context",
    },
  ];

  const { fixes } = fixContextRules(original, issues, "agent.ts");

  assert.ok(fixes.length > 0);
});

test("fixContextRules returns no fixes when no matching issues", () => {
  const original = "const x = 1;";
  const { content, fixes } = fixContextRules(original, [], "irrelevant.ts");

  assert.strictEqual(fixes.length, 0);
  assert.strictEqual(content, original);
});

test("fixVerificationRules creates test file for missing verification", () => {
  const tempDir = fs.mkdtempSync(
    path.join(os.tmpdir(), "agentlint-verification-fixer-test-"),
  );
  const filePath = path.join(tempDir, "utils.ts");
  // The fixer reads package.json (workspace context) for framework
  // detection, and checks sibling test file existence — both are real
  // workspace I/O, not target I/O. Source content stays in-memory.
  fs.writeFileSync(filePath, "export function helper() {}", "utf8");

  const issues: AgentIssue[] = [
    {
      file: filePath,
      line: 1,
      message: "Missing corresponding test file for business logic module.",
      ruleId: "verification-missing-tests",
      severity: "warn",
      suggestion:
        "Every core business logic file MUST include a corresponding test file.",
      category: "Verification/Security",
    },
  ];

  const { fixes, newFiles } = fixVerificationRules(
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

test("fixVerificationRules skips if test file already exists", () => {
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
      suggestion:
        "Every core business logic file MUST include a corresponding test file.",
      category: "Verification/Security",
    },
  ];

  const { fixes, newFiles } = fixVerificationRules(
    "export function helper() {}",
    issues,
    filePath,
  );

  assert.strictEqual(fixes.length, 0);
  assert.ok(!newFiles || newFiles.length === 0);

  fs.rmSync(tempDir, { recursive: true, force: true });
});

test("fixVerificationRules handles empty issues array", () => {
  const { fixes } = fixVerificationRules("// any", [], "/tmp/test.ts");
  assert.strictEqual(fixes.length, 0);
});

test("fixContextRules non-AST fallback fixes all Agent occurrences in a file", () => {
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

  const { content } = fixContextRules(original, issues, "agents.ts");

  // Both Agent inits should have traceId injected
  const traceIdCount = (content.match(/traceId:/g) || []).length;
  assert.equal(traceIdCount, 2);
});
