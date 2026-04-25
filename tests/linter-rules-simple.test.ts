import assert from "node:assert/strict";
import test from "node:test";

import { checkCodeQualityRules } from "../src/scanners/rules/code-quality-lint.js";
import { checkSecurityRules } from "../src/scanners/rules/security-lint.js";
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

test("checkCodeQualityRules respects off config", () => {
  const config = loadConfig(".");
  config.rules["code-quality-no-any"] = "off";
  const issues = checkCodeQualityRules("test.ts", ["const x: any = {};"], config);

  assert.strictEqual(issues.length, 0);
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

test("checkSecurityRules respects security-secret-leakage off config", () => {
  const config = loadConfig(".");
  config.rules["security-secret-leakage"] = "off";
  const issues = checkSecurityRules("config.ts", ["const token = 'sk-abc123def456ghi789jkl012mnopqrst';"], config);

  const secretIssues = issues.filter((i) => i.ruleId === "security-secret-leakage");
  assert.strictEqual(secretIssues.length, 0);
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
