import * as ts from "typescript";
import { AgentIssue, ToolDeclaration } from "../scanners/types.js";
import { FixRecord, Rule } from "./types.js";

const TOOL_SHAPE_PROPS = new Set([
  "description",
  "parameters",
  "inputSchema",
  "input_schema",
  "function",
  "handler",
  "execute",
  "examples",
]);

function looksLikeToolObject(
  props: ts.NodeArray<ts.ObjectLiteralElementLike>,
): boolean {
  let hasName = false;
  let hasShapeProp = false;
  for (const prop of props) {
    if (
      ts.isPropertyAssignment(prop) &&
      prop.name &&
      ts.isIdentifier(prop.name)
    ) {
      const propName = prop.name.text;
      if (propName === "name") hasName = true;
      if (TOOL_SHAPE_PROPS.has(propName)) hasShapeProp = true;
    }
  }
  return hasName && hasShapeProp;
}

const TOOL_SHAPE_REGEX =
  /\b(?:description|parameters|inputSchema|input_schema|handler|execute|examples)\s*:/;

// Collect `name: "X"` keys only when accompanied within a small window
// by another tool-shape property — avoids matching every `name:` field
// in unrelated objects (UI components, GraphQL queries, etc.)
export function collectToolNamesNonAst(content: string): string[] {
  const names: string[] = [];
  const lines = content.split("\n");
  const namePattern = /name:\s*['"]([^'"]+)['"]/g;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const matches = Array.from(line.matchAll(namePattern));
    if (matches.length === 0) continue;

    const windowStart = Math.max(0, i - 5);
    const windowEnd = Math.min(lines.length, i + 6);
    const windowText = lines.slice(windowStart, windowEnd).join("\n");
    if (!TOOL_SHAPE_REGEX.test(windowText)) continue;

    for (const m of matches) {
      names.push(m[1]);
    }
  }
  return names;
}

// This Rule emits `tool-weak-schema` and (as a side effect) populates
// `ctx.globalTools` so the orchestrator's cross-file `tool-overlapping`
// aggregator has the workspace-wide tool roster to dedup against.
//
// The collection side effect is paired with this Rule rather than its own
// module because the AST traversal already walks every object literal once;
// splitting collection into a separate Rule would duplicate the walk.
export const toolWeakSchemaRule: Rule = {
  id: "tool-weak-schema",
  appliesTo: "source",
  check(ctx) {
    const issues: AgentIssue[] = [];
    const globalTools: ToolDeclaration[] = ctx.globalTools;

    if (ctx.ast) {
      const sourceFile = ctx.ast;
      function visit(node: ts.Node) {
        if (ts.isObjectLiteralExpression(node)) {
          let hasTypeObject = false;
          let hasDescription = false;
          let toolName = "";

          for (const prop of node.properties) {
            if (
              ts.isPropertyAssignment(prop) &&
              prop.name &&
              ts.isIdentifier(prop.name)
            ) {
              const propName = prop.name.text;
              if (
                propName === "type" &&
                ts.isStringLiteral(prop.initializer) &&
                prop.initializer.text === "object"
              ) {
                hasTypeObject = true;
              }
              if (propName === "description") {
                hasDescription = true;
              }
              if (propName === "name" && ts.isStringLiteral(prop.initializer)) {
                toolName = prop.initializer.text;
              }
            }
          }

          if (hasTypeObject && !hasDescription) {
            const { line } = sourceFile.getLineAndCharacterOfPosition(
              node.getStart(),
            );
            issues.push({
              file: ctx.filePath,
              line: line + 1,
              message: "Tool parameter object missing descriptions.",
              ruleId: "tool-weak-schema",
              severity: "error",
              suggestion:
                "Add detailed descriptions to tool properties to guide the agent.",
              category: "Tool",
              startPos: node.getStart(),
              endPos: node.getEnd(),
            });
          }

          if (toolName && looksLikeToolObject(node.properties)) {
            const { line } = sourceFile.getLineAndCharacterOfPosition(
              node.getStart(),
            );
            globalTools.push({
              name: toolName,
              file: ctx.filePath,
              line: line + 1,
            });
          }
        }
        ts.forEachChild(node, visit);
      }
      visit(sourceFile);
    } else {
      const objectTypePattern = /type:\s*["']object["']/;
      for (let i = 0; i < ctx.lines.length; i++) {
        const line = ctx.lines[i];
        if (
          objectTypePattern.test(line) &&
          !ctx.lines
            .slice(Math.max(0, i - 5), Math.min(ctx.lines.length, i + 5))
            .some((l) => l.includes("description"))
        ) {
          issues.push({
            file: ctx.filePath,
            line: i + 1,
            message: "Tool parameter object missing descriptions.",
            ruleId: "tool-weak-schema",
            severity: "error",
            suggestion:
              "Add detailed descriptions to tool properties to guide the agent.",
            category: "Tool",
          });
        }
      }

      const namedToolNames = collectToolNamesNonAst(ctx.content);
      for (const name of namedToolNames) {
        globalTools.push({ name, file: ctx.filePath, line: 1 });
      }
    }

    return issues;
  },
  applyFix(content, issues) {
    const fixes: FixRecord[] = [];
    const toolIssues = issues.filter((i) => i.ruleId === "tool-weak-schema");
    if (toolIssues.length === 0) {
      return { content, fixes };
    }

    const lines = content.split("\n");
    let modified = false;

    // Naive heuristic: inject a description into an empty `properties: {}`
    // near each issue line.
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
              fixed: true,
              ruleId: issue.ruleId,
              message: `Injected missing description template on line ${j + 1}.`,
            });
          } else {
            lines[j] = line + " // TBD: expand property descriptions";
            modified = true;
            fixes.push({
              fixed: true,
              ruleId: issue.ruleId,
              message: `Added description reminder on line ${j + 1}.`,
            });
          }
          break; // Only fix the first one found near the issue
        }
      }
    }

    return { content: modified ? lines.join("\n") : content, fixes };
  },
};
