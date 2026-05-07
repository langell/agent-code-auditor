// Self-tests for the test harness in tests/_helpers.ts. Each section
// exercises one harness primitive against a real built-in rule, doubling as
// a usage example for new rule/fixer test files.
import assert from "node:assert/strict";
import test from "node:test";

import {
  buildCtx,
  checkAll,
  makeIssue,
  expectCheck,
  expectNoIssues,
  expectFix,
  expectNoFix,
} from "./_helpers.js";

import { codeQualityNoAnyRule } from "../src/rules/code-quality-no-any.js";
import { specMissingAcceptanceCriteriaRule } from "../src/rules/spec-missing-acceptance-criteria.js";
import { specMissingRollbackRule } from "../src/rules/spec-missing-rollback.js";
import { observabilityMissingTraceIdRule } from "../src/rules/observability-missing-trace-id.js";
import { verificationMissingTestsRule } from "../src/rules/verification-missing-tests.js";

// =====================================================================
// makeIssue
// =====================================================================

test("makeIssue defaults sensibly when only ruleId is given", () => {
  const issue = makeIssue({ ruleId: "x" });
  assert.equal(issue.ruleId, "x");
  assert.equal(issue.file, "test.ts");
  assert.equal(issue.line, 1);
  assert.equal(issue.severity, "warn");
  assert.equal(issue.category, "General");
});

test("makeIssue passes through optional fields when supplied", () => {
  const issue = makeIssue({
    ruleId: "x",
    line: 7,
    file: "agent.ts",
    severity: "error",
    category: "Security",
    startPos: 10,
    endPos: 13,
    suggestion: "do this instead",
  });
  assert.equal(issue.line, 7);
  assert.equal(issue.startPos, 10);
  assert.equal(issue.endPos, 13);
  assert.equal(issue.suggestion, "do this instead");
});

// =====================================================================
// expectCheck — happy and unhappy paths
// =====================================================================

test("expectCheck: rule emits the expected issues, in order, by ruleId", () => {
  // code-quality-no-any with AST detects 3 `any` usages on lines 1, 2, 3.
  expectCheck(codeQualityNoAnyRule, {
    content: ["const a: any = {};", "const b = x as any;", "const c = <any>y;"].join(
      "\n",
    ),
    withAst: true,
    expectIssues: [
      { ruleId: "code-quality-no-any", line: 1 },
      { ruleId: "code-quality-no-any", line: 2 },
      { ruleId: "code-quality-no-any", line: 3 },
    ],
  });
});

test("expectCheck: severity assertions when supplied", () => {
  expectCheck(codeQualityNoAnyRule, {
    content: "const a: any = {};",
    withAst: true,
    expectIssues: [
      { ruleId: "code-quality-no-any", severity: "error" },
    ],
  });
});

test("expectCheck: count mismatch fails with both expected and emitted in the message", () => {
  // Suppress the throw to inspect the AssertionError's message
  let thrown: Error | undefined;
  try {
    expectCheck(codeQualityNoAnyRule, {
      content: "const a: any = {};",
      withAst: true,
      expectIssues: [
        // Expect 2 — but the rule will emit only 1
        { ruleId: "code-quality-no-any" },
        { ruleId: "code-quality-no-any" },
      ],
    });
  } catch (e) {
    thrown = e as Error;
  }
  assert.ok(thrown, "expectCheck should throw on count mismatch");
  assert.match(thrown!.message, /emitted 1 issue\(s\); expected 2/);
  assert.match(thrown!.message, /code-quality-no-any/);
});

test("expectCheck: line mismatch fails", () => {
  let thrown: Error | undefined;
  try {
    expectCheck(codeQualityNoAnyRule, {
      content: "const a: any = {};",
      withAst: true,
      expectIssues: [{ ruleId: "code-quality-no-any", line: 99 }],
    });
  } catch (e) {
    thrown = e as Error;
  }
  assert.ok(thrown);
  assert.match(thrown!.message, /line mismatch/);
});

// =====================================================================
// expectNoIssues
// =====================================================================

test("expectNoIssues: rule is silent on input that doesn't trigger it", () => {
  expectNoIssues(codeQualityNoAnyRule, {
    content: "const a: number = 1;",
    withAst: true,
  });
});

test("expectNoIssues: a non-spec/task file path doesn't trigger spec-missing-acceptance-criteria", () => {
  expectNoIssues(specMissingAcceptanceCriteriaRule, {
    content: "# Just a doc",
    filePath: "README.md",
  });
});

// =====================================================================
// expectFix — before/after
// =====================================================================

test("expectFix: code-quality-no-any rewrites any to unknown across one line", () => {
  expectFix(codeQualityNoAnyRule, {
    before: "const a: any = {};\n",
    after: "const a: unknown = {};\n",
    issues: [makeIssue({ ruleId: "code-quality-no-any", line: 1 })],
    fixCount: 1,
  });
});

