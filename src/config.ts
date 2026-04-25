import * as fs from "fs";
import * as path from "path";

export interface AgentLintConfig {
  rules: {
    "no-placeholder-comments"?: "error" | "warn" | "off";
    "no-insecure-renders"?: "error" | "warn" | "off";
    "no-hallucinated-imports"?: "error" | "warn" | "off";
    "spec-missing-acceptance-criteria"?: "error" | "warn" | "off";
    "context-oversized"?: "error" | "warn" | "off";
    "tool-overlapping"?: "error" | "warn" | "off";
    "tool-weak-schema"?: "error" | "warn" | "off";
    "security-prompt-injection"?: "error" | "warn" | "off";
    "security-excessive-privileges"?: "error" | "warn" | "off";
    "security-destructive-action"?: "error" | "warn" | "off";
    "execution-missing-max-steps"?: "error" | "warn" | "off";
    "verification-missing-tests"?: "error" | "warn" | "off";
    "security-secret-leakage"?: "error" | "warn" | "off";
    "code-quality-no-any"?: "error" | "warn" | "off";
    "security-input-validation"?: "error" | "warn" | "off";
    "architecture-atomic-transactions"?: "error" | "warn" | "off";
    "spec-missing-rollback"?: "error" | "warn" | "off";
    "security-ignore-instructions"?: "error" | "warn" | "off";
    "tool-missing-examples"?: "error" | "warn" | "off";
    "execution-no-dry-run"?: "error" | "warn" | "off";
    "observability-missing-trace-id"?: "error" | "warn" | "off";
    "context-unredacted-pii"?: "error" | "warn" | "off";
    [key: string]: "error" | "warn" | "off" | undefined;
  };
}

export const defaultConfig: AgentLintConfig = {
  rules: {
    "no-placeholder-comments": "error",
    "no-insecure-renders": "error",
    "no-hallucinated-imports": "error",
    "spec-missing-acceptance-criteria": "warn",
    "context-oversized": "warn",
    "tool-overlapping": "error",
    "tool-weak-schema": "error",
    "security-prompt-injection": "error",
    "security-excessive-privileges": "warn",
    "security-destructive-action": "error",
    "execution-missing-max-steps": "warn",
    "verification-missing-tests": "warn",
    "security-secret-leakage": "error",
    "code-quality-no-any": "error",
    "security-input-validation": "error",
    "architecture-atomic-transactions": "error",
    "spec-missing-rollback": "warn",
    "security-ignore-instructions": "error",
    "tool-missing-examples": "warn",
    "execution-no-dry-run": "error",
    "observability-missing-trace-id": "warn",
    "context-unredacted-pii": "error",
  },
};

export function loadConfig(targetDir: string): AgentLintConfig {
  const configPath = path.join(targetDir, ".agentlintrc.json");

  if (fs.existsSync(configPath)) {
    try {
      const userConfig = JSON.parse(fs.readFileSync(configPath, "utf8"));
      return {
        ...defaultConfig,
        rules: { ...defaultConfig.rules, ...(userConfig.rules || {}) },
      };
    } catch {
      console.warn("Failed to parse .agentlintrc.json. Using default config.");
    }
  }

  return defaultConfig;
}
