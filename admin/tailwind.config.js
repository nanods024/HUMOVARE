/** @type {import('tailwindcss').Config} */

/**
 * HUMOVARE admin design system.
 *
 * Shares the brand red with the storefront but runs a calmer, more neutral
 * palette: an operator spends hours in here, so legibility and information
 * density matter more than editorial flourish. Motion is short and eased —
 * it explains what changed, never makes anyone wait.
 */
const channel = (token) => `rgb(var(${token}) / <alpha-value>)`;

export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],

  theme: {
    extend: {
      colors: {
        primary: {
          DEFAULT: channel('--admin-primary'),
          dark: channel('--admin-primary-dark'),
          soft: channel('--admin-primary-soft'),
        },
        canvas: channel('--admin-canvas'),
        panel: channel('--admin-panel'),
        sidebar: channel('--admin-sidebar'),
        ink: {
          DEFAULT: channel('--admin-text'),
          muted: channel('--admin-muted'),
          subtle: channel('--admin-subtle'),
        },
        line: channel('--admin-border'),
        success: channel('--admin-success'),
        warning: channel('--admin-warning'),
        danger: channel('--admin-danger'),
        info: channel('--admin-info'),
      },

      fontFamily: {
        sans: ['Inter', 'system-ui', '-apple-system', 'Segoe UI', 'sans-serif'],
      },

      boxShadow: {
        panel: '0 1px 2px rgb(16 24 40 / 0.04), 0 1px 3px rgb(16 24 40 / 0.04)',
        lift: '0 4px 6px -2px rgb(16 24 40 / 0.05), 0 12px 24px -8px rgb(16 24 40 / 0.12)',
        popover: '0 24px 48px -12px rgb(16 24 40 / 0.25)',
        glow: '0 6px 16px -6px rgb(var(--admin-primary) / 0.55)',
        inset: 'inset 0 1px 0 rgb(255 255 255 / 0.06)',
      },

      borderRadius: {
        panel: '0.875rem',
      },

      transitionTimingFunction: {
        smooth: 'cubic-bezier(0.22, 1, 0.36, 1)',
      },

      keyframes: {
        'fade-in': { from: { opacity: '0' }, to: { opacity: '1' } },
        'fade-out': { from: { opacity: '1' }, to: { opacity: '0' } },
        'slide-up': {
          from: { opacity: '0', transform: 'translateY(8px)' },
          to: { opacity: '1', transform: 'translateY(0)' },
        },
        'page-in': {
          from: { opacity: '0', transform: 'translateY(10px)' },
          to: { opacity: '1', transform: 'translateY(0)' },
        },
        'scale-in': {
          from: { opacity: '0', transform: 'translateY(8px) scale(0.97)' },
          to: { opacity: '1', transform: 'translateY(0) scale(1)' },
        },
        'scale-out': {
          from: { opacity: '1', transform: 'translateY(0) scale(1)' },
          to: { opacity: '0', transform: 'translateY(6px) scale(0.97)' },
        },
        'slide-in-left': {
          from: { transform: 'translateX(-100%)' },
          to: { transform: 'translateX(0)' },
        },
        'toast-in': {
          from: { opacity: '0', transform: 'translateX(24px) scale(0.98)' },
          to: { opacity: '1', transform: 'translateX(0) scale(1)' },
        },
        'toast-progress': { from: { transform: 'scaleX(1)' }, to: { transform: 'scaleX(0)' } },
        shimmer: { '100%': { transform: 'translateX(100%)' } },
        'route-progress': {
          '0%': { transform: 'translateX(-100%)' },
          '100%': { transform: 'translateX(250%)' },
        },
      },
      animation: {
        'fade-in': 'fade-in 180ms ease-out both',
        'fade-out': 'fade-out 160ms ease-in both',
        'slide-up': 'slide-up 260ms cubic-bezier(0.22, 1, 0.36, 1) both',
        'page-in': 'page-in 380ms cubic-bezier(0.22, 1, 0.36, 1) both',
        'scale-in': 'scale-in 240ms cubic-bezier(0.22, 1, 0.36, 1) both',
        'scale-out': 'scale-out 160ms ease-in both',
        'slide-in-left': 'slide-in-left 280ms cubic-bezier(0.22, 1, 0.36, 1) both',
        'toast-in': 'toast-in 320ms cubic-bezier(0.22, 1, 0.36, 1) both',
        'route-progress': 'route-progress 1.1s ease-in-out infinite',
      },
    },
  },

  plugins: [],
};
