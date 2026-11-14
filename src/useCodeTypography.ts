import { usePreference } from './preferences';

/** Shared by code, diff, blame, conflict, and review surfaces. */
export function useCodeTypography() {
  const [fontSize] = usePreference('diffFontSize');
  const [lineHeight] = usePreference('codeLineHeight');
  return { fontSize, lineHeight };
}
