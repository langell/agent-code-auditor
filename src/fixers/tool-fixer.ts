import * as fs from "fs";
import { AgentIssue } from "../scanners/types.js";
import { FixResult } from "./types.js";

// Safety note: fixer routines support dryRun previews and explicit approve gates at call sites.

export async function fixToolRules(
  file: string,
  issues: AgentIssue[],
): Promise<FixResult[]> {
  const fixes: FixResult[] = [];
  const objectTypePattern = /type:\s*["']object["']/;
  const toolIssues = issues.filter((i) => i.ruleId === "tool-weak-schema");
  const overlappingIssues = issues.filter(
    (i) => i.ruleId === "tool-overlapping",
  );

  if (fs.existsSync(file)) {
    const lines = fs.readFileSync(file, "utf8").split("\n");
    let modified = false;

    // A very naive heuristic to inject a description field into an empty properties object or similar
    for (const issue of toolIssues) {
      const startIdx = Math.max(0, issue.line - 1);
      const endIdx = Math.min(lines.length, startIdx + 5);

      for (let j = startIdx; j < endIdx; j++) {
        const line = lines[j];
        if (
          line.includes("properties: {") ||
          line.includes("properties:{}") ||
          line.includes("properties: {}")
        ) {
          if (line.includes("{}")) {
            lines[j] = line.replace(
              "{}",
              '{ description: "TBD: describe this parameter" }',
            );
            modified = true;
            fixes.push({
              file,
              fixed: true,
              ruleId: issue.ruleId,
              message: `Injected missing description template on line ${j + 1}.`,
            });
          } else {
            lines[j] = line + " // TBD: expand property descriptions";
            modified = true;
            fixes.push({
              file,
              fixed: true,
              ruleId: issue.ruleId,
              message: `Added description reminder on line ${j + 1}.`,
            });
          }
          break; // Only fix the first one found near the issue
        }
      }
    }

    const exampleIssues = issues.filter(
      (i) => i.ruleId === "tool-missing-examples",
    );
    for (const issue of exampleIssues) {
      const startIdx = Math.max(0, issue.line - 1);
      const endIdx = Math.min(lines.length, startIdx + 5);

      for (let j = startIdx; j < endIdx; j++) {
        const line = lines[j];
        if (objectTypePattern.test(line)) {
          // Append examples next to object type schema.
          lines[j] =
            line + ' examples: ["TBD: valid example", "TBD: invalid example"],';
          modified = true;
          fixes.push({
            file,
            fixed: true,
            ruleId: issue.ruleId,
            message: `Injected missing examples template on line ${j + 1}.`,
          });
          break; // Only fix the first one near the issue
        }
      }
    }

    if (overlappingIssues.length > 0) {
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
              file,
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
    }

    if (modified) {
      fs.writeFileSync(file, lines.join("\n"), "utf8");
    }
  }

  return fixes;
}
