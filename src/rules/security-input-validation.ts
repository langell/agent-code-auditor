import * as ts from "typescript";
import { AgentIssue } from "../scanners/types.js";
import { looksValidated } from "../scanners/rules/validation-helpers.js";
import { insertAfterImports, isTypeScriptTarget } from "./_helpers.js";
import { FixRecord, Rule } from "./types.js";

function isIdentifierToken(value: string): boolean {
  if (!value) return false;
  const first = value[0];
  const isFirstValid =
    (first >= "A" && first <= "Z") ||
    (first >= "a" && first <= "z") ||
    first === "_" ||
    first === "$";
  if (!isFirstValid) return false;

  for (let i = 1; i < value.length; i++) {
    const ch = value[i];
    const isValid =
      (ch >= "A" && ch <= "Z") ||
      (ch >= "a" && ch <= "z") ||
      (ch >= "0" && ch <= "9") ||
      ch === "_" ||
      ch === "$";
    if (!isValid) return false;
  }

  return true;
}

const ROUTE_FILE_EXT_REGEX = /\/route\.(?:ts|tsx|js|jsx)$/;
const SOURCE_FILE_EXT_REGEX = /\.(?:ts|tsx|js|jsx)$/;
const PAGES_API_DIR_REGEX = /\/pages\/api\//;
const APP_DIR_REGEX = /\/app\//;
const EXPRESS_ROUTES_DIR_REGEX = /\/routes\//;
const USE_SERVER_DIRECTIVE_REGEX = /^\s*['"]use server['"];?\s*$/m;

function hasUseServerDirective(content: string): boolean {
  const head = content.split("\n").slice(0, 6).join("\n");
  return USE_SERVER_DIRECTIVE_REGEX.test(head);
}

function isRouteHandlerFile(file: string, content: string): boolean {
  const norm = file.replace(/\\/g, "/");
  // Next.js App Router handler: app/.../route.ts
  if (APP_DIR_REGEX.test(norm) && ROUTE_FILE_EXT_REGEX.test(norm)) return true;
  // Next.js Pages API: pages/api/...
  if (PAGES_API_DIR_REGEX.test(norm) && SOURCE_FILE_EXT_REGEX.test(norm))
    return true;
  // Express handlers under a routes/ directory
  if (EXPRESS_ROUTES_DIR_REGEX.test(norm)) return true;
  // Next.js Server Actions
  if (hasUseServerDirective(content)) return true;
  return false;
}

function isExportedFunctionLike(node: ts.Node): boolean {
  if (
    ts.isFunctionDeclaration(node) &&
    node.modifiers?.some((m) => m.kind === ts.SyntaxKind.ExportKeyword)
  ) {
    return true;
  }
  if (
    ts.isVariableStatement(node) &&
    node.modifiers?.some((m) => m.kind === ts.SyntaxKind.ExportKeyword)
  ) {
    return true;
  }
  return false;
}

function hasParameters(node: ts.Node): boolean {
  if (ts.isFunctionDeclaration(node)) {
    return node.parameters.length > 0;
  }
  if (ts.isVariableStatement(node)) {
    for (const decl of node.declarationList.declarations) {
      const init = decl.initializer;
      if (
        init &&
        (ts.isArrowFunction(init) || ts.isFunctionExpression(init)) &&
        init.parameters.length > 0
      ) {
        return true;
      }
    }
  }
  return false;
}

export const securityInputValidationRule: Rule = {
  id: "security-input-validation",
  appliesTo: "all",
  check(ctx) {
    const issues: AgentIssue[] = [];
    const content = ctx.content;

    if (!isRouteHandlerFile(ctx.filePath, content)) {
      return issues;
    }

    let missingValidation = false;
    let issueNode: ts.Node | undefined;

    if (ctx.ast) {
      const sourceFile = ctx.ast;
      function visit(node: ts.Node) {
        if (isExportedFunctionLike(node) && hasParameters(node)) {
          const funcText = node.getText(sourceFile);
          if (
            (funcText.includes("function") || funcText.includes("=>")) &&
            !looksValidated(funcText)
          ) {
            missingValidation = true;
            issueNode = node;
          }
        }
        ts.forEachChild(node, visit);
      }
      visit(sourceFile);
    } else {
      if (
        (content.includes("export async function") ||
          content.includes("export function")) &&
        !looksValidated(content)
      ) {
        missingValidation = true;
      }
    }

    if (missingValidation) {
      const line = issueNode
        ? ctx.ast!.getLineAndCharacterOfPosition(issueNode.getStart()).line + 1
        : 1;
      issues.push({
        file: ctx.filePath,
        line,
        message:
          "API route or Server Action appears to be missing input validation.",
        ruleId: "security-input-validation",
        severity: "error",
        suggestion:
          "Sanitize and validate all user inputs before processing. Use a schema validation library like Zod.",
        category: "Security",
        startPos: issueNode?.getStart(),
        endPos: issueNode?.getEnd(),
      });
    }

    return issues;
  },
  applyFix(content, issues, filePath) {
    const fixes: FixRecord[] = [];
    const inputValidationIssues = issues.filter(
      (i) => i.ruleId === "security-input-validation",
    );
    if (inputValidationIssues.length === 0 || looksValidated(content)) {
      return { content, fixes };
    }

    let next = content;

    const isTs = isTypeScriptTarget(filePath);
    const validateHelper = isTs
      ? "function validate(input: unknown): void {\n" +
        "  if (input === null || input === undefined) {\n" +
        "    throw new Error('Invalid input');\n" +
        "  }\n" +
        "}\n"
      : "function validate(input) {\n" +
        "  if (input === null || input === undefined) {\n" +
        "    throw new Error('Invalid input');\n" +
        "  }\n" +
        "}\n";

    if (
      !next.includes("function validate(") &&
      !next.includes("const validate =")
    ) {
      next = insertAfterImports(next, validateHelper);
    }

    const astIssues = inputValidationIssues.filter(
      (i) => i.startPos !== undefined && i.endPos !== undefined,
    );

    if (astIssues.length > 0) {
      astIssues.sort((a, b) => b.startPos! - a.startPos!);
      for (const issue of astIssues) {
        const nodeText = next.slice(issue.startPos!, issue.endPos!);

        const blockStartIndex = nodeText.indexOf("{");
        if (blockStartIndex === -1) continue;

        const signature = nodeText.slice(0, blockStartIndex);
        const paramsChunk =
          signature.split("(")[1]?.split(")")[0]?.trim() || "";
        let paramName = "input";

        if (paramsChunk.length > 0) {
          const firstParam = paramsChunk.split(",")[0].trim();
          const token = firstParam.split(":")[0].trim();
          if (isIdentifierToken(token)) {
            paramName = token;
          }
        }

        const injection = `{\n  validate(${paramName});`;
        const replacedText =
          nodeText.slice(0, blockStartIndex) +
          injection +
          nodeText.slice(blockStartIndex + 1);

        if (replacedText !== nodeText) {
          next =
            next.slice(0, issue.startPos!) +
            replacedText +
            next.slice(issue.endPos!);
          fixes.push({
            fixed: true,
            ruleId: "security-input-validation",
            message: "Added a basic input validation guard template.",
          });
        }
      }
    } else {
      // Fallback line-by-line
      const lines = next.split("\n");
      let injectedValidation = false;
      for (let i = 0; i < lines.length; i++) {
        const line = lines[i].trim();
        if (
          (line.startsWith("export async function ") ||
            line.startsWith("export function ")) &&
          line.includes("(") &&
          line.includes(")") &&
          line.endsWith("{")
        ) {
          const paramsChunk = line.split("(")[1]?.split(")")[0]?.trim() || "";
          let paramName = "input";

          if (paramsChunk.length > 0) {
            const firstParam = paramsChunk.split(",")[0].trim();
            const token = firstParam.split(":")[0].trim();
            if (isIdentifierToken(token)) {
              paramName = token;
            }
          }

          lines.splice(i + 1, 0, `  validate(${paramName});`);
          injectedValidation = true;
          break;
        }
      }

      if (injectedValidation) {
        next = lines.join("\n");
        fixes.push({
          fixed: true,
          ruleId: "security-input-validation",
          message: "Added a basic input validation guard template.",
        });
      }
    }

    return { content: next, fixes };
  },
};
