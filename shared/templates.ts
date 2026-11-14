export type TemplateKind = 'commit' | 'branch' | 'pullRequest';
export type TemplateSet = Record<TemplateKind, string>;
export const EMPTY_TEMPLATES: TemplateSet = { commit: '', branch: '', pullRequest: '' };
export const MAX_TEMPLATE_LENGTH = 16_000;

export function normalizeTemplates(value: unknown): TemplateSet | undefined {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return undefined;
  const input = value as Record<string, unknown>;
  const result = { ...EMPTY_TEMPLATES };
  for (const kind of Object.keys(result) as TemplateKind[]) {
    const text = input[kind];
    if (typeof text !== 'string' || text.length > MAX_TEMPLATE_LENGTH || text.includes('\0')) return undefined;
    result[kind] = text;
  }
  return result;
}

/** Literal substitutions only; unrecognized placeholders are retained for editing. */
export function expandTemplate(template: string, values: { branch: string; repository: string; date: string; base: string }): string {
  if (template.length > MAX_TEMPLATE_LENGTH) throw new Error('The template is too large.');
  return template.replace(/\{(branch|repository|date|base)\}/g, (_, key: keyof typeof values) => values[key]);
}
