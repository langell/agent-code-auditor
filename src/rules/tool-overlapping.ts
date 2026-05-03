import { FixRecord, Rule } from "./types.js";

// `tool-overlapping` is a workspace-level concern: emission happens in the
// orchestrator's cross-file aggregator (after every file has been scanned),
// not as a per-file Rule. This module exists to carry the fix logic so the
// fix orchestrator can pair issues with `applyFix` via ruleId lookup.
//
// `check` is a no-op — including this Rule in the registry would otherwise
// double-emit issues.
export const toolOverlappingRule: Rule = {
  id: "tool-overlapping",
  appliesTo: "source",
  check() {
    return [];
  },
  applyFix(content, issues) {
    const fixes: FixRecord[] = [];
    const overlappingIssues = issues.filter(
      (i) => i.ruleId === "tool-overlapping",
    );
    if (overlappingIssues.length === 0) {
      return { content, fixes };
    }

    const lines = content.split("\n");
    let modified = false;

    const TOOL_SHAPE_REGEX =
      /\b(?:description|parameters|inputSchema|input_schema|handler|execute|examples)\s*:/;
    const isToolNameLine = (idx: number): boolean => {
      const start = Math.max(0, idx - 5);
      const end = Math.min(lines.length, idx + 6);
      return TOOL_SHAPE_REGEX.test(lines.slice(start, end).join("\n"));
    };

    const seenNames: Record<string, number> = {};
    const usedNames = new Set<string>();

    for (let i = 0; i < lines.length; i++) {
      if (!isToolNameLine(i)) continue;
      const namePattern = /name:\s*['"]([^'"]+)['"]/g;
      for (const match of lines[i].matchAll(namePattern)) {
        usedNames.add(match[1]);
      }
    }

    for (let i = 0; i < lines.length; i++) {
      if (!isToolNameLine(i)) continue;
      const line = lines[i];
      const namePattern = /(name:\s*['"])([^'"]+)(['"])/g;
      let lineChanged = false;

      const updatedLine = line.replace(
        namePattern,
        (_, prefix: string, toolName: string, suffix: string) => {
          seenNames[toolName] = (seenNames[toolName] || 0) + 1;
          if (seenNames[toolName] === 1) {
            return `${prefix}${toolName}${suffix}`;
          }

          let renameIdx = 2;
          let renamed = `${toolName}_${renameIdx}`;
          while (usedNames.has(renamed)) {
            renameIdx += 1;
            renamed = `${toolName}_${renameIdx}`;
          }

          usedNames.add(renamed);
          lineChanged = true;
          fixes.push({
            fixed: true,
            ruleId: "tool-overlapping",
            message: `Renamed duplicate tool '${toolName}' to '${renamed}' on line ${i + 1}.`,
          });
          return `${prefix}${renamed}${suffix}`;
        },
      );

      if (lineChanged) {
        lines[i] = updatedLine;
        modified = true;
      }
    }

    return { content: modified ? lines.join("\n") : content, fixes };
  },
};
