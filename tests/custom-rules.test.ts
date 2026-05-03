import assert from "node:assert/strict";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import test from "node:test";

import { loadConfig } from "../src/config.js";
import {
  loadCustomRules,
  mergeRules,
} from "../src/load-custom-rules.js";
import { runASTAnalyzer } from "../src/scanners/ast-analyzer.js";
import { runFixer } from "../src/fix-orchestrator.js";
import { registry } from "../src/rules/index.js";
import type { Rule } from "../src/rules/types.js";
import type { AgentIssue } from "../src/scanners/types.js";

const EXAMPLE_DIR = path.resolve("examples/custom-rules");

// =================================================================
// loadCustomRules — module loading + validation
// =================================================================

test("loadCustomRules loads a valid named-export Rule", async () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "agentlint-cr-load-"));
  fs.copyFileSync(
    path.join(EXAMPLE_DIR, "no-console-log.mjs"),
    path.join(tempDir, "no-console-log.mjs"),
  );

  const config = loadConfig(".");
  config.customRules = ["./no-console-log.mjs#noConsoleLogRule"];

  const loaded = await loadCustomRules(tempDir, config);

  assert.equal(loaded.length, 1);
  assert.equal(loaded[0].id, "no-console-log");
  assert.equal(loaded[0].appliesTo, "source");
  assert.equal(typeof loaded[0].check, "function");

  fs.rmSync(tempDir, { recursive: true, force: true });
});

test("loadCustomRules accepts object-form reference", async () => {
  const tempDir = fs.mkdtempSync(
    path.join(os.tmpdir(), "agentlint-cr-objref-"),
  );
  fs.copyFileSync(
    path.join(EXAMPLE_DIR, "no-console-log.mjs"),
    path.join(tempDir, "no-console-log.mjs"),
  );

  const config = loadConfig(".");
  config.customRules = [
    { path: "./no-console-log.mjs", exportName: "noConsoleLogRule" },
  ];

  const loaded = await loadCustomRules(tempDir, config);
  assert.equal(loaded.length, 1);
  assert.equal(loaded[0].id, "no-console-log");

  fs.rmSync(tempDir, { recursive: true, force: true });
});

test("loadCustomRules skips and warns when module is missing", async () => {
  const tempDir = fs.mkdtempSync(
    path.join(os.tmpdir(), "agentlint-cr-missing-"),
  );

  const config = loadConfig(".");
  config.customRules = ["./does-not-exist.mjs#missing"];

  const loaded = await loadCustomRules(tempDir, config);
  assert.equal(loaded.length, 0);

  fs.rmSync(tempDir, { recursive: true, force: true });
});

test("loadCustomRules skips and warns when named export is absent", async () => {
  const tempDir = fs.mkdtempSync(
    path.join(os.tmpdir(), "agentlint-cr-no-export-"),
  );
  fs.writeFileSync(
    path.join(tempDir, "rule.mjs"),
    "export const someOther = { id: 'x', appliesTo: 'all', check() { return []; } };\n",
    "utf8",
  );

  const config = loadConfig(".");
  config.customRules = ["./rule.mjs#missingExport"];

  const loaded = await loadCustomRules(tempDir, config);
  assert.equal(loaded.length, 0);

  fs.rmSync(tempDir, { recursive: true, force: true });
});

test("loadCustomRules skips and warns when export is not a valid Rule", async () => {
  const tempDir = fs.mkdtempSync(
    path.join(os.tmpdir(), "agentlint-cr-invalid-"),
  );
  fs.writeFileSync(
    path.join(tempDir, "bad.mjs"),
    [
      // Missing `check` function
      "export const bad = { id: 'bad', appliesTo: 'all' };",
      // Missing `id`
      "export const noId = { appliesTo: 'all', check() { return []; } };",
      // Wrong appliesTo
      "export const wrongScope = { id: 'x', appliesTo: 'workspace', check() { return []; } };",
    ].join("\n"),
    "utf8",
  );

  const config = loadConfig(".");
  config.customRules = [
    "./bad.mjs#bad",
    "./bad.mjs#noId",
    "./bad.mjs#wrongScope",
  ];

  const loaded = await loadCustomRules(tempDir, config);
  assert.equal(loaded.length, 0);

  fs.rmSync(tempDir, { recursive: true, force: true });
});

