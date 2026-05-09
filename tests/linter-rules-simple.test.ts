import assert from "node:assert/strict";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import test from "node:test";

import { codeQualityNoAnyRule } from "../src/rules/code-quality-no-any.js";
import { securitySecretLeakageRule } from "../src/rules/security-secret-leakage.js";
import { securityDestructiveActionRule } from "../src/rules/security-destructive-action.js";
import { runASTAnalyzer } from "../src/scanners/ast-analyzer.js";
import { loadConfig } from "../src/config.js";
import { expectCheck, expectNoIssues } from "./_helpers.js";

test("codeQualityNoAnyRule detects any type annotations", () => {
  expectCheck(codeQualityNoAnyRule, {
    content: "const x: any = {};",
    filePath: "test.ts",
    withAst: true,
    expectIssues: [{ ruleId: "code-quality-no-any" }],
  });
});

test("codeQualityNoAnyRule skips non-TS files", () => {
  // .js files use the AST path (the rule looks for `any` keyword tokens),
  // and `any` isn't a JS keyword — so no issues.
  expectNoIssues(codeQualityNoAnyRule, {
    content: "const x = any;",
    filePath: "test.js",
    withAst: true,
  });
});

test("orchestrator respects off config for code-quality-no-any", async () => {
  // Orchestrator-level test (config-driven filtering happens in
  // runASTAnalyzer, not the per-rule check). The harness only covers
  // rule.check / rule.applyFix, so this stays at the runASTAnalyzer level.
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

test("securitySecretLeakageRule detects OpenAI key", () => {
  expectCheck(securitySecretLeakageRule, {
    content: "const apiKey = 'sk-abc123def456ghi789jkl012mnopqrst';",
    filePath: "config.ts",
    expectIssues: [{ ruleId: "security-secret-leakage" }],
  });
});

test("securitySecretLeakageRule detects Slack token", () => {
  expectCheck(securitySecretLeakageRule, {
    content: "const token = 'xoxb-1234567890-1234567890-abc123';",
    filePath: "config.ts",
    expectIssues: [{ ruleId: "security-secret-leakage" }],
  });
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

test("securityDestructiveActionRule detects destructive action without confirmation", () => {
  expectCheck(securityDestructiveActionRule, {
    content: "fs.writeFileSync('/tmp/file.txt', data);",
    filePath: "agent.ts",
    expectIssues: [{ ruleId: "security-destructive-action" }],
  });
});

test("securityDestructiveActionRule allows destructive action with confirmation", () => {
  expectNoIssues(securityDestructiveActionRule, {
    content: [
      "// First confirm with user",
      "const confirmed = userConfirmed;",
      "if (confirmed) {",
      "  fs.writeFileSync('/tmp/file.txt', data);",
      "}",
    ].join("\n"),
    filePath: "agent.ts",
  });
});
