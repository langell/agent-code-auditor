import { createRequire } from "node:module";
import * as path from "node:path";
import { ESLint } from "eslint";

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
    };
  } catch (error) {
    console.error(
      "ESLint scanning failed. The target project may have a missing or incompatible ESLint setup.",
      error,
    );
    return { errorCount: 0, warningCount: 0, messages: [] };
  }
}
