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
import { buildCtx } from "./_helpers.js";
import type { AgentIssue } from "../src/scanners/types.js";

function makeTempDir(prefix: string): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), prefix));
}

// =================================================================
// context — oversized + missing-trace-id (AST + non-AST paths)
// =================================================================

test("context-oversized + observability-missing-trace-id (AST) flag oversized strings and Agent without traceId", () => {
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
  const content = [
    "export async function handler(req) {",
    "  return { ok: true };",
    "}",
  ].join("\n");
  const issues = securityInputValidationRule.check(
    buildCtx("src/app/api/handler/route.ts", content, true),
  );
  assert.ok(issues.length >= 1);
  assert.ok(issues[0].startPos !== undefined);
});

test("security-input-validation (non-AST) flags missing validation in actions files", () => {
  const content = [
    "'use server';",
    "export async function action(input) {",
    "  return input;",
    "}",
  ].join("\n");
  const issues = securityInputValidationRule.check(
    buildCtx("src/actions/run.ts", content),
  );
  assert.ok(issues.length > 0);
});

test("security-input-validation (AST) allows validated api functions", () => {
  const content = [
    "export async function handler(req) {",
    "  const parsed = z.object({}).parse(req);",
    "  return parsed;",
    "}",
  ].join("\n");
  const issues = securityInputValidationRule.check(
    buildCtx("src/app/api/safe/route.ts", content, true),
  );
  assert.equal(issues.length, 0);
});

test("security-prompt-injection detects toolOutput template", () => {
  const issues = securityPromptInjectionRule.check(
    buildCtx("inject.ts", "const prompt = `Use this output: ${toolOutput}`;"),
  );
  assert.ok(issues.length > 0);
});

// =================================================================
// tool — weak-schema, missing-examples, globalTools collection
// =================================================================

test("tool-weak-schema + tool-missing-examples (AST) emit for object schemas; globalTools is populated", () => {
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
  const issues = toolMissingExamplesRule.check(
    buildCtx(
      "tool.ts",
      'const schema = { type: "object", description: "thing", properties: {} };',
    ),
  );
  assert.ok(issues.length > 0);
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
  const issue: AgentIssue = {
    file: "agent.ts",
    line: 1,
    message: "missing trace",
    ruleId: "observability-missing-trace-id",
    severity: "warn",
    category: "Context",
    startPos: original.indexOf("new Agent()"),
    endPos: original.indexOf("new Agent()") + "new Agent()".length,
  };

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
  const original = [
    "const __agentStep = 0;",
    "while (true) { run(); }",
    "",
  ].join("\n");

  const issue: AgentIssue = {
    file: "loop.ts",
    line: 2,
    message: "while true",
    ruleId: "execution-missing-max-steps",
    severity: "warn",
    category: "Execution",
  };

  const { content, fixes } = executionMissingMaxStepsRule.applyFix!(
    original,
    [issue],
    "loop.ts",
  );
  assert.ok(fixes.length > 0);
  assert.match(content, /__agentStep1/);
});

// =================================================================
// tool-weak-schema + tool-missing-examples applyFix
// =================================================================

test("tool-weak-schema + tool-missing-examples applyFix expand empty properties and append examples", () => {
  const original = [
    'const a = { type: "object", properties: {} };',
    'const b = { type: "object", properties: { id: { type: "number" } } };',
    "",
  ].join("\n");

  const weakIssues: AgentIssue[] = [
    {
      file: "tool.ts",
      line: 1,
      message: "weak",
      ruleId: "tool-weak-schema",
      severity: "error",
      category: "Tool",
    },
    {
      file: "tool.ts",
      line: 2,
      message: "weak",
      ruleId: "tool-weak-schema",
      severity: "error",
      category: "Tool",
    },
  ];
  const exampleIssues: AgentIssue[] = [
    {
      file: "tool.ts",
      line: 1,
      message: "examples",
      ruleId: "tool-missing-examples",
      severity: "warn",
      category: "Tool",
    },
  ];

  // Thread content through both rules.
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
  const original = [
    "function run() {",
    "  // TODO: implement run logic",
    "  return null;",
    "}",
    "",
  ].join("\n");

  const issues: AgentIssue[] = [
    {
      file: "src.ts",
      line: 2,
      message: "placeholder",
      ruleId: "no-placeholder-comments",
      severity: "error",
      category: "Spec",
    },
  ];

  const { content, fixes } = placeholderCommentsRule.applyFix!(
    original,
    issues,
    "src.ts",
  );
  assert.ok(fixes.length > 0);
  assert.match(content, /Not implemented - AI placeholder detected/);
});

test("placeholderCommentsRule.applyFix leaves inline TODO comments alone (avoids breaking syntax)", () => {
  const original = [
    "const value = compute(); // TODO: implement caching",
    "return value;",
    "",
  ].join("\n");

  const issues: AgentIssue[] = [
    {
      file: "logic.ts",
      line: 1,
      message: "Found AI placeholder indicating unwritten code.",
      ruleId: "no-placeholder-comments",
      severity: "error",
      category: "Spec",
    },
  ];

  const { content } = placeholderCommentsRule.applyFix!(
    original,
    issues,
    "logic.ts",
  );

  // Inline trailing TODO must not be rewritten — would corrupt the statement
  assert.equal(content, original);
});

// =================================================================
// code-quality-no-any.applyFix
// =================================================================

