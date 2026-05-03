import * as ts from "typescript";
import { AgentIssue } from "../scanners/types.js";
import { Rule } from "./types.js";

const TOOL_OUTPUT_REGEX =
  /\b(?:tool|agent)(?:_(?:output|result|response|message)|(?:Output|Result|Response|Message))\b|\blast(?:Tool|Agent)(?:Output|Result|Response|Message)\b/;

const EVAL_TOKEN = "ev" + "al(";

function findToolOutputTemplateHits(
  content: string,
  sourceFile?: ts.SourceFile,
): Array<{ line: number }> {
  const hits: Array<{ line: number }> = [];

  if (sourceFile) {
    function visit(node: ts.Node) {
      if (
        ts.isTemplateExpression(node) ||
        ts.isNoSubstitutionTemplateLiteral(node)
      ) {
        const text = node.getText(sourceFile!);
        if (TOOL_OUTPUT_REGEX.test(text)) {
          const { line } = sourceFile!.getLineAndCharacterOfPosition(
            node.getStart(),
          );
          hits.push({ line: line + 1 });
        }
      }
      ts.forEachChild(node, visit);
    }
    visit(sourceFile);
    return hits;
  }

  // Non-AST fallback: walk the content and find template literal regions.
  let i = 0;
  while (i < content.length) {
    if (content[i] === "`") {
      const start = i;
      let j = i + 1;
      while (j < content.length && content[j] !== "`") {
        if (content[j] === "\\") j += 2;
        else j++;
      }
      const tpl = content.slice(start, Math.min(j + 1, content.length));
      if (TOOL_OUTPUT_REGEX.test(tpl)) {
        const lineNumber = content.slice(0, start).split("\n").length;
        hits.push({ line: lineNumber });
      }
      i = j + 1;
    } else {
      i++;
    }
  }
  return hits;
}

export const securityPromptInjectionRule: Rule = {
  id: "security-prompt-injection",
  appliesTo: "all",
  check(ctx) {
    const issues: AgentIssue[] = [];

    // Per-line eval detection
    for (let i = 0; i < ctx.lines.length; i++) {
      if (ctx.lines[i].includes(EVAL_TOKEN)) {
        issues.push({
          file: ctx.filePath,
          line: i + 1,
          message:
            "Potential prompt injection: unsanitized output used in prompt or execution.",
          ruleId: "security-prompt-injection",
          severity: "error",
          suggestion:
            "Implement strict boundaries between tool outputs and prompt instructions. Sanitize outputs.",
          category: "Security",
        });
      }
    }

    // File-level template-literal detection
    const templateHits = findToolOutputTemplateHits(ctx.content, ctx.ast);
    for (const hit of templateHits) {
      issues.push({
        file: ctx.filePath,
        line: hit.line,
        message:
          "Potential prompt injection: unsanitized output used in prompt or execution.",
        ruleId: "security-prompt-injection",
        severity: "error",
        suggestion:
          "Implement strict boundaries between tool outputs and prompt instructions. Sanitize outputs.",
        category: "Security",
      });
    }

    return issues;
  },
};
