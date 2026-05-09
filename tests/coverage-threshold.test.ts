import assert from "node:assert/strict";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import test from "node:test";

import { loadConfig } from "../src/config.js";
import { runASTAnalyzer } from "../src/scanners/ast-analyzer.js";

import { contextOversizedRule } from "../src/rules/context-oversized.js";
import { observabilityMissingTraceIdRule } from "../src/rules/observability-missing-trace-id.js";
import { securityInputValidationRule } from "../src/rules/security-input-validation.js";
import { securityPromptInjectionRule } from "../src/rules/security-prompt-injection.js";
import { contextUnredactedPiiRule } from "../src/rules/context-unredacted-pii.js";
import { toolWeakSchemaRule } from "../src/rules/tool-weak-schema.js";
import { toolMissingExamplesRule } from "../src/rules/tool-missing-examples.js";
import { codeQualityNoAnyRule } from "../src/rules/code-quality-no-any.js";
import { executionMissingMaxStepsRule } from "../src/rules/execution-missing-max-steps.js";
import { verificationMissingTestsRule } from "../src/rules/verification-missing-tests.js";
import { placeholderCommentsRule } from "../src/rules/legacy/placeholder-comments.js";
import {
  buildCtx,
  expectCheck,
  expectFix,
  expectNoFix,
  expectNoIssues,
  makeIssue,
} from "./_helpers.js";
import type { AgentIssue } from "../src/scanners/types.js";

function makeTempDir(prefix: string): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), prefix));
}

// =================================================================
// context — oversized + missing-trace-id (AST + non-AST paths)
// =================================================================

test("context-oversized + observability-missing-trace-id (AST) flag oversized strings and Agent without traceId", () => {
  // Multi-rule case that also checks `startPos` is populated — drives ctx
  // directly so the AST positions can be inspected.
  const huge = "x".repeat(5500);
  const content = [
    "const blob = `" + huge + "`;",
    "const agent = new Agent({ name: 'a', tools: [] });",
    "const init = Agent.init({ model: 'a' });",
  ].join("\n");

  const ctx = buildCtx("ctx.ts", content, true);
  const oversized = contextOversizedRule.check(ctx);
  const traceMissing = observabilityMissingTraceIdRule.check(ctx);

  assert.ok(oversized.length >= 1);
  assert.ok(traceMissing.length >= 2);
  assert.ok(oversized[0].startPos !== undefined);
});

test("context-oversized + observability-missing-trace-id (non-AST) fallback paths", () => {
  const huge = "y".repeat(5500);
  const content = [
    'const blob = "' + huge + '";',
    "const agent = new Agent({});",
  ].join("\n");
  const ctx = buildCtx("ctx.ts", content);
  assert.ok(contextOversizedRule.check(ctx).length > 0);
  assert.ok(observabilityMissingTraceIdRule.check(ctx).length > 0);
});

// =================================================================
// security — input-validation, prompt-injection, PII
// =================================================================

test("security-input-validation (AST) flags missing validation in api files", () => {
  // Asserts startPos is populated — drives ctx directly.
  const content = [
    "export async function handler(req) {",
    "  return { ok: true };",
    "}",
  ].join("\n");
  const ctx = buildCtx("src/app/api/handler/route.ts", content, true);
  const issues = securityInputValidationRule.check(ctx);
  assert.ok(issues.length >= 1);
  assert.ok(issues[0].startPos !== undefined);
});

test("security-input-validation (non-AST) flags missing validation in actions files", () => {
  expectCheck(securityInputValidationRule, {
    content: [
      "'use server';",
      "export async function action(input) {",
      "  return input;",
      "}",
    ].join("\n"),
    filePath: "src/actions/run.ts",
    expectIssues: [{ ruleId: "security-input-validation" }],
  });
});

test("security-input-validation (AST) allows validated api functions", () => {
  expectNoIssues(securityInputValidationRule, {
    content: [
      "export async function handler(req) {",
      "  const parsed = z.object({}).parse(req);",
      "  return parsed;",
      "}",
    ].join("\n"),
    filePath: "src/app/api/safe/route.ts",
    withAst: true,
  });
});

