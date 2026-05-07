import assert from "node:assert/strict";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import test from "node:test";

// Imports go through the library entry point — exercises the surface that
// downstream consumers will import from `agent-code-auditor`. We import from
// `../src/api.js` (the source-tree path the tsx test runner resolves
// alongside the rest of the suite); after publish, downstream sees the
// same shape via the `main` / `exports` map.
import {
  // Orchestrators
  runASTAnalyzer,
  runFixer,
  runLinter,
  runVulnerabilityScanner,
  // Scanner objects
  astScanner,
  linterScanner,
  vulnerabilityScanner,
  // Config + registry
  loadConfig,
  defaultConfig,
  registry,
  // Custom rule loading
  loadCustomRules,
  mergeRules,
  // Reporter
  printScanReport,
  printScanHeader,
  printFixHeader,
  printFixReport,
  printCsvReport,
} from "../src/api.js";

import type {
  // Core types
  AgentLintConfig,
  AgentIssue,
  Rule,
  RuleContext,
  RuleApplicability,
  Scanner,
  ScannerContext,
  FixOutcome,
  FixRecord,
  NewFile,
  FixResult,
  FixReport,
  CustomFixer,
  CustomFixerReference,
  CustomRuleReference,
  CustomRuleConfigValue,
  ToolDeclaration,
  VulnerabilityIssue,
  VulnerabilityReport,
  LinterReport,
} from "../src/api.js";

test("library entry exposes orchestrators, scanners, registry, and reporter", () => {
  // Functions
  for (const fn of [
    runASTAnalyzer,
    runFixer,
    runLinter,
    runVulnerabilityScanner,
    loadConfig,
    loadCustomRules,
    mergeRules,
    printScanReport,
    printScanHeader,
    printFixHeader,
    printFixReport,
    printCsvReport,
  ]) {
    assert.equal(typeof fn, "function");
  }

  // Scanner objects
  assert.equal(astScanner.name, "ast");
  assert.equal(linterScanner.name, "linter");
  assert.equal(vulnerabilityScanner.name, "vulnerability");

  // Registry is populated
  assert.ok(Array.isArray(registry));
  assert.ok(registry.length > 0);
  // Sanity check — a known built-in rule is reachable
  assert.ok(registry.some((r) => r.id === "code-quality-no-any"));

  // defaultConfig has rule defaults
  assert.ok(defaultConfig.rules);
  assert.equal(defaultConfig.rules["code-quality-no-any"], "error");
});

test("library API: end-to-end scan via the public entry point", async () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "agentlint-api-"));
  fs.writeFileSync(path.join(tempDir, "x.ts"), "const x: any = 1;\n", "utf8");

  const config = loadConfig(tempDir);
  const issues = await runASTAnalyzer(tempDir, config);
  assert.ok(issues.some((i: AgentIssue) => i.ruleId === "code-quality-no-any"));

  fs.rmSync(tempDir, { recursive: true, force: true });
});

test("library API: end-to-end fix via the public entry point", async () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "agentlint-api-fix-"));
  const filePath = path.join(tempDir, "x.ts");
  fs.writeFileSync(filePath, "const x: any = 1;\n", "utf8");

  const config = loadConfig(tempDir);
  const issues = await runASTAnalyzer(tempDir, config);
  const report = await runFixer(tempDir, issues, config);

  assert.ok(report.fixes.length > 0);
  assert.match(fs.readFileSync(filePath, "utf8"), /:\s*unknown/);

  fs.rmSync(tempDir, { recursive: true, force: true });
});

test("library API: types compile (smoke check)", () => {
  // This test exists to prove the type-only imports above resolve. If a
  // type was renamed or removed without updating the api re-export, the
  // tsx test runner would fail to compile this file. Runtime assertions
  // are minimal because TypeScript erases types.
  const _config: AgentLintConfig = defaultConfig;
  const _ctx: ScannerContext = { targetDir: ".", config: _config };
  void _ctx;

  const myRule: Rule = {
    id: "my-rule",
    appliesTo: "all" as RuleApplicability,
    check(_ctxArg: RuleContext): AgentIssue[] {
      return [];
    },
    applyFix(content): FixOutcome {
      const _record: FixRecord = {
        fixed: true,
        ruleId: "my-rule",
        message: "noop",
      };
      const _newFile: NewFile = { path: "/tmp/x", content: "" };
      void _newFile;
      return { content, fixes: [_record] };
    },
  };
  void myRule;

  // Reference all the type imports so they're not dead.
  const _typeRefs: Array<unknown> = [
    null as unknown as Scanner<unknown>,
    null as unknown as FixResult,
    null as unknown as FixReport,
    null as unknown as CustomFixer,
    null as unknown as CustomFixerReference,
    null as unknown as CustomRuleReference,
    null as unknown as CustomRuleConfigValue,
    null as unknown as ToolDeclaration,
    null as unknown as VulnerabilityIssue,
    null as unknown as VulnerabilityReport,
    null as unknown as LinterReport,
  ];
  assert.equal(_typeRefs.length, 11);
});
