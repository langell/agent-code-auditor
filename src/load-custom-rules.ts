import * as path from "path";
import { pathToFileURL } from "url";
import {
  AgentLintConfig,
  CustomRuleConfigValue,
  CustomRuleReference,
} from "./config.js";
import { Rule } from "./rules/types.js";

function parseReference(ref: CustomRuleConfigValue): {
  modulePath: string;
  exportName?: string;
} {
  if (typeof ref === "string") {
    const [modulePath, exportName] = ref.split("#");
    return { modulePath, exportName };
  }

  const objRef = ref as CustomRuleReference;
  return { modulePath: objRef.path, exportName: objRef.exportName };
}

// Lightweight runtime validation: does this value look like a Rule?
function isRule(value: unknown): value is Rule {
  if (!value || typeof value !== "object") return false;
  const rule = value as Record<string, unknown>;
  return (
    typeof rule.id === "string" &&
    rule.id.length > 0 &&
    (rule.appliesTo === "all" || rule.appliesTo === "source") &&
    typeof rule.check === "function"
  );
}

// Resolve, import, and validate every entry in `config.customRules`. Returns
// the loaded Rules in the order they were declared. Modules that fail to
// import or that don't expose a valid Rule are logged and skipped — a single
// bad entry never aborts the run.
export async function loadCustomRules(
  targetDir: string,
  config: AgentLintConfig,
): Promise<Rule[]> {
  const loaded: Rule[] = [];
  const refs = config.customRules ?? [];

  for (const ref of refs) {
    const { modulePath, exportName } = parseReference(ref);
    const absolutePath = path.resolve(targetDir, modulePath);

    let imported: Record<string, unknown>;
    try {
      imported = await import(pathToFileURL(absolutePath).href);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.warn(`Failed to load custom rule '${modulePath}': ${message}`);
      continue;
    }

    const exportKey = exportName || "default";
    const exportedValue = imported[exportKey];

    if (!isRule(exportedValue)) {
      console.warn(
        `Custom rule '${modulePath}#${exportKey}' is not a valid Rule. ` +
          `Expected an object with { id: string, appliesTo: "all" | "source", check: function }.`,
      );
      continue;
    }

    loaded.push(exportedValue);
  }

  return loaded;
}

// Merge built-in and custom rules. When a custom rule has the same `id` as a
// built-in (or an earlier custom rule), the later definition wins and a
// warning is logged so the user knows their rule is shadowing one. This lets
// users override a built-in's behavior without forking the codebase, while
// still surfacing the override at every load.
export function mergeRules(builtIn: Rule[], custom: Rule[]): Rule[] {
  if (custom.length === 0) return builtIn;

  const result: Rule[] = [];
  const indexById = new Map<string, number>();

  for (const rule of builtIn) {
    indexById.set(rule.id, result.length);
    result.push(rule);
  }

  for (const rule of custom) {
    const existingIdx = indexById.get(rule.id);
    if (existingIdx !== undefined) {
      console.warn(
        `Custom rule '${rule.id}' shadows the built-in rule with the same id.`,
      );
      result[existingIdx] = rule;
    } else {
      indexById.set(rule.id, result.length);
      result.push(rule);
    }
  }

  return result;
}
