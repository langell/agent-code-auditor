import { exec } from "child_process";
import { promisify } from "util";
import * as fs from "fs";
import * as path from "path";

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
      const totalIssues = Object.values(vulnerabilitiesObj).reduce(
        (acc, value) => acc + (typeof value === "number" ? value : 0),
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
