import assert from "node:assert/strict";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import test from "node:test";

import { runASTAnalyzer } from "../src/scanners/ast-analyzer.js";
import { runLinter } from "../src/scanners/linter.js";
import { runVulnerabilityScanner } from "../src/scanners/vulnerabilities.js";
import { loadConfig } from "../src/config.js";

// Integration tests for complete scanning pipeline

test("Full scan pipeline with all three scanners", async () => {
  const tempDir = fs.mkdtempSync(
    path.join(os.tmpdir(), "agentlint-full-scan-")
  );
  
  // Create a mock project structure
  const packageJsonPath = path.join(tempDir, "package.json");
  fs.writeFileSync(
    packageJsonPath,
    JSON.stringify({
      name: "test-project",
      version: "1.0.0",
      dependencies: { express: "4.0.0" },
    }),
    "utf8"
  );

  const lockPath = path.join(tempDir, "package-lock.json");
  fs.writeFileSync(lockPath, '{"lockfileVersion": 3}', "utf8");

  const codeFile = path.join(tempDir, "index.ts");
  fs.writeFileSync(
    codeFile,
    "const x: any = null;\n// TODO: implement\n",
    "utf8"
  );

  const config = loadConfig(".");

  // Run all three scanners
  const astIssues = await runASTAnalyzer(tempDir, config);
  const linterReport = await runLinter(tempDir);
  const vulnReport = await runVulnerabilityScanner(tempDir);

  assert.ok(Array.isArray(astIssues));
  assert.ok(typeof linterReport === "object");
  assert.ok(typeof vulnReport === "object");
  assert.ok(typeof vulnReport.issues === "number");

  fs.rmSync(tempDir, { recursive: true, force: true });
});

test("Vulnerability scanner with pnpm project", async () => {
  const tempDir = fs.mkdtempSync(
    path.join(os.tmpdir(), "agentlint-pnpm-scan-")
  );
  
  const pnpmLockPath = path.join(tempDir, "pnpm-lock.yaml");
  fs.writeFileSync(pnpmLockPath, "# pnpm lock file", "utf8");

  const vulnReport = await runVulnerabilityScanner(tempDir);
  
  assert.ok(typeof vulnReport === "object");
  assert.ok("issues" in vulnReport);
  assert.ok("details" in vulnReport);
  assert.ok("vulnerabilities" in vulnReport);

  fs.rmSync(tempDir, { recursive: true, force: true });
});

test("Linter handles missing eslint config", async () => {
  const tempDir = fs.mkdtempSync(
    path.join(os.tmpdir(), "agentlint-linter-noconfig-")
  );

  const linterReport = await runLinter(tempDir);

  assert.ok(typeof linterReport === "object");
  assert.ok("errorCount" in linterReport);
  assert.ok("warningCount" in linterReport);
  assert.ok("messages" in linterReport);

  fs.rmSync(tempDir, { recursive: true, force: true });
});

test("AST analyzer with empty directory", async () => {
  const tempDir = fs.mkdtempSync(
    path.join(os.tmpdir(), "agentlint-empty-dir-")
  );

  const config = loadConfig(".");
  const issues = await runASTAnalyzer(tempDir, config);

  assert.ok(Array.isArray(issues));
  assert.strictEqual(issues.length, 0);

  fs.rmSync(tempDir, { recursive: true, force: true });
});

test("Config loading with custom fixers", () => {
  const tempDir = fs.mkdtempSync(
    path.join(os.tmpdir(), "agentlint-custom-fixers-")
  );
  const configPath = path.join(tempDir, ".agentlintrc.json");

  fs.writeFileSync(
    configPath,
    JSON.stringify({
      fixers: {
        "code-quality-no-any": "./custom-fixer.js#CustomFixer",
      },
      rules: {
        "code-quality-no-any": "error",
      },
    }),
    "utf8"
  );

  const config = loadConfig(tempDir);

  assert.ok(config.fixers);
  assert.ok("code-quality-no-any" in config.fixers);

  fs.rmSync(tempDir, { recursive: true, force: true });
});

test("Multiple file types in single directory", async () => {
  const tempDir = fs.mkdtempSync(
    path.join(os.tmpdir(), "agentlint-multitype-")
  );

  // Create files of different types
  fs.writeFileSync(path.join(tempDir, "code.ts"), "const x: any = null;");
  fs.writeFileSync(path.join(tempDir, "readme.md"), "# README\n# TODO: Document");
  fs.writeFileSync(path.join(tempDir, "agent.prompt"), "System prompt\n[INSERT instructions]");

  const config = loadConfig(".");
  const issues = await runASTAnalyzer(tempDir, config);

  assert.ok(issues.length > 0);

  fs.rmSync(tempDir, { recursive: true, force: true });
});
