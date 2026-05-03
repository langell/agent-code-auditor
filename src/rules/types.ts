import * as ts from "typescript";
import { AgentIssue, ToolDeclaration } from "../scanners/types.js";

// The pre-computed input passed to a Rule's `check`. Built once per file by
// the orchestrator and reused across all Rules for that file.
//
// `globalTools` is a mutable workspace-level accumulator threaded across
// files so cross-file checks (e.g. `tool-overlapping`) can dedup on tool
// name.
export interface RuleContext {
  filePath: string;
  content: string;
  lines: string[];
  ast: ts.SourceFile | undefined;
  targetDir: string;
  globalTools: ToolDeclaration[];
}

// Which files a Rule applies to.
//   "all"     — both source files (.ts/.tsx/.js/.jsx/etc.) and prose
//               (.md/.prompt). Used for spec, context, security, and the
//               legacy line-scan rules.
//   "source"  — source files only. Used for tool, execution, code-quality,
//               and verification families.
export type RuleApplicability = "all" | "source";

// Per-issue fix record before the orchestrator stamps a file path on it.
// Lifted out of FixResult so per-rule applyFix returns can stay
// file-path-blind (the orchestrator owns I/O).
export interface FixRecord {
  fixed: boolean;
  ruleId: string;
  message: string;
  /** Optional override file (e.g. for verification-missing-tests pointing at
   *  the scaffolded sibling test file rather than the source). */
  file?: string;
}

// A new sibling file (e.g. a scaffolded test) that the rule's applyFix wants
// the orchestrator to write to disk after the main content write.
export interface NewFile {
  path: string;
  content: string;
}

// What every Rule.applyFix returns:
//   content     possibly-transformed content of the input file
//   fixes       per-issue fix records; orchestrator stamps `file`
//   newFiles    optional new files to create alongside the input
export interface FixOutcome {
  content: string;
  fixes: FixRecord[];
  newFiles?: NewFile[];
}

// Public report shape — `file` is always set (the orchestrator stamps it).
export interface FixResult {
  file: string;
  fixed: boolean;
  ruleId: string;
  message: string;
}

export interface FixReport {
  fixes: FixResult[];
}

// Custom fixer contract — the user-facing extension point. Loaded from
// `.agentlintrc.json` `fixers` map and matched by ruleId. Same shape as
// Rule.applyFix.
export interface CustomFixer {
  fix(
    content: string,
    issues: AgentIssue[],
    filePath: string,
  ): Promise<FixOutcome> | FixOutcome;
}

// A self-contained module that detects one specific kind of issue and
// optionally knows how to fix it. Identified by `id` (which is also the
// `ruleId` carried by issues this Rule emits).
//
// `check` is the detector. `applyFix` (optional) is the fixer — receives only
// the issues this Rule emitted, transforms content, returns a FixOutcome.
// Rules are config-blind; the orchestrator handles config (drop "off",
// override severity).
export interface Rule {
  id: string;
  appliesTo: RuleApplicability;
  check(ctx: RuleContext): AgentIssue[];
  applyFix?(
    content: string,
    issues: AgentIssue[],
    filePath: string,
  ): FixOutcome;
}
