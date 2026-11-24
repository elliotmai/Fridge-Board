/** @type {import('tailwindcss').Config} */
// Colours and radii point at the design tokens in src/styles/tokens.css, so the
// few Tailwind-styled template pieces (What's New, toasts, footer) match Hive.
export default {
  darkMode: 'class',
  content: ['./index.html', './src/**/*.{js,jsx,ts,tsx}'],
  theme: {
    extend: {
      colors: {
        brand: { DEFAULT: 'var(--ink)', fg: 'var(--bg)' },
        paper: 'var(--bg)',
        surface: 'var(--surface)',
        sunken: 'var(--sunken)',
        ink: 'var(--ink)',
        muted: 'var(--muted)',
        line: 'var(--line)',
        honey: 'var(--honey)',
        late: 'var(--late)',
        warn: 'var(--warn)',
        ok: 'var(--ok)',
      },
      borderRadius: { xs: 'var(--r-xs)', sm: 'var(--r-sm)', md: 'var(--r-md)', lg: 'var(--r-lg)' },
      fontFamily: { sans: 'var(--font)' },
    },
  },
  plugins: [],
};
