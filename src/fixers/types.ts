import { AgentIssue } from "../scanners/types.js";

export interface FixResult {
  file: string;
  fixed: boolean;
  ruleId: string;
  message: string;
}

export interface FixReport {
  fixes: FixResult[];
}

export interface CustomFixer {
  fix(
    filePath: string,
    issues: AgentIssue[],
  ): Promise<FixResult[]> | FixResult[];
}
