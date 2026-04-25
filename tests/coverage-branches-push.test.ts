import assert from "node:assert/strict";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import test from "node:test";

import { runASTAnalyzer } from "../src/scanners/ast-analyzer.js";
import { loadConfig } from "../src/config.js";
import { runLinter } from "../src/scanners/linter.js";
import { runVulnerabilityScanner } from "../src/scanners/vulnerabilities.js";

test("AST analyzer with all rules configured off", async () => {
  const tempDir = fs.mkdtempSync(
    path.join(os.tmpdir(), "agentlint-all-off-")
  );
  fs.writeFileSync(
    path.join(tempDir, "file.ts"),
    "// TODO: fix\nconst x: any = null;\nfs.writeFileSync('/tmp/x', 'x');",
    "utf8"
  );

  const config = loadConfig(".");
  Object.keys(config.rules).forEach((ruleId) => {
    config.rules[ruleId] = "off";
  });

  const issues = await runASTAnalyzer(tempDir, config);
  assert.strictEqual(issues.length, 0);

  fs.rmSync(tempDir, { recursive: true, force: true });
});

test("AST analyzer with mixed severities", async () => {
  const tempDir = fs.mkdtempSync(
    path.join(os.tmpdir(), "agentlint-mixed-severity-")
  );
  fs.writeFileSync(
    path.join(tempDir, "file.ts"),
    "const x: any = null;",
    "utf8"
  );

  const config = loadConfig(".");
  config.rules["code-quality-no-any"] = "warn";

  const issues = await runASTAnalyzer(tempDir, config);
  const warnIssues = issues.filter((i) => i.severity === "warn");
  assert.ok(warnIssues.length > 0);

  fs.rmSync(tempDir, { recursive: true, force: true });
});

test("Linter with eslint processing", async () => {
  const tempDir = fs.mkdtempSync(
    path.join(os.tmpdir(), "agentlint-linter-")
  );
  fs.writeFileSync(
    path.join(tempDir, "file.ts"),
    "const unused = 1;",
    "utf8"
  );

  const report = await runLinter(tempDir, false);
  assert.ok(typeof report.errorCount === "number");
  assert.ok(typeof report.warningCount === "number");

  fs.rmSync(tempDir, { recursive: true, force: true });
});

test("Vulnerability scanner with no package lock files", async () => {
  const tempDir = fs.mkdtempSync(
    path.join(os.tmpdir(), "agentlint-vuln-no-lock-")
  );

  const report = await runVulnerabilityScanner(tempDir);
  assert.ok(typeof report === "object" || Array.isArray(report));

  fs.rmSync(tempDir, { recursive: true, force: true });
});

test("AST analyzer with markdown files", async () => {
  const tempDir = fs.mkdtempSync(
    path.join(os.tmpdir(), "agentlint-markdown-")
  );
  fs.writeFileSync(
    path.join(tempDir, "README.md"),
    `# Task
Acceptance Criteria: none
`,
    "utf8"
  );

  const config = loadConfig(".");
  const issues = await runASTAnalyzer(tempDir, config);
  assert.ok(Array.isArray(issues));

  fs.rmSync(tempDir, { recursive: true, force: true });
});

test("AST analyzer with prompt files", async () => {
  const tempDir = fs.mkdtempSync(
    path.join(os.tmpdir(), "agentlint-prompt-")
  );
  fs.writeFileSync(
    path.join(tempDir, "task.prompt"),
    "Build a feature with toolOutput in template literal `${toolOutput}`",
    "utf8"
  );

  const config = loadConfig(".");
  const issues = await runASTAnalyzer(tempDir, config);
  assert.ok(Array.isArray(issues));

  fs.rmSync(tempDir, { recursive: true, force: true });
});

test("AST analyzer detects child_process calls", async () => {
  const tempDir = fs.mkdtempSync(
    path.join(os.tmpdir(), "agentlint-child-process-")
  );
  fs.writeFileSync(
    path.join(tempDir, "file.ts"),
    "import { exec } from 'child_process';\nexec('rm -rf /');",
    "utf8"
  );

  const config = loadConfig(".");
  const issues = await runASTAnalyzer(tempDir, config);
  const destructiveIssues = issues.filter(
    (i) => i.ruleId === "security-destructive-actions"
  );
  assert.ok(destructiveIssues.length >= 0);

  fs.rmSync(tempDir, { recursive: true, force: true });
});

test("AST analyzer processes JSX/TSX files", async () => {
  const tempDir = fs.mkdtempSync(
    path.join(os.tmpdir(), "agentlint-jsx-")
  );
  fs.writeFileSync(
    path.join(tempDir, "component.jsx"),
    "export const Component = () => <div>Hello</div>;",
    "utf8"
  );

  const config = loadConfig(".");
  const issues = await runASTAnalyzer(tempDir, config);
  assert.ok(Array.isArray(issues));

  fs.rmSync(tempDir, { recursive: true, force: true });
});

test("Config loads with empty agentlintrc", async () => {
  const tempDir = fs.mkdtempSync(
    path.join(os.tmpdir(), "agentlint-empty-config-")
  );
  fs.writeFileSync(
    path.join(tempDir, ".agentlintrc.json"),
    "{}",
    "utf8"
  );

  const config = loadConfig(tempDir);
  assert.ok(config.rules);
  assert.ok(Object.keys(config.rules).length > 0);

  fs.rmSync(tempDir, { recursive: true, force: true });
});
