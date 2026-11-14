import tailwindcss from 'tailwindcss';
import autoprefixer from 'autoprefixer';

// Existing screens use many nearby dark surface colors. Turn those neutral
// arbitrary-color utilities into theme tokens while preserving the exact
// original value as a fallback for Gitter's classic theme.
const themeSurfaces = () => ({
  postcssPlugin: 'gitter-theme-surfaces',
  Rule(rule) {
    if (/white\\\//.test(rule.selector || '')) {
      rule.walkDecls((decl) => {
        if (/^(?:background-color|border(?:-.+)?-color|border-color|--tw-ring-color)$/.test(decl.prop)) {
          decl.value = decl.value.replace(/rgb\(\s*255\s+255\s+255([\s/)]|$)/, 'rgb(var(--theme-overlay, 255 255 255)$1');
        }
      });
    }
    const match = rule.selector?.match(/\\#([0-9a-f]{6})/i);
    if (!match) return;
    const rgb = match[1].match(/../g).map((part) => parseInt(part, 16));
    if (Math.max(...rgb) >= 105 || Math.max(...rgb) - Math.min(...rgb) >= 45) return;
    const average = rgb.reduce((a, b) => a + b, 0) / 3;
    rule.walkDecls((decl) => {
      if (!/^(?:background-color|border(?:-.+)?-color|border-color|--tw-ring-color)$/.test(decl.prop)) return;
      const name = decl.prop.startsWith('border') || decl.prop === '--tw-ring-color' ? 'border' : average < 23 ? 'deep' : average < 32 ? 'base' : average < 43 ? 'surface' : 'raised';
      const prefix = new RegExp(`rgb\\(\\s*${rgb.join('\\s+')}([\\s/)]|$)`);
      decl.value = decl.value.replace(prefix, `rgb(var(--theme-${name}, ${rgb.join(' ')})$1`);
    });
  },
});

// Scale interface text utilities, including arbitrary px sizes. Code views set
// their own inline font size and line height and therefore remain independent.
const interfaceTextScale = () => ({
  postcssPlugin: 'gitter-interface-text-scale',
  Rule(rule) {
    const size = rule.nodes?.find((decl) => decl.type === 'decl' && decl.prop === 'font-size');
    if (!size || !/^\d*\.?\d+(?:px|rem)$/.test(size.value)) return;
    size.value = `calc(${size.value} * var(--ui-text-scale, 1))`;
    const lineHeight = rule.nodes?.find((decl) => decl.type === 'decl' && decl.prop === 'line-height');
    if (lineHeight && /^\d*\.?\d+(?:px|rem)$/.test(lineHeight.value)) lineHeight.value = `calc(${lineHeight.value} * var(--ui-text-scale, 1))`;
  },
});

export default { plugins: [tailwindcss(), themeSurfaces(), interfaceTextScale(), autoprefixer()] };
