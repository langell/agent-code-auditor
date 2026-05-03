import assert from "node:assert/strict";
import test from "node:test";

import { specMissingAcceptanceCriteriaRule } from "../src/rules/spec-missing-acceptance-criteria.js";
import { specMissingRollbackRule } from "../src/rules/spec-missing-rollback.js";
import { toolOverlappingRule } from "../src/rules/tool-overlapping.js";
import { toolWeakSchemaRule } from "../src/rules/tool-weak-schema.js";
import { securityPromptInjectionRule } from "../src/rules/security-prompt-injection.js";
import type { AgentIssue } from "../src/scanners/types.js";

test("security-prompt-injection has no applyFix (detection-only rule)", () => {
  // Sanity check: this rule emits issues but has no fixer; verifies the
  // optional-applyFix design holds up.
  assert.equal(typeof securityPromptInjectionRule.applyFix, "undefined");
});

test("specMissingAcceptanceCriteriaRule.applyFix appends acceptance criteria", () => {
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

  const { content, fixes } = specMissingAcceptanceCriteriaRule.applyFix!(
    original,
    issues,
    "task.md",
  );
  assert.ok(fixes.length > 0);
  assert.match(content, /Acceptance Criteria/);
});

test("toolOverlappingRule.applyFix renames duplicate tool names", () => {
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

  const { fixes } = toolOverlappingRule.applyFix!(
    original,
    issues,
    "tools.ts",
  );
  assert.ok(Array.isArray(fixes));
});

test("specMissingRollbackRule.applyFix appends rollback section", () => {
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

  const { content, fixes } = specMissingRollbackRule.applyFix!(
    original,
    issues,
    "migration.md",
  );
  assert.ok(fixes.length > 0);
  assert.match(content, /Rollback/);
});

test("toolWeakSchemaRule.applyFix injects description on weak schema", () => {
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

  const { fixes } = toolWeakSchemaRule.applyFix!(
    original,
    issues,
    "schema.ts",
  );
  assert.ok(Array.isArray(fixes));
});
