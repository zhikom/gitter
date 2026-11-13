import { ANTHROPIC_SANS, fontStack } from '../shared/fonts';
import { api } from './api/client';

let claudeFont: Promise<void> | undefined;

/** Load the user's existing local Claude font into this window only. */
export function ensureClaudeSans(): Promise<void> {
  if (!claudeFont) {
    claudeFont = (async () => {
      const data = await api.claudeSansFont();
      const addFace = async (base64: string, style: 'normal' | 'italic') => {
        const bytes = Uint8Array.from(atob(base64), (character) => character.charCodeAt(0));
        const face = new FontFace('Gitter Anthropic Sans', bytes.buffer, { style, weight: '300 800' });
        document.fonts.add(await face.load());
      };
      await addFace(data.roman, 'normal');
      if (data.italic) await addFace(data.italic, 'italic').catch(() => undefined);
    })().catch((error) => { claudeFont = undefined; throw error; });
  }
  return claudeFont;
}

export function applyFontPreferences(interfaceFont: string, codeFont: string) {
  const root = document.documentElement;
  const ui = fontStack(interfaceFont, 'ui');
  const code = fontStack(codeFont, 'code');
  if (ui) { root.style.setProperty('--font-ui', ui); root.style.setProperty('--font-heading', ui); }
  else { root.style.removeProperty('--font-ui'); root.style.removeProperty('--font-heading'); }
  if (code) root.style.setProperty('--font-code', code);
  else root.style.removeProperty('--font-code');
  if (interfaceFont === ANTHROPIC_SANS || codeFont === ANTHROPIC_SANS) void ensureClaudeSans().catch(() => undefined);
}
