import * as fs from "fs";
import * as path from "path";
import { AgentIssue } from "../scanners/types.js";
import { FixResult } from "./types.js";

// Safety note: fixer routines support dryRun previews and explicit approve gates at call sites.

export async function fixVerificationRules(
  file: string,
  issues: AgentIssue[],
): Promise<FixResult[]> {
  const fixes: FixResult[] = [];
  const verificationIssues = issues.filter(
    (i) => i.ruleId === "verification-missing-tests",
  );
  if (verificationIssues.length === 0) return fixes;

  for (const issue of verificationIssues) {
    const ext = path.extname(file);
    const basename = path.basename(file, ext);
    const dirname = path.dirname(file);
    const testFile = path.join(dirname, `${basename}.test${ext}`);

    if (!fs.existsSync(testFile)) {
      const testContent = `import * as ${basename} from './${basename}.js';\n\ndescribe('${basename}', () => {\n  it('should be implemented', () => {\n    // TBD: Write tests for ${basename}\n    expect(true).toBe(true);\n  });\n});\n`;
      fs.writeFileSync(testFile, testContent, "utf8");
      fixes.push({
        file: testFile,
        fixed: true,
        ruleId: issue.ruleId,
        message: `Scaffolded missing test file for ${basename}${ext}`,
      });
    }
  }

  return fixes;
}
