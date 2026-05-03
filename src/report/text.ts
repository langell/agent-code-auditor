import chalk from "chalk";
import { AgentLintConfig } from "../config.js";
import { VulnerabilityReport } from "../scanners/vulnerabilities.js";
import { LinterReport } from "../scanners/linter.js";
import { AgentIssue } from "../scanners/types.js";
import { FixReport } from "../rules/types.js";

const DIVIDER = chalk.gray("=".repeat(80));
const SUB_DIVIDER = chalk.gray("-".repeat(80));

const AST_CATEGORIES: ReadonlyArray<{
  id: AgentIssue["category"];
  icon: string;
  title: string;
}> = [
  { id: "Code Quality", icon: "✨", title: "Code Quality Lint" },
  { id: "Spec", icon: "📋", title: "Spec Lint" },
  { id: "Context", icon: "📚", title: "Context Lint" },
  { id: "Tool", icon: "🛠️ ", title: "Tool/MCP Lint" },
  { id: "Execution Safety", icon: "⚙️ ", title: "Execution Safety Lint" },
  { id: "Execution", icon: "⚙️ ", title: "Execution Lint" },
  { id: "Security", icon: "🔒", title: "Security Lint" },
  {
    id: "Verification/Security",
    icon: "🛡️ ",
    title: "Verification & Security Lint",
  },
];

export function printScanHeader(
  targetDir: string,
  config: AgentLintConfig,
): void {
  console.log(chalk.blue(`\n🔍 Scanning directory: ${targetDir}\n`));
  console.log(
    chalk.gray(
      `Loaded AgentLint config (Found ${Object.keys(config.rules).length} rule overrides)\n`,
    ),
  );
}

export function printFixHeader(targetDir: string): void {
  console.log(chalk.blue(`\n🛠️  Fixing directory: ${targetDir}\n`));
}

export function printFixReport(report: FixReport): void {
  console.log(DIVIDER);
  console.log(chalk.bold("  Auto-Fix Report"));
  console.log(DIVIDER + "\n");

  if (report.fixes.length === 0) {
    console.log(chalk.green(`  ✅ No agentic smells could be auto-fixed.\n`));
    return;
  }

  for (const fix of report.fixes) {
    console.log(
      `  🔧 ${chalk.cyan(fix.file)}: ${fix.message} ${chalk.gray(`(${fix.ruleId})`)}`,
    );
  }
  console.log(
    chalk.green(`\n  ✅ Applied ${report.fixes.length} agentic smell fixes.\n`),
  );
}

export function printScanReport(
  vuln: VulnerabilityReport,
  lint: LinterReport,
  ast: AgentIssue[],
): void {
  console.log(DIVIDER);
  console.log(chalk.bold("  AgentLint Report"));
  console.log(DIVIDER + "\n");

  printVulnerabilities(vuln);
  printLinter(lint);
  printAst(ast);
  printSummary(vuln, lint, ast);
}

function printVulnerabilities(vuln: VulnerabilityReport): void {
  console.log(chalk.cyan.bold("📦 Vulnerability Scanner"));
  console.log(SUB_DIVIDER);

  if (vuln.issues === 0) {
    console.log(chalk.green("  ✅ No vulnerability issues.\n"));
    return;
  }

  console.log(chalk.red(`  ❌ Issues: ${vuln.issues} (${vuln.details})\n`));
  for (const v of vuln.vulnerabilities) {
    console.log(`    • ${chalk.bold(v.package)} (${chalk.red(v.severity)})`);
    console.log(`      💡 ${chalk.italic("Suggestion:")} ${v.suggestion}`);
  }
  console.log();
}

