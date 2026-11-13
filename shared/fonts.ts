/** Empty means that the current theme chooses the font. */
export const ANTHROPIC_SANS = '@anthropic-sans';
export const ANTHROPIC_SYSTEM_FAMILIES = ['Anthropic Sans', 'Anthropic Sans Text', 'Anthropic Sans Text Light', 'Anthropic Sans Web'];

export const hasAnthropicSystemFont = (families: string[]) => families.some((name) => ANTHROPIC_SYSTEM_FAMILIES.some((family) => family.toLowerCase() === name.toLowerCase()));

export function normalizeFontName(value: unknown): string | undefined {
  if (typeof value !== 'string' || value.length > 160 || /[\x00-\x1f\x7f]/.test(value)) return undefined;
  return value.trim();
}

/** Quote a family as a CSS string, so punctuation in a font name stays literal. */
export function fontStack(name: string, role: 'ui' | 'code'): string | null {
  const normalized = normalizeFontName(name);
  if (!normalized) return null;
  const escape = (family: string) => `"${family.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`;
  if (normalized === ANTHROPIC_SANS) return `"Gitter Anthropic Sans", ${ANTHROPIC_SYSTEM_FAMILIES.map(escape).join(', ')}, system-ui, sans-serif`;
  const fallback = role === 'code' ? '"SF Mono", "Cascadia Code", Consolas, monospace' : 'system-ui, -apple-system, "Segoe UI", sans-serif';
  return `${escape(normalized)}, ${fallback}`;
}
