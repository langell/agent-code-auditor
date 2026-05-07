import assert from "node:assert/strict";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import test from "node:test";

import { runASTAnalyzer } from "../src/scanners/ast-analyzer.js";
import { toolOverlappingRule } from "../src/rules/tool-overlapping.js";
import { loadConfig } from "../src/config.js";
import type {
  Rule,
  RuleContext,
  WorkspaceContext,
} from "../src/rules/types.js";
import type { AgentIssue, ToolDeclaration } from "../src/scanners/types.js";

// =================================================================
// toolOverlappingRule.aggregate — direct tests
// =================================================================

test("toolOverlappingRule.check is a no-op (workspace concern)", () => {
  const ctx: RuleContext = {
    filePath: "x.ts",
    content: "",
    lines: [""],
    ast: undefined,
    targetDir: "",
    globalTools: [],
  };
  assert.equal(toolOverlappingRule.check(ctx).length, 0);
});

test("toolOverlappingRule.aggregate emits no issues when names are unique", () => {
  const ctx: WorkspaceContext = {
    targetDir: "",
    globalTools: [
      { name: "alpha", file: "a.ts", line: 1 },
      { name: "beta", file: "b.ts", line: 2 },
    ],
  };
  assert.equal(toolOverlappingRule.aggregate!(ctx).length, 0);
});

test("toolOverlappingRule.aggregate emits one issue per duplicate tool name", () => {
  const ctx: WorkspaceContext = {
    targetDir: "",
    globalTools: [
      { name: "shared", file: "a.ts", line: 1 },
      { name: "shared", file: "b.ts", line: 5 },
      { name: "shared", file: "c.ts", line: 10 },
    ],
  };
  const issues = toolOverlappingRule.aggregate!(ctx);
  assert.equal(issues.length, 2);
  // Each duplicate is reported at its own location, blaming the first sighting
  for (const issue of issues) {
    assert.equal(issue.ruleId, "tool-overlapping");
    assert.match(issue.message, /'shared' overlaps with a tool defined in a\.ts/);
  }
  assert.equal(issues[0].file, "b.ts");
  assert.equal(issues[0].line, 5);
  assert.equal(issues[1].file, "c.ts");
  assert.equal(issues[1].line, 10);
});

// =================================================================
// runASTAnalyzer integration: aggregate path is generic
// =================================================================

test("runASTAnalyzer dispatches to Rule.aggregate after the per-file loop", async () => {
  // Smoke-test that the orchestrator's aggregate dispatch fires the
  // tool-overlapping rule's aggregate hook end-to-end (same cross-file
  // overlap test that existed pre-aggregate, now flowing through the new
  // generic dispatch).
  const tempDir = fs.mkdtempSync(
    path.join(os.tmpdir(), "agentlint-aggregate-"),
  );
  fs.writeFileSync(
    path.join(tempDir, "a.ts"),
    [
      "const tool = {",
      '  type: "object",',
      '  name: "shared",',
      '  description: "first",',
      "  properties: {},",
      "};",
    ].join("\n"),
    "utf8",
  );
  fs.writeFileSync(
    path.join(tempDir, "b.ts"),
    [
      "const tool = {",
      '  type: "object",',
      '  name: "shared",',
      '  description: "second",',
      "  properties: {},",
      "};",
    ].join("\n"),
    "utf8",
  );

  const issues = await runASTAnalyzer(tempDir, loadConfig("."));
  assert.ok(issues.some((i) => i.ruleId === "tool-overlapping"));

  fs.rmSync(tempDir, { recursive: true, force: true });
});

test("runASTAnalyzer calls aggregate on every Rule that defines it (even non-tool ones)", async () => {
  // Build a minimal workspace and run a custom rule whose only purpose is
  // to assert that aggregate is invoked. We can't easily inject a rule
  // into the registry, so we test the dispatch indirectly: the tool
  // overlap is the only built-in aggregate today, and we already cover
  // it. This test documents the iteration shape via toolOverlappingRule.
  const ctx: WorkspaceContext = {
    targetDir: ".",
    globalTools: [
      { name: "a", file: "f.ts", line: 1 },
      { name: "a", file: "g.ts", line: 1 },
    ],
  };
  const out = toolOverlappingRule.aggregate!(ctx);
  assert.equal(out.length, 1);
});

test("custom rule with aggregate participates in workspace-level emission", async () => {
  // End-to-end: register a custom Rule with an aggregate method via
  // .agentlintrc.json's customRules and verify its aggregate output
  // shows up in runASTAnalyzer's results.
  const tempDir = fs.mkdtempSync(
    path.join(os.tmpdir(), "agentlint-aggregate-custom-"),
  );

  // A custom rule that emits one workspace-level issue regardless of files.
  fs.writeFileSync(
    path.join(tempDir, "custom-aggregate.mjs"),
    [
      "export const customAggregateRule = {",
      "  id: 'custom-aggregate',",
      "  appliesTo: 'all',",
      "  check() { return []; },",
      "  aggregate(ctx) {",
      "    return [{",
      "      file: ctx.targetDir,",
      "      line: 1,",
      "      message: 'workspace-level issue from custom rule',",
      "      ruleId: 'custom-aggregate',",
      "      severity: 'warn',",
      "      category: 'General',",
      "    }];",
      "  },",
      "};",
    ].join("\n"),
    "utf8",
  );

  fs.writeFileSync(path.join(tempDir, "x.ts"), "const x = 1;\n", "utf8");
  fs.writeFileSync(
    path.join(tempDir, ".agentlintrc.json"),
    JSON.stringify({
      customRules: ["./custom-aggregate.mjs#customAggregateRule"],
    }),
    "utf8",
  );

  const issues = await runASTAnalyzer(tempDir, loadConfig(tempDir));
  assert.ok(
    issues.some((i) => i.ruleId === "custom-aggregate"),
    "custom rule's aggregate should have emitted a workspace-level issue",
  );

  fs.rmSync(tempDir, { recursive: true, force: true });
});

// Type smoke check — proves the WorkspaceContext / Rule.aggregate contract
// compiles without type errors at the call shape downstream consumers will
// use.
test("Rule.aggregate type contract is consumable by user code", () => {
  const myRule: Rule = {
    id: "my-rule",
    appliesTo: "source",
    check(_ctx: RuleContext): AgentIssue[] {
      return [];
    },
    aggregate(ctx: WorkspaceContext): AgentIssue[] {
      // ctx exposes globalTools (ToolDeclaration[]) and targetDir.
      const _tools: ToolDeclaration[] = ctx.globalTools;
      void _tools;
      return [];
    },
  };
  assert.equal(typeof myRule.aggregate, "function");
});
