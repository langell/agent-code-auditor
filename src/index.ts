#!/usr/bin/env node
import { program } from "commander";
import chalk from "chalk";
import * as path from "path";
import { readFileSync } from "fs";
import { fileURLToPath } from "url";
import {
  runVulnerabilityScanner,
  runLinter,
  runASTAnalyzer,
} from "./scanners/index.js";
import { VulnerabilityReport } from "./scanners/vulnerabilities.js";
import { LinterReport } from "./scanners/linter.js";
import { AgentIssue } from "./scanners/types.js";
import { runFixer } from "./fixers/index.js";

import { loadConfig } from "./config.js";

function getCliVersion(): string {
  try {
    const currentFile = fileURLToPath(import.meta.url);
    const packageJsonPath = path.resolve(
      path.dirname(currentFile),
      "..",
      "package.json",
    );
    const packageJsonRaw = readFileSync(packageJsonPath, "utf8");
    const packageJson = JSON.parse(packageJsonRaw) as { version?: string };
    return packageJson.version || "0.0.0";
  } catch {
    return "0.0.0";
  }
}

program
  .name("agentlint")
  .description("Audit and fix AI-generated code issues.")
  .version(getCliVersion());

program
  .command("scan")
  .description("Scan the workspace for AI code smells and vulnerabilities.")
  .option("-d, --dir <directory>", "Directory to scan", ".")
  .option("-f, --format <format>", "Output format (text, csv)", "text")
  .action(async (options) => {
    const targetDir = path.resolve(process.cwd(), options.dir);
    const isText = options.format !== "csv";

    if (isText)
      console.log(chalk.blue(`\n🔍 Scanning directory: ${targetDir}\n`));

    // Load config
    const config = loadConfig(targetDir);
    if (isText)
      console.log(
        chalk.gray(
          `Loaded AgentLint config (Found ${Object.keys(config.rules).length} rule overrides)\n`,
        ),
      );

    // Gather Data
    const vuln = await runVulnerabilityScanner(targetDir);
    const lint = await runLinter(targetDir, false);
    const ast = await runASTAnalyzer(targetDir, config);

    // Output CSV
    if (options.format === "csv") {
      const escapeCSV = (str: string | number | null | undefined) =>
        `"${String(str).replace(/"/g, '""')}"`;
      console.log("Type,File,Line,Severity,Rule,Message,Suggestion");

      vuln.vulnerabilities.forEach((v) => {
        console.log(
          [
            "Vulnerability",
            "package.json",
            "-",
            v.severity,
            "npm-audit",
            v.package,
            v.suggestion,
          ]
            .map(escapeCSV)
            .join(","),
        );
      });

      lint.messages.forEach((result) => {
        const relativePath = path.relative(targetDir, result.filePath);
        result.messages.forEach((msg) => {
          const sevStr = msg.severity === 2 ? "error" : "warning";
          const suggestion = msg.fix
            ? "Auto-fix available via 'agentlint fix'."
            : `Review ESLint rule '${msg.ruleId}' to resolve this issue.`;
          console.log(
            [
              "Linter",
              relativePath,
              msg.line,
              sevStr,
              msg.ruleId || "",
              msg.message,
              suggestion,
            ]
              .map(escapeCSV)
              .join(","),
          );
        });
      });

      if (!lint.available) {
        console.log(
          [
            "Linter",
            "-",
            "-",
            "warning",
            "eslint-unavailable",
            lint.failureMessage ||
              "The target project's ESLint setup could not be executed.",
            "Run ESLint directly in the target project to fix its local configuration or dependency graph.",
          ]
            .map(escapeCSV)
            .join(","),
        );
      }

      ast.forEach((issue) => {
        console.log(
          [
            "AI Smell",
            issue.file,
            issue.line,
            issue.severity,
            issue.ruleId,
            issue.message,
            issue.suggestion || "",
          ]
            .map(escapeCSV)
            .join(","),
        );
      });
      return;
    }

    printReport(vuln, lint, ast);
  });

