import * as fs from "fs";
import * as path from "path";
import { glob } from "glob";
import * as ts from "typescript";
import { AgentLintConfig } from "../config.js";
import { AgentIssue, ToolDeclaration } from "./types.js";
import { registry } from "../rules/index.js";
import { RuleContext, WorkspaceContext } from "../rules/types.js";
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
  // RuleContext so the tool family Rule can populate it during check; the
  // generic `aggregate` pass below reads it.
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

  // Cross-file aggregation: every Rule with an `aggregate` method runs once
  // after the per-file loop. Today only `tool-overlapping` uses this; the
  // hook is generic so additional cross-file rules can be added without
  // changing the orchestrator.
  const workspaceCtx: WorkspaceContext = { targetDir: dir, globalTools };
  for (const rule of effectiveRules) {
    if (rule.aggregate) {
      rawIssues.push(...rule.aggregate(workspaceCtx));
    }
  }

  return applyConfig(rawIssues, config);
}
