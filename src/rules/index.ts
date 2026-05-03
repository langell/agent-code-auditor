import { Rule } from "./types.js";

// Spec family
import { specMissingAcceptanceCriteriaRule } from "./spec-missing-acceptance-criteria.js";
import { specMissingRollbackRule } from "./spec-missing-rollback.js";
import { securityIgnoreInstructionsRule } from "./security-ignore-instructions.js";

// Context family
import { contextOversizedRule } from "./context-oversized.js";
import { observabilityMissingTraceIdRule } from "./observability-missing-trace-id.js";

// Security family
import { securityDestructiveActionRule } from "./security-destructive-action.js";
import { securityInputValidationRule } from "./security-input-validation.js";
import { securitySecretLeakageRule } from "./security-secret-leakage.js";
import { securityPromptInjectionRule } from "./security-prompt-injection.js";
import { contextUnredactedPiiRule } from "./context-unredacted-pii.js";

// Tool family
//   Note: `tool-overlapping`'s `check` is a no-op — issues are emitted by the
//   orchestrator's cross-file aggregator. The Rule exists in the registry so
//   the fix orchestrator can pair `tool-overlapping` issues with `applyFix`.
import { toolWeakSchemaRule } from "./tool-weak-schema.js";
import { toolMissingExamplesRule } from "./tool-missing-examples.js";
import { toolOverlappingRule } from "./tool-overlapping.js";

// Execution family
import { executionMissingMaxStepsRule } from "./execution-missing-max-steps.js";
import { architectureAtomicTransactionsRule } from "./architecture-atomic-transactions.js";
import { executionNoDryRunRule } from "./execution-no-dry-run.js";

// Code quality
import { codeQualityNoAnyRule } from "./code-quality-no-any.js";

// Verification
import { verificationMissingTestsRule } from "./verification-missing-tests.js";

// Legacy line-scan rules
import { placeholderCommentsRule } from "./legacy/placeholder-comments.js";
import { insecureRendersRule } from "./legacy/insecure-renders.js";
import { hallucinatedImportsRule } from "./legacy/hallucinated-imports.js";

// The static array of Rules the orchestrator iterates over. Order roughly
// matches the pre-refactor dispatch order in ast-analyzer.ts so report
// output stays stable.
export const registry: Rule[] = [
  // Spec
  specMissingAcceptanceCriteriaRule,
  specMissingRollbackRule,
  securityIgnoreInstructionsRule,
  // Context
  contextOversizedRule,
  observabilityMissingTraceIdRule,
  // Security
  securityDestructiveActionRule,
  securityInputValidationRule,
  securitySecretLeakageRule,
  securityPromptInjectionRule,
  contextUnredactedPiiRule,
  // Tool
  toolWeakSchemaRule,
  toolMissingExamplesRule,
  toolOverlappingRule,
  // Execution
  executionMissingMaxStepsRule,
  architectureAtomicTransactionsRule,
  executionNoDryRunRule,
  // Code quality
  codeQualityNoAnyRule,
  // Verification
  verificationMissingTestsRule,
  // Legacy line-scan
  placeholderCommentsRule,
  insecureRendersRule,
  hallucinatedImportsRule,
];

export type { Rule, RuleContext, RuleApplicability } from "./types.js";
