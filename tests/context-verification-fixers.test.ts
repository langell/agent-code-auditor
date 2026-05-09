import assert from "node:assert/strict";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import test from "node:test";

import { observabilityMissingTraceIdRule } from "../src/rules/observability-missing-trace-id.js";
import { verificationMissingTestsRule } from "../src/rules/verification-missing-tests.js";
import { expectFix, expectNoFix, makeIssue } from "./_helpers.js";

const traceIssue = makeIssue({
  ruleId: "observability-missing-trace-id",
  file: "agent.ts",
  severity: "warn",
  category: "Context",
});

test("observabilityMissingTraceIdRule.applyFix injects traceId into Agent initialization", () => {
  // Note the trailing space after the comma in the injected `traceId`
  // assignment — the rule's injection literal preserves it before the
  // following newline.
  expectFix(observabilityMissingTraceIdRule, {
    before: `
const agent = new Agent({
  name: 'TestAgent',
  tools: []
});
`,
    after:
      `\nconst agent = new Agent({ traceId: "TODO: inject-trace-id", \n` +
      `  name: 'TestAgent',\n` +
      `  tools: []\n` +
      `});\n`,
    issues: [traceIssue],
    filePath: "agent.ts",
    fixCount: 1,
  });
});

test("observabilityMissingTraceIdRule.applyFix handles file with Agent.init", () => {
  expectFix(observabilityMissingTraceIdRule, {
    before: `
const agent = Agent.init({
  name: 'TestAgent'
});
`,
    after:
      `\nconst agent = Agent.init({ traceId: "TODO: inject-trace-id", \n` +
      `  name: 'TestAgent'\n` +
      `});\n`,
    issues: [traceIssue],
    filePath: "agent.ts",
    fixCount: 1,
  });
});

test("observabilityMissingTraceIdRule.applyFix returns no fixes when no matching issues", () => {
  expectNoFix(observabilityMissingTraceIdRule, {
    before: "const x = 1;",
    issues: [],
    filePath: "irrelevant.ts",
  });
});

test("observabilityMissingTraceIdRule.applyFix non-AST fallback fixes all Agent occurrences", () => {
  expectFix(observabilityMissingTraceIdRule, {
    before: [
      "const a = new Agent({ tools: [] });",
      "const b = new Agent({ model: 'x' });",
      "",
    ].join("\n"),
    after: [
      'const a = new Agent({ traceId: "TODO: inject-trace-id",  tools: [] });',
      `const b = new Agent({ traceId: "TODO: inject-trace-id",  model: 'x' });`,
      "",
    ].join("\n"),
    issues: [
      makeIssue({
        ruleId: "observability-missing-trace-id",
        file: "agents.ts",
        line: 1,
        category: "Context",
      }),
      makeIssue({
        ruleId: "observability-missing-trace-id",
        file: "agents.ts",
        line: 2,
        category: "Context",
      }),
    ],
    filePath: "agents.ts",
    fixCount: 2,
  });
});

test("verificationMissingTestsRule.applyFix scaffolds new test file", () => {
  // Verification fix needs a real filesystem — it walks up to find a
  // package.json to detect the test framework, and probes the sibling
  // test path on disk before scaffolding.
  const tempDir = fs.mkdtempSync(
    path.join(os.tmpdir(), "agentlint-verification-fixer-test-"),
  );
  const filePath = path.join(tempDir, "utils.ts");
  fs.writeFileSync(filePath, "export function helper() {}", "utf8");

  const sourceContent = "export function helper() {}";
  const outcome = expectFix(verificationMissingTestsRule, {
    before: sourceContent,
    after: sourceContent, // verification doesn't modify the source file
    issues: [
      makeIssue({
        ruleId: "verification-missing-tests",
        file: filePath,
        severity: "warn",
        category: "Verification/Security",
      }),
    ],
    filePath,
    fixCount: 1,
  });

  assert.equal(outcome.newFiles.length, 1);
  assert.equal(outcome.newFiles[0].path, path.join(tempDir, "utils.test.ts"));
  assert.match(outcome.newFiles[0].content, /utils/);

  fs.rmSync(tempDir, { recursive: true, force: true });
});

test("verificationMissingTestsRule.applyFix skips if test file already exists", () => {
  const tempDir = fs.mkdtempSync(
    path.join(os.tmpdir(), "agentlint-verification-fixer-exists-test-"),
  );
  const filePath = path.join(tempDir, "utils.ts");
  fs.writeFileSync(filePath, "export function helper() {}", "utf8");
  fs.writeFileSync(
    path.join(tempDir, "utils.test.ts"),
    "// existing test",
    "utf8",
  );

  expectNoFix(verificationMissingTestsRule, {
    before: "export function helper() {}",
    issues: [
      makeIssue({
        ruleId: "verification-missing-tests",
        file: filePath,
        severity: "warn",
        category: "Verification/Security",
      }),
    ],
    filePath,
  });

  fs.rmSync(tempDir, { recursive: true, force: true });
});

test("verificationMissingTestsRule.applyFix handles empty issues array", () => {
  expectNoFix(verificationMissingTestsRule, {
    before: "// any",
    issues: [],
    filePath: "/tmp/test.ts",
  });
});
