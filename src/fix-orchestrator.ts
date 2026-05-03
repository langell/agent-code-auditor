import * as fs from "fs";
import * as path from "path";
import { pathToFileURL } from "url";
import { AgentLintConfig, CustomFixerReference } from "./config.js";
import { registry } from "./rules/index.js";
import {
  CustomFixer,
  FixRecord,
  FixReport,
  FixResult,
  Rule,
} from "./rules/types.js";
import { AgentIssue } from "./scanners/types.js";

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
          `Custom fixer for '${ruleId}' does not implement a 'fix(content, issues, filePath)' method. Falling back to default fixer.`,
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

function stampFile(records: FixRecord[], file: string): FixResult[] {
  return records.map((r) => ({
    fixed: r.fixed,
    ruleId: r.ruleId,
    message: r.message,
    file: r.file ?? file,
  }));
}

// Build the ordered list of (Rule, ruleId) pairs that have an `applyFix`.
// Order matches registry order, which roughly mirrors the pre-refactor
// family-fixer dispatch order so report output stays stable.
function fixableRules(): Rule[] {
  return registry.filter((rule) => typeof rule.applyFix === "function");
}

export async function runFixer(
  targetDir: string,
  issues: AgentIssue[],
  config: AgentLintConfig,
): Promise<FixReport> {
  const fixes: FixResult[] = [];
  const skippedRules = new Set(config.skipRules || []);
  const customFixers = await loadCustomFixers(targetDir, config);
  const fixers = fixableRules();

  // Group issues by file
  const issuesByFile = issues.reduce(
    (acc, issue) => {
      if (!acc[issue.file]) acc[issue.file] = [];
      acc[issue.file].push(issue);
      return acc;
    },
    {} as Record<string, AgentIssue[]>,
  );

  for (const [relativeFile, fileIssues] of Object.entries(issuesByFile)) {
    const fullPath = path.resolve(targetDir, relativeFile);

    const activeFileIssues = fileIssues.filter(
      (issue) => !skippedRules.has(issue.ruleId),
    );

    if (activeFileIssues.length === 0) continue;
    if (!fs.existsSync(fullPath)) continue;

    const originalContent = fs.readFileSync(fullPath, "utf8");
    let content = originalContent;
    const newFiles: { path: string; content: string }[] = [];

    // Track which ruleIds were handled by a custom fixer so the default
    // applyFix path skips them.
    const handledByCustom = new Set<string>();

    // Custom fixers run first; each only sees issues for its specific ruleId.
    for (const [ruleId, fixer] of Object.entries(customFixers)) {
      const customIssues = activeFileIssues.filter(
        (issue) => issue.ruleId === ruleId,
      );

      if (customIssues.length === 0) continue;

      try {
        const outcome = await fixer.fix(content, customIssues, fullPath);
        content = outcome.content;
        fixes.push(...stampFile(outcome.fixes, relativeFile));
        if (outcome.newFiles) newFiles.push(...outcome.newFiles);
        handledByCustom.add(ruleId);
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        console.warn(
          `Custom fixer for '${ruleId}' failed for '${relativeFile}': ${message}. Falling back to default fixer.`,
        );
      }
    }

    // Default applyFix path: walk the registry, find rules with applyFix,
    // and call each with its own ruleId's issues. Content threads through.
    for (const rule of fixers) {
      if (handledByCustom.has(rule.id)) continue;
      const ruleIssues = activeFileIssues.filter((i) => i.ruleId === rule.id);
      if (ruleIssues.length === 0) continue;

      const outcome = rule.applyFix!(content, ruleIssues, fullPath);
      content = outcome.content;
      fixes.push(...stampFile(outcome.fixes, relativeFile));
      if (outcome.newFiles) newFiles.push(...outcome.newFiles);
    }

    // Write the source file once if anything changed.
    if (content !== originalContent) {
      fs.writeFileSync(fullPath, content, "utf8");
    }

    // Write any scaffolded sibling files (e.g. test scaffolds) that don't
    // already exist on disk.
    for (const newFile of newFiles) {
      if (!fs.existsSync(newFile.path)) {
        fs.writeFileSync(newFile.path, newFile.content, "utf8");
      }
    }
  }

  return { fixes };
}
