# AgentLint (Agent Code Auditor)

AgentLint is a configurable audit tool and linter specifically designed for AI-generated code. It helps development teams detect, audit, and automatically fix common "AI code smells," insecure patterns, and hallucinations.

## Features

- **Static Analysis**: Deep scanning of your codebase to find typical AI-generated code issues.
- **Dependency Vulnerability Scanning**: Ensures AI hasn't introduced outdated or vulnerable packages.
- **Custom Rule Engine**: Tailor the linter to your project's specific needs to catch domain-specific AI hallucinations.
- **Auto-Fix Capabilities**: Automatically correct simple AI-generated code smells to streamline development.
- **IDE Integration Ready**: Designed to work seamlessly within your development workflow.

## Installation

Install AgentLint globally or locally in your project using your preferred package manager.

```bash
# Using npm
npm install -g agentlint

# Using pnpm
pnpm install -g agentlint

# Using yarn
yarn global add agentlint
```

## Usage

AgentLint provides a simple CLI to scan and fix your workspace.

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

## Commands

- `agentlint scan [options]`: Scan the workspace for AI code smells and vulnerabilities.
  - `-d, --dir <directory>`: Directory to scan (default: `.`)
- `agentlint fix [options]`: Automatically fix simple AI-generated code smells.
  - `-d, --dir <directory>`: Directory to fix (default: `.`)
- `agentlint --help`: Display help for commands.
- `agentlint --version`: Display the current version.

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
