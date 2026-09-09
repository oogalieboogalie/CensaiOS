/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./landing.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        bg: 'var(--bg)',
        canvas: 'var(--canvas)',
        surface: 'var(--surface)',
        'surface-2': 'var(--surface-2)',
        hairline: 'var(--hairline)',
        'hairline-strong': 'var(--hairline-strong)',
        ink: 'var(--ink)',
        'ink-soft': 'var(--ink-soft)',
        'ink-faint': 'var(--ink-faint)',
        accent: 'var(--accent)',
        'accent-soft': 'var(--accent-soft)',
        'accent-ink': 'var(--accent-ink)',
        'ps-green': 'var(--ps-green)',
        'ps-blue': 'var(--ps-blue)',
        'ps-red': 'var(--ps-red)',
        'ps-pink': 'var(--ps-pink)',
      },
      borderRadius: {
        app: 'var(--radius-app)',
        card: 'var(--radius-card)',
        pill: 'var(--radius-pill)',
      },
      boxShadow: {
        card: 'var(--shadow-card)',
        pop: 'var(--shadow-pop)',
      },
      fontFamily: {
        sans: 'var(--font-sans)',
        mono: 'var(--font-mono)',
        display: 'var(--font-display)',
      },
      keyframes: {
        pulse: {
          '0%, 100%': { opacity: '0.4', transform: 'scale(0.9)' },
          '50%': { opacity: '1', transform: 'scale(1.05)' },
        },
        'gen-shimmer': {
          '0%': { backgroundPosition: '0% 50%' },
          '50%': { backgroundPosition: '100% 50%' },
          '100%': { backgroundPosition: '0% 50%' },
        },
        'gen-bounce': {
          '0%, 100%': { transform: 'translateY(0)', opacity: '0.6' },
          '50%': { transform: 'translateY(-6px)', opacity: '1' },
        },
        'gen-fade': {
          from: { opacity: '0', transform: 'scale(1.04)' },
          to: { opacity: '1', transform: 'scale(1)' },
        },
      },
      animation: {
        pulse: 'pulse 1.2s ease-in-out infinite',
        'gen-shimmer': 'gen-shimmer 2s linear infinite',
        'gen-bounce': 'gen-bounce 2s ease-in-out infinite',
        'gen-fade': 'gen-fade 0.3s ease-out forwards',
      },
    },
  },
  plugins: [],
}
