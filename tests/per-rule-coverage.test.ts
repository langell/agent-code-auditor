import assert from "node:assert/strict";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import test from "node:test";
import * as ts from "typescript";

import { architectureAtomicTransactionsRule } from "../src/rules/architecture-atomic-transactions.js";
import { verificationMissingTestsRule } from "../src/rules/verification-missing-tests.js";
import { RuleContext } from "../src/rules/types.js";

function buildCtx(
  filePath: string,
  content: string,
  withAst: boolean,
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

// ============================================================
// architecture-atomic-transactions — AST path
// ============================================================

test("architecture-atomic-transactions (AST) flags 2+ mutations in same scope without transaction", () => {
  const content = [
    "function run() {",
    "  db.insert({ id: 1 });",
    "  db.update({ id: 1, name: 'a' });",
    "}",
  ].join("\n");

  const issues = architectureAtomicTransactionsRule.check(
    buildCtx("svc.ts", content, true),
  );

  assert.equal(
    issues.filter((i) => i.ruleId === "architecture-atomic-transactions")
      .length,
    1,
  );
});

test("architecture-atomic-transactions (AST) suppresses when mutations are inside transaction callback", () => {
  const content = [
    "function run() {",
    "  db.transaction(() => {",
    "    db.insert({ id: 1 });",
    "    db.update({ id: 1, name: 'a' });",
    "  });",
    "}",
  ].join("\n");

  const issues = architectureAtomicTransactionsRule.check(
    buildCtx("svc.ts", content, true),
  );

  assert.equal(
    issues.filter((i) => i.ruleId === "architecture-atomic-transactions")
      .length,
    0,
  );
});

test("architecture-atomic-transactions (AST) suppresses when transaction call exists in same scope (function expr)", () => {
  // The Rule treats the enclosing function scope as transactional once a
  // *.transaction(...) or *.$transaction(...) call appears in it. This
  // form uses a function-expression callback rather than an arrow.
  const content = [
    "function run() {",
    "  db.$transaction(function () {",
    "    db.insert({ id: 1 });",
    "    db.update({ id: 1, name: 'a' });",
    "  });",
    "}",
  ].join("\n");

  const issues = architectureAtomicTransactionsRule.check(
    buildCtx("svc.ts", content, true),
  );

  assert.equal(
    issues.filter((i) => i.ruleId === "architecture-atomic-transactions")
      .length,
    0,
  );
});

test("architecture-atomic-transactions (AST) ignores single mutation in scope", () => {
  const content = [
    "function run() {",
    "  db.insert({ id: 1 });",
    "}",
  ].join("\n");

  const issues = architectureAtomicTransactionsRule.check(
    buildCtx("svc.ts", content, true),
  );

  assert.equal(issues.length, 0);
});

test("architecture-atomic-transactions (AST) flags each unrelated function scope independently", () => {
  // Two separate functions, each with 2 mutations. Both should fire.
  const content = [
    "function a() {",
    "  db.insert({});",
    "  db.update({});",
    "}",
    "function b() {",
    "  db.create({});",
    "  db.delete({});",
    "}",
  ].join("\n");

  const issues = architectureAtomicTransactionsRule.check(
    buildCtx("svc.ts", content, true),
  );

  assert.equal(
    issues.filter((i) => i.ruleId === "architecture-atomic-transactions")
      .length,
    2,
  );
});

// ============================================================
// verification-missing-tests — applyFix scaffolds per detected framework
// ============================================================

function withTempDir<T>(
  prefix: string,
  pkgJson: object,
  fn: (dir: string, srcFile: string) => T,
): T {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), prefix));
  fs.writeFileSync(
    path.join(dir, "package.json"),
    JSON.stringify(pkgJson),
    "utf8",
  );
  const srcFile = path.join(dir, "thing.ts");
  fs.writeFileSync(srcFile, "export const x = 1;\n", "utf8");
  try {
    return fn(dir, srcFile);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

test("verification-missing-tests applyFix scaffolds vitest test when vitest dep is present", () => {
  withTempDir(
    "agentlint-vitest-",
    { devDependencies: { vitest: "^1.0.0" } },
    (_dir, srcFile) => {
      const outcome = verificationMissingTestsRule.applyFix!(
        "export const x = 1;\n",
        [
          {
            file: srcFile,
            line: 1,
            message: "missing tests",
            ruleId: "verification-missing-tests",
            severity: "warn",
            category: "Verification/Security",
          },
        ],
        srcFile,
      );

      assert.ok(outcome.newFiles && outcome.newFiles.length === 1);
      assert.match(outcome.newFiles![0].content, /from "vitest"/);
      assert.match(outcome.newFiles![0].content, /expect\(thing\)/);
    },
  );
});

test("verification-missing-tests applyFix scaffolds jest test when jest dep is present", () => {
  withTempDir(
    "agentlint-jest-",
    { devDependencies: { jest: "^29.0.0" } },
    (_dir, srcFile) => {
      const outcome = verificationMissingTestsRule.applyFix!(
        "export const x = 1;\n",
        [
          {
            file: srcFile,
            line: 1,
            message: "missing tests",
            ruleId: "verification-missing-tests",
            severity: "warn",
            category: "Verification/Security",
          },
        ],
        srcFile,
      );

      assert.ok(outcome.newFiles && outcome.newFiles.length === 1);
      assert.match(outcome.newFiles![0].content, /describe\("thing"/);
      assert.match(outcome.newFiles![0].content, /expect\(thing\)/);
      // jest scaffold has no `from "vitest"` import
      assert.doesNotMatch(outcome.newFiles![0].content, /from "vitest"/);
    },
  );
});

test("verification-missing-tests applyFix scaffolds mocha test when mocha dep is present", () => {
  withTempDir(
    "agentlint-mocha-",
    { devDependencies: { mocha: "^10.0.0" } },
    (_dir, srcFile) => {
      const outcome = verificationMissingTestsRule.applyFix!(
        "export const x = 1;\n",
        [
          {
            file: srcFile,
            line: 1,
            message: "missing tests",
            ruleId: "verification-missing-tests",
            severity: "warn",
            category: "Verification/Security",
          },
        ],
        srcFile,
      );

      assert.ok(outcome.newFiles && outcome.newFiles.length === 1);
      assert.match(outcome.newFiles![0].content, /from "node:assert\/strict"/);
      assert.match(outcome.newFiles![0].content, /describe\("thing"/);
    },
  );
});

test("verification-missing-tests applyFix scaffolds node-test when scripts use node --test", () => {
  withTempDir(
    "agentlint-nodetest-",
    { scripts: { test: "node --test tests" } },
    (_dir, srcFile) => {
      const outcome = verificationMissingTestsRule.applyFix!(
        "export const x = 1;\n",
        [
          {
            file: srcFile,
            line: 1,
            message: "missing tests",
            ruleId: "verification-missing-tests",
            severity: "warn",
            category: "Verification/Security",
          },
        ],
        srcFile,
      );

      assert.ok(outcome.newFiles && outcome.newFiles.length === 1);
      assert.match(outcome.newFiles![0].content, /from "node:test"/);
      assert.match(outcome.newFiles![0].content, /assert\.ok\(thing\)/);
    },
  );
});

test("verification-missing-tests applyFix falls back to node-test when no package.json found", () => {
  // Walk up from /tmp/agentlint-nopkg-XXX — no package.json anywhere on the
  // walk path (well, there is one at the repo root if run from there).
  // To force the fallback, point at a deep tmp dir that has no walkable
  // package.json above it. mkdtemp under os.tmpdir() typically achieves this.
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "agentlint-nopkg-"));
  const srcFile = path.join(dir, "thing.ts");
  fs.writeFileSync(srcFile, "export const x = 1;\n", "utf8");

  const outcome = verificationMissingTestsRule.applyFix!(
    "export const x = 1;\n",
    [
      {
        file: srcFile,
        line: 1,
        message: "missing tests",
        ruleId: "verification-missing-tests",
        severity: "warn",
        category: "Verification/Security",
      },
    ],
    srcFile,
  );

  // Fallback resolves to node-test because the walk hits agent-code-auditor's
  // own package.json (which has `tsx --test` in scripts). Either way, a
  // scaffold is produced.
  assert.ok(outcome.newFiles && outcome.newFiles.length === 1);
  assert.match(outcome.newFiles![0].content, /thing/);

  fs.rmSync(dir, { recursive: true, force: true });
});

test("verification-missing-tests check (workspace I/O) emits when business-logic file lacks sibling test", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "agentlint-verif-check-"));
  const libDir = path.join(dir, "src", "lib");
  fs.mkdirSync(libDir, { recursive: true });
  fs.writeFileSync(
    path.join(libDir, "missing.ts"),
    "export const x = 1;\n",
    "utf8",
  );

  const issues = verificationMissingTestsRule.check(
    buildCtx("src/lib/missing.ts", "export const x = 1;\n", false, dir),
  );

  assert.equal(
    issues.filter((i) => i.ruleId === "verification-missing-tests").length,
    1,
  );

  fs.rmSync(dir, { recursive: true, force: true });
});
