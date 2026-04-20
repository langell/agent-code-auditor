export function checkToolRules(file, lines, config) {
    const issues = [];
    // Basic AST-ish heuristics: Look for tool schemas missing descriptions.
    for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        if (config.rules["tool-weak-schema"] !== "off") {
            // A very basic check: 'type: "object"' without properties or description close by.
            // In a real AST parser, we'd traverse the AST. For regex, we'll flag simple patterns.
            if (line.includes('type: "object"') &&
                !lines
                    .slice(Math.max(0, i - 5), Math.min(lines.length, i + 5))
                    .some((l) => l.includes("description"))) {
                issues.push({
                    file,
                    line: i + 1,
                    message: "Tool parameter object missing descriptions.",
                    ruleId: "tool-weak-schema",
                    severity: config.rules["tool-weak-schema"] || "error",
                    suggestion: "Add detailed descriptions to tool properties to guide the agent.",
                    category: "Tool",
                });
            }
        }
        if (config.rules["tool-missing-examples"] !== "off") {
            if (line.includes('type: "object"') &&
                !lines
                    .slice(Math.max(0, i - 10), Math.min(lines.length, i + 15))
                    .some((l) => l.includes("examples"))) {
                issues.push({
                    file,
                    line: i + 1,
                    message: "Tool object missing examples.",
                    ruleId: "tool-missing-examples",
                    severity: config.rules["tool-missing-examples"] || "warn",
                    suggestion: "Provide examples of valid and invalid tool calls to improve agent reliability.",
                    category: "Tool",
                });
            }
        }
    }
    if (config.rules["tool-overlapping"] !== "off") {
        const content = lines.join("\n");
        // Basic AST-ish heuristic: Check if 'type: "object"' or 'function' appears multiple times in a short span with similar names.
        // For a generic static scan, we look for multiple declarations of tools with identical names.
        const toolNames = content.match(/name:\s*['"](.*?)['"]/g) || [];
        const uniqueNames = new Set(toolNames);
        if (toolNames.length > uniqueNames.size) {
            issues.push({
                file,
                line: 1,
                message: "Multiple tools with identical or overlapping names detected.",
                ruleId: "tool-overlapping",
                severity: config.rules["tool-overlapping"] || "error",
                suggestion: "Ensure each tool has a distinct name and purpose to avoid ambiguous decision points.",
                category: "Tool",
            });
        }
    }
    return issues;
}
