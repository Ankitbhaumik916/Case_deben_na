import type { Config } from 'tailwindcss';

/**
 * Every colour maps to a CSS variable defined in src/app/globals.css.
 * Nothing here holds a literal hex, so re-skinning is a token change.
 */
const config: Config = {
  content: ['./src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        page: 'var(--surface-page)',
        raised: 'var(--surface-raised)',
        sunken: 'var(--surface-sunken)',
        chrome: {
          DEFAULT: 'var(--surface-chrome)',
          hover: 'var(--surface-chrome-hover)',
        },
        edge: {
          DEFAULT: 'var(--border-subtle)',
          strong: 'var(--border-strong)',
          chrome: 'var(--border-chrome)',
        },
        ink: {
          DEFAULT: 'var(--text-primary)',
          secondary: 'var(--text-secondary)',
          muted: 'var(--text-muted)',
          inverse: 'var(--text-inverse)',
          'inverse-muted': 'var(--text-inverse-muted)',
        },
        accent: {
          DEFAULT: 'var(--accent)',
          hover: 'var(--accent-hover)',
          subtle: 'var(--accent-subtle)',
          chrome: 'var(--accent-on-chrome)',
        },
        danger: {
          DEFAULT: 'var(--danger)',
          subtle: 'var(--danger-subtle)',
        },
        success: {
          DEFAULT: 'var(--success)',
          subtle: 'var(--success-subtle)',
        },
      },
      spacing: {
        4.5: '1.125rem',
      },
      fontFamily: {
        sans: ['var(--font-sans)', 'ui-sans-serif', 'system-ui', 'sans-serif'],
        mono: ['var(--font-mono)', 'ui-monospace', 'SFMono-Regular', 'monospace'],
      },
      fontSize: {
        // Dense-UI scale. 13px is the workhorse; 16px stays the mobile input
        // minimum so iOS does not zoom on focus.
        '2xs': ['0.6875rem', { lineHeight: '1rem', letterSpacing: '0.01em' }],
        xs: ['0.75rem', { lineHeight: '1.125rem' }],
        sm: ['0.8125rem', { lineHeight: '1.25rem' }],
        base: ['0.875rem', { lineHeight: '1.375rem' }],
        lg: ['1rem', { lineHeight: '1.5rem' }],
        xl: ['1.125rem', { lineHeight: '1.625rem', letterSpacing: '-0.01em' }],
        '2xl': ['1.375rem', { lineHeight: '1.875rem', letterSpacing: '-0.015em' }],
        '3xl': ['1.75rem', { lineHeight: '2.25rem', letterSpacing: '-0.02em' }],
      },
      borderRadius: {
        sm: 'var(--radius-sm)',
        DEFAULT: 'var(--radius)',
        lg: 'var(--radius-lg)',
      },
      boxShadow: {
        sm: 'var(--shadow-sm)',
        DEFAULT: 'var(--shadow)',
        lg: 'var(--shadow-lg)',
      },
      zIndex: {
        nav: '30',
        dropdown: '40',
        overlay: '50',
      },
    },
  },
  plugins: [],
};

export default config;
