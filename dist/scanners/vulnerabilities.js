import { exec } from "child_process";
import { promisify } from "util";
import * as fs from "fs";
import * as path from "path";
const execAsync = promisify(exec);
export async function runVulnerabilityScanner(dir) {
    const pnpmLockPath = path.join(dir, "pnpm-lock.yaml");
    const yarnLockPath = path.join(dir, "yarn.lock");
    const packageLockPath = path.join(dir, "package-lock.json");
    let resultStdout = "";
    try {
        if (fs.existsSync(pnpmLockPath)) {
            resultStdout = (await execAsync("pnpm audit --json", { cwd: dir }))
                .stdout;
        }
        else if (fs.existsSync(yarnLockPath)) {
            resultStdout = (await execAsync("yarn audit --json", { cwd: dir }))
                .stdout;
        }
        else if (fs.existsSync(packageLockPath)) {
            const { stdout } = await execAsync("npm audit --json", { cwd: dir });
            resultStdout = stdout;
        }
        else {
            return {
                issues: 0,
                details: "No lockfile found. Skipping vulnerability scan.",
                vulnerabilities: [],
            };
        }
    }
    catch (err) {
        resultStdout = err.stdout || "{}";
    }
    if (resultStdout) {
        try {
            const result = JSON.parse(resultStdout);
            // Different package managers might have different JSON output structures
            const vulnerabilitiesObj = result.metadata?.vulnerabilities || result.vulnerabilities || {};
            const totalIssues = Object.values(vulnerabilitiesObj).reduce((a, b) => a + (typeof b === "number" ? b : 0), 0);
            const vulnerabilitiesList = [];
            if (result.vulnerabilities &&
                typeof result.vulnerabilities === "object") {
                for (const [pkgName, vulnData] of Object.entries(result.vulnerabilities)) {
                    if (typeof vulnData === "object" && vulnData !== null) {
                        vulnerabilitiesList.push({
                            package: pkgName,
                            severity: vulnData.severity || "unknown",
                            suggestion: `Update '${pkgName}' to a secure version. Run 'npm audit fix' or update manually.`,
                        });
                    }
                }
            }
            return {
                issues: totalIssues,
                details: totalIssues > 0
                    ? `Found ${totalIssues} vulnerability/vulnerabilities.`
                    : "No known vulnerabilities found.",
                vulnerabilities: vulnerabilitiesList,
            };
        }
        catch (e) {
            // ignore parsing error
        }
    }
    return {
        issues: 0,
        details: "Failed to run vulnerability scan.",
        vulnerabilities: [],
    };
}
