import assert from "node:assert/strict";
import test from "node:test";
import * as ts from "typescript";

import { loadConfig } from "../src/config.js";
import { checkSecurityRules } from "../src/scanners/rules/security-lint.js";

function lint(file: string, content: string) {
  const config = loadConfig(".");
  const sourceFile = ts.createSourceFile(
    file,
    content,
    ts.ScriptTarget.Latest,
    true,
  );
  return checkSecurityRules(file, content.split("\n"), config, sourceFile).filter(
    (i) => i.ruleId === "security-input-validation",
  );
}

// === True positives ===

test("flags Next.js route handler with unvalidated body", () => {
  const issues = lint(
    "apps/web/app/api/contact/route.ts",
    [
      "export async function POST(request) {",
      "  const body = await request.json();",
      "  return Response.json({ ok: true });",
      "}",
    ].join("\n"),
  );
  assert.equal(issues.length, 1);
});

test("flags Server Action with 'use server' directive and unvalidated input", () => {
  const issues = lint(
    "apps/web/app/lib/actions.ts",
    [
      "'use server';",
      "export async function submit(formData) {",
      "  return formData;",
      "}",
    ].join("\n"),
  );
  assert.equal(issues.length, 1);
});

test("flags Express handler under routes/ directory", () => {
  const issues = lint(
    "apps/api/src/routes/users.ts",
    [
      "export const handler = (req, res) => {",
      "  res.json(req.body);",
      "};",
    ].join("\n"),
  );
  assert.equal(issues.length, 1);
});

// === False positives the old rule produced — must NOT flag now ===

test("does not flag pure utility under apps/api (haversine math)", () => {
  const issues = lint(
    "apps/api/src/lib/haversine.ts",
    [
      "export const haversineKm = (lat1: number, lng1: number, lat2: number, lng2: number): number => {",
      "  return Math.sqrt(lat1 + lng1 + lat2 + lng2);",
      "};",
    ].join("\n"),
  );
  assert.equal(issues.length, 0);
});

test("does not flag cron/job module under apps/api", () => {
  const issues = lint(
    "apps/api/src/jobs/prewarm-cache.ts",
    [
      "export async function runPrewarmCache(): Promise<void> {",
      "  return;",
      "}",
    ].join("\n"),
  );
  assert.equal(issues.length, 0);
});

test("does not flag parameterless route handler", () => {
  const issues = lint(
    "apps/web/app/api/auth/api-token/route.ts",
    [
      "export async function GET() {",
      "  return Response.json({});",
      "}",
    ].join("\n"),
  );
  assert.equal(issues.length, 0);
});

test("does not flag server.ts entry point that just starts the listener", () => {
  const issues = lint(
    "apps/api/src/server.ts",
    [
      "export const startServer = () => {",
      "  const app = createApp();",
      "  return app.listen(3000);",
      "};",
    ].join("\n"),
  );
  assert.equal(issues.length, 0);
});

// === Validation patterns the old rule missed ===

test("recognizes safeParse as validation", () => {
  const issues = lint(
    "apps/web/app/api/items/route.ts",
    [
      "export async function POST(request) {",
      "  const parsed = schema.safeParse(await request.json());",
      "  return Response.json(parsed);",
      "}",
    ].join("\n"),
  );
  assert.equal(issues.length, 0);
});

test("recognizes parseAsync as validation", () => {
  const issues = lint(
    "apps/web/app/api/items/route.ts",
    [
      "export async function POST(request) {",
      "  const parsed = await schema.parseAsync(await request.json());",
      "  return Response.json(parsed);",
      "}",
    ].join("\n"),
  );
  assert.equal(issues.length, 0);
});

test("recognizes camelCase validateXxx() as validation", () => {
  const issues = lint(
    "apps/api/src/routes/users.ts",
    [
      "export const handler = (req, res) => {",
      "  const input = validateUserPayload(req.body);",
      "  res.json(input);",
      "};",
    ].join("\n"),
  );
  assert.equal(issues.length, 0);
});
