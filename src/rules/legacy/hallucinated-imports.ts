import { AgentIssue } from "../../scanners/types.js";
import { Rule } from "../types.js";

// Marker is split so this file itself doesn't trip the rule when scanned.
const HALLUCINATED_IMPORT_MARKER =
  "import * as unknown from " + "'non-existent-lib'";

export const hallucinatedImportsRule: Rule = {
  id: "no-hallucinated-imports",
  appliesTo: "all",
  check(ctx) {
    const issues: AgentIssue[] = [];
    for (let i = 0; i < ctx.lines.length; i++) {
      if (ctx.lines[i].includes(HALLUCINATED_IMPORT_MARKER)) {
        issues.push({
          file: ctx.filePath,
          line: i + 1,
          message: "Hallucinated library import detected.",
          ruleId: "no-hallucinated-imports",
          severity: "error",
          suggestion:
            "Verify the library exists in your package.json and the import path is correct.",
          category: "Execution",
        });
      }
    }
    return issues;
  },
};
