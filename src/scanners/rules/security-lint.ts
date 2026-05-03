import * as ts from "typescript";
import { AgentLintConfig } from "../../config.js";
import { AgentIssue } from "../types.js";
import { RuleContext } from "../../rules/types.js";
import { securityDestructiveActionRule } from "../../rules/security-destructive-action.js";
import { securityInputValidationRule } from "../../rules/security-input-validation.js";
import { securitySecretLeakageRule } from "../../rules/security-secret-leakage.js";
import { securityPromptInjectionRule } from "../../rules/security-prompt-injection.js";
import { contextUnredactedPiiRule } from "../../rules/context-unredacted-pii.js";

// Facade — see spec-lint.ts header.
export function checkSecurityRules(
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
  return [
    ...securityDestructiveActionRule.check(ctx),
    ...securityInputValidationRule.check(ctx),
    ...securitySecretLeakageRule.check(ctx),
    ...securityPromptInjectionRule.check(ctx),
    ...contextUnredactedPiiRule.check(ctx),
  ];
}
