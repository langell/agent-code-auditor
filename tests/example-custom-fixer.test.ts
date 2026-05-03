import assert from "node:assert/strict";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import test from "node:test";

import { loadConfig } from "../src/config.js";
import { runFixer } from "../src/fix-orchestrator.js";
import type { AgentIssue } from "../src/scanners/types.js";

const EXAMPLE_DIR = path.resolve("examples/custom-fixers");

test("example SecretToEnvFixer rewrites hardcoded secrets to process.env", async () => {
  const tempDir = fs.mkdtempSync(
    path.join(os.tmpdir(), "agentlint-example-secret-fixer-"),
  );

  fs.copyFileSync(
    path.join(EXAMPLE_DIR, ".agentlintrc.json"),
    path.join(tempDir, ".agentlintrc.json"),
  );
  fs.copyFileSync(
    path.join(EXAMPLE_DIR, "secret-to-env-fixer.mjs"),
    path.join(tempDir, "secret-to-env-fixer.mjs"),
  );

  const sampleSrc = fs.readFileSync(
    path.join(EXAMPLE_DIR, "before.ts"),
    "utf8",
  );
  const samplePath = path.join(tempDir, "before.ts");
  fs.writeFileSync(samplePath, sampleSrc, "utf8");

  const issues: AgentIssue[] = [
    {
      file: "before.ts",
      line: 5,
      message: "Potential secret/API key exposed in code or config.",
      ruleId: "security-secret-leakage",
      severity: "error",
      category: "Security",
    },
    {
      file: "before.ts",
      line: 6,
      message: "Potential secret/API key exposed in code or config.",
      ruleId: "security-secret-leakage",
      severity: "error",
      category: "Security",
    },
  ];

  const config = loadConfig(tempDir);
  const report = await runFixer(tempDir, issues, config);

  assert.equal(report.fixes.length, 2);
  assert.ok(
    report.fixes.every((f) => f.ruleId === "security-secret-leakage"),
  );

  const updated = fs.readFileSync(samplePath, "utf8");
  assert.match(updated, /process\.env\.OPENAI_API_KEY/);
  assert.match(updated, /process\.env\.SLACK_BOT_TOKEN/);
  assert.doesNotMatch(updated, /sk-[a-zA-Z0-9]{32,}/);
  assert.doesNotMatch(updated, /xoxb-[0-9]{10,}/);

  fs.rmSync(tempDir, { recursive: true, force: true });
});
