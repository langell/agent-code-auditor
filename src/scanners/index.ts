export * from "./vulnerabilities.js";
export * from "./linter.js";
export * from "./ast-analyzer.js";

import { vulnerabilityScanner } from "./vulnerabilities.js";
import { linterScanner } from "./linter.js";
import { astScanner } from "./ast-analyzer.js";
import type { AgentIssue, Scanner, ScannerContext } from "./types.js";

// The full set of built-in scanners, in the order they appear in scan
// reports. Custom integrations can compose this with their own
// `Scanner<T>` instances.
export const scanners: ReadonlyArray<Scanner<unknown>> = [
  vulnerabilityScanner as Scanner<unknown>,
  linterScanner as Scanner<unknown>,
  astScanner as Scanner<unknown>,
];

// Run a scanner and adapt its output to the canonical `AgentIssue[]`
// stream. Convenience helper for library consumers that want a single
// flat issue list rather than per-scanner native shapes.
export async function collectIssues<T>(
  scanner: Scanner<T>,
  ctx: ScannerContext,
): Promise<AgentIssue[]> {
  const report = await scanner.run(ctx);
  return scanner.toIssues(report);
}

// Run every built-in scanner against `ctx` in parallel and return one
// flat `AgentIssue[]`. Order matches `scanners` (vulnerability, linter,
// ast). The reporter still uses the per-scanner native shapes for
// formatting; this is the unified path for embedding agentlint as a
// library.
export async function collectAllIssues(
  ctx: ScannerContext,
): Promise<AgentIssue[]> {
  const results = await Promise.all([
    collectIssues(vulnerabilityScanner, ctx),
    collectIssues(linterScanner, ctx),
    collectIssues(astScanner, ctx),
  ]);
  return results.flat();
}
