import assert from "node:assert/strict";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import test from "node:test";

import { runASTAnalyzer } from "../src/scanners/ast-analyzer.js";
import { loadConfig } from "../src/config.js";

test("runASTAnalyzer respects rule severity off config", async () => {
  const tempDir = fs.mkdtempSync(
    path.join(os.tmpdir(), "agentlint-scanner-off-test-")
  );
  const filePath = path.join(tempDir, "test.ts");
  const configPath = path.join(tempDir, ".agentlintrc.json");

  fs.writeFileSync(
    filePath,
    "const a: any = {}; const b = value as any;",
    "utf8"
  );

  // Create config that turns off code-quality-no-any
  fs.writeFileSync(
    configPath,
    JSON.stringify({
      rules: { "code-quality-no-any": "off" },
    }),
    "utf8"
  );

  const config = loadConfig(tempDir);
  const issues = await runASTAnalyzer(tempDir, config);

  // Should not find code-quality-no-any issues since rule is off
  const noAnyIssues = issues.filter(
    (i) => i.ruleId === "code-quality-no-any"
  );
  assert.strictEqual(noAnyIssues.length, 0);

  fs.rmSync(tempDir, { recursive: true, force: true });
});

test("runASTAnalyzer detects warn-level issues", async () => {
  const tempDir = fs.mkdtempSync(
    path.join(os.tmpdir(), "agentlint-scanner-warn-test-")
  );
  const filePath = path.join(tempDir, "test.ts");
  const configPath = path.join(tempDir, ".agentlintrc.json");

  fs.writeFileSync(filePath, "const a: any = {};", "utf8");

  // Create config with warn level
  fs.writeFileSync(
    configPath,
    JSON.stringify({
      rules: { "code-quality-no-any": "warn" },
    }),
    "utf8"
  );

  const config = loadConfig(tempDir);
  const issues = await runASTAnalyzer(tempDir, config);

  const noAnyIssues = issues.filter(
    (i) => i.ruleId === "code-quality-no-any"
  );
  assert.ok(noAnyIssues.length > 0);
  assert.strictEqual(noAnyIssues[0].severity, "warn");

  fs.rmSync(tempDir, { recursive: true, force: true });
});

test("runASTAnalyzer detects error-level issues", async () => {
  const tempDir = fs.mkdtempSync(
    path.join(os.tmpdir(), "agentlint-scanner-error-test-")
  );
  const filePath = path.join(tempDir, "test.ts");

  fs.writeFileSync(filePath, "const a: any = {};", "utf8");

  const config = loadConfig(tempDir); // uses default
  const issues = await runASTAnalyzer(tempDir, config);

  const noAnyIssues = issues.filter(
    (i) => i.ruleId === "code-quality-no-any"
  );
  assert.ok(noAnyIssues.length > 0);
  assert.strictEqual(noAnyIssues[0].severity, "error");

  fs.rmSync(tempDir, { recursive: true, force: true });
});
