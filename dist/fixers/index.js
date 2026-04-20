import * as path from 'path';
import { fixSpecRules } from './spec-fixer.js';
import { fixCodeQualityRules } from './code-quality-fixer.js';
import { fixToolRules } from './tool-fixer.js';
import { fixContextRules } from './context-fixer.js';
import { fixVerificationRules } from './verification-fixer.js';
export async function runFixer(targetDir, issues) {
    const fixes = [];
    // Group issues by file
    const issuesByFile = issues.reduce((acc, issue) => {
        if (!acc[issue.file])
            acc[issue.file] = [];
        acc[issue.file].push(issue);
        return acc;
    }, {});
    for (const [file, fileIssues] of Object.entries(issuesByFile)) {
        // Resolve the relative issue.file to the target directory
        const fullPath = path.resolve(targetDir, file);
        // Apply fixers
        const specFixes = await fixSpecRules(fullPath, fileIssues);
        const cqFixes = await fixCodeQualityRules(fullPath, fileIssues);
        const toolFixes = await fixToolRules(fullPath, fileIssues);
        const contextFixes = await fixContextRules(fullPath, fileIssues);
        const verificationFixes = await fixVerificationRules(fullPath, fileIssues);
        const allFixes = [...specFixes, ...cqFixes, ...toolFixes, ...contextFixes, ...verificationFixes].map(f => ({ ...f, file }));
        fixes.push(...allFixes);
    }
    return { fixes };
}
