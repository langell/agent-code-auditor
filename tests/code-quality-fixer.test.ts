// Demonstrates the test harness from `_helpers.ts`. Compare against the
// pre-harness version (in git history) for the readability win — the
// before/after pattern reads like a spec instead of plumbing.
import test from "node:test";

import { codeQualityNoAnyRule } from "../src/rules/code-quality-no-any.js";
import { expectFix, expectNoFix, makeIssue } from "./_helpers.js";

test("codeQualityNoAnyRule.applyFix replaces any patterns (line-based)", () => {
  expectFix(codeQualityNoAnyRule, {
    before: [
      "const a: any = {};",
      "const b = value as any;",
      "const c = <any>value;",
      "const d = 1;",
    ].join("\n"),
    after: [
      "const a: unknown = {};",
      "const b = value as unknown;",
      "const c = <unknown>value;",
      "const d = 1;",
    ].join("\n"),
    issues: [1, 2, 3].map((line) =>
      makeIssue({
        ruleId: "code-quality-no-any",
        line,
        file: "sample.ts",
        severity: "error",
        category: "Code Quality",
      }),
    ),
    filePath: "sample.ts",
    fixCount: 3,
  });
});

test("codeQualityNoAnyRule.applyFix is a no-op when no matching issues", () => {
  expectNoFix(codeQualityNoAnyRule, {
    before: "const a: any = {}",
    issues: [
      makeIssue({
        ruleId: "spec-missing-rollback",
        file: "sample.ts",
        category: "Spec",
      }),
    ],
    filePath: "sample.ts",
  });
});

test("codeQualityNoAnyRule.applyFix skips lines containing strings or comments", () => {
  // The line-based fallback only rewrites lines that are pure code — lines
  // containing string/template literals or comments are left alone, since
  // `: any` could legitimately live inside a string.
  expectFix(codeQualityNoAnyRule, {
    before: [
      `const msg = "type: any inside string";`,
      `// example: any here in a comment`,
      `const x: any = 1;`,
      ``,
    ].join("\n"),
    after: [
      `const msg = "type: any inside string";`,
      `// example: any here in a comment`,
      `const x: unknown = 1;`,
      ``,
    ].join("\n"),
    issues: [1, 2, 3].map((line) =>
      makeIssue({
        ruleId: "code-quality-no-any",
        line,
        file: "mixed.ts",
        severity: "error",
        category: "Code Quality",
      }),
    ),
    filePath: "mixed.ts",
    fixCount: 1,
  });
});
