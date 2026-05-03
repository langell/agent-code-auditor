# agent-code-auditor

agent-code-auditor is a configurable audit tool and linter specifically designed for AI-generated code. It helps development teams detect, audit, and automatically fix common "AI code smells," insecure patterns, and hallucinations.

## Features

- **Static Analysis**: Deep scanning of your codebase to find typical AI-generated code issues.
- **Dependency Vulnerability Scanning**: Ensures AI hasn't introduced outdated or vulnerable packages.
- **Custom Rule Engine**: Tailor the linter to your project's specific needs to catch domain-specific AI hallucinations.
- **Auto-Fix Capabilities**: Automatically correct simple AI-generated code smells to streamline development.
- **IDE Integration Ready**: Designed to work seamlessly within your development workflow.

## Installation

Install agent-code-auditor globally or locally in your project using your preferred package manager.

```bash
# Using npm
npm install -g agent-code-auditor

# Using pnpm
pnpm install -g agent-code-auditor

# Using yarn
yarn global add agent-code-auditor
```

## Usage

agent-code-auditor provides a simple CLI to scan and fix your workspace.

### Scanning your workspace

To scan a directory for AI code smells, vulnerabilities, and linting errors:

```bash
agentlint scan
```

You can specify a target directory:

```bash
agentlint scan -d ./src
```

### Fixing issues automatically

To automatically apply fixes for detected code smells and linting errors:

```bash
agentlint fix
```

You can also specify a directory to fix:

```bash
agentlint fix -d ./src
```

## Configuration

AgentLint looks for a configuration file in your project directory. This allows you to define rule overrides and configure the AST analyzer for your specific needs.

Example `.agentlintrc.json`:

```json
{
  "skipRules": ["code-quality-no-any", "tool-overlapping"],
  "rules": {
    "security-input-validation": "error",
    "spec-missing-rollback": "off",
    "no-console-log": "warn"
  },
  "fixers": {
    "code-quality-no-any": "./agentlint-fixers/custom-no-any-fixer.mjs#CustomNoAnyFixer"
  },
  "customRules": [
    "./agentlint-rules/no-console-log.mjs#noConsoleLogRule"
  ]
}
```

- `skipRules`: list of rule IDs to disable without setting each rule to `off`.
- `rules`: rule severity overrides (`error`, `warn`, `off`). Works for both built-in and custom rule IDs.
- `fixers`: map of `ruleId` to a custom fixer class module reference.
  - String format: `./relative/path/to/module.mjs#ExportedClassName`
  - Object form: `{ "path": "./module.mjs", "exportName": "ExportedClassName" }`
- `customRules`: array of module references that export a `Rule` object. Loaded at startup and merged into the built-in registry.
  - String format: `./relative/path/to/module.mjs#exportedRuleName`
  - Object form: `{ "path": "./module.mjs", "exportName": "exportedRuleName" }`

### Custom fixer contract

A custom fixer is a class with a single `fix` method. The orchestrator
owns all file I/O — your fixer receives the file's current content as a
string, transforms it, and returns a `FixOutcome`.

```js
// my-fixer.mjs
export class MyFixer {
  fix(content, issues, filePath) {
    // issues are pre-filtered to only this fixer's ruleId
    const updated = content.replace(/badPattern/g, "goodPattern");
    return {
      content: updated,
      fixes: [
        {
          fixed: true,
          ruleId: "my-rule",
          message: "Replaced bad pattern.",
        },
      ],
      // optional: scaffold sibling files (e.g. test stubs)
      // newFiles: [{ path: "/abs/path/to/new.ts", content: "..." }],
    };
  }
}
```

Contract:

- Default-export OR named-export a class. The class is instantiated with
  `new` and no constructor args.
- The instance must implement `fix(content, issues, filePath): FixOutcome`,
  sync or async.
- `FixOutcome = { content, fixes, newFiles? }`. Each fix record is
  `{ fixed, ruleId, message }` — the orchestrator stamps the file path.
- Don't read or write files inside the fixer; return transformed content
  and the orchestrator will write it (and any `newFiles`) once per file.

A working example lives in
[`examples/custom-fixers/secret-to-env-fixer.mjs`](examples/custom-fixers/secret-to-env-fixer.mjs).

> **Breaking change in 2.x**: pre-refactor custom fixers used
> `fix(filePath, issues): FixResult[]` and did their own file I/O. The
> new contract above is required.

### Custom rule contract

A custom rule is a plain object that matches the same shape as built-in
rules. The orchestrator handles config (severity overrides, `"off"`
filtering) and I/O — your rule emits issues at its own default severity
and (optionally) provides an `applyFix` for `agentlint fix`.

```js
// my-rule.mjs
export const myRule = {
  id: "my-rule",
  appliesTo: "source", // or "all" to also scan .md / .prompt
  check(ctx) {
    // ctx: { filePath, content, lines, ast?, targetDir, globalTools }
    const issues = [];
    if (ctx.content.includes("badPattern")) {
      issues.push({
        file: ctx.filePath,
        line: 1,
        message: "Don't use badPattern.",
        ruleId: "my-rule",
        severity: "warn",
        category: "Code Quality",
      });
    }
    return issues;
  },
  // Optional — implement to make the rule auto-fixable.
  applyFix(content, issues, filePath) {
    return {
      content: content.replace(/badPattern/g, "goodPattern"),
      fixes: issues.map((i) => ({
        fixed: true,
        ruleId: "my-rule",
        message: "Replaced badPattern with goodPattern.",
      })),
    };
  },
};
```

Contract:

- Named OR default export of a `Rule`-shaped object. No `new`; the object is used directly.
- Required fields: `id` (string), `appliesTo` (`"all"` or `"source"`), `check(ctx) → Issue[]`.
- `applyFix(content, issues, filePath) → FixOutcome` is optional. Same `FixOutcome` shape as custom fixers.
- If a custom rule's `id` matches a built-in's, the custom rule **shadows** the built-in (a warning is logged at load time so you know it's overriding).
- If module load fails or the export isn't a valid Rule shape, the rule is skipped with a warning — one bad entry never aborts the run.

A working example lives in
[`examples/custom-rules/no-console-log.mjs`](examples/custom-rules/no-console-log.mjs).

## Commands

- `agentlint scan [options]`: Scan the workspace for AI code smells and vulnerabilities.
  - `-d, --dir <directory>`: Directory to scan (default: `.`)
- `agentlint fix [options]`: Automatically fix simple AI-generated code smells.
  - `-d, --dir <directory>`: Directory to fix (default: `.`)
- `agentlint --help`: Display help for commands.
- `agentlint --version`: Display the current version.

## Release Workflow (Semantic Versioning)

This project uses semantic-release for automatic versioning and npm publishing
from commits merged into `main`.

This repository does not use Changesets. Do not create changeset files or open
version PRs manually.

1. Use a Conventional Commit message for the change that should trigger the
  release (for example: `fix: ...`, `feat: ...`, `feat!: ...` or
  `BREAKING CHANGE:` in the body).
2. Verify the package locally before pushing:
  - `pnpm test`
  - `pnpm test:coverage:check`
  - `pnpm run publish:check`
3. Push the commit to `main`.
4. GitHub Actions runs semantic-release and automatically:
   - calculates the next version,
   - publishes to npm,
   - creates a GitHub Release.

Manual helper:

```bash
# Runs semantic-release locally (normally only used in CI)
pnpm release
```

## Development

To run the CLI locally during development:

```bash
# Install dependencies
pnpm install

# Run the development watcher
pnpm dev

# Build the project
pnpm build

# Run the CLI
pnpm start scan
```

## License

ISC