test("loadCustomRules returns [] when customRules is undefined", async () => {
  const tempDir = fs.mkdtempSync(
    path.join(os.tmpdir(), "agentlint-cr-empty-"),
  );
  const config = loadConfig(".");
  delete config.customRules;
  const loaded = await loadCustomRules(tempDir, config);
  assert.equal(loaded.length, 0);
  fs.rmSync(tempDir, { recursive: true, force: true });
});

// =================================================================
// mergeRules — collision policy (last-wins, with warning)
// =================================================================

test("mergeRules appends non-colliding custom rules", () => {
  const builtIn: Rule[] = [
    { id: "a", appliesTo: "all", check: () => [] },
    { id: "b", appliesTo: "all", check: () => [] },
  ];
  const custom: Rule[] = [
    { id: "c", appliesTo: "all", check: () => [] },
  ];
  const merged = mergeRules(builtIn, custom);
  assert.deepEqual(
    merged.map((r) => r.id),
    ["a", "b", "c"],
  );
});

test("mergeRules: custom rule with same id shadows built-in (last wins)", () => {
  const builtIn: Rule[] = [
    {
      id: "shared",
      appliesTo: "all",
      check: () => [
        {
          file: "x",
          line: 1,
          message: "from built-in",
          ruleId: "shared",
          severity: "error",
          category: "General",
        },
      ],
    },
  ];
  const custom: Rule[] = [
    {
      id: "shared",
      appliesTo: "all",
      check: () => [
        {
          file: "x",
          line: 1,
          message: "from custom",
          ruleId: "shared",
          severity: "error",
          category: "General",
        },
      ],
    },
  ];

  const merged = mergeRules(builtIn, custom);
  assert.equal(merged.length, 1);
  // The merged rule produces the custom rule's issues
  const issues = merged[0].check({
    filePath: "x",
    content: "",
    lines: [""],
    ast: undefined,
    targetDir: "",
    globalTools: [],
  });
  assert.equal(issues[0].message, "from custom");
});

test("mergeRules: returns the built-in array reference when no custom rules", () => {
  const builtIn: Rule[] = [{ id: "a", appliesTo: "all", check: () => [] }];
  const merged = mergeRules(builtIn, []);
  assert.equal(merged, builtIn);
});

// =================================================================
// runASTAnalyzer integration — custom rule emits issues
// =================================================================

test("runASTAnalyzer emits issues from a custom rule", async () => {
  const tempDir = fs.mkdtempSync(
    path.join(os.tmpdir(), "agentlint-cr-analyzer-"),
  );
  fs.copyFileSync(
    path.join(EXAMPLE_DIR, "no-console-log.mjs"),
    path.join(tempDir, "no-console-log.mjs"),
  );
  fs.writeFileSync(
    path.join(tempDir, "app.ts"),
    "export function go() {\n  console.log('hi');\n}\n",
    "utf8",
  );
  fs.writeFileSync(
    path.join(tempDir, ".agentlintrc.json"),
    JSON.stringify({
      customRules: ["./no-console-log.mjs#noConsoleLogRule"],
    }),
    "utf8",
  );

  const config = loadConfig(tempDir);
  const issues = await runASTAnalyzer(tempDir, config);

  assert.ok(issues.some((i) => i.ruleId === "no-console-log"));
  fs.rmSync(tempDir, { recursive: true, force: true });
});

test("runASTAnalyzer respects 'off' config for custom rule ids", async () => {
  const tempDir = fs.mkdtempSync(
    path.join(os.tmpdir(), "agentlint-cr-off-"),
  );
  fs.copyFileSync(
    path.join(EXAMPLE_DIR, "no-console-log.mjs"),
    path.join(tempDir, "no-console-log.mjs"),
  );
  fs.writeFileSync(
    path.join(tempDir, "app.ts"),
    "console.log('hi');\n",
    "utf8",
  );
  fs.writeFileSync(
    path.join(tempDir, ".agentlintrc.json"),
    JSON.stringify({
      customRules: ["./no-console-log.mjs#noConsoleLogRule"],
      rules: { "no-console-log": "off" },
    }),
    "utf8",
  );

  const config = loadConfig(tempDir);
  const issues = await runASTAnalyzer(tempDir, config);

  assert.equal(
    issues.filter((i) => i.ruleId === "no-console-log").length,
    0,
  );
  fs.rmSync(tempDir, { recursive: true, force: true });
});

