import * as path from "path";
import { AgentIssue } from "../scanners/types.js";
import { FixReport, FixResult } from "./types.js";
import { fixSpecRules } from "./spec-fixer.js";
import { fixCodeQualityRules } from "./code-quality-fixer.js";
import { fixToolRules } from "./tool-fixer.js";
import { fixContextRules } from "./context-fixer.js";
import { fixVerificationRules } from "./verification-fixer.js";
import { fixExecutionRules } from "./execution-fixer.js";
import { fixSecurityRules } from "./security-fixer.js";

export async function runFixer(
  targetDir: string,
  issues: AgentIssue[],
): Promise<FixReport> {
  const fixes: FixResult[] = [];

  // Group issues by file
  const issuesByFile = issues.reduce(
    (acc, issue) => {
      if (!acc[issue.file]) acc[issue.file] = [];
      acc[issue.file].push(issue);
      return acc;
    },
    {} as Record<string, AgentIssue[]>,
  );

  for (const [file, fileIssues] of Object.entries(issuesByFile)) {
    // Resolve the relative issue.file to the target directory
    const fullPath = path.resolve(targetDir, file);

    // Apply fixers
    const specFixes = await fixSpecRules(fullPath, fileIssues);
    const cqFixes = await fixCodeQualityRules(fullPath, fileIssues);
    const toolFixes = await fixToolRules(fullPath, fileIssues);
    const contextFixes = await fixContextRules(fullPath, fileIssues);
    const verificationFixes = await fixVerificationRules(fullPath, fileIssues);
    const executionFixes = await fixExecutionRules(fullPath, fileIssues);
    const securityFixes = await fixSecurityRules(fullPath, fileIssues);

    const allFixes = [
      ...specFixes,
      ...cqFixes,
      ...toolFixes,
      ...contextFixes,
      ...verificationFixes,
      ...executionFixes,
      ...securityFixes,
    ].map((f) => ({ ...f, file }));
    fixes.push(...allFixes);
  }

  return { fixes };
}
