# agent-code-auditor — backlog

Living doc tracking what's left after the deepen-rules migration. Update or
delete entries as they land.

## Recently landed

- ✅ Reporter split out of `src/index.ts` (PR #16) — CLI shrunk from
  ~360 → 97 lines; `src/report/{text,csv,index}.ts` carry formatting.
- ✅ `feat/custom-rule-loading` (PR #14) — first scoped-out plan item:
  `customRules` array in `.agentlintrc.json`.
- ✅ `refactor/drop-facades` (PR #15) — deleted 16 family facade files;
  tests now go through per-`ruleId` Rules directly.
- ✅ `test/coverage-tightening` (PR #13) — coverage on the
  atomic-transactions AST path and verification framework branches.

Current state on main: 228/228 tests pass; ~95–98% line coverage; all 20
per-`ruleId` rule modules under `src/rules/`; canonical Rule interface
with `check` + optional `applyFix`.

## Next up

### 1. Scanner interface uniformity

`runVulnerabilityScanner`, `runLinter`, and `runASTAnalyzer` each return a
different shape. Unify under a common `Scanner` interface (matching the
`Scanner` term in `CONTEXT.md`) so the CLI can iterate scanners
generically and so the library API has one well-typed result shape.

Files: `src/scanners/{vulnerabilities,linter,ast-analyzer}.ts`,
`src/scanners/types.ts`, plus reporter consumers
(`src/report/{text,csv}.ts`). Medium effort.

### 2. Programmatic API surface

For embedding agentlint as a library (other tools running scans/fixes
in-process). After (1), expose a clean entry point — either from
`src/index.ts` or a new `src/api.ts` — that re-exports `runASTAnalyzer`,
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
