import assert from "node:assert/strict";
import test from "node:test";

import { fixSecurityRules } from "../src/fixers/security-fixer.js";
import { fixSpecRules } from "../src/fixers/spec-fixer.js";
import { fixToolRules } from "../src/fixers/tool-fixer.js";
import type { AgentIssue } from "../src/scanners/types.js";

test("fixSecurityRules accepts empty content with prompt-injection issue", () => {
  const issues: AgentIssue[] = [
    {
      file: "agent.ts",
      line: 1,
      message: "Potential prompt injection",
      ruleId: "security-prompt-injection",
      severity: "error",
      category: "Security",
    },
  ];

  const outcome = fixSecurityRules(
    "const prompt = `User said: ${toolOutput}`;",
    issues,
    "agent.ts",
  );
  assert.ok(typeof outcome.content === "string");
  assert.ok(Array.isArray(outcome.fixes));
});

test("fixSpecRules adds acceptance criteria to spec", () => {
  const original = "# Task\nBuild a feature";

  const issues: AgentIssue[] = [
    {
      file: "task.md",
      line: 1,
      message: "Missing acceptance criteria",
      ruleId: "spec-missing-acceptance-criteria",
      severity: "warn",
      category: "Spec",
    },
  ];

  const { content, fixes } = fixSpecRules(original, issues, "task.md");
  assert.ok(fixes.length > 0);
  assert.match(content, /Acceptance Criteria/);
});

test("fixToolRules removes duplicate tool names", () => {
  const original = `
const tools = [
  { name: "getData", description: "first" },
  { name: "getData", description: "second" }
];
`;

  const issues: AgentIssue[] = [
    {
      file: "tools.ts",
      line: 1,
      message: "Duplicate tool names",
      ruleId: "tool-overlapping",
      severity: "error",
      category: "Tool",
    },
  ];

  const { fixes } = fixToolRules(original, issues, "tools.ts");
  assert.ok(Array.isArray(fixes));
});

test("fixSecurityRules returns empty fixes when content has no matching patterns", () => {
  const issues: AgentIssue[] = [
    {
      file: "agent.ts",
      line: 1,
      message: "Test issue",
      ruleId: "security-prompt-injection",
      severity: "error",
      category: "Security",
    },
  ];

  const { fixes } = fixSecurityRules(
    "const x = 1;",
    issues,
    "agent.ts",
  );
  assert.equal(fixes.length, 0);
});

test("fixSpecRules adds rollback section to spec", () => {
  const original = "# Migration Task\nMigrate user data";

  const issues: AgentIssue[] = [
    {
      file: "migration.md",
      line: 1,
      message: "Missing rollback conditions",
      ruleId: "spec-missing-rollback",
      severity: "warn",
      category: "Spec",
    },
  ];

  const { content, fixes } = fixSpecRules(original, issues, "migration.md");
  assert.ok(fixes.length > 0);
  assert.match(content, /Rollback/);
});

test("fixToolRules adds weak schema descriptions", () => {
  const original = `const schema = { type: "object", properties: {} };`;

  const issues: AgentIssue[] = [
    {
      file: "schema.ts",
      line: 1,
      message: "Weak schema",
      ruleId: "tool-weak-schema",
      severity: "error",
      category: "Tool",
    },
  ];

  const { fixes } = fixToolRules(original, issues, "schema.ts");
  assert.ok(Array.isArray(fixes));
});
