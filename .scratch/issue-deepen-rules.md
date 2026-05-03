# Deepen Rule architecture: pure fixers + per-ruleId Rule modules + Registry

## Background

Architecture review (May 2026) surfaced that Rules and Fixers are split across two trees, paired only by a string prefix on `ruleId`. The hard-coded dispatch in `src/scanners/ast-analyzer.ts` and `src/fixers/index.ts` means adding a rule family edits 4 places, and renaming a `ruleId` silently breaks the rule↔fixer pairing. Fixer file I/O is also coupled to fixer logic, which forces every fixer test through `fs.mkdtempSync` and blocks dry-run.

Design captured in `CONTEXT.md` (vocabulary: Rule, RuleContext, Issue, Severity, Registry, applyFix, Scanner, Orchestrator).

## Target shape

```ts
type Rule = {
  id: string;
  severity?: Severity;
  check(ctx: RuleContext): Issue[];
  applyFix?(content: string, issues: Issue[]): FixOutcome;
};

type RuleContext = {
  filePath: string;
  content: string;
  lines: string[];
  ast: ts.SourceFile | undefined;
};

type FixOutcome = { content: string; fixed: Issue[]; skipped?: Issue[] };
```

Decisions locked:
- One module per `ruleId` (~15–25 modules under `src/rules/`)
- Single uniform `RuleContext`, AST optional
- Rules are config-blind; orchestrator applies severity + `skipRules`
- `applyFix` receives only this rule's issues
- Static array Registry exported from `src/rules/index.ts`
- ESLint and vulnerability issues stay outside the Registry (display-only)

## Migration path (Path A — bottom-up)

Each step is independently shippable.

### Step 1 — Make fixers pure (this issue's first PR)

- Add `FixOutcome` to `src/fixers/types.ts`
- Refactor `src/fixers/index.ts` orchestrator: read each file once, thread content through every matching fixer, write once
- Refactor each `src/fixers/*-fixer.ts` from `(file, issues) → FixResult[]` to `(content, issues) → FixOutcome`. Strip out `fs.readFile`/`writeFile`/`existsSync`
- Update custom-fixer interface (breaking change; `feat!` commit + CHANGELOG note): `fix(content, issues): FixOutcome`
- Convert per-fixer unit tests to use literal string fixtures (no temp dirs). Keep orchestrator-level integration tests as-is (regression check)

### Step 2 — Define Rule, RuleContext, Registry

- New types in `src/rules/types.ts`
- Static array in `src/rules/index.ts`
- Wrap each existing rule family as a thick Rule (one Rule per family, ~7 wrappers)
- Replace hard-coded dispatch in `src/scanners/ast-analyzer.ts:8-14, 130-142` with `for (const rule of rules)`

### Step 3 — Move config application to the orchestrator

- Strip `config.rules[id]` checks out of rule files
- Orchestrator: skip when `"off"`, stamp severity overrides on emitted issues

### Step 4 — Split family-Rules into per-`ruleId` Rules

- One PR per family. Mechanical and reviewable.
- New layout: `src/rules/<ruleId>.ts` per rule

### Step 5 — Inline fixer logic into Rule.applyFix

- Move each pure fixer's body into its paired Rule's `applyFix`
- Delete `src/fixers/*-fixer.ts` family files
- Rename orchestrator (`fixers/index.ts` → `fix-orchestrator.ts` or similar)

## Out of scope

- Custom rule loading from `.agentlintrc.json` (only one source of rules today; revisit when a second adapter exists)
- Reporter split out of `src/index.ts` (separate deepening, separate issue)
- Scanner interface uniformity across `linter.ts` / `vulnerabilities.ts` (hypothetical seam)
