import * as fs from "fs";
import * as path from "path";
import { glob } from "glob";
import { checkSpecRules } from "./rules/spec-lint.js";
import { checkContextRules } from "./rules/context-lint.js";
import { checkToolRules } from "./rules/tool-lint.js";
import { checkExecutionRules } from "./rules/execution-lint.js";
import { checkSecurityRules } from "./rules/security-lint.js";
import { checkCodeQualityRules } from "./rules/code-quality-lint.js";
import { checkVerificationRules } from "./rules/verification-lint.js";
export async function runASTAnalyzer(dir, config) {
    const issues = [];
    const files = await glob("**/*.{js,ts,jsx,tsx,md,prompt}", {
        cwd: dir,
        ignore: ["node_modules/**", "dist/**"],
    });
    for (const file of files) {
        const fullPath = path.join(dir, file);
        const content = fs.readFileSync(fullPath, "utf8");
        const lines = content.split("\n");
        // Run modular rules
        issues.push(...checkSpecRules(file, lines, config));
        issues.push(...checkContextRules(file, lines, config));
        issues.push(...checkToolRules(file, lines, config));
        issues.push(...checkExecutionRules(file, lines, config));
        issues.push(...checkSecurityRules(file, lines, config));
        issues.push(...checkCodeQualityRules(file, lines, config));
        issues.push(...checkVerificationRules(file, lines, config, dir));
        // Keep the original 3 rules for backward compatibility in the General/Tool categories
        for (let i = 0; i < lines.length; i++) {
            const line = lines[i];
            if (config.rules["no-placeholder-comments"] !== "off") {
                if (/TODO:?.*(Implement|insert|add|here)/i.test(line) ||
                    /\[.*insert.*\]/i.test(line)) {
                    issues.push({
                        file,
                        line: i + 1,
                        message: "Found AI placeholder indicating unwritten code.",
                        ruleId: "no-placeholder-comments",
                        severity: config.rules["no-placeholder-comments"] || "error",
                        suggestion: "Replace this placeholder comment with the actual implementation.",
                        category: "Spec",
                    });
                }
            }
            if (config.rules["no-insecure-renders"] !== "off") {
                if (line.includes("dangerouslySetInnerHTML")) {
                    issues.push({
                        file,
                        line: i + 1,
                        message: "Insecure rendering method found (dangerouslySetInnerHTML).",
                        ruleId: "no-insecure-renders",
                        severity: config.rules["no-insecure-renders"] || "error",
                        suggestion: "Use a safer alternative like DOMPurify to sanitize the HTML before rendering, or avoid dangerouslySetInnerHTML entirely.",
                        category: "Security",
                    });
                }
            }
            if (config.rules["no-hallucinated-imports"] !== "off") {
                if (line.includes("import * as unknown from 'non-existent-lib'")) {
                    issues.push({
                        file,
                        line: i + 1,
                        message: "Hallucinated library import detected.",
                        ruleId: "no-hallucinated-imports",
                        severity: config.rules["no-hallucinated-imports"] || "error",
                        suggestion: "Verify the library exists in your package.json and the import path is correct.",
                        category: "Execution",
                    });
                }
            }
        }
    }
    return issues;
}
