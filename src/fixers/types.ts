// Re-export for back-compat with imports that haven't migrated to
// `src/rules/types.js`. The canonical source of these types now lives there
// since they're part of the Rule contract.
export type {
  CustomFixer,
  FixOutcome,
  FixRecord,
  FixReport,
  FixResult,
  NewFile,
} from "../rules/types.js";
