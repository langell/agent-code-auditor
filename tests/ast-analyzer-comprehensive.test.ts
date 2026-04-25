import assert from "node:assert/strict";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import test from "node:test";

import { runASTAnalyzer } from "../src/scanners/ast-analyzer.js";
import { loadConfig } from "../src/config.js";

test("runASTAnalyzer detects unsafe render functions", async () => {
  const tempDir = fs.mkdtempSync(
    path.join(os.tmpdir(), "agentlint-unsafe-render-test-")
  );
  const filePath = path.join(tempDir, "component.tsx");
  fs.writeFileSync(
    filePath,
    'const Component = () => <div dangerouslySetInnerHTML={{__html: data}} />;',
    "utf8"
  );

  const config = loadConfig(".");
  const issues = await runASTAnalyzer(tempDir, config);

  const unsafeIssues = issues.filter((i) => i.ruleId === "no-insecure-renders");
  assert.ok(unsafeIssues.length > 0);

  fs.rmSync(tempDir, { recursive: true, force: true });
});

test("runASTAnalyzer detects hallucinated imports", async () => {
  const tempDir = fs.mkdtempSync(
    path.join(os.tmpdir(), "agentlint-hallucinated-import-test-")
  );
  const filePath = path.join(tempDir, "code.ts");
  fs.writeFileSync(
    filePath,
    "import * as unknown from 'non-existent-lib';",
    "utf8"
  );

  const config = loadConfig(".");
  const issues = await runASTAnalyzer(tempDir, config);

  const hallucinatedIssues = issues.filter(
    (i) => i.ruleId === "no-hallucinated-imports"
  );
  assert.ok(hallucinatedIssues.length > 0);

  fs.rmSync(tempDir, { recursive: true, force: true });
});

test("runASTAnalyzer detects unredacted PII", async () => {
  const tempDir = fs.mkdtempSync(
    path.join(os.tmpdir(), "agentlint-pii-test-")
  );
  const filePath = path.join(tempDir, "code.ts");
  fs.writeFileSync(
    filePath,
    `
const userData = {
  email: 'user@example.com',
  ssn: '123-45-6789',
  phone: '555-1234'
};
console.log(userData);
`,
    "utf8"
  );

  const config = loadConfig(".");
  const issues = await runASTAnalyzer(tempDir, config);

  const piiIssues = issues.filter((i) => i.ruleId === "context-unredacted-pii");
  assert.ok(piiIssues.length > 0);

  fs.rmSync(tempDir, { recursive: true, force: true });
});

test("runASTAnalyzer handles warn-level rules", async () => {
  const tempDir = fs.mkdtempSync(
    path.join(os.tmpdir(), "agentlint-warn-test-")
  );
  const filePath = path.join(tempDir, "task.md");
  fs.writeFileSync(
    filePath,
    "# Task: Build something\n\nAcceptance Criteria: It works",
    "utf8"
  );

  const config = loadConfig(".");
  config.rules["spec-missing-rollback"] = "warn";
  const issues = await runASTAnalyzer(tempDir, config);

  const warnIssues = issues.filter(
    (i) => i.severity === "warn" && i.ruleId === "spec-missing-rollback"
  );
  assert.ok(warnIssues.length > 0);

  fs.rmSync(tempDir, { recursive: true, force: true });
});

test("runASTAnalyzer processes files in nested directories", async () => {
  const tempDir = fs.mkdtempSync(
    path.join(os.tmpdir(), "agentlint-nested-test-")
  );
  const nestedDir = path.join(tempDir, "src", "lib");
  fs.mkdirSync(nestedDir, { recursive: true });
  
  fs.writeFileSync(
    path.join(nestedDir, "utils.ts"),
    "const x: any = null;",
    "utf8"
  );

  const config = loadConfig(".");
  const issues = await runASTAnalyzer(tempDir, config);

  const anyIssues = issues.filter((i) => i.ruleId === "code-quality-no-any");
  assert.ok(anyIssues.length > 0);

  fs.rmSync(tempDir, { recursive: true, force: true });
});

test("runASTAnalyzer skips node_modules and dist directories", async () => {
  const tempDir = fs.mkdtempSync(
    path.join(os.tmpdir(), "agentlint-skip-test-")
  );
  const nodeModulesDir = path.join(tempDir, "node_modules");
  fs.mkdirSync(nodeModulesDir, { recursive: true });
  
  fs.writeFileSync(
    path.join(nodeModulesDir, "index.ts"),
    "const x: any = null;",
    "utf8"
  );

  const config = loadConfig(".");
  const issues = await runASTAnalyzer(tempDir, config);

  const nodeModulesIssues = issues.filter(
    (i) => i.file.includes("node_modules")
  );
  assert.strictEqual(nodeModulesIssues.length, 0);

  fs.rmSync(tempDir, { recursive: true, force: true });
});

test("runASTAnalyzer detects multiple issues in single file", async () => {
  const tempDir = fs.mkdtempSync(
    path.join(os.tmpdir(), "agentlint-multi-issue-test-")
  );
  const filePath = path.join(tempDir, "problematic.ts");
  fs.writeFileSync(
    filePath,
    `
// TODO: Fix this
const x: any = null;
const apiKey = 'sk-abc123def456ghi789jkl012mnopqrst';
fs.writeFileSync('/data/file.txt', 'content');
`,
    "utf8"
  );

  const config = loadConfig(".");
  const issues = await runASTAnalyzer(tempDir, config);

  assert.ok(issues.length >= 2);

  fs.rmSync(tempDir, { recursive: true, force: true });
});
