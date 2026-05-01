import * as fs from "fs";
import * as path from "path";
import { AgentLintConfig } from "../../config.js";
import { AgentIssue } from "../types.js";

import * as ts from "typescript";

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

export function checkVerificationRules(
  file: string,
  lines: string[],
  config: AgentLintConfig,
  dir: string,
  _sourceFile?: ts.SourceFile,
): AgentIssue[] {
  const issues: AgentIssue[] = [];

  if (config.rules["verification-missing-tests"] !== "off") {
    const norm = file.replace(/\\/g, "/");
    if (
      BUSINESS_LOGIC_SEGMENT_REGEX.test(norm) &&
      SOURCE_EXT_REGEX.test(norm) &&
      !TEST_OR_SPEC_REGEX.test(norm)
    ) {
      if (!findCorrespondingTestFile(dir, file)) {
        issues.push({
          file,
          line: 1,
          message: `Missing corresponding test file for business logic module.`,
          ruleId: "verification-missing-tests",
          severity:
            config.rules["verification-missing-tests"] === "warn"
              ? "warn"
              : "error",
          suggestion:
            "Every core business logic file MUST include a corresponding test file.",
          category: "Verification/Security",
        });
      }
    }
  }

  return issues;
}
