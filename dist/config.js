import * as fs from "fs";
import * as path from "path";
export const defaultConfig = {
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
export function loadConfig(targetDir) {
    const configPath = path.join(targetDir, ".agentlintrc.json");
    if (fs.existsSync(configPath)) {
        try {
            const userConfig = JSON.parse(fs.readFileSync(configPath, "utf8"));
            return {
                ...defaultConfig,
                rules: { ...defaultConfig.rules, ...(userConfig.rules || {}) },
            };
        }
        catch (e) {
            console.warn("Failed to parse .agentlintrc.json. Using default config.");
        }
    }
    return defaultConfig;
}