test("expectFix: spec-missing-acceptance-criteria appends the template section", () => {
  // The rule's applyFix appends the section if not already present. Since
  // the appended block is multi-line, we pin it directly in `after`.
  const before = "# Task\nDo a thing.";
  const after =
    "# Task\nDo a thing." +
    "\n\n## Acceptance Criteria\n- [ ] TBD: Define acceptance criteria.\n";
  expectFix(specMissingAcceptanceCriteriaRule, {
    before,
    after,
    issues: [
      makeIssue({
        ruleId: "spec-missing-acceptance-criteria",
        file: "task.md",
      }),
    ],
    filePath: "task.md",
    fixCount: 1,
  });
});

test("expectFix: rule-with-no-applyFix raises a clear error", () => {
  // Stub a Rule with no applyFix to verify the harness's error path.
  let thrown: Error | undefined;
  try {
    expectFix(
      {
        id: "noop",
        appliesTo: "all",
        check() {
          return [];
        },
      },
      {
        before: "x",
        after: "x",
        issues: [makeIssue({ ruleId: "noop" })],
      },
    );
  } catch (e) {
    thrown = e as Error;
  }
  assert.ok(thrown);
  assert.match(thrown!.message, /has no applyFix/);
});

test("expectFix: content-mismatch failure includes both expected and got", () => {
  let thrown: Error | undefined;
  try {
    expectFix(codeQualityNoAnyRule, {
      before: "const a: any = {};\n",
      after: "const a: SOMETHING_WRONG = {};\n",
      issues: [makeIssue({ ruleId: "code-quality-no-any", line: 1 })],
    });
  } catch (e) {
    thrown = e as Error;
  }
  assert.ok(thrown);
  assert.match(thrown!.message, /expected/);
  assert.match(thrown!.message, /got/);
});

test("expectFix: newFiles assertion (verification scaffolds a sibling test)", () => {
  // verification-missing-tests writes a sibling .test.ts. We check the
  // newFiles output without going through real fs for the source file.
  // The framework detection walks up to find a package.json — agentlint's
  // own root is found, so the framework defaults to "node-test".
  const sourceContent = "export function helper() {}\n";
  const filePath = "/tmp/agentlint-harness-vmt/utils.ts";
  const outcome = expectFix(verificationMissingTestsRule, {
    before: sourceContent,
    after: sourceContent, // verification doesn't modify the source file
    issues: [
      makeIssue({
        ruleId: "verification-missing-tests",
        file: filePath,
        severity: "warn",
      }),
    ],
    filePath,
    fixCount: 1,
  });

  // newFiles is asserted via the returned snapshot rather than the option,
  // because the framework detection looks at our own package.json (which
  // is fine but we don't want to pin the framework string here).
  assert.equal(outcome.newFiles.length, 1);
  assert.equal(outcome.newFiles[0].path, "/tmp/agentlint-harness-vmt/utils.test.ts");
  assert.match(outcome.newFiles[0].content, /utils/);
});

// =====================================================================
// expectNoFix
// =====================================================================

test("expectNoFix: rule whose body is a no-op for non-matching ruleIds", () => {
  expectNoFix(codeQualityNoAnyRule, {
    before: "const a: any = {};",
    issues: [makeIssue({ ruleId: "spec-missing-rollback" })],
  });
});

test("expectNoFix: spec-missing-rollback applyFix is idempotent on already-rolled-back content", () => {
  // Content already includes the rollback section, so applyFix shouldn't
  // append another.
  const content = [
    "# Task",
    "Migrate.",
    "## Rollback Conditions",
    "- abort if X",
  ].join("\n");
  expectNoFix(specMissingRollbackRule, {
    before: content,
    issues: [
      makeIssue({ ruleId: "spec-missing-rollback", file: "task.md" }),
    ],
    filePath: "task.md",
  });
});

// =====================================================================
// buildCtx + checkAll regression coverage (existing primitives)
// =====================================================================

test("buildCtx populates ast only when withAst is true", () => {
  const a = buildCtx("x.ts", "const x = 1;");
  assert.equal(a.ast, undefined);
  const b = buildCtx("x.ts", "const x = 1;", true);
  assert.notEqual(b.ast, undefined);
});

test("checkAll concatenates issues from multiple rules", () => {
  const ctx = buildCtx(
    "agent.ts",
    "const agent = new Agent({ tools: [], model: 'gpt' });",
    true,
  );
  // observability-missing-trace-id should fire here; code-quality-no-any
  // shouldn't because there's no `any` keyword.
  const issues = checkAll(ctx, observabilityMissingTraceIdRule, codeQualityNoAnyRule);
  assert.equal(issues.length, 1);
  assert.equal(issues[0].ruleId, "observability-missing-trace-id");
});
