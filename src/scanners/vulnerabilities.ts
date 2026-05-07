import { exec } from "child_process";
import { promisify } from "util";
import * as fs from "fs";
import * as path from "path";
import type { AgentIssue, Scanner } from "./types.js";

const execAsync = promisify(exec);

export interface VulnerabilityIssue {
  package: string;
  severity: string;
  suggestion: string;
}

export interface VulnerabilityReport {
  issues: number;
  details: string;
  vulnerabilities: VulnerabilityIssue[];
}

type VulnerabilitySeverity = {
  severity?: string;
};

type AuditJson = {
  metadata?: {
    vulnerabilities?: Record<string, number>;
  };
  vulnerabilities?: Record<string, VulnerabilitySeverity | number>;
};

export async function runVulnerabilityScanner(
  dir: string,
): Promise<VulnerabilityReport> {
  const pnpmLockPath = path.join(dir, "pnpm-lock.yaml");
  const yarnLockPath = path.join(dir, "yarn.lock");
  const packageLockPath = path.join(dir, "package-lock.json");

  let resultStdout: string | undefined;
  try {
    if (fs.existsSync(pnpmLockPath)) {
      resultStdout = (await execAsync("pnpm audit --json", { cwd: dir }))
        .stdout;
    } else if (fs.existsSync(yarnLockPath)) {
      resultStdout = (await execAsync("yarn audit --json", { cwd: dir }))
        .stdout;
    } else if (fs.existsSync(packageLockPath)) {
      const { stdout } = await execAsync("npm audit --json", { cwd: dir });
      resultStdout = stdout;
    } else {
      return {
        issues: 0,
        details: "No lockfile found. Skipping vulnerability scan.",
        vulnerabilities: [],
      };
    }
  } catch (err: unknown) {
    const errWithStdout = err as { stdout?: string };
    resultStdout = errWithStdout.stdout || "{}";
  }

  if (resultStdout) {
    try {
      const result = JSON.parse(resultStdout) as AuditJson;
      // Different package managers might have different JSON output structures
      const vulnerabilitiesObj =
        result.metadata?.vulnerabilities || result.vulnerabilities || {};
      const vulnerabilityCounts = Object.values(vulnerabilitiesObj).filter(
        (value): value is number => typeof value === "number",
      );
      const totalIssues = vulnerabilityCounts.reduce(
        (acc, value) => acc + value,
        0,
      );

      const vulnerabilitiesList: VulnerabilityIssue[] = [];
      if (
        result.vulnerabilities &&
        typeof result.vulnerabilities === "object"
      ) {
        for (const [pkgName, vulnData] of Object.entries(
          result.vulnerabilities,
        )) {
          if (typeof vulnData === "object" && vulnData !== null) {
            const vulnSeverity = (vulnData as VulnerabilitySeverity).severity;
            vulnerabilitiesList.push({
              package: pkgName,
              severity: vulnSeverity || "unknown",
              suggestion: `Update '${pkgName}' to a secure version. Run 'npm audit fix' or update manually.`,
            });
          }
        }
      }

      return {
        issues: totalIssues,
        details:
          totalIssues > 0
            ? `Found ${totalIssues} vulnerability/vulnerabilities.`
            : "No known vulnerabilities found.",
        vulnerabilities: vulnerabilitiesList,
      };
    } catch {
      // ignore parsing error
    }
  }

  return {
    issues: 0,
    details: "Failed to run vulnerability scan.",
    vulnerabilities: [],
  };
}

// Map an npm-audit severity string to the AgentIssue severity enum.
// `critical` and `high` are errors; everything else (moderate, low, info)
// is a warning. Unknown severities default to warn so they're at least
// surfaced.
function mapVulnerabilitySeverity(severity: string): AgentIssue["severity"] {
  return severity === "critical" || severity === "high" ? "error" : "warn";
}

// Scanner-shaped wrapper around runVulnerabilityScanner. Both forms remain
// exported during the transition; the Scanner shape is preferred for new
// callers and the eventual programmatic API surface.
export const vulnerabilityScanner: Scanner<VulnerabilityReport> = {
  name: "vulnerability",
  run(ctx) {
    return runVulnerabilityScanner(ctx.targetDir);
  },
  toIssues(report) {
    return report.vulnerabilities.map((v) => ({
      file: "package.json",
      line: 1,
      message: `Dependency '${v.package}' has a known ${v.severity} vulnerability.`,
      ruleId: "security-vulnerable-dependency",
      severity: mapVulnerabilitySeverity(v.severity),
      suggestion: v.suggestion,
      category: "Security",
    }));
  },
};
