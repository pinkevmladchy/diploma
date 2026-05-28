/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        // Brand (accent) palette — buttons, active items, links, focus rings.
        // Driven by --color-brand-{50..800} from styles.css / ThemeContext.
        brand: {
          50: 'rgb(var(--color-brand-50) / <alpha-value>)',
          100: 'rgb(var(--color-brand-100) / <alpha-value>)',
          200: 'rgb(var(--color-brand-200) / <alpha-value>)',
          300: 'rgb(var(--color-brand-300) / <alpha-value>)',
          400: 'rgb(var(--color-brand-400) / <alpha-value>)',
          500: 'rgb(var(--color-brand-500) / <alpha-value>)',
          600: 'rgb(var(--color-brand-600) / <alpha-value>)',
          700: 'rgb(var(--color-brand-700) / <alpha-value>)',
          800: 'rgb(var(--color-brand-800) / <alpha-value>)',
        },
        // Primary palette — sidebar + top bar surfaces. Each palette also exposes
        // its own fg/fgMuted/border so layouts read correctly on light or dark.
        primary: {
          700: 'rgb(var(--color-primary-700, 51 65 85) / <alpha-value>)',
          800: 'rgb(var(--color-primary-800, 30 41 59) / <alpha-value>)',
          900: 'rgb(var(--color-primary-900, 15 23 42) / <alpha-value>)',
          fg: 'rgb(var(--color-primary-fg, 226 232 240) / <alpha-value>)',
          'fg-muted': 'rgb(var(--color-primary-fg-muted, 148 163 184) / <alpha-value>)',
          border: 'rgb(var(--color-primary-border, 30 41 59) / <alpha-value>)',
        },
      },
    },
  },
  plugins: [],
};
