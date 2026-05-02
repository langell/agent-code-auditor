# agent-code-auditor

A configurable audit tool and linter for AI-generated code. Detects "AI code smells," insecure patterns, and hallucinations; auto-fixes a subset.

## Language

**Rule**:
A self-contained module that detects one specific kind of issue and optionally knows how to fix it. Identified by a `ruleId`. Owns both `check` and `applyFix`.
_Avoid_: check, lint, linter rule, validator (linter rule is okay informally but "Rule" is the canonical noun in this codebase).

**RuleContext**:
The pre-computed input passed to a Rule's `check`: file path, content, lines, and optional parsed TypeScript `SourceFile`. Built once per file by the orchestrator and reused across all Rules for that file.
_Avoid_: input, file context, scan input.

**Issue**:
One detected occurrence of a problem in a file. Carries `ruleId`, severity, location, and a message. Produced by a Rule's `check` (or by an external Scanner).
_Avoid_: violation, finding, problem, error, lint result.

**Severity**:
The weight stamped on an Issue: `error`, `warn`, or `off`. A Rule has a default severity; user config can override per-`ruleId`. Severity stamping happens in the orchestrator, not in the Rule.

**Registry**:
The static array of Rules the orchestrator iterates over. Built-ins live in `src/rules/index.ts`. Custom rules from user config (if/when supported) concat onto the same array.
_Avoid_: rule list, plugin list, ruleset.

**applyFix**:
The optional pure method on a Rule: `(content, issues) → { content, fixed, skipped? }`. Receives only the issues that Rule produced for the file. Never reads or writes disk — file I/O is the orchestrator's job.
_Avoid_: fix, transform, mutator (these are too generic; `applyFix` is the precise name).

**Scanner**:
A producer of Issues that is not a Rule. Today: the ESLint wrapper (`linter.ts`), the dependency vulnerability scanner (`vulnerabilities.ts`), and the AST analyzer (`ast-analyzer.ts`) — though the AST analyzer is being refactored to dispatch through the Registry rather than be a Scanner of its own. Issues from non-Rule Scanners pass through to the report unchanged; `applyFix` does not touch them.
_Avoid_: checker, analyzer (use those only inside a specific Scanner's name).

**Fixer**:
**Deprecated term.** Pre-refactor, fixers were standalone functions in `src/fixers/` that read files, mutated content, and wrote them back. Post-refactor, fixer logic lives inside each Rule as `applyFix`, and file I/O lives in the orchestrator. New code should not introduce "Fixer" as a noun.

**Orchestrator**:
The code that iterates the Registry, builds RuleContext per file, calls each Rule's `check` (or `applyFix`), applies user config (severity overrides, skipRules), and handles all file I/O. Two orchestrators today: the scan orchestrator (in `ast-analyzer.ts` post-refactor) and the fix orchestrator (in `fixers/index.ts` post-refactor, eventually renamed).

## Relationships

- A **Rule** has one **`check`** and zero-or-one **`applyFix`**.
- A **Rule**'s **`check`** receives a **RuleContext** and returns **Issues**.
- A **Rule**'s **`applyFix`** receives content + the **Issues** that Rule produced, and returns transformed content plus per-Issue fix records.
- The **Registry** holds all built-in **Rules**. The **Orchestrator** iterates it.
- A **Scanner** produces **Issues** but is not a **Rule** — its issues are display-only.
- **Severity** lives on an **Issue** and is stamped by the **Orchestrator** based on user config and the **Rule**'s default.

## Example dialogue

> **Dev:** "Where do I add config-aware logic for the new max-line-length rule?"
> **Maintainer:** "Don't. The **Rule** is config-blind. The **Orchestrator** reads `.agentlintrc.json` and decides whether to call your `check` and what **Severity** to stamp on the **Issues** you emit. If your **Rule** needs *parameters* (like a configurable line limit), we'll add an `options` argument to `check` — but we haven't crossed that bridge yet."

> **Dev:** "Do ESLint findings flow through `applyFix`?"
> **Maintainer:** "No. ESLint is a **Scanner**, not a source of **Rules**. Its issues are display-only on our side — ESLint's own `--fix` handles them."

## Flagged ambiguities

- **"Fixer"** was previously used for a standalone module under `src/fixers/`. Resolved: post-refactor, that role collapses into a Rule's `applyFix` method. The directory and term are deprecated. Issues fixed by external tools (ESLint `--fix`) are not "Fixers" in our vocabulary.
- **"Rule"** (this codebase) vs **"rule"** (ESLint). When discussing ESLint, prefer "ESLint rule" to disambiguate.
