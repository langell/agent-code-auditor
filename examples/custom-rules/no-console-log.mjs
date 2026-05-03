// Example custom rule: flag every `console.log(...)` call as a code smell,
// and (optionally) auto-fix by rewriting them to `console.debug(...)`.
//
// agentlint loads custom rules listed in `.agentlintrc.json` under
// `customRules`, e.g.:
//
//   {
//     "rules": { "no-console-log": "warn" },
//     "customRules": [
//       "./examples/custom-rules/no-console-log.mjs#noConsoleLogRule"
//     ]
//   }
//
// Contract:
//   - Named OR default export of an object matching the Rule shape:
//       {
//         id: string,
//         appliesTo: "all" | "source",
//         check(ctx): Issue[],
//         applyFix?(content, issues, filePath): FixOutcome,
//       }
//   - The orchestrator handles I/O, severity stamping, and config "off"
//     filtering. Your rule emits at its own default severity; the user can
//     override it via `rules: { "<id>": "warn"|"error"|"off" }`.
//   - If a custom rule's id matches a built-in's, the custom rule shadows it
//     (a warning is logged at load time).

const CONSOLE_LOG_REGEX = /console\.log\s*\(/g;

export const noConsoleLogRule = {
  id: "no-console-log",
  appliesTo: "source",
  check(ctx) {
    const issues = [];
    for (let i = 0; i < ctx.lines.length; i++) {
      const line = ctx.lines[i];
      // Skip lines that look like comments to avoid flagging examples
      // inside docstrings.
      const trimmed = line.trim();
      if (trimmed.startsWith("//") || trimmed.startsWith("*")) continue;

      if (line.includes("console.log(")) {
        issues.push({
          file: ctx.filePath,
          line: i + 1,
          message:
            "Avoid console.log in committed code; use a structured logger or console.debug.",
          ruleId: "no-console-log",
          severity: "warn",
          suggestion:
            "Replace console.log with console.debug, or route through your project's logger.",
          category: "Code Quality",
        });
      }
    }
    return issues;
  },
  applyFix(content, issues) {
    if (issues.length === 0) {
      return { content, fixes: [] };
    }
    const fixes = [];
    let replaced = 0;
    const next = content.replace(CONSOLE_LOG_REGEX, () => {
      replaced += 1;
      return "console.debug(";
    });
    for (let i = 0; i < replaced; i++) {
      fixes.push({
        fixed: true,
        ruleId: "no-console-log",
        message: "Rewrote console.log to console.debug.",
      });
    }
    return { content: next, fixes };
  },
};
