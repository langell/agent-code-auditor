import assert from "node:assert/strict";
import test from "node:test";

import { toolOverlappingRule } from "../src/rules/tool-overlapping.js";
import type { AgentIssue } from "../src/scanners/types.js";

test("toolOverlappingRule.applyFix renames duplicate tool names", () => {
  const original = [
    "const tools = [",
    '  { name: "search", description: "first" },',
    '  { name: "search", description: "second" },',
    '  { name: "search", description: "third" },',
    '  { name: "fetch", description: "single" },',
    "];",
  ].join("\n");

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

  const { content, fixes } = toolOverlappingRule.applyFix!(
    original,
    issues,
    "tools.ts",
  );

  assert.equal(fixes.length, 2);
  assert.match(content, /name: "search", description: "first"/);
  assert.match(content, /name: "search_2", description: "second"/);
  assert.match(content, /name: "search_3", description: "third"/);
  assert.match(content, /name: "fetch", description: "single"/);
});

test("toolOverlappingRule.applyFix is a no-op when names are already unique", () => {
  const original = [
    "const tools = [",
    '  { name: "search", description: "first" },',
    '  { name: "fetch", description: "second" },',
    '  { name: "run", description: "third" },',
    "];",
  ].join("\n");

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

  const { content, fixes } = toolOverlappingRule.applyFix!(
    original,
    issues,
    "tools.ts",
  );

  assert.equal(fixes.length, 0);
  assert.equal(content, original);
});

test("toolOverlappingRule.applyFix avoids collisions with existing suffixed names", () => {
  const original = [
    "const tools = [",
    '  { name: "search", description: "first" },',
    '  { name: "search_2", description: "already exists" },',
    '  { name: "search", description: "duplicate" },',
    '  { name: "search", description: "another duplicate" },',
    "];",
  ].join("\n");

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

  const { content, fixes } = toolOverlappingRule.applyFix!(
    original,
    issues,
    "tools.ts",
  );

  assert.equal(fixes.length, 2);
  assert.match(content, /name: "search", description: "first"/);
  assert.match(content, /name: "search_2", description: "already exists"/);
  assert.match(content, /name: "search_3", description: "duplicate"/);
  assert.match(content, /name: "search_4", description: "another duplicate"/);
});
