export function checkSecurityRules(file, lines, config) {
    const issues = [];
    for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        // 1. Secret Leakage
        if (config.rules["security-secret-leakage"] !== "off") {
            if (/sk-[a-zA-Z0-9]{32,}/.test(line) || /xoxb-[0-9]{10,}/.test(line)) {
                issues.push({
                    file,
                    line: i + 1,
                    message: "Potential secret/API key exposed in code or config.",
                    ruleId: "security-secret-leakage",
                    severity: config.rules["security-secret-leakage"] || "error",
                    suggestion: "Remove hardcoded secrets and use environment variables or a secret manager.",
                    category: "Security",
                });
            }
        }
        // 2. Prompt Injection (basic heuristic: eval or unsanitized template injection)
        if (config.rules["security-prompt-injection"] !== "off") {
            if (line.includes("eval(") ||
                (line.includes("`") &&
                    line.includes("${") &&
                    line.includes("toolOutput"))) {
                issues.push({
                    file,
                    line: i + 1,
                    message: "Potential prompt injection: unsanitized output used in prompt or execution.",
                    ruleId: "security-prompt-injection",
                    severity: config.rules["security-prompt-injection"] || "error",
                    suggestion: "Implement strict boundaries between tool outputs and prompt instructions. Sanitize outputs.",
                    category: "Security",
                });
            }
        }
        // 3. Destructive Action
        if (config.rules["security-destructive-action"] !== "off") {
            if (line.includes("fs.writeFileSync") ||
                line.includes("child_process.exec")) {
                // A naive check: does the file mention "confirm" or "approve"?
                if (!lines.join("\n").includes("confirm") &&
                    !lines.join("\n").includes("approve")) {
                    issues.push({
                        file,
                        line: i + 1,
                        message: "Destructive action (file write/shell exec) without confirmation step.",
                        ruleId: "security-destructive-action",
                        severity: config.rules["security-destructive-action"] || "error",
                        suggestion: "Require a human approval step or explicit boundaries before executing mutating commands.",
                        category: "Execution Safety", // Fits in execution safety as well
                    });
                }
            }
        }
        // 4. Missing Input Validation (Server Actions / APIs)
        if (config.rules["security-input-validation"] !== "off") {
            // Heuristic: If file is in api or actions directory, and we see exported functions that take args
            // but no z.object, .parse, or similar validation tokens.
            if (file.includes("/api/") || file.includes("/actions/")) {
                const content = lines.join("\n");
                if (content.includes("export async function") ||
                    content.includes("export function")) {
                    if (!content.includes(".parse(") &&
                        !content.includes("z.object") &&
                        !content.includes("validate(")) {
                        // To avoid flagging multiple times, just add it once at line 1 if the file looks like an endpoint without validation
                        if (i === 0) {
                            issues.push({
                                file,
                                line: 1,
                                message: "API route or Server Action appears to be missing input validation.",
                                ruleId: "security-input-validation",
                                severity: config.rules["security-input-validation"] || "error",
                                suggestion: "Sanitize and validate all user inputs before processing. Use a schema validation library like Zod.",
                                category: "Security",
                            });
                        }
                    }
                }
            }
        }
        // 5. Unredacted PII
        if (config.rules["context-unredacted-pii"] !== "off") {
            if (/(user|customer|patient)(Data|Object|Record)\s*=/.test(line) &&
                !lines
                    .slice(Math.max(0, i), Math.min(lines.length, i + 10))
                    .some((l) => l.includes("redact") || l.includes("sanitize"))) {
                issues.push({
                    file,
                    line: i + 1,
                    message: "Potential unredacted user data being processed.",
                    ruleId: "context-unredacted-pii",
                    severity: config.rules["context-unredacted-pii"] || "error",
                    suggestion: "Ensure user records or PII are redacted or minimized before passing to an agent context.",
                    category: "Security",
                });
            }
        }
    }
    return issues;
}
