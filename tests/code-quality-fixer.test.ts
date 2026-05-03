import assert from "node:assert/strict";
import test from "node:test";

import { codeQualityNoAnyRule } from "../src/rules/code-quality-no-any.js";
import type { AgentIssue } from "../src/scanners/types.js";

test("codeQualityNoAnyRule.applyFix replaces any patterns", () => {
  const original = [
    "const a: any = {};",
    "const b = value as any;",
    "const c = <any>value;",
    "const d = 1;",
  ].join("\n");

  const issues: AgentIssue[] = [1, 2, 3].map((line) => ({
    file: "sample.ts",
    line,
    message: "Use of 'any' type detected.",
    ruleId: "code-quality-no-any",
    severity: "error",
    category: "Code Quality",
  }));

  const { content, fixes } = codeQualityNoAnyRule.applyFix!(
    original,
    issues,
    "sample.ts",
  );

  assert.equal(fixes.length, 3);
  assert.match(content, /const a: unknown = \{\};/);
  assert.match(content, /const b = value as unknown;/);
  assert.match(content, /const c = <unknown>value;/);
  assert.match(content, /const d = 1;/);
});

test("codeQualityNoAnyRule.applyFix is a no-op when no matching issues", () => {
  const original = "const a: any = {}";

  const issues: AgentIssue[] = [
    {
      file: "sample.ts",
      line: 1,
      message: "Different rule",
      ruleId: "spec-missing-rollback",
      severity: "warn",
      category: "Spec",
    },
  ];

  const { content, fixes } = codeQualityNoAnyRule.applyFix!(
    original,
    issues,
    "sample.ts",
  );

  assert.equal(fixes.length, 0);
  assert.equal(content, original);
});

test("codeQualityNoAnyRule.applyFix skips lines containing strings or comments", () => {
  const original = [
    `const msg = "type: any inside string";`,
    `// example: any here in a comment`,
    `const x: any = 1;`,
    ``,
  ].join("\n");

  const issues: AgentIssue[] = [1, 2, 3].map((line) => ({
    file: "mixed.ts",
    line,
    message: "any",
    ruleId: "code-quality-no-any",
    severity: "error",
    category: "Code Quality",
  }));

  const { content, fixes } = codeQualityNoAnyRule.applyFix!(
    original,
    issues,
    "mixed.ts",
  );

  // Only the bare `const x: any = 1` line is rewritten
  assert.equal(fixes.length, 1);
  assert.match(content, /type:\s*any inside string/);
  assert.match(content, /\/\/ example:\s*any here in a comment/);
  assert.match(content, /const x:\s*unknown\s*=\s*1/);
});
