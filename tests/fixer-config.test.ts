import assert from "node:assert/strict";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import test from "node:test";

import { loadConfig } from "../src/config.js";
import { runFixer } from "../src/fixers/index.js";
import type { AgentIssue } from "../src/scanners/types.js";

test("runFixer respects skipRules from config", async () => {
  const tempDir = fs.mkdtempSync(
    path.join(os.tmpdir(), "agentlint-fixer-skip-"),
  );
  const filePath = path.join(tempDir, "sample.ts");

  fs.writeFileSync(
    path.join(tempDir, ".agentlintrc.json"),
    JSON.stringify({ skipRules: ["code-quality-no-any"] }, null, 2),
    "utf8",
  );

  fs.writeFileSync(filePath, "const value: any = 1;\n", "utf8");

  const issues: AgentIssue[] = [
    {
      file: "sample.ts",
      line: 1,
      message: "Use of 'any' type detected.",
      ruleId: "code-quality-no-any",
      severity: "error",
      category: "Code Quality",
    },
  ];

  const config = loadConfig(tempDir);
  const report = await runFixer(tempDir, issues, config);
  const updated = fs.readFileSync(filePath, "utf8");

  assert.equal(report.fixes.length, 0);
  assert.equal(updated, "const value: any = 1;\n");

  fs.rmSync(tempDir, { recursive: true, force: true });
});

test("runFixer uses configured custom fixer class to override default fixer", async () => {
  const tempDir = fs.mkdtempSync(
    path.join(os.tmpdir(), "agentlint-fixer-custom-"),
  );
  const filePath = path.join(tempDir, "sample.ts");
  const customFixerPath = path.join(tempDir, "custom-fixer.mjs");

  fs.writeFileSync(
    path.join(tempDir, ".agentlintrc.json"),
    JSON.stringify(
      {
        fixers: {
          "code-quality-no-any": "./custom-fixer.mjs#CustomNoAnyFixer",
        },
      },
      null,
      2,
    ),
    "utf8",
  );

  fs.writeFileSync(
    customFixerPath,
    [
      "export class CustomNoAnyFixer {",
      "  fix(content) {",
      "    const updated = content.replace(': any', ': string');",
      "    return {",
      "      content: updated,",
      "      fixes: [",
      "        {",
      "          fixed: true,",
      "          ruleId: 'code-quality-no-any',",
      "          message: 'Custom fixer applied',",
      "        },",
      "      ],",
      "    };",
      "  }",
      "}",
    ].join("\n"),
    "utf8",
  );

  fs.writeFileSync(filePath, "const value: any = 1;\n", "utf8");

  const issues: AgentIssue[] = [
    {
      file: "sample.ts",
      line: 1,
      message: "Use of 'any' type detected.",
      ruleId: "code-quality-no-any",
      severity: "error",
      category: "Code Quality",
    },
  ];

  const config = loadConfig(tempDir);
  const report = await runFixer(tempDir, issues, config);
  const updated = fs.readFileSync(filePath, "utf8");

  assert.equal(report.fixes.length, 1);
  assert.equal(report.fixes[0]?.ruleId, "code-quality-no-any");
  assert.equal(report.fixes[0]?.message, "Custom fixer applied");
  assert.equal(updated, "const value: string = 1;\n");

  fs.rmSync(tempDir, { recursive: true, force: true });
});
