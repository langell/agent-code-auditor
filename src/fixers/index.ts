import * as path from "path";
import { pathToFileURL } from "url";
import { AgentIssue } from "../scanners/types.js";
import { AgentLintConfig, CustomFixerReference } from "../config.js";
import { CustomFixer, FixReport, FixResult } from "./types.js";
import { fixSpecRules } from "./spec-fixer.js";
import { fixCodeQualityRules } from "./code-quality-fixer.js";
import { fixToolRules } from "./tool-fixer.js";
import { fixContextRules } from "./context-fixer.js";
import { fixVerificationRules } from "./verification-fixer.js";
import { fixExecutionRules } from "./execution-fixer.js";
import { fixSecurityRules } from "./security-fixer.js";

function parseFixerReference(ref: string | CustomFixerReference): {
  modulePath: string;
  exportName?: string;
} {
  if (typeof ref === "string") {
    const [modulePath, exportName] = ref.split("#");
    return { modulePath, exportName };
  }

  return {
    modulePath: ref.path,
    exportName: ref.exportName,
  };
}

async function loadCustomFixers(
  targetDir: string,
  config: AgentLintConfig,
): Promise<Record<string, CustomFixer>> {
  const loaded: Record<string, CustomFixer> = {};
  const configuredFixers = config.fixers || {};

  for (const [ruleId, fixerRef] of Object.entries(configuredFixers)) {
    try {
      const { modulePath, exportName } = parseFixerReference(fixerRef);
      const absoluteModulePath = path.resolve(targetDir, modulePath);
      const imported = await import(pathToFileURL(absoluteModulePath).href);
      const exportKey = exportName || "default";
      const FixerClass = imported[exportKey];

      if (typeof FixerClass !== "function") {
        console.warn(
          `Custom fixer for '${ruleId}' did not export a class/function '${exportKey}'. Falling back to default fixer.`,
        );
        continue;
      }

      const instance = new FixerClass() as CustomFixer;

      if (!instance || typeof instance.fix !== "function") {
        console.warn(
          `Custom fixer for '${ruleId}' does not implement a 'fix(filePath, issues)' method. Falling back to default fixer.`,
        );
        continue;
      }

      loaded[ruleId] = instance;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.warn(
        `Failed to load custom fixer for '${ruleId}': ${message}. Falling back to default fixer.`,
      );
    }
  }

  return loaded;
}

export async function runFixer(
  targetDir: string,
  issues: AgentIssue[],
  config: AgentLintConfig,
): Promise<FixReport> {
  const fixes: FixResult[] = [];
  const skippedRules = new Set(config.skipRules || []);
  const customFixers = await loadCustomFixers(targetDir, config);

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

    const activeFileIssues = fileIssues.filter(
      (issue) => !skippedRules.has(issue.ruleId),
    );

    if (activeFileIssues.length === 0) {
      continue;
    }

    let issuesForDefaultFixers = [...activeFileIssues];

    for (const [ruleId, fixer] of Object.entries(customFixers)) {
      const customIssues = activeFileIssues.filter(
        (issue) => issue.ruleId === ruleId,
      );

      if (customIssues.length === 0) {
        continue;
      }

      try {
        const customFixes = await fixer.fix(fullPath, customIssues);
        fixes.push(...customFixes.map((f) => ({ ...f, file })));
        issuesForDefaultFixers = issuesForDefaultFixers.filter(
          (issue) => issue.ruleId !== ruleId,
        );
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        console.warn(
          `Custom fixer for '${ruleId}' failed for '${file}': ${message}. Falling back to default fixer.`,
        );
      }
    }

    // Apply fixers
    const specFixes = await fixSpecRules(fullPath, issuesForDefaultFixers);
    const cqFixes = await fixCodeQualityRules(fullPath, issuesForDefaultFixers);
    const toolFixes = await fixToolRules(fullPath, issuesForDefaultFixers);
    const contextFixes = await fixContextRules(
      fullPath,
      issuesForDefaultFixers,
    );
    const verificationFixes = await fixVerificationRules(
      fullPath,
      issuesForDefaultFixers,
    );
    const executionFixes = await fixExecutionRules(
      fullPath,
      issuesForDefaultFixers,
    );
    const securityFixes = await fixSecurityRules(
      fullPath,
      issuesForDefaultFixers,
    );

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
