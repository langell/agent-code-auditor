import assert from "node:assert/strict";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import test from "node:test";
import * as ts from "typescript";

import { loadConfig } from "../src/config.js";
import { runASTAnalyzer } from "../src/scanners/ast-analyzer.js";
import { checkContextRules } from "../src/scanners/rules/context-lint.js";
import { checkSecurityRules } from "../src/scanners/rules/security-lint.js";
import { checkToolRules } from "../src/scanners/rules/tool-lint.js";
import { fixContextRules } from "../src/fixers/context-fixer.js";
import { fixSecurityRules } from "../src/fixers/security-fixer.js";
import { fixExecutionRules } from "../src/fixers/execution-fixer.js";
import { fixToolRules } from "../src/fixers/tool-fixer.js";
import { fixSpecRules } from "../src/fixers/spec-fixer.js";
import { fixCodeQualityRules } from "../src/fixers/code-quality-fixer.js";
import type { AgentIssue } from "../src/scanners/types.js";

function makeTempDir(prefix: string): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), prefix));
}

test("context-lint AST flags oversized template strings and Agent without traceId", () => {
  const config = loadConfig(".");
  const huge = "x".repeat(5500);
  const content = [
    "const blob = `" + huge + "`;",
    "const agent = new Agent({ name: 'a', tools: [] });",
    "const init = Agent.init({ model: 'a' });",
  ].join("\n");

  const sourceFile = ts.createSourceFile(
    "ctx.ts",
    content,
    ts.ScriptTarget.Latest,
    true,
  );
  const lines = content.split("\n");
  const issues = checkContextRules("ctx.ts", lines, config, sourceFile);

  const oversized = issues.filter((i) => i.ruleId === "context-oversized");
  const traceMissing = issues.filter(
    (i) => i.ruleId === "observability-missing-trace-id",
  );
  assert.ok(oversized.length >= 1);
  assert.ok(traceMissing.length >= 2);
  assert.ok(oversized[0].startPos !== undefined);
});

test("context-lint non-AST oversized line and missing trace fallback", () => {
  const config = loadConfig(".");
  const huge = "y".repeat(5500);
  const lines = [
    'const blob = "' + huge + '";',
    "const agent = new Agent({});",
  ];

  const issues = checkContextRules("ctx.ts", lines, config);

  assert.ok(issues.some((i) => i.ruleId === "context-oversized"));
  assert.ok(
    issues.some((i) => i.ruleId === "observability-missing-trace-id"),
  );
});

test("security-lint AST flags missing input validation in api files", () => {
  const config = loadConfig(".");
  const content = [
    "export async function handler(req) {",
    "  return { ok: true };",
    "}",
  ].join("\n");

  const file = "src/api/handler.ts";
  const sourceFile = ts.createSourceFile(
    file,
    content,
    ts.ScriptTarget.Latest,
    true,
  );
  const issues = checkSecurityRules(file, content.split("\n"), config, sourceFile);

  const validation = issues.filter(
    (i) => i.ruleId === "security-input-validation",
  );
  assert.ok(validation.length >= 1);
  assert.ok(validation[0].startPos !== undefined);
});

test("security-lint non-AST flags missing input validation in actions files", () => {
  const config = loadConfig(".");
  const content = [
    "export async function action(input) {",
    "  return input;",
    "}",
  ];

  const issues = checkSecurityRules(
    "src/actions/run.ts",
    content,
    config,
  );

  assert.ok(
    issues.some((i) => i.ruleId === "security-input-validation"),
  );
});

test("security-lint AST allows validated api functions", () => {
  const config = loadConfig(".");
  const content = [
    "export async function handler(req) {",
    "  const parsed = z.object({}).parse(req);",
    "  return parsed;",
    "}",
  ].join("\n");

  const file = "src/api/safe.ts";
  const sourceFile = ts.createSourceFile(
    file,
    content,
    ts.ScriptTarget.Latest,
    true,
  );
  const issues = checkSecurityRules(file, content.split("\n"), config, sourceFile);

  assert.strictEqual(
    issues.some((i) => i.ruleId === "security-input-validation"),
    false,
  );
});

test("security-lint detects toolOutput template prompt injection", () => {
  const config = loadConfig(".");
  const lines = [
    "const prompt = `Use this output: ${toolOutput}`;",
  ];
  const issues = checkSecurityRules("inject.ts", lines, config);
  assert.ok(
    issues.some((i) => i.ruleId === "security-prompt-injection"),
  );
});

