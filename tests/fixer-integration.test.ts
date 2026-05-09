import assert from "node:assert/strict";
import test from "node:test";

import { specMissingAcceptanceCriteriaRule } from "../src/rules/spec-missing-acceptance-criteria.js";
import { specMissingRollbackRule } from "../src/rules/spec-missing-rollback.js";
import { toolOverlappingRule } from "../src/rules/tool-overlapping.js";
import { toolWeakSchemaRule } from "../src/rules/tool-weak-schema.js";
import { securityPromptInjectionRule } from "../src/rules/security-prompt-injection.js";
import { expectFix, makeIssue } from "./_helpers.js";

test("security-prompt-injection has no applyFix (detection-only rule)", () => {
  // Sanity check: optional applyFix design — some rules detect without
  // fixing.
  assert.equal(typeof securityPromptInjectionRule.applyFix, "undefined");
});

test("specMissingAcceptanceCriteriaRule.applyFix appends acceptance criteria", () => {
  expectFix(specMissingAcceptanceCriteriaRule, {
    before: "# Task\nBuild a feature",
    after:
      "# Task\nBuild a feature" +
      "\n\n## Acceptance Criteria\n- [ ] TBD: Define acceptance criteria.\n",
    issues: [
      makeIssue({
        ruleId: "spec-missing-acceptance-criteria",
        file: "task.md",
        category: "Spec",
      }),
    ],
    filePath: "task.md",
    fixCount: 1,
  });
});

test("toolOverlappingRule.applyFix renames duplicate tool names", () => {
  expectFix(toolOverlappingRule, {
    before: `
const tools = [
  { name: "getData", description: "first" },
  { name: "getData", description: "second" }
];
`,
    after: `
const tools = [
  { name: "getData", description: "first" },
  { name: "getData_2", description: "second" }
];
`,
    issues: [
      makeIssue({
        ruleId: "tool-overlapping",
        file: "tools.ts",
        severity: "error",
        category: "Tool",
      }),
    ],
    filePath: "tools.ts",
    fixCount: 1,
  });
});

test("specMissingRollbackRule.applyFix appends rollback section", () => {
  expectFix(specMissingRollbackRule, {
    before: "# Migration Task\nMigrate user data",
    after:
      "# Migration Task\nMigrate user data" +
      "\n\n## Rollback / Abort Conditions\n- [ ] TBD: Define conditions under which the agent should abort.\n",
    issues: [
      makeIssue({
        ruleId: "spec-missing-rollback",
        file: "migration.md",
        category: "Spec",
      }),
    ],
    filePath: "migration.md",
    fixCount: 1,
  });
});

test("toolWeakSchemaRule.applyFix injects description on weak schema", () => {
  expectFix(toolWeakSchemaRule, {
    before: `const schema = { type: "object", properties: {} };`,
    after: `const schema = { type: "object", properties: { description: "TBD: describe this parameter" } };`,
    issues: [
      makeIssue({
        ruleId: "tool-weak-schema",
        file: "schema.ts",
        severity: "error",
        category: "Tool",
      }),
    ],
    filePath: "schema.ts",
    fixCount: 1,
  });
});
