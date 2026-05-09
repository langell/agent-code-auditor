import test from "node:test";

import { securityInputValidationRule } from "../src/rules/security-input-validation.js";
import { expectCheck, expectNoIssues } from "./_helpers.js";

// All tests in this file run the rule with `withAst: true` (the rule needs
// the TS AST to find exported function-likes for the validation check).
const SHOULD_FLAG = [{ ruleId: "security-input-validation" }];

// === True positives ===

test("flags Next.js route handler with unvalidated body", () => {
  expectCheck(securityInputValidationRule, {
    content: [
      "export async function POST(request) {",
      "  const body = await request.json();",
      "  return Response.json({ ok: true });",
      "}",
    ].join("\n"),
    filePath: "apps/web/app/api/contact/route.ts",
    withAst: true,
    expectIssues: SHOULD_FLAG,
  });
});

test("flags Server Action with 'use server' directive and unvalidated input", () => {
  expectCheck(securityInputValidationRule, {
    content: [
      "'use server';",
      "export async function submit(formData) {",
      "  return formData;",
      "}",
    ].join("\n"),
    filePath: "apps/web/app/lib/actions.ts",
    withAst: true,
    expectIssues: SHOULD_FLAG,
  });
});

test("flags Express handler under routes/ directory", () => {
  expectCheck(securityInputValidationRule, {
    content: [
      "export const handler = (req, res) => {",
      "  res.json(req.body);",
      "};",
    ].join("\n"),
    filePath: "apps/api/src/routes/users.ts",
    withAst: true,
    expectIssues: SHOULD_FLAG,
  });
});

// === False positives the old rule produced — must NOT flag now ===

test("does not flag pure utility under apps/api (haversine math)", () => {
  expectNoIssues(securityInputValidationRule, {
    content: [
      "export const haversineKm = (lat1: number, lng1: number, lat2: number, lng2: number): number => {",
      "  return Math.sqrt(lat1 + lng1 + lat2 + lng2);",
      "};",
    ].join("\n"),
    filePath: "apps/api/src/lib/haversine.ts",
    withAst: true,
  });
});

test("does not flag cron/job module under apps/api", () => {
  expectNoIssues(securityInputValidationRule, {
    content: [
      "export async function runPrewarmCache(): Promise<void> {",
      "  return;",
      "}",
    ].join("\n"),
    filePath: "apps/api/src/jobs/prewarm-cache.ts",
    withAst: true,
  });
});

test("does not flag parameterless route handler", () => {
  expectNoIssues(securityInputValidationRule, {
    content: [
      "export async function GET() {",
      "  return Response.json({});",
      "}",
    ].join("\n"),
    filePath: "apps/web/app/api/auth/api-token/route.ts",
    withAst: true,
  });
});

test("does not flag server.ts entry point that just starts the listener", () => {
  expectNoIssues(securityInputValidationRule, {
    content: [
      "export const startServer = () => {",
      "  const app = createApp();",
      "  return app.listen(3000);",
      "};",
    ].join("\n"),
    filePath: "apps/api/src/server.ts",
    withAst: true,
  });
});

// === Validation patterns the old rule missed ===

test("recognizes safeParse as validation", () => {
  expectNoIssues(securityInputValidationRule, {
    content: [
      "export async function POST(request) {",
      "  const parsed = schema.safeParse(await request.json());",
      "  return Response.json(parsed);",
      "}",
    ].join("\n"),
    filePath: "apps/web/app/api/items/route.ts",
    withAst: true,
  });
});

test("recognizes parseAsync as validation", () => {
  expectNoIssues(securityInputValidationRule, {
    content: [
      "export async function POST(request) {",
      "  const parsed = await schema.parseAsync(await request.json());",
      "  return Response.json(parsed);",
      "}",
    ].join("\n"),
    filePath: "apps/web/app/api/items/route.ts",
    withAst: true,
  });
});

test("recognizes camelCase validateXxx() as validation", () => {
  expectNoIssues(securityInputValidationRule, {
    content: [
      "export const handler = (req, res) => {",
      "  const input = validateUserPayload(req.body);",
      "  res.json(input);",
      "};",
    ].join("\n"),
    filePath: "apps/api/src/routes/users.ts",
    withAst: true,
  });
});