test("tool-lint AST emits weak-schema and missing-examples for object schemas", () => {
  const config = loadConfig(".");
  const content = [
    "const schema = {",
    '  type: "object",',
    '  name: "fetcher",',
    "  properties: { id: { type: 'number' } }",
    "};",
  ].join("\n");

  const sourceFile = ts.createSourceFile(
    "tool.ts",
    content,
    ts.ScriptTarget.Latest,
    true,
  );

  const tools: { name: string; file: string; line: number }[] = [];
  const issues = checkToolRules(
    "tool.ts",
    content.split("\n"),
    config,
    sourceFile,
    tools,
  );

  assert.ok(issues.some((i) => i.ruleId === "tool-weak-schema"));
  assert.ok(issues.some((i) => i.ruleId === "tool-missing-examples"));
  assert.ok(tools.some((t) => t.name === "fetcher"));
});

test("tool-lint non-AST collects globalTools entries", () => {
  const config = loadConfig(".");
  const lines = [
    "const a = { name: 'first' };",
    "const b = { name: 'second' };",
  ];

  const tools: { name: string; file: string; line: number }[] = [];
  checkToolRules("tools.ts", lines, config, undefined, tools);

  assert.ok(tools.length >= 2);
});

test("tool-lint non-AST detects missing examples around object schemas", () => {
  const config = loadConfig(".");
  const lines = [
    'const schema = { type: "object", description: "thing", properties: {} };',
  ];

  const issues = checkToolRules("tool.ts", lines, config);
  assert.ok(issues.some((i) => i.ruleId === "tool-missing-examples"));
});

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

  const config = loadConfig(".");
  const issues = await runASTAnalyzer(tempDir, config);

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

  const config = loadConfig(".");
  const issues = await runASTAnalyzer(tempDir, config);

  const placeholders = issues.filter(
    (i) => i.ruleId === "no-placeholder-comments",
  );
  assert.ok(placeholders.length >= 2);

  fs.rmSync(tempDir, { recursive: true, force: true });
});

test("fixContextRules injects traceId via AST positions", async () => {
  const tempDir = makeTempDir("agentlint-context-ast-fix-");
  const filePath = path.join(tempDir, "agent.ts");
  const original = "const agent = new Agent({ name: 'a' });\n";
  fs.writeFileSync(filePath, original, "utf8");

  const config = loadConfig(".");
  const issues = await runASTAnalyzer(tempDir, config);
  const traceIssues = issues
    .filter((i) => i.ruleId === "observability-missing-trace-id")
    .map((i) => ({ ...i, file: filePath }));

  assert.ok(traceIssues.length > 0);
  assert.ok(traceIssues[0].startPos !== undefined);

  const fixes = await fixContextRules(filePath, traceIssues);
  assert.ok(fixes.length > 0);
  const updated = fs.readFileSync(filePath, "utf8");
  assert.match(updated, /traceId/);

  fs.rmSync(tempDir, { recursive: true, force: true });
});

test("fixContextRules injects traceId via AST positions with empty Agent()", async () => {
  const tempDir = makeTempDir("agentlint-context-ast-empty-");
  const filePath = path.join(tempDir, "agent.ts");
  const original = "const agent = new Agent();\n";
  fs.writeFileSync(filePath, original, "utf8");

  const issue: AgentIssue = {
    file: filePath,
    line: 1,
    message: "missing trace",
    ruleId: "observability-missing-trace-id",
    severity: "warn",
    category: "Context",
    startPos: original.indexOf("new Agent()"),
    endPos: original.indexOf("new Agent()") + "new Agent()".length,
  };

  const fixes = await fixContextRules(filePath, [issue]);
  assert.ok(fixes.length > 0);
  const updated = fs.readFileSync(filePath, "utf8");
  assert.match(updated, /traceId/);

  fs.rmSync(tempDir, { recursive: true, force: true });
});

