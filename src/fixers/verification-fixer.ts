import * as fs from "fs";
import * as path from "path";
import { AgentIssue } from "../scanners/types.js";
import { FixResult } from "./types.js";

// Safety note: fixer routines support dryRun previews and explicit approve gates at call sites.

type TestFramework = "node-test" | "vitest" | "jest" | "mocha";

function detectTestFramework(startDir: string): TestFramework {
  let dir = startDir;
  for (let i = 0; i < 6; i++) {
    const pkgPath = path.join(dir, "package.json");
    if (fs.existsSync(pkgPath)) {
      try {
        const pkg = JSON.parse(fs.readFileSync(pkgPath, "utf8"));
        const deps = {
          ...(pkg.dependencies || {}),
          ...(pkg.devDependencies || {}),
        };
        if (deps.vitest) return "vitest";
        if (deps.jest) return "jest";
        if (deps.mocha) return "mocha";
        if (pkg.scripts) {
          const scripts = Object.values(pkg.scripts).join(" ");
          if (/node\s+--test|tsx\s+--test/.test(scripts)) return "node-test";
        }
        return "node-test";
      } catch {
        // continue walking up
      }
    }
    const parent = path.dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  return "node-test";
}

function scaffoldTest(framework: TestFramework, basename: string): string {
  switch (framework) {
    case "vitest":
      return [
        `import { describe, it, expect } from "vitest";`,
        `import * as ${basename} from "./${basename}.js";`,
        ``,
        `describe("${basename}", () => {`,
        `  it("should be implemented", () => {`,
        `    // TODO: write tests for ${basename}`,
        `    expect(${basename}).toBeDefined();`,
        `  });`,
        `});`,
        ``,
      ].join("\n");
    case "jest":
      return [
        `import * as ${basename} from "./${basename}.js";`,
        ``,
        `describe("${basename}", () => {`,
        `  it("should be implemented", () => {`,
        `    // TODO: write tests for ${basename}`,
        `    expect(${basename}).toBeDefined();`,
        `  });`,
        `});`,
        ``,
      ].join("\n");
    case "mocha":
      return [
        `import assert from "node:assert/strict";`,
        `import * as ${basename} from "./${basename}.js";`,
        ``,
        `describe("${basename}", () => {`,
        `  it("should be implemented", () => {`,
        `    // TODO: write tests for ${basename}`,
        `    assert.ok(${basename});`,
        `  });`,
        `});`,
        ``,
      ].join("\n");
    case "node-test":
    default:
      return [
        `import test from "node:test";`,
        `import assert from "node:assert/strict";`,
        `import * as ${basename} from "./${basename}.js";`,
        ``,
        `test("${basename} should be implemented", () => {`,
        `  // TODO: write tests for ${basename}`,
        `  assert.ok(${basename});`,
        `});`,
        ``,
      ].join("\n");
  }
}

export async function fixVerificationRules(
  file: string,
  issues: AgentIssue[],
): Promise<FixResult[]> {
  const fixes: FixResult[] = [];
  const verificationIssues = issues.filter(
    (i) => i.ruleId === "verification-missing-tests",
  );
  if (verificationIssues.length === 0) return fixes;

  const framework = detectTestFramework(path.dirname(file));

  for (const issue of verificationIssues) {
    const ext = path.extname(file);
    const basename = path.basename(file, ext);
    const dirname = path.dirname(file);
    const testFile = path.join(dirname, `${basename}.test${ext}`);

    if (!fs.existsSync(testFile)) {
      fs.writeFileSync(testFile, scaffoldTest(framework, basename), "utf8");
      fixes.push({
        file: testFile,
        fixed: true,
        ruleId: issue.ruleId,
        message: `Scaffolded missing test file for ${basename}${ext} (${framework})`,
      });
    }
  }

  return fixes;
}
