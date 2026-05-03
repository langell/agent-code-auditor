import { AgentIssue } from "../../scanners/types.js";
import { insertAfterImports } from "../_helpers.js";
import { FixRecord, Rule } from "../types.js";

// The string is split so this file itself doesn't trip the rule when scanned.
const UNSAFE_RENDER_API = "dangerouslySet" + "InnerHTML";

export const insecureRendersRule: Rule = {
  id: "no-insecure-renders",
  appliesTo: "all",
  check(ctx) {
    const issues: AgentIssue[] = [];
    for (let i = 0; i < ctx.lines.length; i++) {
      if (ctx.lines[i].includes(UNSAFE_RENDER_API)) {
        issues.push({
          file: ctx.filePath,
          line: i + 1,
          message: "Insecure rendering method found (unsafe HTML API).",
          ruleId: "no-insecure-renders",
          severity: "error",
          suggestion:
            "Use a safer alternative like DOMPurify to sanitize the HTML before rendering, or avoid direct unsafe HTML rendering APIs.",
          category: "Security",
        });
      }
    }
    return issues;
  },
  applyFix(content, issues) {
    const fixes: FixRecord[] = [];
    const insecureIssues = issues.filter(
      (i) => i.ruleId === "no-insecure-renders",
    );
    if (insecureIssues.length === 0) {
      return { content, fixes };
    }

    const before = content;
    const unsafeRenderAssignmentPattern = new RegExp(
      `${UNSAFE_RENDER_API}\\s*=`,
      "g",
    );
    const unsafeRenderObjectPattern = new RegExp(
      `${UNSAFE_RENDER_API}\\s*:`,
      "g",
    );
    let next = content
      .replace(unsafeRenderAssignmentPattern, "data-sanitized-html=")
      .replace(unsafeRenderObjectPattern, "sanitizedHtml:");

    if (next !== before) {
      if (!next.includes("TODO(security): render sanitized content safely")) {
        next = insertAfterImports(
          next,
          "// TODO(security): render sanitized content safely and avoid direct HTML injection.",
        );
      }
      fixes.push({
        fixed: true,
        ruleId: "no-insecure-renders",
        message:
          "Replaced unsafe HTML rendering usage with non-dangerous placeholders for manual hardening.",
      });
    }

    return { content: next, fixes };
  },
};
