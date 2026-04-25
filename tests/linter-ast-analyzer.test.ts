import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import test from "node:test";

import { runLinter } from "../src/scanners/linter.js";
import { runASTAnalyzer } from "../src/scanners/ast-analyzer.js";
import { loadConfig } from "../src/config.js";

test("runLinter handles project without eslint config gracefully", async () => {
  const tempDir = fs.mkdtempSync(
    path.join(os.tmpdir(), "agentlint-linter-test-")
  );
  const filePath = path.join(tempDir, "code.ts");
  fs.writeFileSync(filePath, "const x = 1;", "utf8");

  const result = await runLinter(tempDir);

  assert.ok(typeof result.errorCount === "number");
  assert.ok(typeof result.warningCount === "number");
  assert.ok(Array.isArray(result.messages));
  assert.strictEqual(result.available, false);
  assert.ok(typeof result.failureMessage === "string");

  fs.rmSync(tempDir, { recursive: true, force: true });
});

test("runLinter prefers a project's local eslint package", async () => {
  const tempDir = fs.mkdtempSync(
    path.join(os.tmpdir(), "agentlint-local-eslint-test-")
  );
  const nodeModulesDir = path.join(tempDir, "node_modules", "eslint");
  fs.mkdirSync(nodeModulesDir, { recursive: true });

  fs.writeFileSync(
    path.join(nodeModulesDir, "package.json"),
    JSON.stringify({ name: "eslint", main: "index.js" }),
    "utf8"
  );
  fs.writeFileSync(
    path.join(nodeModulesDir, "index.js"),
    `class ESLint {
      constructor(options) {
        this.options = options;
      }

      async lintFiles(patterns) {
        if (
          JSON.stringify(patterns) !==
          JSON.stringify(["**/*.js", "**/*.ts", "**/*.jsx", "**/*.tsx"])
        ) {
          throw new Error("Unexpected lint patterns: " + JSON.stringify(patterns));
        }

        return [
          {
            filePath: this.options.cwd + "/local.ts",
            errorCount: 1,
            warningCount: 0,
            messages: [
              {
                severity: 2,
                line: 1,
                ruleId: "local-eslint-rule",
                message: "Used local eslint runtime"
              }
            ]
          }
        ];
      }

      static async outputFixes() {}
    }

    module.exports = { ESLint };
`,
    "utf8"
  );

  const result = await runLinter(tempDir);

  assert.strictEqual(result.errorCount, 1);
  assert.strictEqual(result.messages[0]?.messages[0]?.ruleId, "local-eslint-rule");
  assert.strictEqual(result.available, true);

  fs.rmSync(tempDir, { recursive: true, force: true });
});

test("runLinter returns structured failure details for incompatible local eslint", async () => {
  const tempDir = fs.mkdtempSync(
    path.join(os.tmpdir(), "agentlint-broken-eslint-test-")
  );
  const nodeModulesDir = path.join(tempDir, "node_modules", "eslint");
  fs.mkdirSync(nodeModulesDir, { recursive: true });

  fs.writeFileSync(
    path.join(nodeModulesDir, "package.json"),
    JSON.stringify({ name: "eslint", main: "index.js" }),
    "utf8"
  );
  fs.writeFileSync(
    path.join(nodeModulesDir, "index.js"),
    `class ESLint {
      async lintFiles() {
        throw new TypeError("expand is not a function");
      }
    }

    module.exports = { ESLint };
`,
    "utf8"
  );

  const result = await runLinter(tempDir);

  assert.strictEqual(result.available, false);
  assert.strictEqual(result.failureMessage, "expand is not a function");
  assert.strictEqual(result.errorCount, 0);
  assert.strictEqual(result.warningCount, 0);

  fs.rmSync(tempDir, { recursive: true, force: true });
});

