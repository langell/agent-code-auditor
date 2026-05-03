import { AgentIssue } from "../../scanners/types.js";
import { FixRecord, Rule } from "../types.js";

function extractCommentText(line: string): string | null {
  const trimmed = line.trim();

  if (trimmed.startsWith("*")) {
    return trimmed.slice(1).trim();
  }

  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    const previousChar = i > 0 ? line[i - 1] : "";

    if (char === '"' || char === "'" || char === "`") {
      let j = i + 1;

      while (j < line.length) {
        if (line[j] === char && line[j - 1] !== "\\") {
          i = j;
          break;
        }

        j += 1;
      }

      continue;
    }

    if (char === "/" && line[i + 1] === "/" && previousChar !== ":") {
      return line.slice(i + 2).trim();
    }

    if (char === "/" && line[i + 1] === "*") {
      return line
        .slice(i + 2)
        .replace(/\*\/\s*$/, "")
        .trim();
    }

    if (line.startsWith("<!--", i)) {
      return line
        .slice(i + 4)
        .replace(/-->\s*$/, "")
        .trim();
    }
  }

  return null;
}

function isPlaceholderComment(line: string): boolean {
  const commentText = extractCommentText(line);

  if (!commentText) {
    return false;
  }

  const placeholderPatterns = [
    /\bTODO\b[:\s-]*(?:implement|complete|finish|fill\s+in|write\s+the\s+implementation|replace\s+with\s+actual)\b/i,
    /\b(?:implement|insert|add|fill\s+in|replace\s+with\s+actual|write)\b.{0,100}?\b(?:here|code|logic|implementation)\b/i,
    /\byour\s+code\s+here\b/i,
    /\bplaceholder\b/i,
    /\[(?:[^\]]*\b(?:insert|implement|fill\s+in|placeholder|your\s+code|add\s+logic)\b[^\]]*)\]/i,
  ];

  return placeholderPatterns.some((pattern) => pattern.test(commentText));
}

export const placeholderCommentsRule: Rule = {
  id: "no-placeholder-comments",
  appliesTo: "all",
  check(ctx) {
    const issues: AgentIssue[] = [];
    for (let i = 0; i < ctx.lines.length; i++) {
      if (isPlaceholderComment(ctx.lines[i])) {
        issues.push({
          file: ctx.filePath,
          line: i + 1,
          message: "Found AI placeholder indicating unwritten code.",
          ruleId: "no-placeholder-comments",
          severity: "error",
          suggestion:
            "Replace this placeholder comment with the actual implementation.",
          category: "Spec",
        });
      }
    }
    return issues;
  },
  applyFix(content, issues) {
    const fixes: FixRecord[] = [];
    const placeholderIssues = issues.filter(
      (i) => i.ruleId === "no-placeholder-comments",
    );
    if (placeholderIssues.length === 0) {
      return { content, fixes };
    }

    const lines = content.split("\n");
    let modified = false;
    for (const issue of placeholderIssues) {
      const lineIdx = issue.line - 1;
      if (lineIdx < 0 || lineIdx >= lines.length) continue;
      const line = lines[lineIdx];
      const trimmed = line.trim();
      // Only replace when the line is a standalone single-line comment.
      // Inline trailing comments (e.g. `const x = 1; // TODO: implement`) and
      // JSX comment blocks would break syntax if rewritten.
      const isStandaloneLineComment =
        trimmed.startsWith("//") &&
        /T(?:ODO):/i.test(trimmed) &&
        /im(?:plement)/i.test(trimmed);
      if (!isStandaloneLineComment) continue;

      const indent = line.match(/^\s*/)?.[0] ?? "";
      lines[lineIdx] =
        `${indent}throw new Error("Not implemented - AI placeholder detected");`;
      modified = true;
      fixes.push({
        fixed: true,
        ruleId: issue.ruleId,
        message: `Replaced placeholder comment with hard fail on line ${issue.line}.`,
      });
    }

    return { content: modified ? lines.join("\n") : content, fixes };
  },
};
