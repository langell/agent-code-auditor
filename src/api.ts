// Library entry point.
//
// `import "agent-code-auditor"` resolves here and gives consumers the
// programmatic API: the scan/fix orchestrators, scanner objects, the rule
// registry, custom-rule loading, the reporter functions, and every type
// they're likely to need (`Rule`, `RuleContext`, `AgentIssue`, etc.).
//
// The CLI lives at `src/index.ts` and is invoked through the `agentlint` bin
// — importing this module never executes the CLI.

// --- Orchestrators -------------------------------------------------------
export { runASTAnalyzer } from "./scanners/ast-analyzer.js";
export { runLinter } from "./scanners/linter.js";
export { runVulnerabilityScanner } from "./scanners/vulnerabilities.js";
export { runFixer } from "./fix-orchestrator.js";

// --- Scanner objects (uniform Scanner<T> shape) --------------------------
export { astScanner } from "./scanners/ast-analyzer.js";
export { linterScanner } from "./scanners/linter.js";
export { vulnerabilityScanner } from "./scanners/vulnerabilities.js";

// --- Config --------------------------------------------------------------
export { loadConfig, defaultConfig } from "./config.js";

// --- Rules ---------------------------------------------------------------
export { registry } from "./rules/index.js";
export { loadCustomRules, mergeRules } from "./load-custom-rules.js";

// --- Reporter (text + CSV) -----------------------------------------------
export {
  printCsvReport,
  printScanHeader,
  printScanReport,
  printFixHeader,
  printFixReport,
} from "./report/index.js";

// --- Types ---------------------------------------------------------------
export type {
  AgentLintConfig,
  CustomFixerReference,
  CustomRuleReference,
  CustomRuleConfigValue,
} from "./config.js";

export type {
  AgentIssue,
  ToolDeclaration,
  Scanner,
  ScannerContext,
} from "./scanners/types.js";

export type {
  VulnerabilityIssue,
  VulnerabilityReport,
} from "./scanners/vulnerabilities.js";

export type { LinterReport } from "./scanners/linter.js";

export type {
  Rule,
  RuleContext,
  RuleApplicability,
  FixOutcome,
  FixRecord,
  NewFile,
  FixResult,
  FixReport,
  CustomFixer,
} from "./rules/types.js";
