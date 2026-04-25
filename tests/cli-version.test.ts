import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import * as fs from "node:fs";
import * as path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

test("cli --version matches package.json version", () => {
  const testDir = path.dirname(fileURLToPath(import.meta.url));
  const repoRoot = path.resolve(testDir, "..");
  const packageJsonPath = path.join(repoRoot, "package.json");
  const packageJsonRaw = fs.readFileSync(packageJsonPath, "utf8");
  const packageJson = JSON.parse(packageJsonRaw) as { version: string };

  const tsxBinary =
    process.platform === "win32"
      ? path.join(repoRoot, "node_modules", ".bin", "tsx.cmd")
      : path.join(repoRoot, "node_modules", ".bin", "tsx");

  const stdout = execFileSync(tsxBinary, ["src/index.ts", "--version"], {
    cwd: repoRoot,
    encoding: "utf8",
  }).trim();

  assert.equal(stdout, packageJson.version);
});
