import colors from 'tailwindcss/colors';

const themePalette = (name) => Object.fromEntries(Object.entries(colors[name]).map(([level, hex]) => {
  const rgb = hex.slice(1).match(/../g).map((part) => parseInt(part, 16)).join(' ');
  return [level, `rgb(var(--${name}-${level}, ${rgb}) / <alpha-value>)`];
}));

/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        slate: themePalette('slate'),
        teal: themePalette('teal'),
        gk: {
          bg: '#14181f',
          surface: '#1b212c',
          panel: '#202735',
          border: '#2a3447',
          active: '#2d384c',
          hover: '#262f3f',
          text: '#e2e8f0',
          muted: '#8b9bb4',
          accent: '#18b487',      // GitKraken vibrant teal green
          teal: '#14b8a6',
          purple: '#a855f7',
          orange: '#f97316',
          blue: '#3b82f6',
          pink: '#ec4899',
          yellow: '#eab308',
          red: '#ef4444',
          cyan: '#06b6d4',
          indigo: '#6366f1'
        }
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', '-apple-system', 'sans-serif'],
        mono: ['JetBrains Mono', 'Fira Code', 'Consolas', 'monospace'],
      }
    },
  },
  plugins: [],
}
