import assert from "node:assert/strict";
import test from "node:test";

import { loadConfig } from "../src/config.js";
import { checkContextRules } from "../src/scanners/rules/context-lint.js";
import { checkExecutionRules } from "../src/scanners/rules/execution-lint.js";
import { checkSecurityRules } from "../src/scanners/rules/security-lint.js";
import { checkToolRules } from "../src/scanners/rules/tool-lint.js";

test("execution rules accept maxIterations guards", () => {
  const config = loadConfig(".");
  const lines = [
    "let maxIterations = 50;",
    "while (true) {",
    "  if (count >= maxIterations) break;",
    "  count++;",
    "}",
  ];

  const issues = checkExecutionRules("loop.ts", lines, config);
  assert.strictEqual(
    issues.some((issue) => issue.ruleId === "execution-missing-max-steps"),
    false,
  );
});

test("execution rules accept explicit transactions", () => {
  const config = loadConfig(".");
  const lines = [
    "db.transaction(() => {",
    "  db.insert({ data: 1 });",
    "  db.delete({ id: 1 });",
    "  db.update({ id: 2, name: 'new' });",
    "});",
  ];

  const issues = checkExecutionRules("transaction.ts", lines, config);
  assert.strictEqual(
    issues.some((issue) => issue.ruleId === "architecture-atomic-transactions"),
    false,
  );
});

test("security rules accept approval guards", () => {
  const config = loadConfig(".");
  const lines = [
    "if (approved) {",
    "  fs.writeFileSync('/etc/passwd', data);",
    "}",
  ];

  const issues = checkSecurityRules("destructive.ts", lines, config);
  assert.strictEqual(
    issues.some((issue) => issue.ruleId === "security-destructive-action"),
    false,
  );
});

test("security rules preserve configured warn severity", () => {
  const config = loadConfig(".");
  config.rules["security-destructive-action"] = "warn";

  const issues = checkSecurityRules("file.ts", ["fs.writeFileSync('/tmp/file', data);"], config);
  const destructiveIssue = issues.find(
    (issue) => issue.ruleId === "security-destructive-action",
  );

  if (destructiveIssue) {
    assert.strictEqual(destructiveIssue.severity, "warn");
  }
});

test("context rules accept runId and correlationId", () => {
  const config = loadConfig(".");
  const runIdIssues = checkContextRules(
    "agent.ts",
    ["const agent = new Agent({ runId: 'test', tools: [] });"],
    config,
  );
  const correlationIssues = checkContextRules(
    "agent.ts",
    ["const agent = new Agent({ correlationId: 'corr-123', tools: [] });"],
    config,
  );

  assert.strictEqual(
    runIdIssues.some((issue) => issue.ruleId === "observability-missing-trace-id"),
    false,
  );
  assert.strictEqual(
    correlationIssues.some((issue) => issue.ruleId === "observability-missing-trace-id"),
    false,
  );
});

test("tool rules handle duplicate declarations branch", () => {
  const config = loadConfig(".");
  const lines = [
    'export const tools = [',
    '  { name: "tool1", handler: func1 },',
    '  { name: "tool1", handler: func2 },',
    '  { name: "tool1", handler: func3 }',
    '];',
  ];

  const issues = checkToolRules("tools.ts", lines, config);
  assert.ok(issues.some((issue) => issue.ruleId === "tool-overlapping"));
});
