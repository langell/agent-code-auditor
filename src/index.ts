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
import { runFixer } from "./fixers/index.js";
import { loadConfig } from "./config.js";
import {
  printCsvReport,
  printScanHeader,
  printScanReport,
  printFixHeader,
  printFixReport,
} from "./report/index.js";

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
    const config = loadConfig(targetDir);
    const isText = options.format !== "csv";

    if (isText) printScanHeader(targetDir, config);

    const vuln = await runVulnerabilityScanner(targetDir);
    const lint = await runLinter(targetDir, false);
    const ast = await runASTAnalyzer(targetDir, config);

    if (options.format === "csv") {
      printCsvReport(vuln, lint, ast, targetDir);
      return;
    }

    printScanReport(vuln, lint, ast);
  });

program
  .command("fix")
  .description("Automatically fix simple AI-generated code smells.")
  .option("-d, --dir <directory>", "Directory to fix", ".")
  .action(async (options) => {
    const targetDir = path.resolve(process.cwd(), options.dir);
    const config = loadConfig(targetDir);

    printFixHeader(targetDir);

    console.log(chalk.yellow("Running Linter Auto-fix..."));
    await runLinter(targetDir, true);

    console.log(chalk.yellow("\nRunning Agentic Auto-fix..."));
    const initialIssues = await runASTAnalyzer(targetDir, config);
    const fixReport = await runFixer(targetDir, initialIssues, config);

    printFixReport(fixReport);

    console.log(
      chalk.blue("\nRe-scanning directory for remaining issues...\n"),
    );

    const vuln = await runVulnerabilityScanner(targetDir);
    const finalLint = await runLinter(targetDir, false);
    const finalAST = await runASTAnalyzer(targetDir, config);

    printScanReport(vuln, finalLint, finalAST);
  });

program.parse();
