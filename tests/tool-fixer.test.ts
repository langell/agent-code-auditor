import test from "node:test";

import { toolOverlappingRule } from "../src/rules/tool-overlapping.js";
import { expectFix, expectNoFix, makeIssue } from "./_helpers.js";

const overlappingIssue = makeIssue({
  ruleId: "tool-overlapping",
  file: "tools.ts",
  severity: "error",
  category: "Tool",
});

test("toolOverlappingRule.applyFix renames duplicate tool names", () => {
  expectFix(toolOverlappingRule, {
    before: [
      "const tools = [",
      '  { name: "search", description: "first" },',
      '  { name: "search", description: "second" },',
      '  { name: "search", description: "third" },',
      '  { name: "fetch", description: "single" },',
      "];",
    ].join("\n"),
    after: [
      "const tools = [",
      '  { name: "search", description: "first" },',
      '  { name: "search_2", description: "second" },',
      '  { name: "search_3", description: "third" },',
      '  { name: "fetch", description: "single" },',
      "];",
    ].join("\n"),
    issues: [overlappingIssue],
    filePath: "tools.ts",
    fixCount: 2,
  });
});

test("toolOverlappingRule.applyFix is a no-op when names are already unique", () => {
  expectNoFix(toolOverlappingRule, {
    before: [
      "const tools = [",
      '  { name: "search", description: "first" },',
      '  { name: "fetch", description: "second" },',
      '  { name: "run", description: "third" },',
      "];",
    ].join("\n"),
    issues: [overlappingIssue],
    filePath: "tools.ts",
  });
});

test("toolOverlappingRule.applyFix avoids collisions with existing suffixed names", () => {
  // search_2 already taken — duplicates rename to search_3, search_4.
  expectFix(toolOverlappingRule, {
    before: [
      "const tools = [",
      '  { name: "search", description: "first" },',
      '  { name: "search_2", description: "already exists" },',
      '  { name: "search", description: "duplicate" },',
      '  { name: "search", description: "another duplicate" },',
      "];",
    ].join("\n"),
    after: [
      "const tools = [",
      '  { name: "search", description: "first" },',
      '  { name: "search_2", description: "already exists" },',
      '  { name: "search_3", description: "duplicate" },',
      '  { name: "search_4", description: "another duplicate" },',
      "];",
    ].join("\n"),
    issues: [overlappingIssue],
    filePath: "tools.ts",
    fixCount: 2,
  });
});
