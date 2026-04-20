import * as fs from 'fs';
import * as path from 'path';
import { AgentIssue } from '../scanners/types.js';
import { FixResult } from './types.js';

export async function fixCodeQualityRules(file: string, issues: AgentIssue[]): Promise<FixResult[]> {
  const fixes: FixResult[] = [];
  const cqIssues = issues.filter(i => i.ruleId === 'code-quality-no-any');
  if (cqIssues.length === 0) return fixes;

  if (fs.existsSync(file)) {
    const lines = fs.readFileSync(file, 'utf8').split('\n');
    let modified = false;

    // Apply fixes line by line based on the issues reported
    for (const issue of cqIssues) {
      const lineIdx = issue.line - 1;
      if (lineIdx >= 0 && lineIdx < lines.length) {
        if (lines[lineIdx].includes(': any')) {
          lines[lineIdx] = lines[lineIdx].replace(/: any\b/g, ': unknown');
          modified = true;
          fixes.push({ file, fixed: true, ruleId: issue.ruleId, message: `Replaced 'any' with 'unknown' on line ${issue.line}.` });
        }
      }
    }

    if (modified) {
      fs.writeFileSync(file, lines.join('\n'), 'utf8');
    }
  }

  return fixes;
}
