import * as ts from "typescript";
import { AgentLintConfig } from "../../config.js";
import { AgentIssue } from "../types.js";
import { RuleContext } from "../../rules/types.js";
import { verificationMissingTestsRule } from "../../rules/verification-missing-tests.js";

// Facade — see spec-lint.ts header.
export function checkVerificationRules(
  file: string,
  lines: string[],
  _config: AgentLintConfig | undefined,
  dir: string,
  sourceFile?: ts.SourceFile,
): AgentIssue[] {
  const ctx: RuleContext = {
    filePath: file,
    content: lines.join("\n"),
    lines,
    ast: sourceFile,
    targetDir: dir,
    globalTools: [],
  };
  return verificationMissingTestsRule.check(ctx);
}
