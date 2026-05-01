import assert from "node:assert/strict";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import test from "node:test";

import { fixCodeQualityRules } from "../src/fixers/code-quality-fixer.js";
import type { AgentIssue } from "../src/scanners/types.js";

test("fixCodeQualityRules replaces any patterns for code-quality-no-any", async () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "agentlint-cq-fixer-"));
  const filePath = path.join(tempDir, "sample.ts");
  const original = [
    "const a: any = {};",
    "const b = value as any;",
    "const c = <any>value;",
    "const d = 1;",
  ].join("\n");

  fs.writeFileSync(filePath, original, "utf8");

  const issues: AgentIssue[] = [
    {
      file: "sample.ts",
      line: 1,
      message: "Use of 'any' type detected.",
      ruleId: "code-quality-no-any",
      severity: "error",
      category: "Code Quality",
    },
    {
      file: "sample.ts",
      line: 2,
      message: "Use of 'any' type detected.",
      ruleId: "code-quality-no-any",
      severity: "error",
      category: "Code Quality",
    },
    {
      file: "sample.ts",
      line: 3,
      message: "Use of 'any' type detected.",
      ruleId: "code-quality-no-any",
      severity: "error",
      category: "Code Quality",
    },
  ];

  const fixes = await fixCodeQualityRules(filePath, issues);
  const updated = fs.readFileSync(filePath, "utf8");

  assert.equal(fixes.length, 3);
  assert.match(updated, /const a: unknown = \{\};/);
  assert.match(updated, /const b = value as unknown;/);
  assert.match(updated, /const c = <unknown>value;/);
  assert.match(updated, /const d = 1;/);

  fs.rmSync(tempDir, { recursive: true, force: true });
});

test("fixCodeQualityRules skips when no matching rule issues are provided", async () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "agentlint-cq-fixer-"));
  const filePath = path.join(tempDir, "sample.ts");
  const original = "const a: any = {}";

  fs.writeFileSync(filePath, original, "utf8");

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

  const fixes = await fixCodeQualityRules(filePath, issues);
  const updated = fs.readFileSync(filePath, "utf8");

  assert.equal(fixes.length, 0);
  assert.equal(updated, original);

  fs.rmSync(tempDir, { recursive: true, force: true });
});

test("fixCodeQualityRules skips lines containing strings or comments", async () => {
  const tempDir = fs.mkdtempSync(
    path.join(os.tmpdir(), "agentlint-cq-string-comment-")
  );
  const filePath = path.join(tempDir, "mixed.ts");
  const original = [
    `const msg = "type: any inside string";`,
    `// example: any here in a comment`,
    `const x: any = 1;`,
    ``,
  ].join("\n");
  fs.writeFileSync(filePath, original, "utf8");

  const issues: AgentIssue[] = [1, 2, 3].map((line) => ({
    file: filePath,
    line,
    message: "any",
    ruleId: "code-quality-no-any",
    severity: "error",
    category: "Code Quality",
  }));

  const fixes = await fixCodeQualityRules(filePath, issues);
  const updated = fs.readFileSync(filePath, "utf8");

  // Only the bare `const x: any = 1` line is rewritten
  assert.equal(fixes.length, 1);
  assert.match(updated, /type:\s*any inside string/);
  assert.match(updated, /\/\/ example:\s*any here in a comment/);
  assert.match(updated, /const x:\s*unknown\s*=\s*1/);

  fs.rmSync(tempDir, { recursive: true, force: true });
});
