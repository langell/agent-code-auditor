import * as ts from "typescript";
import { AgentLintConfig } from "../../config.js";
import { AgentIssue } from "../types.js";
import { RuleContext } from "../../rules/types.js";
import { codeQualityNoAnyRule } from "../../rules/code-quality-no-any.js";

// Facade — see spec-lint.ts header.
export function checkCodeQualityRules(
  file: string,
  lines: string[],
  _config?: AgentLintConfig,
  sourceFile?: ts.SourceFile,
): AgentIssue[] {
  const ctx: RuleContext = {
    filePath: file,
    content: sourceFile ? sourceFile.text : lines.join("\n"),
    lines,
    ast: sourceFile,
    targetDir: "",
    globalTools: [],
  };
  return codeQualityNoAnyRule.check(ctx);
}
