/** @type {import('tailwindcss').Config} */

/**
 * HUMOVARE design system.
 *
 * Colours are declared as space-separated RGB channels in `src/styles/theme.css`
 * and read here through `rgb(var(--token) / <alpha-value>)`. That keeps opacity
 * utilities (`bg-primary/10`) working while leaving one file — theme.css — as
 * the single place to retune the brand red.
 */
const channel = (token) => `rgb(var(${token}) / <alpha-value>)`;

export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  darkMode: 'class',

  theme: {
    extend: {
      colors: {
        primary: {
          DEFAULT: channel('--color-primary'),
          dark: channel('--color-primary-dark'),
          light: channel('--color-primary-light'),
          tint: channel('--color-primary-tint'),
        },
        ink: {
          DEFAULT: channel('--color-text'),
          black: channel('--color-black'),
          muted: channel('--color-muted'),
          subtle: channel('--color-subtle'),
        },
        surface: {
          DEFAULT: channel('--color-surface'),
          alt: channel('--color-surface-alt'),
          inverse: channel('--color-surface-inverse'),
        },
        canvas: channel('--color-background'),
        line: channel('--color-border'),
        success: channel('--color-success'),
        warning: channel('--color-warning'),
        danger: channel('--color-danger'),
      },

      fontFamily: {
        // Display face carries the brand voice; body stays highly legible.
        display: ['"Archivo"', '"Archivo Black"', 'Impact', 'system-ui', 'sans-serif'],
        sans: ['"Inter"', 'system-ui', '-apple-system', 'Segoe UI', 'Roboto', 'sans-serif'],
      },

      fontSize: {
        // Editorial display scale, clamped so headlines never break mobile.
        'display-xl': ['clamp(2.75rem, 9vw, 7rem)', { lineHeight: '0.92', letterSpacing: '-0.03em' }],
        'display-lg': ['clamp(2.25rem, 6vw, 4.5rem)', { lineHeight: '0.95', letterSpacing: '-0.025em' }],
        'display-md': ['clamp(1.75rem, 4vw, 3rem)', { lineHeight: '1.02', letterSpacing: '-0.02em' }],
        'display-sm': ['clamp(1.375rem, 2.6vw, 2rem)', { lineHeight: '1.1', letterSpacing: '-0.015em' }],
        eyebrow: ['0.6875rem', { lineHeight: '1', letterSpacing: '0.22em' }],
      },

      letterSpacing: {
        brand: '0.22em',
        wider: '0.12em',
      },

      spacing: {
        gutter: 'var(--page-gutter)',
        header: 'var(--header-height)',
      },

      maxWidth: {
        page: '90rem',
        prose: '68ch',
      },

      borderRadius: {
        card: '0.25rem',
        pill: '9999px',
      },

      aspectRatio: {
        // Every product image in the grid is locked to 4:5 so rows never jump.
        product: '4 / 5',
        editorial: '3 / 4',
        hero: '16 / 10',
      },

      boxShadow: {
        // Restrained elevation only — no large diffuse drop shadows.
        card: '0 1px 2px rgb(0 0 0 / 0.04)',
        lift: '0 8px 24px -12px rgb(0 0 0 / 0.18)',
        header: '0 1px 0 rgb(var(--color-border) / 1)',
      },

      transitionTimingFunction: {
        brand: 'cubic-bezier(0.22, 1, 0.36, 1)',
      },

      transitionDuration: {
        fast: '150ms',
        base: '250ms',
        slow: '400ms',
      },

      keyframes: {
        'fade-up': {
          from: { opacity: '0', transform: 'translateY(12px)' },
          to: { opacity: '1', transform: 'translateY(0)' },
        },
        'fade-in': {
          from: { opacity: '0' },
          to: { opacity: '1' },
        },
        marquee: {
          from: { transform: 'translateX(0)' },
          to: { transform: 'translateX(-50%)' },
        },
        'hero-zoom': {
          from: { transform: 'scale(1.1)' },
          to: { transform: 'scale(1)' },
        },
        'hero-rise': {
          from: { opacity: '0', transform: 'translateY(28px) scale(0.96)' },
          to: { opacity: '1', transform: 'translateY(0) scale(1)' },
        },
      },

      animation: {
        'fade-up': 'fade-up 400ms cubic-bezier(0.22, 1, 0.36, 1) both',
        'fade-in': 'fade-in 250ms ease-out both',
        marquee: 'marquee 28s linear infinite',
        'hero-zoom': 'hero-zoom 1600ms cubic-bezier(0.16, 1, 0.3, 1) both',
        'hero-rise': 'hero-rise 900ms cubic-bezier(0.16, 1, 0.3, 1) both',
      },
    },
  },

  plugins: [],
};
