import * as ts from "typescript";
import { AgentLintConfig } from "../../config.js";
import { AgentIssue, ToolDeclaration } from "../types.js";
import { RuleContext } from "../../rules/types.js";
import {
  toolWeakSchemaRule,
  collectToolNamesNonAst,
} from "../../rules/tool-weak-schema.js";
import { toolMissingExamplesRule } from "../../rules/tool-missing-examples.js";

export { collectToolNamesNonAst };

// Facade — see spec-lint.ts header.
//
// `tool-overlapping` is workspace-level in production (the orchestrator
// post-loop emits cross-file dups). For legacy test paths that don't pass
// `globalTools`, this facade also detects intra-file dups so direct unit
// tests against `checkToolRules` keep working.
export function checkToolRules(
  file: string,
  lines: string[],
  _config?: AgentLintConfig,
  sourceFile?: ts.SourceFile,
  globalTools?: ToolDeclaration[],
): AgentIssue[] {
  const ctx: RuleContext = {
    filePath: file,
    content: sourceFile ? sourceFile.text : lines.join("\n"),
    lines,
    ast: sourceFile,
    targetDir: "",
    globalTools: globalTools ?? [],
  };

  const issues = [
    ...toolWeakSchemaRule.check(ctx),
    ...toolMissingExamplesRule.check(ctx),
  ];

  // Intra-file overlap detection for the legacy no-globalTools call path.
  if (!globalTools) {
    const toolNames = collectToolNamesNonAst(ctx.content);
    const uniqueNames = new Set(toolNames);
    if (toolNames.length > uniqueNames.size) {
      issues.push({
        file,
        line: 1,
        message: "Multiple tools with identical or overlapping names detected.",
        ruleId: "tool-overlapping",
        severity: "error",
        suggestion:
          "Ensure each tool has a distinct name and purpose to avoid ambiguous decision points.",
        category: "Tool",
      });
    }
  }

  return issues;
}
