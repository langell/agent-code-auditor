import * as ts from "typescript";
import { AgentLintConfig } from "../../config.js";
import { AgentIssue } from "../types.js";
import { RuleContext } from "../../rules/types.js";
import { specMissingAcceptanceCriteriaRule } from "../../rules/spec-missing-acceptance-criteria.js";
import { specMissingRollbackRule } from "../../rules/spec-missing-rollback.js";
import { securityIgnoreInstructionsRule } from "../../rules/security-ignore-instructions.js";

// Facade — aggregates the spec-family per-ruleId Rules. Kept for the test
// suite's direct call sites; production goes through the registry. Config
// is unused (rules are config-blind; orchestrator handles config).
export function checkSpecRules(
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
    ...specMissingAcceptanceCriteriaRule.check(ctx),
    ...specMissingRollbackRule.check(ctx),
    ...securityIgnoreInstructionsRule.check(ctx),
  ];
}
