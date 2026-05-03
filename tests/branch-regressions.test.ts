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
import { buildCtx } from "./_helpers.js";

test("executionMissingMaxStepsRule accepts maxIterations guards", () => {
  const content = [
    "let maxIterations = 50;",
    "while (true) {",
    "  if (count >= maxIterations) break;",
    "  count++;",
    "}",
  ].join("\n");

  const issues = executionMissingMaxStepsRule.check(buildCtx("loop.ts", content));
  assert.strictEqual(issues.length, 0);
});

test("architectureAtomicTransactionsRule accepts explicit transactions", () => {
  const content = [
    "db.transaction(() => {",
    "  db.insert({ data: 1 });",
    "  db.delete({ id: 1 });",
    "  db.update({ id: 2, name: 'new' });",
    "});",
  ].join("\n");

  const issues = architectureAtomicTransactionsRule.check(
    buildCtx("transaction.ts", content),
  );
  assert.strictEqual(issues.length, 0);
});

test("securityDestructiveActionRule accepts approval guards", () => {
  const content = [
    "if (approved) {",
    "  fs.writeFileSync('/etc/passwd', data);",
    "}",
  ].join("\n");

  const issues = securityDestructiveActionRule.check(
    buildCtx("destructive.ts", content),
  );
  assert.strictEqual(issues.length, 0);
});

test("orchestrator stamps configured warn severity for security-destructive-action", async () => {
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
  const runIdIssues = observabilityMissingTraceIdRule.check(
    buildCtx(
      "agent.ts",
      "const agent = new Agent({ runId: 'test', tools: [] });",
    ),
  );
  const correlationIssues = observabilityMissingTraceIdRule.check(
    buildCtx(
      "agent.ts",
      "const agent = new Agent({ correlationId: 'corr-123', tools: [] });",
    ),
  );

  assert.strictEqual(runIdIssues.length, 0);
  assert.strictEqual(correlationIssues.length, 0);
});

test("toolWeakSchemaRule populates globalTools so duplicates can be detected", () => {
  // The intra-file `tool-overlapping` Rule has a no-op check (workspace
  // emission stays in the orchestrator). This test exercises the
  // workspace-level path: weak-schema collects tool names into globalTools,
  // then we manually run the dedup pass.
  const lines = [
    "export const tools = [",
    '  { name: "tool1", handler: func1 },',
    '  { name: "tool1", handler: func2 },',
    '  { name: "tool1", handler: func3 }',
    "];",
  ].join("\n");

  const ctx = buildCtx("tools.ts", lines);
  toolWeakSchemaRule.check(ctx);
  const names = ctx.globalTools.map((t) => t.name);
  const dups = names.filter((name, i) => names.indexOf(name) !== i);
  assert.ok(dups.length > 0, "expected duplicate tool names in globalTools");

  // Sanity check on the rule itself (no-op check)
  assert.equal(toolOverlappingRule.check(ctx).length, 0);
});
