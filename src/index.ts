#!/usr/bin/env node
import { program } from "commander";
import chalk from "chalk";
import * as path from "path";
import { readFileSync } from "fs";
import { fileURLToPath } from "url";
import {
  vulnerabilityScanner,
  linterScanner,
  astScanner,
  runLinter,
} from "./scanners/index.js";
import { runFixer } from "./fix-orchestrator.js";
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
    const ctx = { targetDir, config };

    if (isText) printScanHeader(targetDir, config);

    const vuln = await vulnerabilityScanner.run(ctx);
    const lint = await linterScanner.run(ctx);
    const ast = await astScanner.run(ctx);

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
    const ctx = { targetDir, config };

    printFixHeader(targetDir);

    console.log(chalk.yellow("Running Linter Auto-fix..."));
    // Linter fix-mode is a side-effect operation, not a scan, so it
    // doesn't go through the Scanner abstraction.
    await runLinter(targetDir, true);

    console.log(chalk.yellow("\nRunning Agentic Auto-fix..."));
    const initialIssues = await astScanner.run(ctx);
    const fixReport = await runFixer(targetDir, initialIssues, config);

    printFixReport(fixReport);

    console.log(
      chalk.blue("\nRe-scanning directory for remaining issues...\n"),
    );

    const vuln = await vulnerabilityScanner.run(ctx);
    const finalLint = await linterScanner.run(ctx);
    const finalAST = await astScanner.run(ctx);

    printScanReport(vuln, finalLint, finalAST);
  });

program.parse();
