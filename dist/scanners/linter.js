import { ESLint } from "eslint";
export async function runLinter(dir, fix = false) {
    const eslint = new ESLint({
        cwd: dir,
        fix: fix,
    });
    try {
        // Run linter on common file pattern
        const results = await eslint.lintFiles(["**/*.{js,ts,jsx,tsx}"]);
        if (fix) {
            await ESLint.outputFixes(results);
        }
        const errorCount = results.reduce((acc, result) => acc + result.errorCount, 0);
        const warningCount = results.reduce((acc, result) => acc + result.warningCount, 0);
        return {
            errorCount,
            warningCount,
            messages: results.filter((r) => r.errorCount > 0 || r.warningCount > 0),
        };
    }
    catch (error) {
        console.error("ESLint scanning failed. Has an ESLint config been initialized in this project?", error);
        return { errorCount: 0, warningCount: 0, messages: [] };
    }
}
