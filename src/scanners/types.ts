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
}
