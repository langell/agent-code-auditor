// Example custom fixer for the `security-secret-leakage` rule.
//
// agentlint loads a custom fixer when its rule id appears in `.agentlintrc.json`
// under `fixers`, e.g.
//
//   {
//     "fixers": {
//       "security-secret-leakage":
//         "./examples/custom-fixers/secret-to-env-fixer.mjs#SecretToEnvFixer"
//     }
//   }
//
// Contract (post-refactor — pure transformer; the orchestrator handles I/O):
//   - default-export OR named-export a class
//   - the class is instantiated with `new` (no constructor args)
//   - the instance must implement
//       fix(content, issues, filePath): FixOutcome
//     where FixOutcome = {
//       content: string,                  // possibly transformed content
//       fixes: { fixed, ruleId, message }[],  // one record per applied fix
//       newFiles?: { path, content }[],   // optional sibling files to create
//     }
//   - fix may return synchronously or as a Promise
//
// `issues` contains only the issues for the rule id this fixer is wired to,
// scoped to the file represented by `content`/`filePath`.

const OPENAI_KEY = /sk-[a-zA-Z0-9]{32,}/g;
const SLACK_TOKEN = /xoxb-[0-9]{10,}[a-zA-Z0-9-]*/g;

export class SecretToEnvFixer {
  fix(content, issues, _filePath) {
    if (issues.length === 0) {
      return { content, fixes: [] };
    }

    const fixes = [];
    let updated = content;

    updated = updated.replace(OPENAI_KEY, () => {
      fixes.push({
        fixed: true,
        ruleId: "security-secret-leakage",
        message:
          "Replaced hardcoded OpenAI key with process.env.OPENAI_API_KEY.",
      });
      return "process.env.OPENAI_API_KEY";
    });

    updated = updated.replace(SLACK_TOKEN, () => {
      fixes.push({
        fixed: true,
        ruleId: "security-secret-leakage",
        message:
          "Replaced hardcoded Slack token with process.env.SLACK_BOT_TOKEN.",
      });
      return "process.env.SLACK_BOT_TOKEN";
    });

    return { content: updated, fixes };
  }
}
