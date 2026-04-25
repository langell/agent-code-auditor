import assert from "node:assert/strict";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import test from "node:test";

import { runVulnerabilityScanner } from "../src/scanners/vulnerabilities.js";

test("runVulnerabilityScanner returns empty when no lockfile is found", async () => {
  const tempDir = fs.mkdtempSync(
    path.join(os.tmpdir(), "agentlint-vuln-test-")
  );

  const result = await runVulnerabilityScanner(tempDir);

  assert.strictEqual(result.issues, 0);
  assert.match(result.details, /No lockfile found/);
  assert.deepStrictEqual(result.vulnerabilities, []);

  fs.rmSync(tempDir, { recursive: true, force: true });
});

test("runVulnerabilityScanner handles pnpm-lock.yaml presence", async () => {
  const tempDir = fs.mkdtempSync(
    path.join(os.tmpdir(), "agentlint-vuln-pnpm-test-")
  );
  const pnpmLockPath = path.join(tempDir, "pnpm-lock.yaml");

  fs.writeFileSync(pnpmLockPath, "# pnpm lock file\n", "utf8");

  const result = await runVulnerabilityScanner(tempDir);

  // Should attempt pnpm audit and handle gracefully
  assert.ok(result !== undefined);
  assert.ok(typeof result.issues === "number");

  fs.rmSync(tempDir, { recursive: true, force: true });
});

test("runVulnerabilityScanner handles yarn.lock presence", async () => {
  const tempDir = fs.mkdtempSync(
    path.join(os.tmpdir(), "agentlint-vuln-yarn-test-")
  );
  const yarnLockPath = path.join(tempDir, "yarn.lock");

  fs.writeFileSync(yarnLockPath, "# yarn lock file\n", "utf8");

  const result = await runVulnerabilityScanner(tempDir);

  // Should attempt yarn audit and handle gracefully
  assert.ok(result !== undefined);
  assert.ok(typeof result.issues === "number");

  fs.rmSync(tempDir, { recursive: true, force: true });
});

test("runVulnerabilityScanner handles package-lock.json presence", async () => {
  const tempDir = fs.mkdtempSync(
    path.join(os.tmpdir(), "agentlint-vuln-npm-test-")
  );
  const packageLockPath = path.join(tempDir, "package-lock.json");

  fs.writeFileSync(packageLockPath, '{"lockfileVersion": 3}\n', "utf8");

  const result = await runVulnerabilityScanner(tempDir);

  // Should attempt npm audit and handle gracefully
  assert.ok(result !== undefined);
  assert.ok(typeof result.issues === "number");

  fs.rmSync(tempDir, { recursive: true, force: true });
});

test("runVulnerabilityScanner handles parsing errors gracefully", async () => {
  const tempDir = fs.mkdtempSync(
    path.join(os.tmpdir(), "agentlint-vuln-error-test-")
  );
  const packageLockPath = path.join(tempDir, "package-lock.json");

  fs.writeFileSync(packageLockPath, '{"valid": "json"}\n', "utf8");

  const result = await runVulnerabilityScanner(tempDir);

  // Should handle parse errors gracefully and return safe defaults
  assert.strictEqual(result.issues, 0);
  assert.strictEqual(result.vulnerabilities.length, 0);

  fs.rmSync(tempDir, { recursive: true, force: true });
});
