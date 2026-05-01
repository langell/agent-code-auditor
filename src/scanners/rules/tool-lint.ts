import * as ts from "typescript";
import { AgentLintConfig } from "../../config.js";
import { AgentIssue, ToolDeclaration } from "../types.js";

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

export function checkToolRules(
  file: string,
  lines: string[],
  config: AgentLintConfig,
  sourceFile?: ts.SourceFile,
  globalTools?: ToolDeclaration[],
): AgentIssue[] {
  const issues: AgentIssue[] = [];

  if (sourceFile) {
    function visit(node: ts.Node) {
      if (ts.isObjectLiteralExpression(node)) {
        let hasTypeObject = false;
        let hasDescription = false;
        let hasExamples = false;
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
            if (propName === "examples") {
              hasExamples = true;
            }
            if (propName === "name" && ts.isStringLiteral(prop.initializer)) {
              toolName = prop.initializer.text;
            }
          }
        }

        if (hasTypeObject) {
          if (config.rules["tool-weak-schema"] !== "off" && !hasDescription) {
            const { line } = sourceFile!.getLineAndCharacterOfPosition(
              node.getStart(),
            );
            issues.push({
              file,
              line: line + 1,
              message: "Tool parameter object missing descriptions.",
              ruleId: "tool-weak-schema",
              severity: config.rules["tool-weak-schema"] || "error",
              suggestion:
                "Add detailed descriptions to tool properties to guide the agent.",
              category: "Tool",
              startPos: node.getStart(),
              endPos: node.getEnd(),
            });
          }

          if (config.rules["tool-missing-examples"] !== "off" && !hasExamples) {
            const { line } = sourceFile!.getLineAndCharacterOfPosition(
              node.getStart(),
            );
            issues.push({
              file,
              line: line + 1,
              message: "Tool object missing examples.",
              ruleId: "tool-missing-examples",
              severity: config.rules["tool-missing-examples"] || "warn",
              suggestion:
                "Provide examples of valid and invalid tool calls to improve agent reliability.",
              category: "Tool",
              startPos: node.getStart(),
              endPos: node.getEnd(),
            });
          }
        }

        if (toolName && globalTools && looksLikeToolObject(node.properties)) {
          const { line } = sourceFile!.getLineAndCharacterOfPosition(
            node.getStart(),
          );
          globalTools.push({
            name: toolName,
            file,
            line: line + 1,
          });
        }
      }
      ts.forEachChild(node, visit);
    }
    visit(sourceFile);
  } else {
    const objectTypePattern = /type:\s*["']object["']/;
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];

      if (config.rules["tool-weak-schema"] !== "off") {
        if (
          objectTypePattern.test(line) &&
          !lines
            .slice(Math.max(0, i - 5), Math.min(lines.length, i + 5))
            .some((l) => l.includes("description"))
        ) {
          issues.push({
            file,
            line: i + 1,
            message: "Tool parameter object missing descriptions.",
            ruleId: "tool-weak-schema",
            severity: config.rules["tool-weak-schema"] || "error",
            suggestion:
              "Add detailed descriptions to tool properties to guide the agent.",
            category: "Tool",
          });
        }
      }

      if (config.rules["tool-missing-examples"] !== "off") {
        if (
          objectTypePattern.test(line) &&
          !lines
            .slice(Math.max(0, i - 10), Math.min(lines.length, i + 15))
            .some((l) => l.includes("examples"))
        ) {
          issues.push({
            file,
            line: i + 1,
            message: "Tool object missing examples.",
            ruleId: "tool-missing-examples",
            severity: config.rules["tool-missing-examples"] || "warn",
            suggestion:
              "Provide examples of valid and invalid tool calls to improve agent reliability.",
            category: "Tool",
          });
        }
      }
    }

    if (globalTools) {
      const content = lines.join("\n");
      const namedToolNames = collectToolNamesNonAst(content);
      for (const name of namedToolNames) {
        globalTools.push({ name, file, line: 1 });
      }
    }
  }

  // The local tool-overlapping check is kept for backwards compatibility with tests and standalone file checks
  if (config.rules["tool-overlapping"] !== "off" && !globalTools) {
    const content = sourceFile ? sourceFile.text : lines.join("\n");
    const toolNames = collectToolNamesNonAst(content);
    const uniqueNames = new Set(toolNames);
    if (toolNames.length > uniqueNames.size) {
      issues.push({
        file,
        line: 1,
        message: "Multiple tools with identical or overlapping names detected.",
        ruleId: "tool-overlapping",
        severity:
          config.rules["tool-overlapping"] === "warn" ? "warn" : "error",
        suggestion:
          "Ensure each tool has a distinct name and purpose to avoid ambiguous decision points.",
        category: "Tool",
      });
    }
  }

  return issues;
}
