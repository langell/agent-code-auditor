import * as fs from "fs";
import * as path from "path";

type RuleLevel = "error" | "warn" | "off";

export interface CustomFixerReference {
  path: string;
  exportName?: string;
}

type CustomFixerConfigValue = string | CustomFixerReference;

export interface CustomRuleReference {
  path: string;
  exportName?: string;
}

export type CustomRuleConfigValue = string | CustomRuleReference;

export interface AgentLintConfig {
  skipRules?: string[];
  fixers?: Record<string, CustomFixerConfigValue>;
  // List of module references that export a Rule object. Loaded by both
  // orchestrators at startup and merged into the registry. If a custom Rule's
  // `id` matches a built-in or a previously-loaded custom Rule, the latest
  // loaded wins with a warning logged. See README "Custom rules".
  customRules?: CustomRuleConfigValue[];
  rules: {
    "no-placeholder-comments"?: RuleLevel;
    "no-insecure-renders"?: RuleLevel;
    "no-hallucinated-imports"?: RuleLevel;
    "spec-missing-acceptance-criteria"?: RuleLevel;
    "context-oversized"?: RuleLevel;
    "tool-overlapping"?: RuleLevel;
    "tool-weak-schema"?: RuleLevel;
    "security-prompt-injection"?: RuleLevel;
    "security-excessive-privileges"?: RuleLevel;
    "security-destructive-action"?: RuleLevel;
    "execution-missing-max-steps"?: RuleLevel;
    "verification-missing-tests"?: RuleLevel;
    "security-secret-leakage"?: RuleLevel;
    "code-quality-no-any"?: RuleLevel;
    "security-input-validation"?: RuleLevel;
    "architecture-atomic-transactions"?: RuleLevel;
    "spec-missing-rollback"?: RuleLevel;
    "security-ignore-instructions"?: RuleLevel;
    "tool-missing-examples"?: RuleLevel;
    "execution-no-dry-run"?: RuleLevel;
    "observability-missing-trace-id"?: RuleLevel;
    "context-unredacted-pii"?: RuleLevel;
    [key: string]: RuleLevel | undefined;
  };
}

export const defaultConfig: AgentLintConfig = {
  skipRules: [],
  fixers: {},
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
      const skipRules = Array.isArray(userConfig.skipRules)
        ? userConfig.skipRules.filter(
            (rule: unknown) => typeof rule === "string",
          )
        : [];

      const fixers =
        userConfig.fixers && typeof userConfig.fixers === "object"
          ? (userConfig.fixers as Record<string, CustomFixerConfigValue>)
          : {};

      const customRules: CustomRuleConfigValue[] = Array.isArray(
        userConfig.customRules,
      )
        ? userConfig.customRules.filter(
            (entry: unknown): entry is CustomRuleConfigValue =>
              typeof entry === "string" ||
              (typeof entry === "object" &&
                entry !== null &&
                typeof (entry as { path?: unknown }).path === "string"),
          )
        : [];

      const mergedRules = {
        ...defaultConfig.rules,
        ...(userConfig.rules || {}),
      };

      for (const skippedRule of skipRules) {
        mergedRules[skippedRule] = "off";
      }

      return {
        ...defaultConfig,
        ...userConfig,
        skipRules,
        fixers,
        customRules,
        rules: mergedRules,
      };
    } catch {
      console.warn("Failed to parse .agentlintrc.json. Using default config.");
    }
  }

  return defaultConfig;
}
