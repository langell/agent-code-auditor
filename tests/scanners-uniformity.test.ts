import assert from "node:assert/strict";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import test from "node:test";

import {
  vulnerabilityScanner,
  linterScanner,
  astScanner,
} from "../src/scanners/index.js";
import type { Scanner, ScannerContext } from "../src/scanners/types.js";
import { loadConfig } from "../src/config.js";

test("each Scanner exposes a stable name and a run function", () => {
  for (const s of [vulnerabilityScanner, linterScanner, astScanner]) {
    assert.equal(typeof s.name, "string");
    assert.ok(s.name.length > 0);
    assert.equal(typeof s.run, "function");
  }
  // Names are stable identifiers (used as section ids).
  assert.equal(vulnerabilityScanner.name, "vulnerability");
  assert.equal(linterScanner.name, "linter");
  assert.equal(astScanner.name, "ast");
});

test("astScanner.run returns the same shape as runASTAnalyzer (AgentIssue[])", async () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "agentlint-scn-ast-"));
  fs.writeFileSync(
    path.join(tempDir, "x.ts"),
    "const x: any = 1;\n",
    "utf8",
  );
  const ctx: ScannerContext = { targetDir: tempDir, config: loadConfig(".") };

  const issues = await astScanner.run(ctx);
  assert.ok(Array.isArray(issues));
  assert.ok(issues.some((i) => i.ruleId === "code-quality-no-any"));

  fs.rmSync(tempDir, { recursive: true, force: true });
});

test("vulnerabilityScanner.run returns a VulnerabilityReport-shaped value", async () => {
  // Use a dir with no lockfile — vulnerability scan returns a 0-issue
  // report cleanly.
  const tempDir = fs.mkdtempSync(
    path.join(os.tmpdir(), "agentlint-scn-vuln-"),
  );
  const ctx: ScannerContext = { targetDir: tempDir, config: loadConfig(".") };

  const report = await vulnerabilityScanner.run(ctx);
  assert.equal(typeof report.issues, "number");
  assert.ok(Array.isArray(report.vulnerabilities));

  fs.rmSync(tempDir, { recursive: true, force: true });
});

test("linterScanner.run always uses fix=false (no side effects)", async () => {
  // The linter wrapper has a fix-mode path that mutates files. The
  // Scanner-shaped wrapper hard-codes fix=false. We verify by checking
  // that running it on a temp dir doesn't error and the file content
  // doesn't change.
  const tempDir = fs.mkdtempSync(
    path.join(os.tmpdir(), "agentlint-scn-linter-"),
  );
  const filePath = path.join(tempDir, "file.ts");
  const original = "const x = 1;\n";
  fs.writeFileSync(filePath, original, "utf8");

  const ctx: ScannerContext = { targetDir: tempDir, config: loadConfig(".") };
  const report = await linterScanner.run(ctx);
  assert.equal(typeof report.errorCount, "number");
  assert.equal(typeof report.warningCount, "number");

  // File untouched
  assert.equal(fs.readFileSync(filePath, "utf8"), original);

  fs.rmSync(tempDir, { recursive: true, force: true });
});

test("Scanner<T> generic preserves return-type information", async () => {
  // Compile-time check via the Scanner<T> type parameter — if the inferred
  // type were wrong, this test wouldn't type-check. The runtime assertion
  // is just to exercise the path.
  const ctx: ScannerContext = { targetDir: process.cwd(), config: loadConfig(".") };
  const ast: Awaited<ReturnType<typeof astScanner.run>> = await astScanner.run(ctx);
  assert.ok(Array.isArray(ast));
});

test("Scanners can be iterated as a homogeneous list (subject to type erasure)", async () => {
  // The eventual programmatic API surfaces a list like this. We can't
  // statically declare this as Scanner<unknown>[] cleanly because run()
  // returns different types per scanner; document the workaround pattern.
  const scanners: Scanner<unknown>[] = [
    vulnerabilityScanner as Scanner<unknown>,
    linterScanner as Scanner<unknown>,
    astScanner as Scanner<unknown>,
  ];
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "agentlint-scn-iter-"));
  fs.writeFileSync(path.join(tempDir, "x.ts"), "const x = 1;\n", "utf8");
  const ctx: ScannerContext = { targetDir: tempDir, config: loadConfig(".") };

  const results = await Promise.all(scanners.map((s) => s.run(ctx)));
  assert.equal(results.length, 3);
  for (const r of results) {
    assert.ok(r !== null && r !== undefined);
  }

  fs.rmSync(tempDir, { recursive: true, force: true });
});
