import assert from "node:assert/strict";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import test from "node:test";

import { checkCodeQualityRules } from "../src/scanners/rules/code-quality-lint.js";
import { checkSecurityRules } from "../src/scanners/rules/security-lint.js";
import { runASTAnalyzer } from "../src/scanners/ast-analyzer.js";
import { loadConfig } from "../src/config.js";

test("checkCodeQualityRules detects any type annotations", () => {
  const config = loadConfig(".");
  const issues = checkCodeQualityRules("test.ts", ["const x: any = {};"], config);

  assert.ok(issues.length > 0);
  assert.strictEqual(issues[0].ruleId, "code-quality-no-any");
});

test("checkCodeQualityRules skips non-TS files", () => {
  const config = loadConfig(".");
  const issues = checkCodeQualityRules("test.js", ["const x = any;"], config);

  assert.strictEqual(issues.length, 0);
});

test("orchestrator respects off config for code-quality-no-any", async () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "agentlint-cq-off-"));
  fs.writeFileSync(path.join(tempDir, "test.ts"), "const x: any = {};", "utf8");

  const config = loadConfig(".");
  config.rules["code-quality-no-any"] = "off";
  const issues = await runASTAnalyzer(tempDir, config);

  assert.strictEqual(
    issues.filter((i) => i.ruleId === "code-quality-no-any").length,
    0,
  );

  fs.rmSync(tempDir, { recursive: true, force: true });
});

test("checkSecurityRules detects secret leakage (OpenAI key)", () => {
  const config = loadConfig(".");
  const issues = checkSecurityRules("config.ts", ["const apiKey = 'sk-abc123def456ghi789jkl012mnopqrst';"], config);

  const secretIssues = issues.filter((i) => i.ruleId === "security-secret-leakage");
  assert.ok(secretIssues.length > 0);
});

test("checkSecurityRules detects secret leakage (Slack token)", () => {
  const config = loadConfig(".");
  const issues = checkSecurityRules("config.ts", ["const token = 'xoxb-1234567890-1234567890-abc123';"], config);

  const secretIssues = issues.filter((i) => i.ruleId === "security-secret-leakage");
  assert.ok(secretIssues.length > 0);
});

test("orchestrator respects security-secret-leakage off config", async () => {
  const tempDir = fs.mkdtempSync(
    path.join(os.tmpdir(), "agentlint-secret-off-"),
  );
  fs.writeFileSync(
    path.join(tempDir, "config.ts"),
    "const token = 'sk-abc123def456ghi789jkl012mnopqrst';",
    "utf8",
  );

  const config = loadConfig(".");
  config.rules["security-secret-leakage"] = "off";
  const issues = await runASTAnalyzer(tempDir, config);

  assert.strictEqual(
    issues.filter((i) => i.ruleId === "security-secret-leakage").length,
    0,
  );

  fs.rmSync(tempDir, { recursive: true, force: true });
});

test("checkSecurityRules detects destructive action without confirmation", () => {
  const config = loadConfig(".");
  const lines = ["fs.writeFileSync('/tmp/file.txt', data);"];
  const issues = checkSecurityRules("agent.ts", lines, config);

  const destructiveIssues = issues.filter((i) => i.ruleId === "security-destructive-action");
  assert.ok(destructiveIssues.length > 0);
});

test("checkSecurityRules allows destructive action with confirmation", () => {
  const config = loadConfig(".");
  const lines = [
    "// First confirm with user",
    "const confirmed = userConfirmed;",
    "if (confirmed) {",
    "  fs.writeFileSync('/tmp/file.txt', data);",
    "}",
  ];
  const issues = checkSecurityRules("agent.ts", lines, config);

  const destructiveIssues = issues.filter((i) => i.ruleId === "security-destructive-action");
  assert.strictEqual(destructiveIssues.length, 0);
});
