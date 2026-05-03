import * as ts from "typescript";
import { AgentLintConfig } from "../../config.js";
import { AgentIssue } from "../types.js";
import { RuleContext } from "../../rules/types.js";
import { contextOversizedRule } from "../../rules/context-oversized.js";
import { observabilityMissingTraceIdRule } from "../../rules/observability-missing-trace-id.js";

// Facade — see spec-lint.ts header.
export function checkContextRules(
  file: string,
  lines: string[],
  _config?: AgentLintConfig,
  sourceFile?: ts.SourceFile,
): AgentIssue[] {
  const ctx: RuleContext = {
    filePath: file,
    content: lines.join("\n"),
    lines,
    ast: sourceFile,
    targetDir: "",
    globalTools: [],
  };
  return [
    ...contextOversizedRule.check(ctx),
    ...observabilityMissingTraceIdRule.check(ctx),
  ];
}
