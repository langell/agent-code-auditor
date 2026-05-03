import * as fs from "fs";
import * as path from "path";
import { AgentIssue } from "../scanners/types.js";
import { FixRecord, NewFile, Rule } from "./types.js";

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

const BUSINESS_LOGIC_SEGMENT_REGEX = /(?:^|\/)src\/(?:lib|services|actions)\//;
const SOURCE_EXT_REGEX = /\.(?:ts|tsx|js|jsx|mts|cts|mjs|cjs)$/;
const TEST_OR_SPEC_REGEX = /\.(?:test|spec)\./;
const SOURCE_EXTENSIONS = [
  ".ts",
  ".tsx",
  ".js",
  ".jsx",
  ".mts",
  ".cts",
  ".mjs",
  ".cjs",
];

function findCorrespondingTestFile(dir: string, file: string): boolean {
  const norm = file.replace(/\\/g, "/");
  const ext = path.extname(norm);
  const baseRel = norm.slice(0, norm.length - ext.length);
  const fileBasename = path.basename(baseRel);
  const relDir = path.dirname(norm);

  const candidates = new Set<string>();

  // Colocated: src/lib/foo.test.ts, src/lib/foo.spec.ts
  for (const e of SOURCE_EXTENSIONS) {
    candidates.add(path.join(dir, `${baseRel}.test${e}`));
    candidates.add(path.join(dir, `${baseRel}.spec${e}`));
  }

  // Sibling test directories: src/lib/__tests__/foo.test.ts, src/lib/tests/foo.test.ts
  for (const e of SOURCE_EXTENSIONS) {
    for (const subdir of ["__tests__", "tests", "test"]) {
      candidates.add(
        path.join(dir, relDir, subdir, `${fileBasename}.test${e}`),
      );
      candidates.add(
        path.join(dir, relDir, subdir, `${fileBasename}.spec${e}`),
      );
    }
  }

  // Parallel test directory at the package root, mirroring source path:
  //   src/lib/foo.ts -> tests/lib/foo.test.ts
  //   src/lib/foo.ts -> __tests__/lib/foo.test.ts
  const sourceDirRegex = /^src\//;
  if (sourceDirRegex.test(relDir)) {
    const trimmed = relDir.replace(sourceDirRegex, "");
    for (const e of SOURCE_EXTENSIONS) {
      for (const top of ["tests", "__tests__", "test"]) {
        candidates.add(
          path.join(dir, top, trimmed, `${fileBasename}.test${e}`),
        );
        candidates.add(
          path.join(dir, top, trimmed, `${fileBasename}.spec${e}`),
        );
        // Flat test dir: tests/foo.test.ts (no subdir mirror)
        candidates.add(path.join(dir, top, `${fileBasename}.test${e}`));
        candidates.add(path.join(dir, top, `${fileBasename}.spec${e}`));
      }
    }
  }

  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) return true;
  }
  return false;
}

export const verificationMissingTestsRule: Rule = {
  id: "verification-missing-tests",
  appliesTo: "source",
  check(ctx) {
    const issues: AgentIssue[] = [];
    const norm = ctx.filePath.replace(/\\/g, "/");
    if (
      BUSINESS_LOGIC_SEGMENT_REGEX.test(norm) &&
      SOURCE_EXT_REGEX.test(norm) &&
      !TEST_OR_SPEC_REGEX.test(norm)
    ) {
      if (!findCorrespondingTestFile(ctx.targetDir, ctx.filePath)) {
        issues.push({
          file: ctx.filePath,
          line: 1,
          message: `Missing corresponding test file for business logic module.`,
          ruleId: "verification-missing-tests",
          severity: "warn",
          suggestion:
            "Every core business logic file MUST include a corresponding test file.",
          category: "Verification/Security",
        });
      }
    }

    return issues;
  },
  applyFix(content, issues, filePath) {
    const fixes: FixRecord[] = [];
    const newFiles: NewFile[] = [];

    const verificationIssues = issues.filter(
      (i) => i.ruleId === "verification-missing-tests",
    );
    if (verificationIssues.length === 0) {
      return { content, fixes };
    }

    const framework = detectTestFramework(path.dirname(filePath));

    for (const issue of verificationIssues) {
      const ext = path.extname(filePath);
      const basename = path.basename(filePath, ext);
      const dirname = path.dirname(filePath);
      const testFile = path.join(dirname, `${basename}.test${ext}`);

      if (!fs.existsSync(testFile)) {
        newFiles.push({
          path: testFile,
          content: scaffoldTest(framework, basename),
        });
        fixes.push({
          fixed: true,
          ruleId: issue.ruleId,
          message: `Scaffolded missing test file for ${basename}${ext} (${framework})`,
        });
      }
    }

    return { content, fixes, newFiles };
  },
};
