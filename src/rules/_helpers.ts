// Internal helpers shared across multiple per-ruleId Rule modules.

export function insertAfterImports(content: string, block: string): string {
  const lines = content.split("\n");
  let insertAt = 0;

  for (let i = 0; i < lines.length; i++) {
    if (/^\s*import\s+/.test(lines[i])) {
      insertAt = i + 1;
    }
  }

  lines.splice(insertAt, 0, block);
  return lines.join("\n");
}

export function isTypeScriptTarget(filePath: string): boolean {
  return /\.(?:ts|tsx|mts|cts)$/.test(filePath);
}
