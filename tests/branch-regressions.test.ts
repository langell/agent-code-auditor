import assert from "node:assert/strict";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import test from "node:test";

import { loadConfig } from "../src/config.js";
import { runASTAnalyzer } from "../src/scanners/ast-analyzer.js";
import { observabilityMissingTraceIdRule } from "../src/rules/observability-missing-trace-id.js";
import { executionMissingMaxStepsRule } from "../src/rules/execution-missing-max-steps.js";
import { architectureAtomicTransactionsRule } from "../src/rules/architecture-atomic-transactions.js";
import { securityDestructiveActionRule } from "../src/rules/security-destructive-action.js";
import { toolOverlappingRule } from "../src/rules/tool-overlapping.js";
import { toolWeakSchemaRule } from "../src/rules/tool-weak-schema.js";
import { buildCtx, expectNoIssues } from "./_helpers.js";

test("executionMissingMaxStepsRule accepts maxIterations guards", () => {
  expectNoIssues(executionMissingMaxStepsRule, {
    content: [
      "let maxIterations = 50;",
      "while (true) {",
      "  if (count >= maxIterations) break;",
      "  count++;",
      "}",
    ].join("\n"),
    filePath: "loop.ts",
  });
});

test("architectureAtomicTransactionsRule accepts explicit transactions", () => {
  expectNoIssues(architectureAtomicTransactionsRule, {
    content: [
      "db.transaction(() => {",
      "  db.insert({ data: 1 });",
      "  db.delete({ id: 1 });",
      "  db.update({ id: 2, name: 'new' });",
      "});",
    ].join("\n"),
    filePath: "transaction.ts",
  });
});

test("securityDestructiveActionRule accepts approval guards", () => {
  expectNoIssues(securityDestructiveActionRule, {
    content: [
      "if (approved) {",
      "  fs.writeFileSync('/etc/passwd', data);",
      "}",
    ].join("\n"),
    filePath: "destructive.ts",
  });
});

test("orchestrator stamps configured warn severity for security-destructive-action", async () => {
  // Severity stamping happens in the orchestrator's applyConfig pass — not
  // in the per-rule check — so this stays at the runASTAnalyzer level.
  const tempDir = fs.mkdtempSync(
    path.join(os.tmpdir(), "agentlint-sev-override-"),
  );
  fs.writeFileSync(
    path.join(tempDir, "file.ts"),
    "fs.writeFileSync('/tmp/file', data);",
    "utf8",
  );

  const config = loadConfig(".");
  config.rules["security-destructive-action"] = "warn";

  const issues = await runASTAnalyzer(tempDir, config);
  const destructiveIssue = issues.find(
    (issue) => issue.ruleId === "security-destructive-action",
  );

  assert.ok(destructiveIssue);
  assert.strictEqual(destructiveIssue!.severity, "warn");

  fs.rmSync(tempDir, { recursive: true, force: true });
});

test("observabilityMissingTraceIdRule accepts runId and correlationId", () => {
  expectNoIssues(observabilityMissingTraceIdRule, {
    content: "const agent = new Agent({ runId: 'test', tools: [] });",
    filePath: "agent.ts",
  });
  expectNoIssues(observabilityMissingTraceIdRule, {
    content: "const agent = new Agent({ correlationId: 'corr-123', tools: [] });",
    filePath: "agent.ts",
  });
});

test("toolWeakSchemaRule populates globalTools so duplicates can be detected", () => {
  // tool-overlapping is workspace-level — emission lives in the
  // orchestrator's aggregate pass, not in tool-overlapping's check (which
  // is a deliberate no-op). The workspace-state side effect being tested
  // here doesn't fit the harness's check/applyFix model, so we drive the
  // ctx directly.
  const ctx = buildCtx(
    "tools.ts",
    [
      "export const tools = [",
      '  { name: "tool1", handler: func1 },',
      '  { name: "tool1", handler: func2 },',
      '  { name: "tool1", handler: func3 }',
      "];",
    ].join("\n"),
  );
  toolWeakSchemaRule.check(ctx);

  const names = ctx.globalTools.map((t) => t.name);
  const dups = names.filter((name, i) => names.indexOf(name) !== i);
  assert.ok(dups.length > 0, "expected duplicate tool names in globalTools");

  // tool-overlapping's check is a documented no-op; its emission lives in
  // the orchestrator's aggregate pass.
  assert.equal(toolOverlappingRule.check(ctx).length, 0);
});
