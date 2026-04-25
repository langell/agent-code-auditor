import assert from "node:assert/strict";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import test from "node:test";

import { fixToolRules } from "../src/fixers/tool-fixer.js";
import type { AgentIssue } from "../src/scanners/types.js";

test("fixToolRules renames duplicate tool names for tool-overlapping", async () => {
  const tempDir = fs.mkdtempSync(
    path.join(os.tmpdir(), "agentlint-tool-fixer-"),
  );
  const filePath = path.join(tempDir, "tools.ts");
  const original = [
    "const tools = [",
    '  { name: "search", description: "first" },',
    '  { name: "search", description: "second" },',
    '  { name: "search", description: "third" },',
    '  { name: "fetch", description: "single" },',
    "];",
  ].join("\n");

  fs.writeFileSync(filePath, original, "utf8");

  const issues: AgentIssue[] = [
    {
      file: "tools.ts",
      line: 1,
      message: "Multiple tools with identical or overlapping names detected.",
      ruleId: "tool-overlapping",
      severity: "error",
      category: "Tool",
    },
  ];

  const fixes = await fixToolRules(filePath, issues);
  const updated = fs.readFileSync(filePath, "utf8");

  assert.equal(fixes.length, 2);
  assert.match(updated, /name: "search", description: "first"/);
  assert.match(updated, /name: "search_2", description: "second"/);
  assert.match(updated, /name: "search_3", description: "third"/);
  assert.match(updated, /name: "fetch", description: "single"/);

  fs.rmSync(tempDir, { recursive: true, force: true });
});

test("fixToolRules does nothing for tool-overlapping when names are already unique", async () => {
  const tempDir = fs.mkdtempSync(
    path.join(os.tmpdir(), "agentlint-tool-fixer-"),
  );
  const filePath = path.join(tempDir, "tools.ts");
  const original = [
    "const tools = [",
    '  { name: "search", description: "first" },',
    '  { name: "fetch", description: "second" },',
    '  { name: "run", description: "third" },',
    "];",
  ].join("\n");

  fs.writeFileSync(filePath, original, "utf8");

  const issues: AgentIssue[] = [
    {
      file: "tools.ts",
      line: 1,
      message: "Multiple tools with identical or overlapping names detected.",
      ruleId: "tool-overlapping",
      severity: "error",
      category: "Tool",
    },
  ];

  const fixes = await fixToolRules(filePath, issues);
  const updated = fs.readFileSync(filePath, "utf8");

  assert.equal(fixes.length, 0);
  assert.equal(updated, original);

  fs.rmSync(tempDir, { recursive: true, force: true });
});

test("fixToolRules avoids collisions with existing suffixed tool names", async () => {
  const tempDir = fs.mkdtempSync(
    path.join(os.tmpdir(), "agentlint-tool-fixer-"),
  );
  const filePath = path.join(tempDir, "tools.ts");
  const original = [
    "const tools = [",
    '  { name: "search", description: "first" },',
    '  { name: "search_2", description: "already exists" },',
    '  { name: "search", description: "duplicate" },',
    '  { name: "search", description: "another duplicate" },',
    "];",
  ].join("\n");

  fs.writeFileSync(filePath, original, "utf8");

  const issues: AgentIssue[] = [
    {
      file: "tools.ts",
      line: 1,
      message: "Multiple tools with identical or overlapping names detected.",
      ruleId: "tool-overlapping",
      severity: "error",
      category: "Tool",
    },
  ];

  const fixes = await fixToolRules(filePath, issues);
  const updated = fs.readFileSync(filePath, "utf8");

  assert.equal(fixes.length, 2);
  assert.match(updated, /name: "search", description: "first"/);
  assert.match(updated, /name: "search_2", description: "already exists"/);
  assert.match(updated, /name: "search_3", description: "duplicate"/);
  assert.match(updated, /name: "search_4", description: "another duplicate"/);

  fs.rmSync(tempDir, { recursive: true, force: true });
});
