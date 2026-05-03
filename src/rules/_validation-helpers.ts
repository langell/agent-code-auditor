// Detects whether a text fragment looks like it already has validation
// applied — used by `security-input-validation` to suppress false positives
// on already-validated inputs.
const VALIDATION_REGEX =
  /\bz\.[a-zA-Z]+\s*\(|\.(?:parse|safeParse|parseAsync|validate|validateSync)\s*\(|\bvalidator\b|\bvalidate[A-Z][A-Za-z]*\s*\(|\bvalidate\s*\(/;

export function looksValidated(text: string): boolean {
  return VALIDATION_REGEX.test(text);
}
