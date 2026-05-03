// The fix orchestrator moved to `src/fix-orchestrator.ts` post-Step-5.
// This module is kept as a re-export for the existing `runFixer` import
// path (CLI + tests). New callers should import from `../fix-orchestrator`.
export { runFixer } from "../fix-orchestrator.js";
