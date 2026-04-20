export interface FixResult {
  file: string;
  fixed: boolean;
  ruleId: string;
  message: string;
}

export interface FixReport {
  fixes: FixResult[];
}
