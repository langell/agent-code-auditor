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
    "spec-missing-rollback": "off"
  },
  "fixers": {
    "code-quality-no-any": "./agentlint-fixers/custom-no-any-fixer.mjs#CustomNoAnyFixer"
  }
}
```

- `skipRules`: list of rule IDs to disable without setting each rule to `off`.
- `rules`: rule severity overrides (`error`, `warn`, `off`).
- `fixers`: map of `ruleId` to a custom fixer class module reference.
  - String format: `./relative/path/to/module.mjs#ExportedClassName`
  - The class must implement `fix(filePath, issues)` and return a list of fix results.

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
