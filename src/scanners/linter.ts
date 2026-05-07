import { createRequire } from "node:module";
import * as path from "node:path";
import { ESLint } from "eslint";
import type { AgentIssue, Scanner } from "./types.js";

type LintMessage = {
  severity: number;
  line?: number;
  ruleId?: string | null;
  message: string;
  fix?: unknown;
};

type LintResultLike = {
  filePath: string;
  errorCount: number;
  warningCount: number;
  messages: LintMessage[];
};

type ESLintLike = {
  lintFiles(patterns: string[]): Promise<LintResultLike[]>;
};

type ESLintConstructor = {
  new (options: { cwd: string; fix: boolean }): ESLintLike;
  outputFixes?(results: LintResultLike[]): Promise<void>;
};

const lintPatterns = ["**/*.js", "**/*.ts", "**/*.jsx", "**/*.tsx"];

function formatLinterError(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }

  return String(error);
}

function resolveESLint(dir: string): ESLintConstructor {
  try {
    const projectRequire = createRequire(path.join(dir, "__agentlint__.cjs"));
    const eslintModule = projectRequire("eslint");
    const resolvedESLint =
      eslintModule?.ESLint ??
      eslintModule?.default?.ESLint ??
      eslintModule?.default;

    if (typeof resolvedESLint === "function") {
      return resolvedESLint as ESLintConstructor;
    }
  } catch {
    // Fall back to the bundled ESLint when the target project does not provide one.
  }

  return ESLint as unknown as ESLintConstructor;
}

export interface LinterReport {
  errorCount: number;
  warningCount: number;
  messages: LintResultLike[];
  available: boolean;
  failureMessage?: string;
}

export async function runLinter(
  dir: string,
  fix: boolean = false,
): Promise<LinterReport> {
  const ESLintClass = resolveESLint(dir);
  const eslint = new ESLintClass({
    cwd: dir,
    fix: fix,
  });

  try {
    const results = await eslint.lintFiles(lintPatterns);

    if (fix && typeof ESLintClass.outputFixes === "function") {
      await ESLintClass.outputFixes(results);
    }

    const errorCount = results.reduce(
      (acc, result) => acc + result.errorCount,
      0,
    );
    const warningCount = results.reduce(
      (acc, result) => acc + result.warningCount,
      0,
    );

    return {
      errorCount,
      warningCount,
      messages: results.filter((r) => r.errorCount > 0 || r.warningCount > 0),
      available: true,
    };
  } catch (error) {
    return {
      errorCount: 0,
      warningCount: 0,
      messages: [],
      available: false,
      failureMessage: formatLinterError(error),
    };
  }
}

// Scanner-shaped wrapper for the read-only lint pass. The fix-mode call
// (`runLinter(dir, true)`) stays out of the Scanner abstraction because
// fix-mode is a side-effect operation, not a scan, and it's only invoked
// from the `agentlint fix` command path.
export const linterScanner: Scanner<LinterReport> = {
  name: "linter",
  run(ctx) {
    return runLinter(ctx.targetDir, false);
  },
  toIssues(report) {
    if (!report.available) {
      // Surface the linter's failure as a single workspace-level issue so
      // library consumers walking the unified stream don't silently miss
      // the fact that ESLint couldn't run.
      return [
        {
          file: "-",
          line: 1,
          message:
            report.failureMessage ||
            "The target project's ESLint setup could not be executed.",
          ruleId: "eslint-unavailable",
          severity: "warn",
          suggestion:
            "Run ESLint directly in the target project to fix its local configuration or dependency graph.",
          category: "Code Quality",
        },
      ];
    }

    const issues: AgentIssue[] = [];
    for (const result of report.messages) {
      for (const msg of result.messages) {
        issues.push({
          file: result.filePath,
          line: msg.line ?? 1,
          message: msg.message,
          ruleId: msg.ruleId ? `eslint:${msg.ruleId}` : "eslint:unknown",
          severity: msg.severity === 2 ? "error" : "warn",
          suggestion: msg.fix
            ? "Auto-fix available via 'agentlint fix'."
            : msg.ruleId
              ? `Review ESLint rule '${msg.ruleId}' to resolve this issue.`
              : undefined,
          category: "Code Quality",
        });
      }
    }
    return issues;
  },
};
