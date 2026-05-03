# agent-code-auditor — backlog

Living doc tracking what's left after the deepen-rules migration. Update or
delete entries as they land.

## In flight (open PRs)

- `test/coverage-tightening` — adds tests for atomic-transactions AST path
  and verification framework branches; ~98% line / ~91% branch coverage.
- `refactor/drop-facades` — deletes the 16 family facade files
  (`src/fixers/*-fixer.ts`, `src/scanners/rules/*-lint.ts`); migrates ~150
  test imports to the per-`ruleId` Rules. Completes the original plan's
  intent.
- `feat/custom-rule-loading` — first scoped-out item from the plan: users
  register their own Rule modules via `customRules` in
  `.agentlintrc.json`.

## Next up

### 1. Reporter split out of `src/index.ts`

The CLI (~360 lines) mixes commander setup, scan/fix dispatch,
chalk-formatted text output, and CSV output. Split into:

- `src/report/text.ts` — `printTextReport(vuln, lint, ast)` with chalk
- `src/report/csv.ts` — `printCsvReport(vuln, lint, ast, targetDir)`
- `src/report/index.ts` — re-exports

Pulls the long `printReport` function and the inline CSV emission out;
leaves `src/index.ts` as a thin commander shell. Unblocks (2) and the
programmatic-API surface mentioned below. Small-medium effort.

### 2. Scanner interface uniformity

`runVulnerabilityScanner`, `runLinter`, and `runASTAnalyzer` each return a
different shape. Unify under a common `Scanner` interface (matching the
`Scanner` term in `CONTEXT.md`) so the CLI can iterate scanners
generically and so the library API has one well-typed result shape.

Files: `src/scanners/{vulnerabilities,linter,ast-analyzer}.ts`,
`src/scanners/types.ts`. Medium effort. Should land after (1) so the
reporter can consume the unified shape.

### 3. Programmatic API surface

For embedding agentlint as a library (other tools running scans/fixes
in-process). After (1) and (2), expose a clean entry point from
`src/index.ts` (or a new `src/api.ts`) that re-exports `runASTAnalyzer`,
`runFixer`, `loadConfig`, `registry`, `Rule`, `RuleContext`. Update
`package.json` `main` / `exports` if needed. Small effort.

## Smaller cleanups (defer until needed)

- `tool-overlapping` has a no-op `check` because it's a workspace-level
  concern. The cleaner fix is an optional `aggregate?(workspace) →
  Issue[]` on the `Rule` interface for cross-file detection. Worth doing
  only if a second cross-file rule appears.
- `globalTools` field on `RuleContext` is touched by ~3 tool rules and
  ignored by the other 17. Leaky abstraction; could move to a sub-context
  or be hidden behind a workspace accumulator type. Not painful enough to
  fix yet.
- `appliesTo: "all" | "source"` could grow into a richer extension/path
  filter. YAGNI for now.