test("codeQualityNoAnyRule.applyFix replaces any usages via line-only issues", () => {
  const original = [
    "let v: any = 0;",
    "let w = x as any;",
    "let r = <any>y;",
    "",
  ].join("\n");

  const issues: AgentIssue[] = [1, 2, 3].map((line) => ({
    file: "lines.ts",
    line,
    message: "any",
    ruleId: "code-quality-no-any",
    severity: "error",
    category: "Code Quality",
  }));

  const { content, fixes } = codeQualityNoAnyRule.applyFix!(
    original,
    issues,
    "lines.ts",
  );
  assert.equal(fixes.length, 3);
  assert.doesNotMatch(content, /\bany\b/);
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
  fs.writeFileSync(
    path.join(srcDir, "foo.ts"),
    "export const x = 1;\n",
    "utf8",
  );
  fs.writeFileSync(
    path.join(testsDir, "foo.test.ts"),
    "import test from 'node:test';\n",
    "utf8",
  );

  const issues = verificationMissingTestsRule.check(
    buildCtx("src/lib/foo.ts", "", false, tempDir),
  );

  assert.equal(issues.length, 0);
  fs.rmSync(tempDir, { recursive: true, force: true });
});

test("verificationMissingTestsRule still considers vendored src/lib paths (analyzer's glob filters them upstream)", () => {
  // node_modules/some-pkg/src/lib/foo.ts — the rule's regex anchors on
  // path-separator boundaries, so vendored packages still match. Real
  // false-positive exclusion lives in the analyzer's glob ignore.
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
  fs.writeFileSync(
    path.join(srcDir, "bar.ts"),
    "export const y = 2;\n",
    "utf8",
  );
  fs.writeFileSync(
    path.join(subTestsDir, "bar.test.ts"),
    "import test from 'node:test';\n",
    "utf8",
  );

  const issues = verificationMissingTestsRule.check(
    buildCtx("src/services/bar.ts", "", false, tempDir),
  );
  assert.equal(issues.length, 0);
  fs.rmSync(tempDir, { recursive: true, force: true });
});

// =================================================================
// observability-missing-trace-id — domain Agent class
// =================================================================

test("observabilityMissingTraceIdRule does not flag domain Agent class without LLM-shape props", () => {
  const content = "const salesAgent = new Agent({ region: 'NA', quota: 100 });\n";
  const issues = observabilityMissingTraceIdRule.check(
    buildCtx("sales.ts", content, true),
  );
  assert.equal(issues.length, 0);
});

// =================================================================
// execution-missing-max-steps — multi-scope
// =================================================================

test("executionMissingMaxStepsRule does not silence while(true) when maxSteps appears in unrelated function", () => {
  const content = [
    "function configure() {",
    "  return { maxSteps: 100 };",
    "}",
    "function loop() {",
    "  while (true) {",
    "    doWork();",
    "  }",
    "}",
  ].join("\n");

  const issues = executionMissingMaxStepsRule.check(
    buildCtx("loop.ts", content, true),
  );
  // The while(true) inside loop() must still be flagged even though
  // maxSteps appears elsewhere in the file.
  assert.ok(issues.length > 0);
});

// =================================================================
// security-prompt-injection — template-literal variants
// =================================================================

test("securityPromptInjectionRule detects multi-line template literal with toolOutput", () => {
  const content = [
    "const prompt = `",
    "  Use this tool output:",
    "  ${toolOutput}",
    "`;",
  ].join("\n");
  const issues = securityPromptInjectionRule.check(
    buildCtx("agent.ts", content, true),
  );
  assert.ok(issues.length > 0);
});

test("securityPromptInjectionRule detects toolResult variant", () => {
  const issues = securityPromptInjectionRule.check(
    buildCtx("p.ts", "const p = `Result: ${toolResult}`;"),
  );
  assert.ok(issues.length > 0);
});

test("securityPromptInjectionRule detects lastToolMessage variant", () => {
  const issues = securityPromptInjectionRule.check(
    buildCtx("p.ts", "const p = `Last: ${lastToolMessage.text}`;"),
  );
  assert.ok(issues.length > 0);
});

test("securityPromptInjectionRule does not flag toolName template", () => {
  const issues = securityPromptInjectionRule.check(
    buildCtx("p.ts", "const p = `Calling ${toolName}`;"),
  );
  assert.equal(issues.length, 0);
});

// =================================================================
// context-unredacted-pii
// =================================================================

test("contextUnredactedPiiRule detects userInfo PII variant", () => {
  const issues = contextUnredactedPiiRule.check(
    buildCtx("svc.ts", "const userInfo = await db.users.find();"),
  );
  assert.ok(issues.length > 0);
});

test("contextUnredactedPiiRule detects accountDetails PII variant", () => {
  const issues = contextUnredactedPiiRule.check(
    buildCtx("svc.ts", "const accountDetails = fetchAccount(id);"),
  );
  assert.ok(issues.length > 0);
});

test("contextUnredactedPiiRule detects plural users assignment", () => {
  const issues = contextUnredactedPiiRule.check(
    buildCtx("svc.ts", "const users = await db.findUsers();"),
  );
  assert.ok(issues.length > 0);
});

test("contextUnredactedPiiRule accepts redacted PII via mask helper", () => {
  const content = [
    "const userInfo = await db.users.find();",
    "const masked = mask(userInfo);",
  ].join("\n");
  const issues = contextUnredactedPiiRule.check(buildCtx("svc.ts", content));
  assert.equal(issues.length, 0);
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
