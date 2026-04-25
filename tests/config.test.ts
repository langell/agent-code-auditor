import assert from "node:assert/strict";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import test from "node:test";

import { loadConfig, defaultConfig } from "../src/config.js";

test("loadConfig returns default config when .agentlintrc.json does not exist", () => {
  const tempDir = fs.mkdtempSync(
    path.join(os.tmpdir(), "agentlint-config-test-")
  );
  const config = loadConfig(tempDir);

  assert.deepStrictEqual(config.rules, defaultConfig.rules);
  assert.deepStrictEqual(config.skipRules, []);
  assert.deepStrictEqual(config.fixers, {});

  fs.rmSync(tempDir, { recursive: true, force: true });
});

test("loadConfig merges user rules with default rules", () => {
  const tempDir = fs.mkdtempSync(
    path.join(os.tmpdir(), "agentlint-config-test-")
  );
  const configPath = path.join(tempDir, ".agentlintrc.json");

  fs.writeFileSync(
    configPath,
    JSON.stringify({
      rules: {
        "code-quality-no-any": "warn",
        "security-input-validation": "off",
      },
    }),
    "utf8"
  );

  const config = loadConfig(tempDir);

  assert.strictEqual(config.rules["code-quality-no-any"], "warn");
  assert.strictEqual(config.rules["security-input-validation"], "off");
  assert.strictEqual(config.rules["no-placeholder-comments"], "error");

  fs.rmSync(tempDir, { recursive: true, force: true });
});

test("loadConfig forces skipRules to 'off' in merged config", () => {
  const tempDir = fs.mkdtempSync(
    path.join(os.tmpdir(), "agentlint-config-test-")
  );
  const configPath = path.join(tempDir, ".agentlintrc.json");

  fs.writeFileSync(
    configPath,
    JSON.stringify({
      skipRules: ["code-quality-no-any", "security-input-validation"],
    }),
    "utf8"
  );

  const config = loadConfig(tempDir);

  assert.strictEqual(config.rules["code-quality-no-any"], "off");
  assert.strictEqual(config.rules["security-input-validation"], "off");
  assert.deepStrictEqual(config.skipRules, [
    "code-quality-no-any",
    "security-input-validation",
  ]);

  fs.rmSync(tempDir, { recursive: true, force: true });
});

test("loadConfig preserves fixers mapping from user config", () => {
  const tempDir = fs.mkdtempSync(
    path.join(os.tmpdir(), "agentlint-config-test-")
  );
  const configPath = path.join(tempDir, ".agentlintrc.json");

  const fixersMap = {
    "code-quality-no-any": "./fixers/custom-no-any.mjs#CustomNoAnyFixer",
    "security-input-validation": "./fixers/custom-validation.mjs#CustomValidator",
  };

  fs.writeFileSync(configPath, JSON.stringify({ fixers: fixersMap }), "utf8");

  const config = loadConfig(tempDir);

  assert.deepStrictEqual(config.fixers, fixersMap);

  fs.rmSync(tempDir, { recursive: true, force: true });
});

test("loadConfig returns default config on invalid JSON", () => {
  const tempDir = fs.mkdtempSync(
    path.join(os.tmpdir(), "agentlint-config-test-")
  );
  const configPath = path.join(tempDir, ".agentlintrc.json");

  fs.writeFileSync(configPath, "{ invalid json }", "utf8");

  const config = loadConfig(tempDir);

  assert.deepStrictEqual(config.rules, defaultConfig.rules);
  assert.deepStrictEqual(config.skipRules, []);

  fs.rmSync(tempDir, { recursive: true, force: true });
});

test("loadConfig combines skipRules, rules overrides, and fixers in one config", () => {
  const tempDir = fs.mkdtempSync(
    path.join(os.tmpdir(), "agentlint-config-test-")
  );
  const configPath = path.join(tempDir, ".agentlintrc.json");

  fs.writeFileSync(
    configPath,
    JSON.stringify({
      skipRules: ["code-quality-no-any"],
      rules: {
        "security-input-validation": "warn",
      },
      fixers: {
        "security-input-validation": "./custom-validator.mjs#Validator",
      },
    }),
    "utf8"
  );

  const config = loadConfig(tempDir);

  assert.strictEqual(config.rules["code-quality-no-any"], "off");
  assert.strictEqual(config.rules["security-input-validation"], "warn");
  assert.deepStrictEqual(config.skipRules, ["code-quality-no-any"]);
  assert.deepStrictEqual(config.fixers, {
    "security-input-validation": "./custom-validator.mjs#Validator",
  });

  fs.rmSync(tempDir, { recursive: true, force: true });
});