function printLinter(lint: LinterReport): void {
  console.log(chalk.cyan.bold("🎨 Linter Engine"));
  console.log(SUB_DIVIDER);

  if (!lint.available) {
    console.log(
      chalk.red(
        `  ❌ Linter could not run: ${lint.failureMessage || "The target project's ESLint setup is incompatible or missing."}`,
      ),
    );
    console.log(chalk.gray("  Fix the target repo, then rerun agentlint:"));
    console.log(
      chalk.gray(
        "    1. Run 'pnpm exec eslint .' in the target repo to reproduce the local ESLint failure.",
      ),
    );
    console.log(
      chalk.gray(
        "    2. Reinstall that repo's dependencies with 'pnpm install' after clearing stale node_modules if needed.",
      ),
    );
    console.log(
      chalk.gray(
        "    3. Align incompatible ESLint, parser, and plugin versions in that repo before rerunning the scan.\n",
      ),
    );
    return;
  }

  if (lint.errorCount === 0 && lint.warningCount === 0) {
    console.log(chalk.green("  ✅ Code styling is clean.\n"));
    return;
  }

  const errorStr =
    lint.errorCount > 0 ? chalk.red(`${lint.errorCount} Errors`) : `0 Errors`;
  const warnStr =
    lint.warningCount > 0
      ? chalk.yellow(`${lint.warningCount} Warnings`)
      : `0 Warnings`;
  console.log(`  ⚠️  ${errorStr}, ${warnStr}\n`);

  for (const result of lint.messages) {
    if (result.messages.length === 0) continue;

    console.log(chalk.bold(`  📄 File: ${result.filePath}`));
    for (const msg of result.messages) {
      const icon = msg.severity === 2 ? chalk.red("❌") : chalk.yellow("⚠️ ");
      const color = msg.severity === 2 ? chalk.red : chalk.yellow;
      console.log(
        `    ${icon} ${color(`[Line ${msg.line}]`)} ${msg.message} ${chalk.gray(`(${msg.ruleId})`)}`,
      );
      console.log(
        `      💡 ${chalk.italic("Suggestion:")} ${
          msg.fix
            ? "Auto-fix available via 'agentlint fix'."
            : `Review ESLint rule '${msg.ruleId}' to resolve this issue.`
        }`,
      );
    }
    console.log();
  }
}

function printAst(ast: AgentIssue[]): void {
  for (const cat of AST_CATEGORIES) {
    const catIssues = ast.filter((i) => i.category === cat.id);
    if (catIssues.length === 0) continue;

    console.log(chalk.cyan.bold(`${cat.icon} ${cat.title}`));
    console.log(SUB_DIVIDER);

    const grouped = catIssues.reduce(
      (acc: Record<string, AgentIssue[]>, issue) => {
        if (!acc[issue.file]) acc[issue.file] = [];
        acc[issue.file].push(issue);
        return acc;
      },
      {},
    );

    for (const [file, issues] of Object.entries(grouped)) {
      console.log(chalk.bold(`  📄 File: ${file}`));
      for (const issue of issues) {
        const icon =
          issue.severity === "error" ? chalk.red("❌") : chalk.yellow("⚠️ ");
        const color = issue.severity === "error" ? chalk.red : chalk.yellow;
        console.log(
          `    ${icon} ${color(`[Line ${issue.line}]`)} ${issue.message} ${chalk.gray(`(${issue.ruleId})`)}`,
        );
        if (issue.suggestion) {
          console.log(
            `      💡 ${chalk.italic("Suggestion:")} ${issue.suggestion}`,
          );
        }
      }
      console.log(); // blank line between files
    }
  }

  if (ast.length === 0) {
    console.log(chalk.cyan.bold("🧠 Agentic Lint Rules"));
    console.log(SUB_DIVIDER);
    console.log(chalk.green("  ✅ No agentic smells found.\n"));
  }
}

function printSummary(
  vuln: VulnerabilityReport,
  lint: LinterReport,
  ast: AgentIssue[],
): void {
  console.log(DIVIDER);

  const hasErrors =
    vuln.issues > 0 ||
    lint.errorCount > 0 ||
    ast.some((i) => i.severity === "error");
  const summaryColor = hasErrors
    ? chalk.red
    : !lint.available
      ? chalk.yellow
      : chalk.green;
  const summaryPrefix = lint.available ? "✅" : "⚠️";
  const linterSummary = lint.available
    ? `${lint.errorCount} lint errors, ${lint.warningCount} lint warnings`
    : "linter unavailable";

  console.log(
    summaryColor(
      `${summaryPrefix} Scan complete. Found ${vuln.issues} vulnerabilities, ${linterSummary}, and ${ast.length} agentic smells.\n`,
    ),
  );
}
