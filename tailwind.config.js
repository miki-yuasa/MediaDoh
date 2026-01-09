/** @type {import('tailwindcss').Config} */
export default {
  darkMode: 'class',
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        // Sony-inspired dark theme colors - deep grays, not pure black
        background: {
          DEFAULT: 'hsl(var(--background))',
          secondary: 'hsl(var(--background-secondary))',
          tertiary: 'hsl(var(--background-tertiary))',
        },
        foreground: {
          DEFAULT: 'hsl(var(--foreground))',
          muted: 'hsl(var(--foreground-muted))',
        },
        border: 'hsl(var(--border))',
        ring: 'hsl(var(--ring))',
        primary: {
          DEFAULT: 'hsl(var(--primary))',
          foreground: 'hsl(var(--primary-foreground))',
        },
        secondary: {
          DEFAULT: 'hsl(var(--secondary))',
          foreground: 'hsl(var(--secondary-foreground))',
        },
        accent: {
          DEFAULT: 'hsl(var(--accent))',
          foreground: 'hsl(var(--accent-foreground))',
        },
        muted: {
          DEFAULT: 'hsl(var(--muted))',
          foreground: 'hsl(var(--muted-foreground))',
        },
        destructive: {
          DEFAULT: 'hsl(var(--destructive))',
          foreground: 'hsl(var(--destructive-foreground))',
        },
        // Sync status colors
        synced: 'hsl(var(--synced))',
        'sync-pending': 'hsl(var(--sync-pending))',
        'sync-warning': 'hsl(var(--sync-warning))',
      },
      fontFamily: {
        sans: [
          'Inter',
          'Noto Sans JP',
          'Yu Gothic',
          'Hiragino Sans',
          'Meiryo',
          'system-ui',
          'sans-serif',
        ],
        mono: [
          'JetBrains Mono',
          'Consolas',
          'monospace',
        ],
      },
      fontSize: {
        // High-density UI sizes
        'xs': ['0.6875rem', { lineHeight: '1rem' }],    // 11px
        'sm': ['0.75rem', { lineHeight: '1.125rem' }],  // 12px
        'base': ['0.8125rem', { lineHeight: '1.25rem' }], // 13px
        'lg': ['0.875rem', { lineHeight: '1.375rem' }],  // 14px
      },
      spacing: {
        // Compact spacing for dense UI
        '0.5': '0.125rem',
        '1.5': '0.375rem',
        '2.5': '0.625rem',
      },
      borderRadius: {
        'sm': '0.125rem',
        DEFAULT: '0.25rem',
        'md': '0.375rem',
        'lg': '0.5rem',
      },
      animation: {
        'spin-slow': 'spin 3s linear infinite',
        'pulse-subtle': 'pulse 2s cubic-bezier(0.4, 0, 0.6, 1) infinite',
      },
    },
  },
  plugins: [],
}