function printReport(
  vuln: VulnerabilityReport,
  lint: LinterReport,
  ast: AgentIssue[],
) {
  const divider = chalk.gray("=".repeat(80));
  const subDivider = chalk.gray("-".repeat(80));

  console.log(divider);
  console.log(chalk.bold("  AgentLint Report"));
  console.log(divider + "\n");

  // --- Vulnerabilities ---
  console.log(chalk.cyan.bold("📦 Vulnerability Scanner"));
  console.log(subDivider);
  if (vuln.issues > 0) {
    console.log(chalk.red(`  ❌ Issues: ${vuln.issues} (${vuln.details})\n`));
    vuln.vulnerabilities.forEach((v) => {
      console.log(`    • ${chalk.bold(v.package)} (${chalk.red(v.severity)})`);
      console.log(`      💡 ${chalk.italic("Suggestion:")} ${v.suggestion}`);
    });
    console.log();
  } else {
    console.log(chalk.green("  ✅ No vulnerability issues.\n"));
  }

  // --- Linter ---
  console.log(chalk.cyan.bold("🎨 Linter Engine"));
  console.log(subDivider);
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
  } else if (lint.errorCount > 0 || lint.warningCount > 0) {
    const errorStr =
      lint.errorCount > 0 ? chalk.red(`${lint.errorCount} Errors`) : `0 Errors`;
    const warnStr =
      lint.warningCount > 0
        ? chalk.yellow(`${lint.warningCount} Warnings`)
        : `0 Warnings`;
    console.log(`  ⚠️  ${errorStr}, ${warnStr}\n`);

    lint.messages.forEach((result) => {
      if (result.messages.length > 0) {
        const relativePath = result.filePath;
        console.log(chalk.bold(`  📄 File: ${relativePath}`));
        result.messages.forEach((msg) => {
          const icon =
            msg.severity === 2 ? chalk.red("❌") : chalk.yellow("⚠️ ");
          const color = msg.severity === 2 ? chalk.red : chalk.yellow;
          console.log(
            `    ${icon} ${color(`[Line ${msg.line}]`)} ${msg.message} ${chalk.gray(`(${msg.ruleId})`)}`,
          );
          if (msg.fix) {
            console.log(
              `      💡 ${chalk.italic("Suggestion:")} Auto-fix available via 'agentlint fix'.`,
            );
          } else {
            console.log(
              `      💡 ${chalk.italic("Suggestion:")} Review ESLint rule '${msg.ruleId}' to resolve this issue.`,
            );
          }
        });
        console.log();
      }
    });
  } else {
    console.log(chalk.green("  ✅ Code styling is clean.\n"));
  }

  // --- AST Categories ---
  const categories = [
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

  for (const cat of categories) {
    const catIssues = ast.filter((i) => i.category === cat.id);
    if (catIssues.length > 0) {
      console.log(chalk.cyan.bold(`${cat.icon} ${cat.title}`));
      console.log(subDivider);

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
        issues.forEach((issue) => {
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
        });
        console.log(); // blank line between files
      }
    }
  }

  if (ast.length === 0) {
    console.log(chalk.cyan.bold("🧠 Agentic Lint Rules"));
    console.log(subDivider);
    console.log(chalk.green("  ✅ No agentic smells found.\n"));
  }

  console.log(divider);
  const summaryColor =
    vuln.issues > 0 ||
    lint.errorCount > 0 ||
    ast.some((i) => i.severity === "error")
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

program
  .command("fix")
  .description("Automatically fix simple AI-generated code smells.")
  .option("-d, --dir <directory>", "Directory to fix", ".")
  .action(async (options) => {
    const targetDir = path.resolve(process.cwd(), options.dir);
    const config = loadConfig(targetDir);

    console.log(chalk.blue(`\n🛠️  Fixing directory: ${targetDir}\n`));

    console.log(chalk.yellow("Running Linter Auto-fix..."));
    await runLinter(targetDir, true);

    console.log(chalk.yellow("\nRunning Agentic Auto-fix..."));
    const initialIssues = await runASTAnalyzer(targetDir, config);
    const fixReport = await runFixer(targetDir, initialIssues, config);

    console.log(chalk.gray("=".repeat(80)));
    console.log(chalk.bold("  Auto-Fix Report"));
    console.log(chalk.gray("=".repeat(80)) + "\n");

    if (fixReport.fixes.length > 0) {
      fixReport.fixes.forEach((fix) => {
        console.log(
          `  🔧 ${chalk.cyan(fix.file)}: ${fix.message} ${chalk.gray(`(${fix.ruleId})`)}`,
        );
      });
      console.log(
        chalk.green(
          `\n  ✅ Applied ${fixReport.fixes.length} agentic smell fixes.\n`,
        ),
      );
    } else {
      console.log(chalk.green(`  ✅ No agentic smells could be auto-fixed.\n`));
    }

    console.log(
      chalk.blue("\nRe-scanning directory for remaining issues...\n"),
    );

    // Get final state
    const vuln = await runVulnerabilityScanner(targetDir);
    const finalLint = await runLinter(targetDir, false);
    const finalAST = await runASTAnalyzer(targetDir, config);

    // Print final audit report
    printReport(vuln, finalLint, finalAST);
  });

program.parse();