test("fixSecurityRules adds validate() guard via AST positions for api files", async () => {
  const tempDir = makeTempDir("agentlint-sec-input-ast-");
  const srcDir = path.join(tempDir, "src");
  const apiDir = path.join(srcDir, "api");
  fs.mkdirSync(apiDir, { recursive: true });
  const filePath = path.join(apiDir, "handler.ts");
  const original = [
    "export async function handler(req) {",
    "  return { ok: true };",
    "}",
    "",
  ].join("\n");
  fs.writeFileSync(filePath, original, "utf8");

  const config = loadConfig(".");
  const issues = await runASTAnalyzer(tempDir, config);
  const inputValidationIssues = issues
    .filter((i) => i.ruleId === "security-input-validation")
    .map((i) => ({ ...i, file: filePath }));

  assert.ok(inputValidationIssues.length > 0);
  assert.ok(inputValidationIssues[0].startPos !== undefined);

  const fixes = await fixSecurityRules(filePath, inputValidationIssues);
  assert.ok(fixes.length > 0);
  const updated = fs.readFileSync(filePath, "utf8");
  assert.match(updated, /function validate\(input: unknown\)/);
  assert.match(updated, /validate\(/);

  fs.rmSync(tempDir, { recursive: true, force: true });
});

test("fixExecutionRules bounds while(true) via AST positions", async () => {
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

  const config = loadConfig(".");
  const issues = await runASTAnalyzer(tempDir, config);
  const maxStepIssues = issues
    .filter((i) => i.ruleId === "execution-missing-max-steps")
    .map((i) => ({ ...i, file: filePath }));

  assert.ok(maxStepIssues.length > 0);

  const fixes = await fixExecutionRules(filePath, maxStepIssues);
  assert.ok(fixes.length > 0);
  const updated = fs.readFileSync(filePath, "utf8");
  assert.match(updated, /__agentStep/);

  fs.rmSync(tempDir, { recursive: true, force: true });
});

test("fixExecutionRules avoids reusing existing __agentStep loop var", async () => {
  const tempDir = makeTempDir("agentlint-exec-collision-");
  const filePath = path.join(tempDir, "loop.ts");
  const original = [
    "const __agentStep = 0;",
    "while (true) { run(); }",
    "",
  ].join("\n");
  fs.writeFileSync(filePath, original, "utf8");

  const issue: AgentIssue = {
    file: filePath,
    line: 2,
    message: "while true",
    ruleId: "execution-missing-max-steps",
    severity: "warn",
    category: "Execution",
  };

  const fixes = await fixExecutionRules(filePath, [issue]);
  assert.ok(fixes.length > 0);
  const updated = fs.readFileSync(filePath, "utf8");
  assert.match(updated, /__agentStep1/);

  fs.rmSync(tempDir, { recursive: true, force: true });
});

test("fixToolRules expands empty properties and appends examples", async () => {
  const tempDir = makeTempDir("agentlint-tool-fix-paths-");
  const filePath = path.join(tempDir, "tool.ts");
  const original = [
    'const a = { type: "object", properties: {} };',
    'const b = { type: "object", properties: { id: { type: "number" } } };',
    "",
  ].join("\n");
  fs.writeFileSync(filePath, original, "utf8");

  const issues: AgentIssue[] = [
    {
      file: filePath,
      line: 1,
      message: "weak",
      ruleId: "tool-weak-schema",
      severity: "error",
      category: "Tool",
    },
    {
      file: filePath,
      line: 2,
      message: "weak",
      ruleId: "tool-weak-schema",
      severity: "error",
      category: "Tool",
    },
    {
      file: filePath,
      line: 1,
      message: "examples",
      ruleId: "tool-missing-examples",
      severity: "warn",
      category: "Tool",
    },
  ];

  const fixes = await fixToolRules(filePath, issues);
  assert.ok(fixes.length >= 2);

  const updated = fs.readFileSync(filePath, "utf8");
  assert.match(updated, /TBD: describe this parameter/);
  assert.match(updated, /TBD: expand property descriptions/);
  assert.match(updated, /TBD: valid example/);

  fs.rmSync(tempDir, { recursive: true, force: true });
});

test("fixSpecRules replaces placeholder TODO comments with hard-fail throws", async () => {
  const tempDir = makeTempDir("agentlint-spec-fix-placeholder-");
  const filePath = path.join(tempDir, "src.ts");
  const original = [
    "function run() {",
    "  // TODO: implement run logic",
    "  return null;",
    "}",
    "",
  ].join("\n");
  fs.writeFileSync(filePath, original, "utf8");

  const issues: AgentIssue[] = [
    {
      file: filePath,
      line: 2,
      message: "placeholder",
      ruleId: "no-placeholder-comments",
      severity: "error",
      category: "Spec",
    },
  ];

  const fixes = await fixSpecRules(filePath, issues);
  assert.ok(fixes.length > 0);
  const updated = fs.readFileSync(filePath, "utf8");
  assert.match(updated, /Not implemented - AI placeholder detected/);

  fs.rmSync(tempDir, { recursive: true, force: true });
});

test("fixCodeQualityRules replaces any usages via line-only issues", async () => {
  const tempDir = makeTempDir("agentlint-cq-line-only-");
  const filePath = path.join(tempDir, "lines.ts");
  const original = [
    "let v: any = 0;",
    "let w = x as any;",
    "let r = <any>y;",
    "",
  ].join("\n");
  fs.writeFileSync(filePath, original, "utf8");

  const issues: AgentIssue[] = [1, 2, 3].map((line) => ({
    file: filePath,
    line,
    message: "any",
    ruleId: "code-quality-no-any",
    severity: "error",
    category: "Code Quality",
  }));

  const fixes = await fixCodeQualityRules(filePath, issues);
  assert.equal(fixes.length, 3);

  const updated = fs.readFileSync(filePath, "utf8");
  assert.doesNotMatch(updated, /\bany\b/);

  fs.rmSync(tempDir, { recursive: true, force: true });
});

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
