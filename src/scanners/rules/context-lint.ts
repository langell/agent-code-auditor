import * as fs from "fs";
import * as path from "path";
import { AgentLintConfig } from "../../config.js";
import { AgentIssue } from "../types.js";

export function checkContextRules(
  file: string,
  lines: string[],
  config: AgentLintConfig,
): AgentIssue[] {
  const issues: AgentIssue[] = [];
  if (config.rules["context-oversized"] === "off") return issues;

  // Basic check for oversized context injections or bloated files.
  // Flag very long string literals or large context aggregations.
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (
      line.length > 5000 &&
      (line.includes("`") || line.includes('"') || line.includes("'"))
    ) {
      issues.push({
        file,
        line: i + 1,
        message: "Oversized hardcoded context or noisy string block detected.",
        ruleId: "context-oversized",
        severity: config.rules["context-oversized"] || "warn",
        suggestion:
          "Extract large context blocks to separate documents and ensure relevance via RAG or strict filtering.",
        category: "Context",
      });
    }
  }

  // 2. Missing Trace IDs
  if (config.rules["observability-missing-trace-id"] !== "off") {
    const content = lines.join("\n");
    if (/new Agent\(|Agent\.init/.test(content)) {
      if (!/traceId|runId|sessionId|correlationId/i.test(content)) {
        issues.push({
          file,
          line: 1,
          message:
            "Agent initialization found without an explicit Trace ID or Run ID.",
          ruleId: "observability-missing-trace-id",
          severity: config.rules["observability-missing-trace-id"] || "warn",
          suggestion:
            "Ensure a traceId or runId is passed into the agent context for observability and debugging.",
          category: "Context",
        });
      }
    }
  }

  return issues;
}