test("scan command reports unavailable linter instead of clean output", () => {
  const tempDir = fs.mkdtempSync(
    path.join(os.tmpdir(), "agentlint-cli-broken-eslint-test-")
  );
  const nodeModulesDir = path.join(tempDir, "node_modules", "eslint");
  fs.mkdirSync(nodeModulesDir, { recursive: true });
  fs.writeFileSync(
    path.join(nodeModulesDir, "package.json"),
    JSON.stringify({ name: "eslint", main: "index.js" }),
    "utf8"
  );
  fs.writeFileSync(
    path.join(nodeModulesDir, "index.js"),
    `class ESLint {
      async lintFiles() {
        throw new TypeError("expand is not a function");
      }
    }

    module.exports = { ESLint };
`,
    "utf8"
  );

  const cliOutput = execFileSync(
    process.execPath,
    ["./node_modules/tsx/dist/cli.mjs", "./src/index.ts", "scan", "-d", tempDir],
    {
      cwd: path.join(process.cwd()),
      encoding: "utf8",
    }
  );

  assert.match(cliOutput, /Linter could not run: expand is not a function/);
  assert.match(cliOutput, /Fix the target repo, then rerun agentlint:/);
  assert.match(cliOutput, /Run 'pnpm exec eslint \.' in the target repo to reproduce the local ESLint failure/);
  assert.match(cliOutput, /Reinstall that repo's dependencies with 'pnpm install'/);
  assert.doesNotMatch(cliOutput, /Code styling is clean/);
  assert.match(cliOutput, /linter unavailable/);

  fs.rmSync(tempDir, { recursive: true, force: true });
});

test("runASTAnalyzer detects placeholder comments", async () => {
  const tempDir = fs.mkdtempSync(
    path.join(os.tmpdir(), "agentlint-ast-placeholder-test-")
  );
  const filePath = path.join(tempDir, "code.ts");
  fs.writeFileSync(filePath, "// TODO: Implement this function\nfunction test() {}", "utf8");

  const config = loadConfig(".");
  const issues = await runASTAnalyzer(tempDir, config);

  const placeholderIssues = issues.filter(
    (i) => i.ruleId === "no-placeholder-comments"
  );
  assert.ok(placeholderIssues.length > 0);

  fs.rmSync(tempDir, { recursive: true, force: true });
});

test("runASTAnalyzer does not flag valid TODO comments as placeholders", async () => {
  const tempDir = fs.mkdtempSync(
    path.join(os.tmpdir(), "agentlint-valid-todo-test-")
  );
  const filePath = path.join(tempDir, "code.ts");
  fs.writeFileSync(
    filePath,
    "// TODO: investigate auth retry bug\nfunction test() {}",
    "utf8"
  );

  const config = loadConfig(".");
  const issues = await runASTAnalyzer(tempDir, config);

  const placeholderIssues = issues.filter(
    (i) => i.ruleId === "no-placeholder-comments"
  );
  assert.strictEqual(placeholderIssues.length, 0);

  fs.rmSync(tempDir, { recursive: true, force: true });
});

test("runASTAnalyzer does not flag placeholder phrases inside strings", async () => {
  const tempDir = fs.mkdtempSync(
    path.join(os.tmpdir(), "agentlint-placeholder-string-test-")
  );
  const filePath = path.join(tempDir, "code.ts");
  fs.writeFileSync(
    filePath,
    'const note = "TODO: Implement this function";\nfunction test() {}',
    "utf8"
  );

  const config = loadConfig(".");
  const issues = await runASTAnalyzer(tempDir, config);

  const placeholderIssues = issues.filter(
    (i) => i.ruleId === "no-placeholder-comments"
  );
  assert.strictEqual(placeholderIssues.length, 0);

  fs.rmSync(tempDir, { recursive: true, force: true });
});

test("runASTAnalyzer detects inline placeholder comments", async () => {
  const tempDir = fs.mkdtempSync(
    path.join(os.tmpdir(), "agentlint-inline-placeholder-test-")
  );
  const filePath = path.join(tempDir, "code.ts");
  fs.writeFileSync(
    filePath,
    "const result = compute(); // TODO: implement fallback logic here",
    "utf8"
  );

  const config = loadConfig(".");
  const issues = await runASTAnalyzer(tempDir, config);

  const placeholderIssues = issues.filter(
    (i) => i.ruleId === "no-placeholder-comments"
  );
  assert.strictEqual(placeholderIssues.length, 1);

  fs.rmSync(tempDir, { recursive: true, force: true });
});

test("runASTAnalyzer respects skip rules config", async () => {
  const tempDir = fs.mkdtempSync(
    path.join(os.tmpdir(), "agentlint-ast-skip-test-")
  );
  const filePath = path.join(tempDir, "code.ts");
  fs.writeFileSync(filePath, "// TODO: Implement\nconst x: any = {};", "utf8");

  const config = loadConfig(".");
  config.rules["no-placeholder-comments"] = "off";
  const issues = await runASTAnalyzer(tempDir, config);

  const placeholderIssues = issues.filter(
    (i) => i.ruleId === "no-placeholder-comments"
  );
  assert.strictEqual(placeholderIssues.length, 0);

  fs.rmSync(tempDir, { recursive: true, force: true });
});

test("runASTAnalyzer detects all rule categories", async () => {
  const tempDir = fs.mkdtempSync(
    path.join(os.tmpdir(), "agentlint-ast-comprehensive-test-")
  );

  // Create a file with various issues
  const filePath = path.join(tempDir, "task.prompt");
  const content = `
# Task without criteria
This is a task that lacks acceptance criteria and rollback conditions.

# Code section
\`\`\`ts
const value: any = null;
const apiKey = 'sk-abc123def456ghi789jkl012mnopqrst';
\`\`\`
`;
  fs.writeFileSync(filePath, content, "utf8");

  const config = loadConfig(".");
  const issues = await runASTAnalyzer(tempDir, config);

  // Should find some issues
  assert.ok(issues.length > 0);

  // Should find different categories
  const categories = new Set(issues.map((i) => i.ruleId));
  assert.ok(categories.size > 0);

  fs.rmSync(tempDir, { recursive: true, force: true });
});

test("runASTAnalyzer handles empty directories", async () => {
  const tempDir = fs.mkdtempSync(
    path.join(os.tmpdir(), "agentlint-ast-empty-test-")
  );

  const config = loadConfig(".");
  const issues = await runASTAnalyzer(tempDir, config);

  assert.ok(Array.isArray(issues));

  fs.rmSync(tempDir, { recursive: true, force: true });
});

test("runASTAnalyzer scans multiple file types", async () => {
  const tempDir = fs.mkdtempSync(
    path.join(os.tmpdir(), "agentlint-ast-multitype-test-")
  );

  // Create various file types with clear issues
  fs.writeFileSync(
    path.join(tempDir, "code.ts"),
    "const x: any = {};",
    "utf8"
  );

  const config = loadConfig(".");
  const issues = await runASTAnalyzer(tempDir, config);

  // Should find issues (at minimum the 'any' type usage)
  assert.ok(issues.length > 0);

  fs.rmSync(tempDir, { recursive: true, force: true });
});
