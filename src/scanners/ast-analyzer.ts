import * as fs from "fs";
import * as path from "path";
import { glob } from "glob";
import * as ts from "typescript";
import { AgentLintConfig } from "../config.js";
import { AgentIssue, ToolDeclaration } from "./types.js";
import { registry } from "../rules/index.js";
import { RuleContext } from "../rules/types.js";
import { loadCustomRules, mergeRules } from "../load-custom-rules.js";

function isSourceFile(filePath: string): boolean {
  return /\.(?:ts|tsx|js|jsx|mts|cts|mjs|cjs)$/.test(filePath);
}

function shouldParseAst(filePath: string): boolean {
  return /\.(?:ts|tsx|js|jsx)$/.test(filePath);
}

// Apply user config to an issue stream:
//   - drop issues whose ruleId is configured "off"
//   - override severity to "warn" / "error" when the user explicitly set one
//   - otherwise leave the rule's hardcoded default severity in place
//
// Rules are config-blind detectors; this is the single seam where config
// becomes effective.
function applyConfig(
  issues: AgentIssue[],
  config: AgentLintConfig,
): AgentIssue[] {
  const out: AgentIssue[] = [];
  for (const issue of issues) {
    const level = config.rules[issue.ruleId];
    if (level === "off") continue;
    if (level === "warn" || level === "error") {
      out.push({ ...issue, severity: level });
    } else {
      out.push(issue);
    }
  }
  return out;
}

export async function runASTAnalyzer(
  dir: string,
  config: AgentLintConfig,
): Promise<AgentIssue[]> {
  const rawIssues: AgentIssue[] = [];

  const files = await glob("**/*.{js,ts,jsx,tsx,md,prompt}", {
    cwd: dir,
    ignore: ["node_modules/**", "dist/**"],
  });

  // Resolve the effective rule set (built-in + any user-registered custom
  // rules from `customRules` in .agentlintrc.json). Custom rules with the
  // same id as a built-in shadow it.
  const customRules = await loadCustomRules(dir, config);
  const effectiveRules = mergeRules(registry, customRules);

  // Cross-file accumulator for tool-overlapping. Threaded through every
  // RuleContext so the tool family Rule can populate it and the post-loop
  // overlap aggregator below can read it.
  const globalTools: ToolDeclaration[] = [];

  for (const file of files) {
    const fullPath = path.join(dir, file);
    const content = fs.readFileSync(fullPath, "utf8");
    const lines = content.split("\n");

    let ast: ts.SourceFile | undefined;
    if (shouldParseAst(file)) {
      ast = ts.createSourceFile(file, content, ts.ScriptTarget.Latest, true);
    }

    const fileIsSource = isSourceFile(file);

    const ctx: RuleContext = {
      filePath: file,
      content,
      lines,
      ast,
      targetDir: dir,
      globalTools,
    };

    for (const rule of effectiveRules) {
      if (rule.appliesTo === "source" && !fileIsSource) {
        continue;
      }
      rawIssues.push(...rule.check(ctx));
    }
  }

  // Cross-file aggregation: emit one issue per tool name that appears in
  // more than one file. Always emits at the rule's default severity; the
  // applyConfig pass below handles "off" / overrides uniformly.
  const seenTools = new Map<string, string>();
  for (const tool of globalTools) {
    if (seenTools.has(tool.name)) {
      rawIssues.push({
        file: tool.file,
        line: tool.line,
        message: `Tool '${tool.name}' overlaps with a tool defined in ${seenTools.get(tool.name)}.`,
        ruleId: "tool-overlapping",
        severity: "error",
        suggestion:
          "Ensure each tool has a distinct name and purpose across the workspace.",
        category: "Tool",
      });
    } else {
      seenTools.set(tool.name, tool.file);
    }
  }

  return applyConfig(rawIssues, config);
}
