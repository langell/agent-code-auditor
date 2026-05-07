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
// `T` is the scanner-specific report type. The reporter consumes T directly
// (each scanner's section is rendered with its own per-shape formatting),
// while library users that want a uniform issue stream call `toIssues(T)`
// to flatten any scanner's output into `AgentIssue[]`. This avoids forcing
// every scanner onto a single canonical shape (which would lose meaningful
// per-section formatting in the reporter) while still giving consumers a
// single way to walk every issue.
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
  /**
   * Adapt this scanner's native report shape to a uniform `AgentIssue[]`
   * stream. Library users compose multiple scanners' outputs by calling
   * `toIssues` on each; the reporter still uses the native `T` shape.
   */
  toIssues(report: T): AgentIssue[];
}
