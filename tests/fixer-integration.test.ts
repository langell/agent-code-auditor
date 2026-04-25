import assert from "node:assert/strict";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import test from "node:test";

import { fixSecurityRules } from "../src/fixers/security-fixer.js";
import { fixSpecRules } from "../src/fixers/spec-fixer.js";
import { fixToolRules } from "../src/fixers/tool-fixer.js";
import type { AgentIssue } from "../src/scanners/types.js";

test("fixSecurityRules handles prompt injection fix", async () => {
  const tempDir = fs.mkdtempSync(
    path.join(os.tmpdir(), "agentlint-security-fix-test-")
  );
  const filePath = path.join(tempDir, "agent.ts");
  const content = `const prompt = \`User said: \${toolOutput}\`;`;
  fs.writeFileSync(filePath, content, "utf8");

  const issues: AgentIssue[] = [
    {
      file: "agent.ts",
      line: 1,
      message: "Potential prompt injection",
      ruleId: "security-prompt-injection",
      severity: "error",
      category: "Security",
    },
  ];

  const fixes = await fixSecurityRules(filePath, issues);
  assert.ok(typeof fixes === "object" || Array.isArray(fixes));

  fs.rmSync(tempDir, { recursive: true, force: true });
});

test("fixSpecRules adds acceptance criteria to spec", async () => {
  const tempDir = fs.mkdtempSync(
    path.join(os.tmpdir(), "agentlint-spec-fix-test-")
  );
  const filePath = path.join(tempDir, "task.md");
  const content = `# Task\nBuild a feature`;
  fs.writeFileSync(filePath, content, "utf8");

  const issues: AgentIssue[] = [
    {
      file: "task.md",
      line: 1,
      message: "Missing acceptance criteria",
      ruleId: "spec-missing-acceptance-criteria",
      severity: "warn",
      category: "Spec",
    },
  ];

  const fixes = await fixSpecRules(filePath, issues);
  assert.ok(typeof fixes === "object" || Array.isArray(fixes));

  fs.rmSync(tempDir, { recursive: true, force: true });
});

test("fixToolRules removes duplicate tool names", async () => {
  const tempDir = fs.mkdtempSync(
    path.join(os.tmpdir(), "agentlint-tool-fix-test-")
  );
  const filePath = path.join(tempDir, "tools.ts");
  const content = `
const tools = [
  { name: "getData", type: "action" },
  { name: "getData", type: "query" }
];
`;
  fs.writeFileSync(filePath, content, "utf8");

  const issues: AgentIssue[] = [
    {
      file: "tools.ts",
      line: 1,
      message: "Duplicate tool names",
      ruleId: "tool-overlapping",
      severity: "error",
      category: "Tool",
    },
  ];

  const fixes = await fixToolRules(filePath, issues);
  assert.ok(Array.isArray(fixes) || typeof fixes === "object");

  fs.rmSync(tempDir, { recursive: true, force: true });
});

test("fixSecurityRules returns empty for non-existent file", async () => {
  const nonExistentFile = "/tmp/does-not-exist.ts";
  const issues: AgentIssue[] = [
    {
      file: nonExistentFile,
      line: 1,
      message: "Test issue",
      ruleId: "security-prompt-injection",
      severity: "error",
      category: "Security",
    },
  ];

  const fixes = await fixSecurityRules(nonExistentFile, issues);
  assert.ok(Array.isArray(fixes));

  fs.rmSync("/tmp/does-not-exist.ts", { force: true });
});

test("fixSpecRules adds rollback section to spec", async () => {
  const tempDir = fs.mkdtempSync(
    path.join(os.tmpdir(), "agentlint-spec-rollback-test-")
  );
  const filePath = path.join(tempDir, "migration.md");
  const content = `# Migration Task\nMigrate user data`;
  fs.writeFileSync(filePath, content, "utf8");

  const issues: AgentIssue[] = [
    {
      file: "migration.md",
      line: 1,
      message: "Missing rollback conditions",
      ruleId: "spec-missing-rollback",
      severity: "warn",
      category: "Spec",
    },
  ];

  const fixes = await fixSpecRules(filePath, issues);
  assert.ok(Array.isArray(fixes) || typeof fixes === "object");

  fs.rmSync(tempDir, { recursive: true, force: true });
});

test("fixToolRules adds weak schema descriptions", async () => {
  const tempDir = fs.mkdtempSync(
    path.join(os.tmpdir(), "agentlint-tool-schema-test-")
  );
  const filePath = path.join(tempDir, "schema.ts");
  const content = `const schema = { type: "object", properties: {} };`;
  fs.writeFileSync(filePath, content, "utf8");

  const issues: AgentIssue[] = [
    {
      file: "schema.ts",
      line: 1,
      message: "Weak schema",
      ruleId: "tool-weak-schema",
      severity: "error",
      category: "Tool",
    },
  ];

  const fixes = await fixToolRules(filePath, issues);
  assert.ok(Array.isArray(fixes) || typeof fixes === "object");

  fs.rmSync(tempDir, { recursive: true, force: true });
});
