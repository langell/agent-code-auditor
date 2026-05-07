import assert from "node:assert/strict";
import * as ts from "typescript";
import { AgentIssue } from "../src/scanners/types.js";
import {
  FixRecord,
  NewFile,
  Rule,
  RuleContext,
} from "../src/rules/types.js";

// =====================================================================
// Context builders
// =====================================================================

// Construct a minimal RuleContext for a test. Pass `withAst: true` to parse
// the content as TypeScript so AST-path branches in rules get exercised.
export function buildCtx(
  filePath: string,
  content: string,
  withAst = false,
  targetDir = "",
): RuleContext {
  return {
    filePath,
    content,
    lines: content.split("\n"),
    ast: withAst
      ? ts.createSourceFile(filePath, content, ts.ScriptTarget.Latest, true)
      : undefined,
    targetDir,
    globalTools: [],
  };
}

// Run multiple rules against the same context and concatenate their issues.
// Used by tests that previously called a family `checkXxxRules` aggregator.
export function checkAll(ctx: RuleContext, ...rules: Rule[]): AgentIssue[] {
  return rules.flatMap((r) => r.check(ctx));
}

// =====================================================================
// Issue builder
// =====================================================================

// Build an AgentIssue with sensible defaults. Tests only spell out the
// fields they care about — usually `ruleId` and `line`.
export function makeIssue(opts: {
  ruleId: string;
  line?: number;
  file?: string;
  message?: string;
  severity?: AgentIssue["severity"];
  category?: AgentIssue["category"];
  startPos?: number;
  endPos?: number;
  suggestion?: string;
}): AgentIssue {
  const issue: AgentIssue = {
    file: opts.file ?? "test.ts",
    line: opts.line ?? 1,
    message: opts.message ?? "test issue",
    ruleId: opts.ruleId,
    severity: opts.severity ?? "warn",
    category: opts.category ?? "General",
  };
  if (opts.startPos !== undefined) issue.startPos = opts.startPos;
  if (opts.endPos !== undefined) issue.endPos = opts.endPos;
  if (opts.suggestion !== undefined) issue.suggestion = opts.suggestion;
  return issue;
}

// =====================================================================
// Check (detection) harness
// =====================================================================

interface ExpectedIssue {
  ruleId: string;
  line?: number;
  severity?: AgentIssue["severity"];
}

export interface CheckCaseOptions {
  /** File content under test. */
  content: string;
  /** File path (default `"test.ts"`). */
  filePath?: string;
  /** Parse content as a TS AST before running `check` (default `false`). */
  withAst?: boolean;
  /** Workspace root the rule's check sees on `ctx.targetDir`. */
  targetDir?: string;
  /**
   * Expected emitted issues. Asserted in order; any extra issues fail the
   * test. Pass `[]` for "rule should be silent on this input".
   */
  expectIssues: ExpectedIssue[];
}

// Run `rule.check` against the given content and assert the emitted issues
// match `expectIssues` (ruleId required; `line` and `severity` checked when
// supplied). Returns the issues for further inspection.
export function expectCheck(
  rule: Rule,
  opts: CheckCaseOptions,
): AgentIssue[] {
  const ctx = buildCtx(
    opts.filePath ?? "test.ts",
    opts.content,
    opts.withAst ?? false,
    opts.targetDir ?? "",
  );
  const issues = rule.check(ctx);

  assert.equal(
    issues.length,
    opts.expectIssues.length,
    `rule '${rule.id}' emitted ${issues.length} issue(s); expected ${opts.expectIssues.length}\n` +
      `  emitted: ${JSON.stringify(
        issues.map((i) => ({ ruleId: i.ruleId, line: i.line })),
      )}\n` +
      `  expected: ${JSON.stringify(opts.expectIssues)}`,
  );

  for (let i = 0; i < issues.length; i++) {
    const actual = issues[i];
    const expected = opts.expectIssues[i];
    assert.equal(
      actual.ruleId,
      expected.ruleId,
      `issue[${i}].ruleId mismatch`,
    );
    if (expected.line !== undefined) {
      assert.equal(actual.line, expected.line, `issue[${i}].line mismatch`);
    }
    if (expected.severity !== undefined) {
      assert.equal(
        actual.severity,
        expected.severity,
        `issue[${i}].severity mismatch`,
      );
    }
  }

  return issues;
}

// Convenience: assert `rule.check` emits zero issues for the given content.
export function expectNoIssues(
  rule: Rule,
  opts: Omit<CheckCaseOptions, "expectIssues">,
): void {
  expectCheck(rule, { ...opts, expectIssues: [] });
}

// =====================================================================
// Fix (before/after) harness
// =====================================================================

export interface FixCaseOptions {
  /** Source content before applyFix runs. */
  before: string;
  /** Issues fed into `applyFix` (typically built with `makeIssue`). */
  issues: AgentIssue[];
  /** Expected source content after applyFix. */
  after: string;
  /** File path (default `"test.ts"`). */
  filePath?: string;
  /** Optional assertion on number of FixRecords emitted. */
  fixCount?: number;
  /** Optional assertion on the emitted newFiles array (deep equality). */
  newFiles?: NewFile[];
}

export interface FixOutcomeSnapshot {
  content: string;
  fixes: FixRecord[];
  newFiles: NewFile[];
}

// Run `rule.applyFix(before, issues)` and assert the resulting content
// matches `after`. Errors out clearly with a side-by-side hint when content
// diverges. Returns the outcome for further inspection.
export function expectFix(
  rule: Rule,
  opts: FixCaseOptions,
): FixOutcomeSnapshot {
  if (!rule.applyFix) {
    assert.fail(`rule '${rule.id}' has no applyFix method`);
  }
  const filePath = opts.filePath ?? "test.ts";
  const outcome = rule.applyFix(opts.before, opts.issues, filePath);

  assert.equal(
    outcome.content,
    opts.after,
    `applyFix content mismatch for rule '${rule.id}':\n` +
      `--- expected ---\n${opts.after}\n` +
      `--- got ---\n${outcome.content}`,
  );

  if (opts.fixCount !== undefined) {
    assert.equal(
      outcome.fixes.length,
      opts.fixCount,
      `expected ${opts.fixCount} fix record(s); got ${outcome.fixes.length}`,
    );
  }

  if (opts.newFiles !== undefined) {
    assert.deepEqual(
      outcome.newFiles ?? [],
      opts.newFiles,
      "newFiles mismatch",
    );
  }

  return {
    content: outcome.content,
    fixes: outcome.fixes,
    newFiles: outcome.newFiles ?? [],
  };
}

// Convenience: assert `rule.applyFix` is a no-op (content unchanged, no
// fixes emitted, no newFiles).
export function expectNoFix(
  rule: Rule,
  opts: Omit<FixCaseOptions, "after" | "fixCount" | "newFiles">,
): void {
  expectFix(rule, {
    ...opts,
    after: opts.before,
    fixCount: 0,
    newFiles: [],
  });
}
