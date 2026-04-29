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
// Contract:
//   - default-export OR named-export a class
//   - the class is instantiated with `new` (no constructor args)
//   - the instance must implement `fix(filePath, issues)` returning a
//     FixResult[] (sync or async). Each FixResult has the shape
//     { file, fixed, ruleId, message }.
//
// `issues` contains only the issues for the rule id this fixer is wired to,
// scoped to the file passed in `filePath`.

import * as fs from "node:fs";

const OPENAI_KEY = /sk-[a-zA-Z0-9]{32,}/g;
const SLACK_TOKEN = /xoxb-[0-9]{10,}[a-zA-Z0-9-]*/g;

export class SecretToEnvFixer {
  async fix(filePath, issues) {
    if (issues.length === 0 || !fs.existsSync(filePath)) return [];

    const original = fs.readFileSync(filePath, "utf8");
    const fixes = [];
    let updated = original;

    updated = updated.replace(OPENAI_KEY, () => {
      fixes.push({
        file: filePath,
        fixed: true,
        ruleId: "security-secret-leakage",
        message: "Replaced hardcoded OpenAI key with process.env.OPENAI_API_KEY.",
      });
      return "process.env.OPENAI_API_KEY";
    });

    updated = updated.replace(SLACK_TOKEN, () => {
      fixes.push({
        file: filePath,
        fixed: true,
        ruleId: "security-secret-leakage",
        message: "Replaced hardcoded Slack token with process.env.SLACK_BOT_TOKEN.",
      });
      return "process.env.SLACK_BOT_TOKEN";
    });

    if (updated !== original) {
      fs.writeFileSync(filePath, updated, "utf8");
    }

    return fixes;
  }
}