// =================================================================
// runFixer integration — custom rule's applyFix runs
// =================================================================

test("runFixer routes a custom rule's applyFix when issues match", async () => {
  const tempDir = fs.mkdtempSync(
    path.join(os.tmpdir(), "agentlint-cr-fix-"),
  );
  fs.copyFileSync(
    path.join(EXAMPLE_DIR, "no-console-log.mjs"),
    path.join(tempDir, "no-console-log.mjs"),
  );
  const filePath = path.join(tempDir, "app.ts");
  fs.writeFileSync(filePath, "console.log('hi');\n", "utf8");
  fs.writeFileSync(
    path.join(tempDir, ".agentlintrc.json"),
    JSON.stringify({
      customRules: ["./no-console-log.mjs#noConsoleLogRule"],
    }),
    "utf8",
  );

  const config = loadConfig(tempDir);
  const issues: AgentIssue[] = [
    {
      file: "app.ts",
      line: 1,
      message: "console.log",
      ruleId: "no-console-log",
      severity: "warn",
      category: "Code Quality",
    },
  ];

  const report = await runFixer(tempDir, issues, config);
  const updated = fs.readFileSync(filePath, "utf8");

  assert.ok(report.fixes.some((f) => f.ruleId === "no-console-log"));
  assert.match(updated, /console\.debug\(/);
  assert.doesNotMatch(updated, /console\.log\(/);

  fs.rmSync(tempDir, { recursive: true, force: true });
});

// =================================================================
// Override of a built-in: custom rule's check replaces the built-in's
// =================================================================

test("custom rule shadows a built-in when ids collide", async () => {
  const tempDir = fs.mkdtempSync(
    path.join(os.tmpdir(), "agentlint-cr-shadow-"),
  );

  // Pick a built-in id that's easy to verify behavior on.
  const builtInId = "no-placeholder-comments";
  assert.ok(
    registry.some((r) => r.id === builtInId),
    "sanity: built-in still exists",
  );

  // Write a custom rule that uses the same id but never emits.
  fs.writeFileSync(
    path.join(tempDir, "shadow.mjs"),
    [
      `export const shadow = {`,
      `  id: "${builtInId}",`,
      `  appliesTo: "all",`,
      `  check() { return []; },`,
      `};`,
    ].join("\n"),
    "utf8",
  );

  // A file that would normally trigger no-placeholder-comments
  fs.writeFileSync(
    path.join(tempDir, "task.md"),
    "# Task\n<!-- placeholder for diagram -->\n",
    "utf8",
  );

  fs.writeFileSync(
    path.join(tempDir, ".agentlintrc.json"),
    JSON.stringify({
      customRules: ["./shadow.mjs#shadow"],
    }),
    "utf8",
  );

  const config = loadConfig(tempDir);
  const issues = await runASTAnalyzer(tempDir, config);

  assert.equal(
    issues.filter((i) => i.ruleId === builtInId).length,
    0,
    "shadowed built-in rule should produce no issues",
  );

  fs.rmSync(tempDir, { recursive: true, force: true });
});

// =================================================================
// loadConfig parses customRules reliably
// =================================================================

test("loadConfig accepts customRules array of strings + objects", () => {
  const tempDir = fs.mkdtempSync(
    path.join(os.tmpdir(), "agentlint-cr-config-"),
  );
  fs.writeFileSync(
    path.join(tempDir, ".agentlintrc.json"),
    JSON.stringify({
      customRules: [
        "./a.mjs#foo",
        { path: "./b.mjs", exportName: "bar" },
        // garbage entries should be filtered out
        42,
        null,
        { notPath: "x" },
      ],
    }),
    "utf8",
  );

  const config = loadConfig(tempDir);
  assert.ok(config.customRules);
  assert.equal(config.customRules!.length, 2);
  assert.equal(config.customRules![0], "./a.mjs#foo");
  assert.deepEqual(config.customRules![1], {
    path: "./b.mjs",
    exportName: "bar",
  });

  fs.rmSync(tempDir, { recursive: true, force: true });
});
