import assert from "node:assert/strict";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import test from "node:test";

import { architectureAtomicTransactionsRule } from "../src/rules/architecture-atomic-transactions.js";
import { verificationMissingTestsRule } from "../src/rules/verification-missing-tests.js";
import {
  expectCheck,
  expectFix,
  expectNoIssues,
  makeIssue,
} from "./_helpers.js";

// ============================================================
// architecture-atomic-transactions — AST path
// ============================================================

test("architecture-atomic-transactions (AST) flags 2+ mutations in same scope without transaction", () => {
  expectCheck(architectureAtomicTransactionsRule, {
    content: [
      "function run() {",
      "  db.insert({ id: 1 });",
      "  db.update({ id: 1, name: 'a' });",
      "}",
    ].join("\n"),
    filePath: "svc.ts",
    withAst: true,
    expectIssues: [{ ruleId: "architecture-atomic-transactions" }],
  });
});

test("architecture-atomic-transactions (AST) suppresses when mutations are inside transaction callback", () => {
  expectNoIssues(architectureAtomicTransactionsRule, {
    content: [
      "function run() {",
      "  db.transaction(() => {",
      "    db.insert({ id: 1 });",
      "    db.update({ id: 1, name: 'a' });",
      "  });",
      "}",
    ].join("\n"),
    filePath: "svc.ts",
    withAst: true,
  });
});

test("architecture-atomic-transactions (AST) suppresses when transaction call exists in same scope (function expr)", () => {
  // The Rule treats the enclosing function scope as transactional once a
  // *.transaction(...) or *.$transaction(...) call appears in it. This
  // form uses a function-expression callback rather than an arrow.
  expectNoIssues(architectureAtomicTransactionsRule, {
    content: [
      "function run() {",
      "  db.$transaction(function () {",
      "    db.insert({ id: 1 });",
      "    db.update({ id: 1, name: 'a' });",
      "  });",
      "}",
    ].join("\n"),
    filePath: "svc.ts",
    withAst: true,
  });
});

test("architecture-atomic-transactions (AST) ignores single mutation in scope", () => {
  expectNoIssues(architectureAtomicTransactionsRule, {
    content: ["function run() {", "  db.insert({ id: 1 });", "}"].join("\n"),
    filePath: "svc.ts",
    withAst: true,
  });
});

test("architecture-atomic-transactions (AST) flags each unrelated function scope independently", () => {
  // Two separate functions, each with 2 mutations. Both should fire.
  expectCheck(architectureAtomicTransactionsRule, {
    content: [
      "function a() {",
      "  db.insert({});",
      "  db.update({});",
      "}",
      "function b() {",
      "  db.create({});",
      "  db.delete({});",
      "}",
    ].join("\n"),
    filePath: "svc.ts",
    withAst: true,
    expectIssues: [
      { ruleId: "architecture-atomic-transactions" },
      { ruleId: "architecture-atomic-transactions" },
    ],
  });
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

const verificationIssue = (file: string) =>
  makeIssue({
    ruleId: "verification-missing-tests",
    file,
    severity: "warn",
    category: "Verification/Security",
  });

test("verification-missing-tests applyFix scaffolds vitest test when vitest dep is present", () => {
  withTempDir(
    "agentlint-vitest-",
    { devDependencies: { vitest: "^1.0.0" } },
    (_dir, srcFile) => {
      const outcome = expectFix(verificationMissingTestsRule, {
        before: "export const x = 1;\n",
        after: "export const x = 1;\n", // verification doesn't modify the source
        issues: [verificationIssue(srcFile)],
        filePath: srcFile,
        fixCount: 1,
      });
      assert.equal(outcome.newFiles.length, 1);
      assert.match(outcome.newFiles[0].content, /from "vitest"/);
      assert.match(outcome.newFiles[0].content, /expect\(thing\)/);
    },
  );
});

test("verification-missing-tests applyFix scaffolds jest test when jest dep is present", () => {
  withTempDir(
    "agentlint-jest-",
    { devDependencies: { jest: "^29.0.0" } },
    (_dir, srcFile) => {
      const outcome = expectFix(verificationMissingTestsRule, {
        before: "export const x = 1;\n",
        after: "export const x = 1;\n",
        issues: [verificationIssue(srcFile)],
        filePath: srcFile,
        fixCount: 1,
      });
      assert.equal(outcome.newFiles.length, 1);
      assert.match(outcome.newFiles[0].content, /describe\("thing"/);
      assert.match(outcome.newFiles[0].content, /expect\(thing\)/);
      // jest scaffold has no `from "vitest"` import
      assert.doesNotMatch(outcome.newFiles[0].content, /from "vitest"/);
    },
  );
});

test("verification-missing-tests applyFix scaffolds mocha test when mocha dep is present", () => {
  withTempDir(
    "agentlint-mocha-",
    { devDependencies: { mocha: "^10.0.0" } },
    (_dir, srcFile) => {
      const outcome = expectFix(verificationMissingTestsRule, {
        before: "export const x = 1;\n",
        after: "export const x = 1;\n",
        issues: [verificationIssue(srcFile)],
        filePath: srcFile,
        fixCount: 1,
      });
      assert.equal(outcome.newFiles.length, 1);
      assert.match(outcome.newFiles[0].content, /from "node:assert\/strict"/);
      assert.match(outcome.newFiles[0].content, /describe\("thing"/);
    },
  );
});

test("verification-missing-tests applyFix scaffolds node-test when scripts use node --test", () => {
  withTempDir(
    "agentlint-nodetest-",
    { scripts: { test: "node --test tests" } },
    (_dir, srcFile) => {
      const outcome = expectFix(verificationMissingTestsRule, {
        before: "export const x = 1;\n",
        after: "export const x = 1;\n",
        issues: [verificationIssue(srcFile)],
        filePath: srcFile,
        fixCount: 1,
      });
      assert.equal(outcome.newFiles.length, 1);
      assert.match(outcome.newFiles[0].content, /from "node:test"/);
      assert.match(outcome.newFiles[0].content, /assert\.ok\(thing\)/);
    },
  );
});

test("verification-missing-tests applyFix falls back to node-test when no package.json found", () => {
  // Fallback resolves to node-test because the walk hits agent-code-auditor's
  // own package.json (which has `tsx --test` in scripts). Either way, a
  // scaffold is produced.
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "agentlint-nopkg-"));
  const srcFile = path.join(dir, "thing.ts");
  fs.writeFileSync(srcFile, "export const x = 1;\n", "utf8");

  const outcome = expectFix(verificationMissingTestsRule, {
    before: "export const x = 1;\n",
    after: "export const x = 1;\n",
    issues: [verificationIssue(srcFile)],
    filePath: srcFile,
    fixCount: 1,
  });
  assert.equal(outcome.newFiles.length, 1);
  assert.match(outcome.newFiles[0].content, /thing/);

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

  expectCheck(verificationMissingTestsRule, {
    content: "export const x = 1;\n",
    filePath: "src/lib/missing.ts",
    targetDir: dir,
    expectIssues: [{ ruleId: "verification-missing-tests" }],
  });

  fs.rmSync(dir, { recursive: true, force: true });
});
