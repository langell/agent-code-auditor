import * as fs from 'fs';
export async function fixToolRules(file, issues) {
    const fixes = [];
    const toolIssues = issues.filter(i => i.ruleId === 'tool-weak-schema');
    if (fs.existsSync(file)) {
        const lines = fs.readFileSync(file, 'utf8').split('\n');
        let modified = false;
        // A very naive heuristic to inject a description field into an empty properties object or similar
        for (const issue of toolIssues) {
            const startIdx = Math.max(0, issue.line - 1);
            const endIdx = Math.min(lines.length, startIdx + 5);
            for (let j = startIdx; j < endIdx; j++) {
                const line = lines[j];
                if (line.includes('properties: {') || line.includes('properties:{}') || line.includes('properties: {}')) {
                    if (line.includes('{}')) {
                        lines[j] = line.replace('{}', '{ description: "TODO: describe this parameter" }');
                        modified = true;
                        fixes.push({ file, fixed: true, ruleId: issue.ruleId, message: `Injected missing description template on line ${j + 1}.` });
                    }
                    else {
                        lines[j] = line + ' // TODO: Add detailed descriptions to tool properties';
                        modified = true;
                        fixes.push({ file, fixed: true, ruleId: issue.ruleId, message: `Added description reminder on line ${j + 1}.` });
                    }
                    break; // Only fix the first one found near the issue
                }
            }
        }
        const exampleIssues = issues.filter(i => i.ruleId === 'tool-missing-examples');
        for (const issue of exampleIssues) {
            const startIdx = Math.max(0, issue.line - 1);
            const endIdx = Math.min(lines.length, startIdx + 5);
            for (let j = startIdx; j < endIdx; j++) {
                const line = lines[j];
                if (line.includes('type: "object"') || line.includes("type: 'object'")) {
                    // Append examples right after type: "object"
                    lines[j] = line + ' examples: ["TODO: Add valid example", "TODO: Add invalid example"],';
                    modified = true;
                    fixes.push({ file, fixed: true, ruleId: issue.ruleId, message: `Injected missing examples template on line ${j + 1}.` });
                    break; // Only fix the first one near the issue
                }
            }
        }
        if (modified) {
            fs.writeFileSync(file, lines.join('\n'), 'utf8');
        }
    }
    return fixes;
}