test("security-prompt-injection detects toolOutput template", () => {
  expectCheck(securityPromptInjectionRule, {
    content: "const prompt = `Use this output: ${toolOutput}`;",
    filePath: "inject.ts",
    expectIssues: [{ ruleId: "security-prompt-injection" }],
  });
});

// =================================================================
// tool — weak-schema, missing-examples, globalTools collection
// =================================================================

test("tool-weak-schema + tool-missing-examples (AST) emit for object schemas; globalTools is populated", () => {
  // Verifies the side effect of populating ctx.globalTools — needs direct
  // ctx access.
  const content = [
    "const schema = {",
    '  type: "object",',
    '  name: "fetcher",',
    "  parameters: { id: { type: 'number' } },",
    "  handler: () => {},",
    "};",
  ].join("\n");

  const ctx = buildCtx("tool.ts", content, true);
  const weakSchema = toolWeakSchemaRule.check(ctx);
  const missingExamples = toolMissingExamplesRule.check(ctx);

  assert.ok(weakSchema.length > 0);
  assert.ok(missingExamples.length > 0);
  assert.ok(ctx.globalTools.some((t) => t.name === "fetcher"));
});

test("tool-weak-schema (non-AST) populates globalTools", () => {
  const content = [
    "const a = { name: 'first', description: 'first tool' };",
    "const b = { name: 'second', description: 'second tool' };",
  ].join("\n");

  const ctx = buildCtx("tools.ts", content);
  toolWeakSchemaRule.check(ctx);
  assert.ok(ctx.globalTools.length >= 2);
});

test("tool-missing-examples (non-AST) detects missing examples around object schemas", () => {
  expectCheck(toolMissingExamplesRule, {
    content: 'const schema = { type: "object", description: "thing", properties: {} };',
    filePath: "tool.ts",
    expectIssues: [{ ruleId: "tool-missing-examples" }],
  });
});

// =================================================================
// orchestrator — cross-file overlap, placeholder comments across file types
// =================================================================

