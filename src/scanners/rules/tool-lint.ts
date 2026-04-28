import * as ts from "typescript";
import { AgentLintConfig } from "../../config.js";
import { AgentIssue, ToolDeclaration } from "../types.js";

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
          if (ts.isPropertyAssignment(prop) && prop.name && ts.isIdentifier(prop.name)) {
            const propName = prop.name.text;
            if (propName === "type" && ts.isStringLiteral(prop.initializer) && prop.initializer.text === "object") {
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
            const { line } = sourceFile!.getLineAndCharacterOfPosition(node.getStart());
            issues.push({
              file,
              line: line + 1,
              message: "Tool parameter object missing descriptions.",
              ruleId: "tool-weak-schema",
              severity: config.rules["tool-weak-schema"] || "error",
              suggestion: "Add detailed descriptions to tool properties to guide the agent.",
              category: "Tool",
              startPos: node.getStart(),
              endPos: node.getEnd(),
            });
          }

          if (config.rules["tool-missing-examples"] !== "off" && !hasExamples) {
            const { line } = sourceFile!.getLineAndCharacterOfPosition(node.getStart());
            issues.push({
              file,
              line: line + 1,
              message: "Tool object missing examples.",
              ruleId: "tool-missing-examples",
              severity: config.rules["tool-missing-examples"] || "warn",
              suggestion: "Provide examples of valid and invalid tool calls to improve agent reliability.",
              category: "Tool",
              startPos: node.getStart(),
              endPos: node.getEnd(),
            });
          }
        }

        if (toolName && globalTools && (hasDescription || hasTypeObject)) {
          const { line } = sourceFile!.getLineAndCharacterOfPosition(node.getStart());
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
            suggestion: "Add detailed descriptions to tool properties to guide the agent.",
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
            suggestion: "Provide examples of valid and invalid tool calls to improve agent reliability.",
            category: "Tool",
          });
        }
      }
    }

    if (globalTools) {
      const content = lines.join("\n");
      const toolMatches = content.matchAll(/name:\s*['"](.*?)['"]/g);
      for (const match of toolMatches) {
        globalTools.push({
          name: match[1],
          file,
          line: 1,
        });
      }
    }
  }

  // The local tool-overlapping check is kept for backwards compatibility with tests and standalone file checks
  if (config.rules["tool-overlapping"] !== "off" && !globalTools) {
    const content = sourceFile ? sourceFile.text : lines.join("\n");
    const toolNames = content.match(/name:\s*['"](.*?)['"]/g) || [];
    const uniqueNames = new Set(toolNames);
    if (toolNames.length > uniqueNames.size) {
      issues.push({
        file,
        line: 1,
        message: "Multiple tools with identical or overlapping names detected.",
        ruleId: "tool-overlapping",
        severity: config.rules["tool-overlapping"] === "warn" ? "warn" : "error",
        suggestion: "Ensure each tool has a distinct name and purpose to avoid ambiguous decision points.",
        category: "Tool",
      });
    }
  }

  return issues;
}
