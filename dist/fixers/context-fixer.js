import * as fs from 'fs';
export async function fixContextRules(file, issues) {
    const fixes = [];
    const contextIssues = issues.filter(i => i.ruleId === 'observability-missing-trace-id');
    if (contextIssues.length === 0)
        return fixes;
    if (fs.existsSync(file)) {
        const lines = fs.readFileSync(file, 'utf8').split('\n');
        let modified = false;
        // We know 'observability-missing-trace-id' is a file-level issue (line 1), so we scan the whole file.
        for (let i = 0; i < lines.length; i++) {
            const line = lines[i];
            // simplistic heuristic to inject traceId
            if (line.includes('new Agent({') || line.includes('Agent.init({')) {
                // If the object opens on this line, inject it right after the `{`
                lines[i] = line.replace('{', '{ traceId: "TODO: inject-trace-id", ');
                modified = true;
                fixes.push({ file, fixed: true, ruleId: 'observability-missing-trace-id', message: `Injected missing traceId on line ${i + 1}.` });
                break; // Only fix the first occurrence per file for now
            }
        }
        if (modified) {
            fs.writeFileSync(file, lines.join('\n'), 'utf8');
        }
    }
    return fixes;
}