test("AST analyzer detects cross-file overlapping tools", async () => {
  const tempDir = makeTempDir("agentlint-cross-file-overlap-");
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

test("AST analyzer detects placeholder block and HTML comments", async () => {
  const tempDir = makeTempDir("agentlint-comment-styles-");
  fs.writeFileSync(
    path.join(tempDir, "block.ts"),
    "/* TODO: implement the handler */\nconst x = 1;\n",
    "utf8",
  );
  fs.writeFileSync(
    path.join(tempDir, "doc.md"),
    "# Doc\n<!-- placeholder for diagram -->\n",
    "utf8",
  );
  fs.writeFileSync(
    path.join(tempDir, "jsdoc.ts"),
    "/**\n * placeholder docstring\n */\nconst y = 2;\n",
    "utf8",
  );

  const issues = await runASTAnalyzer(tempDir, loadConfig("."));
  const placeholders = issues.filter(
    (i) => i.ruleId === "no-placeholder-comments",
  );
  assert.ok(placeholders.length >= 2);
  fs.rmSync(tempDir, { recursive: true, force: true });
});

// =================================================================
// observability-missing-trace-id.applyFix — AST + line fallback
// =================================================================

test("observabilityMissingTraceIdRule.applyFix injects traceId via AST positions", async () => {
  // End-to-end: orchestrator emits the issue (with AST positions), then
  // we hand the issues to applyFix. Stays at the runASTAnalyzer level so
  // the AST positions are real.
  const tempDir = makeTempDir("agentlint-context-ast-fix-");
  const filePath = path.join(tempDir, "agent.ts");
  const original = "const agent = new Agent({ name: 'a', tools: [] });\n";
  fs.writeFileSync(filePath, original, "utf8");

  const issues = await runASTAnalyzer(tempDir, loadConfig("."));
  const traceIssues = issues.filter(
    (i) => i.ruleId === "observability-missing-trace-id",
  );

  assert.ok(traceIssues.length > 0);
  assert.ok(traceIssues[0].startPos !== undefined);

  const { content, fixes } = observabilityMissingTraceIdRule.applyFix!(
    original,
    traceIssues,
    filePath,
  );
  assert.ok(fixes.length > 0);
  assert.match(content, /traceId/);

  fs.rmSync(tempDir, { recursive: true, force: true });
});

test("observabilityMissingTraceIdRule.applyFix injects via AST positions with empty Agent()", () => {
  const original = "const agent = new Agent();\n";
  const issue = makeIssue({
    ruleId: "observability-missing-trace-id",
    file: "agent.ts",
    category: "Context",
    startPos: original.indexOf("new Agent()"),
    endPos: original.indexOf("new Agent()") + "new Agent()".length,
  });

  const { content, fixes } = observabilityMissingTraceIdRule.applyFix!(
    original,
    [issue],
    "agent.ts",
  );
  assert.ok(fixes.length > 0);
  assert.match(content, /traceId/);
});

// =================================================================
// security-input-validation.applyFix
// =================================================================

test("securityInputValidationRule.applyFix adds validate() guard via AST positions for api files", async () => {
  // End-to-end via runASTAnalyzer to get real AST positions.
  const tempDir = makeTempDir("agentlint-sec-input-ast-");
  const apiDir = path.join(tempDir, "src", "app", "api", "handler");
  fs.mkdirSync(apiDir, { recursive: true });
  const filePath = path.join(apiDir, "route.ts");
  const original = [
    "export async function handler(req) {",
    "  return { ok: true };",
    "}",
    "",
  ].join("\n");
  fs.writeFileSync(filePath, original, "utf8");

  const issues = await runASTAnalyzer(tempDir, loadConfig("."));
  const inputValidationIssues = issues.filter(
    (i) => i.ruleId === "security-input-validation",
  );

  assert.ok(inputValidationIssues.length > 0);
  assert.ok(inputValidationIssues[0].startPos !== undefined);

  const { content, fixes } = securityInputValidationRule.applyFix!(
    original,
    inputValidationIssues,
    filePath,
  );
  assert.ok(fixes.length > 0);
  assert.match(content, /function validate\(input: unknown\)/);
  assert.match(content, /validate\(/);

  fs.rmSync(tempDir, { recursive: true, force: true });
});

// =================================================================
// execution-missing-max-steps.applyFix
// =================================================================

test("executionMissingMaxStepsRule.applyFix bounds while(true) via AST positions", async () => {
  const tempDir = makeTempDir("agentlint-exec-ast-");
  const filePath = path.join(tempDir, "loop.ts");
  const original = [
    "function run() {",
    "  while (true) {",
    "    doStuff();",
    "  }",
    "}",
    "",
  ].join("\n");
  fs.writeFileSync(filePath, original, "utf8");

  const issues = await runASTAnalyzer(tempDir, loadConfig("."));
  const maxStepIssues = issues.filter(
    (i) => i.ruleId === "execution-missing-max-steps",
  );

  assert.ok(maxStepIssues.length > 0);

  const { content, fixes } = executionMissingMaxStepsRule.applyFix!(
    original,
    maxStepIssues,
    filePath,
  );
  assert.ok(fixes.length > 0);
  assert.match(content, /__agentStep/);

  fs.rmSync(tempDir, { recursive: true, force: true });
});

test("executionMissingMaxStepsRule.applyFix avoids reusing existing __agentStep loop var", () => {
  expectFix(executionMissingMaxStepsRule, {
    before: ["const __agentStep = 0;", "while (true) { run(); }", ""].join("\n"),
    after: [
      "const __agentStep = 0;",
      "for (let __agentStep1 = 0; __agentStep1 < 100; __agentStep1++) { run(); }",
      "",
    ].join("\n"),
    issues: [
      makeIssue({
        ruleId: "execution-missing-max-steps",
        line: 2,
        file: "loop.ts",
        category: "Execution",
      }),
    ],
    filePath: "loop.ts",
    fixCount: 1,
  });
});

// =================================================================
// tool-weak-schema + tool-missing-examples applyFix (multi-rule pipeline)
// =================================================================

test("tool-weak-schema + tool-missing-examples applyFix expand empty properties and append examples", () => {
  // Threading content through two rules is a pipeline shape the harness
  // doesn't directly model; we still drive both rules manually but use
  // makeIssue for the issue lists.
  const original = [
    'const a = { type: "object", properties: {} };',
    'const b = { type: "object", properties: { id: { type: "number" } } };',
    "",
  ].join("\n");

  const weakIssues: AgentIssue[] = [
    makeIssue({ ruleId: "tool-weak-schema", line: 1, file: "tool.ts", severity: "error", category: "Tool" }),
    makeIssue({ ruleId: "tool-weak-schema", line: 2, file: "tool.ts", severity: "error", category: "Tool" }),
  ];
  const exampleIssues: AgentIssue[] = [
    makeIssue({ ruleId: "tool-missing-examples", line: 1, file: "tool.ts", severity: "warn", category: "Tool" }),
  ];

  const a = toolWeakSchemaRule.applyFix!(original, weakIssues, "tool.ts");
  const b = toolMissingExamplesRule.applyFix!(a.content, exampleIssues, "tool.ts");

  assert.ok(a.fixes.length + b.fixes.length >= 2);
  assert.match(b.content, /TBD: describe this parameter/);
  assert.match(b.content, /TBD: expand property descriptions/);
  assert.match(b.content, /TBD: valid example/);
});

// =================================================================
// no-placeholder-comments.applyFix
// =================================================================

test("placeholderCommentsRule.applyFix replaces placeholder TODO comments with hard-fail throws", () => {
  expectFix(placeholderCommentsRule, {
    before: [
      "function run() {",
      "  // TODO: implement run logic",
      "  return null;",
      "}",
      "",
    ].join("\n"),
    after: [
      "function run() {",
      `  throw new Error("Not implemented - AI placeholder detected");`,
      "  return null;",
      "}",
      "",
    ].join("\n"),
    issues: [
      makeIssue({
        ruleId: "no-placeholder-comments",
        line: 2,
        file: "src.ts",
        severity: "error",
        category: "Spec",
      }),
    ],
    filePath: "src.ts",
    fixCount: 1,
  });
});

test("placeholderCommentsRule.applyFix leaves inline TODO comments alone (avoids breaking syntax)", () => {
  // Inline trailing TODO must not be rewritten — it would corrupt the
  // statement. The rule's heuristic only rewrites standalone-line comments.
  expectNoFix(placeholderCommentsRule, {
    before: [
      "const value = compute(); // TODO: implement caching",
      "return value;",
      "",
    ].join("\n"),
    issues: [
      makeIssue({
        ruleId: "no-placeholder-comments",
        line: 1,
        file: "logic.ts",
        severity: "error",
        category: "Spec",
      }),
    ],
    filePath: "logic.ts",
  });
});

// =================================================================
// code-quality-no-any.applyFix
// =================================================================

test("codeQualityNoAnyRule.applyFix replaces any usages via line-only issues", () => {
  expectFix(codeQualityNoAnyRule, {
    before: ["let v: any = 0;", "let w = x as any;", "let r = <any>y;", ""].join(
      "\n",
    ),
    after: [
      "let v: unknown = 0;",
      "let w = x as unknown;",
      "let r = <unknown>y;",
      "",
    ].join("\n"),
    issues: [1, 2, 3].map((line) =>
      makeIssue({
        ruleId: "code-quality-no-any",
        line,
        file: "lines.ts",
        severity: "error",
        category: "Code Quality",
      }),
    ),
    filePath: "lines.ts",
    fixCount: 3,
  });
});

// =================================================================
// vulnerability scanner
// =================================================================

test("vulnerability scanner parses object-shape vulnerabilities entries", async () => {
  const tempDir = makeTempDir("agentlint-vuln-parse-");
  fs.writeFileSync(path.join(tempDir, "package.json"), "{}", "utf8");

  fs.writeFileSync(
    path.join(tempDir, "package-lock.json"),
    JSON.stringify({ name: "x", version: "1.0.0", lockfileVersion: 3 }),
    "utf8",
  );

  const { runVulnerabilityScanner } = await import(
    "../src/scanners/vulnerabilities.js"
  );
  const report = await runVulnerabilityScanner(tempDir);
  assert.ok(typeof report.issues === "number");
  assert.ok(Array.isArray(report.vulnerabilities));

  fs.rmSync(tempDir, { recursive: true, force: true });
});

// =================================================================
// verification-missing-tests — sibling/parallel/__tests__ resolution
// =================================================================

test("verificationMissingTestsRule accepts test in parallel tests/ directory", () => {
  const tempDir = makeTempDir("agentlint-verif-parallel-");
  const srcDir = path.join(tempDir, "src", "lib");
  const testsDir = path.join(tempDir, "tests", "lib");
  fs.mkdirSync(srcDir, { recursive: true });
  fs.mkdirSync(testsDir, { recursive: true });
  fs.writeFileSync(path.join(srcDir, "foo.ts"), "export const x = 1;\n", "utf8");
  fs.writeFileSync(
    path.join(testsDir, "foo.test.ts"),
    "import test from 'node:test';\n",
    "utf8",
  );

  expectNoIssues(verificationMissingTestsRule, {
    content: "",
    filePath: "src/lib/foo.ts",
    targetDir: tempDir,
  });
  fs.rmSync(tempDir, { recursive: true, force: true });
});

test("verificationMissingTestsRule still considers vendored src/lib paths (analyzer's glob filters them upstream)", () => {
  // The rule's regex anchors on path-separator boundaries, so vendored
  // packages still match. Real false-positive exclusion lives in the
  // analyzer's glob ignore — here we just confirm the rule returns an
  // array shape without crashing.
  const issues = verificationMissingTestsRule.check(
    buildCtx("node_modules/some-pkg/src/lib/foo.ts", "", false, "/tmp/none"),
  );
  assert.ok(Array.isArray(issues));
});

test("verificationMissingTestsRule accepts colocated __tests__ directory", () => {
  const tempDir = makeTempDir("agentlint-verif-tests-subdir-");
  const srcDir = path.join(tempDir, "src", "services");
  const subTestsDir = path.join(srcDir, "__tests__");
  fs.mkdirSync(subTestsDir, { recursive: true });
  fs.writeFileSync(path.join(srcDir, "bar.ts"), "export const y = 2;\n", "utf8");
  fs.writeFileSync(
    path.join(subTestsDir, "bar.test.ts"),
    "import test from 'node:test';\n",
    "utf8",
  );

  expectNoIssues(verificationMissingTestsRule, {
    content: "",
    filePath: "src/services/bar.ts",
    targetDir: tempDir,
  });
  fs.rmSync(tempDir, { recursive: true, force: true });
});

// =================================================================
// observability-missing-trace-id — domain Agent class
// =================================================================

test("observabilityMissingTraceIdRule does not flag domain Agent class without LLM-shape props", () => {
  // The rule checks for LLM-shape properties (tools, model, instructions,
  // etc.) so a domain class named `Agent` with custom props isn't flagged.
  expectNoIssues(observabilityMissingTraceIdRule, {
    content: "const salesAgent = new Agent({ region: 'NA', quota: 100 });\n",
    filePath: "sales.ts",
    withAst: true,
  });
});

// =================================================================
// execution-missing-max-steps — multi-scope
// =================================================================

test("executionMissingMaxStepsRule does not silence while(true) when maxSteps appears in unrelated function", () => {
  // The while(true) inside loop() must still be flagged even though
  // maxSteps appears elsewhere in the file.
  expectCheck(executionMissingMaxStepsRule, {
    content: [
      "function configure() {",
      "  return { maxSteps: 100 };",
      "}",
      "function loop() {",
      "  while (true) {",
      "    doWork();",
      "  }",
      "}",
    ].join("\n"),
    filePath: "loop.ts",
    withAst: true,
    expectIssues: [{ ruleId: "execution-missing-max-steps" }],
  });
});

// =================================================================
// security-prompt-injection — template-literal variants
// =================================================================

test("securityPromptInjectionRule detects multi-line template literal with toolOutput", () => {
  expectCheck(securityPromptInjectionRule, {
    content: [
      "const prompt = `",
      "  Use this tool output:",
      "  ${toolOutput}",
      "`;",
    ].join("\n"),
    filePath: "agent.ts",
    withAst: true,
    expectIssues: [{ ruleId: "security-prompt-injection" }],
  });
});

test("securityPromptInjectionRule detects toolResult variant", () => {
  expectCheck(securityPromptInjectionRule, {
    content: "const p = `Result: ${toolResult}`;",
    filePath: "p.ts",
    expectIssues: [{ ruleId: "security-prompt-injection" }],
  });
});

test("securityPromptInjectionRule detects lastToolMessage variant", () => {
  expectCheck(securityPromptInjectionRule, {
    content: "const p = `Last: ${lastToolMessage.text}`;",
    filePath: "p.ts",
    expectIssues: [{ ruleId: "security-prompt-injection" }],
  });
});

test("securityPromptInjectionRule does not flag toolName template", () => {
  expectNoIssues(securityPromptInjectionRule, {
    content: "const p = `Calling ${toolName}`;",
    filePath: "p.ts",
  });
});

// =================================================================
// context-unredacted-pii
// =================================================================

test("contextUnredactedPiiRule detects userInfo PII variant", () => {
  expectCheck(contextUnredactedPiiRule, {
    content: "const userInfo = await db.users.find();",
    filePath: "svc.ts",
    expectIssues: [{ ruleId: "context-unredacted-pii" }],
  });
});

test("contextUnredactedPiiRule detects accountDetails PII variant", () => {
  expectCheck(contextUnredactedPiiRule, {
    content: "const accountDetails = fetchAccount(id);",
    filePath: "svc.ts",
    expectIssues: [{ ruleId: "context-unredacted-pii" }],
  });
});

test("contextUnredactedPiiRule detects plural users assignment", () => {
  expectCheck(contextUnredactedPiiRule, {
    content: "const users = await db.findUsers();",
    filePath: "svc.ts",
    expectIssues: [{ ruleId: "context-unredacted-pii" }],
  });
});

test("contextUnredactedPiiRule accepts redacted PII via mask helper", () => {
  expectNoIssues(contextUnredactedPiiRule, {
    content: [
      "const userInfo = await db.users.find();",
      "const masked = mask(userInfo);",
    ].join("\n"),
    filePath: "svc.ts",
  });
});

// =================================================================
// runASTAnalyzer — markdown skip behavior
// =================================================================

test("runASTAnalyzer skips source-only rules on markdown files", async () => {
  const tempDir = makeTempDir("agentlint-md-skip-rules-");
  fs.writeFileSync(
    path.join(tempDir, "task.md"),
    [
      "# Task",
      "Acceptance Criteria: deliver",
      "Rollback: revert",
      "",
      "Some example pseudocode:",
      "  fs.writeFileSync('x.txt', 'data');",
      "  child_process.exec('rm -rf /');",
      "  while (true) {}",
      "",
    ].join("\n"),
    "utf8",
  );

  const issues = await runASTAnalyzer(tempDir, loadConfig("."));

  // No tool/execution/code-quality/verification rules should have fired
  const sourceOnlyRules = [
    "tool-overlapping",
    "tool-weak-schema",
    "tool-missing-examples",
    "execution-missing-max-steps",
    "architecture-atomic-transactions",
    "execution-no-dry-run",
    "code-quality-no-any",
    "verification-missing-tests",
  ];
  for (const ruleId of sourceOnlyRules) {
    assert.equal(
      issues.filter((i) => i.ruleId === ruleId).length,
      0,
      `expected no ${ruleId} issues on markdown`,
    );
  }
});
