export interface AgentIssue {
  file: string;
  line: number;
  message: string;
  ruleId: string;
  severity: "error" | "warn";
  suggestion?: string;
  category:
    | "Spec"
    | "Context"
    | "Tool"
    | "Execution"
    | "Execution Safety"
    | "Security"
    | "Verification/Security"
    | "Code Quality"
    | "General";
  startPos?: number;
  endPos?: number;
}

export interface ToolDeclaration {
  name: string;
  file: string;
  line: number;
}

// Per `CONTEXT.md`, a Scanner is a producer of Issues that is not a Rule.
// This interface gives all three first-class scanners (vulnerability scan,
// linter wrapper, AST analyzer) a uniform shape so the CLI can iterate them
// and the library API has one well-typed entry point per scanner.
//
// `T` is the scanner-specific report type — kept generic for now rather than
// unified onto AgentIssue[] so the existing per-scanner reporter code keeps
// working unchanged. A follow-up can convert all scanner outputs to a
// canonical AgentIssue[] shape if/when the reporter is rewritten.
export interface ScannerContext {
  targetDir: string;
  // Some scanners ignore config (e.g. vulnerability), but providing it
  // uniformly means the orchestrator doesn't need per-scanner branching.
  config: import("../config.js").AgentLintConfig;
}

export interface Scanner<T> {
  /** Stable id — also used as the section name in reports. */
  name: string;
  run(ctx: ScannerContext): Promise<T>;
}
