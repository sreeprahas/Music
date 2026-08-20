/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    './app/**/*.{js,ts,jsx,tsx,mdx}',
    './components/**/*.{js,ts,jsx,tsx,mdx}',
    './src/**/*.{js,ts,jsx,tsx,mdx}'
  ],
  darkMode: 'class',
  theme: {
    extend: {
      boxShadow: {
        accent: '0 0 16px rgb(var(--color-accent-rgb) / 22%), 0 10px 26px rgb(var(--color-accent-rgb) / 12%)',
        'accent-soft': '0 0 14px rgb(var(--color-accent-rgb) / 16%), 0 10px 26px rgb(var(--color-accent-rgb) / 10%)',
        'accent-medium': '0 0 16px rgb(var(--color-accent-rgb) / 22%), 0 10px 26px rgb(var(--color-accent-rgb) / 14%)',
        'accent-strong': '0 0 12px rgb(var(--color-accent-rgb) / 80%)',
        'accent-card': '0 0 0 1px rgb(var(--color-text-rgb) / 16%), 0 0 14px rgb(var(--color-accent-rgb) / 16%), 0 10px 26px rgb(var(--color-accent-rgb) / 12%)',
        'accent-card-strong': '0 0 0 1px rgb(var(--color-text-rgb) / 24%), 0 0 16px rgb(var(--color-accent-rgb) / 22%), 0 10px 26px rgb(var(--color-accent-rgb) / 16%)',
        'accent-line': '0 0 8px rgb(var(--color-accent-rgb) / 90%)',
        'accent-small': '0 0 10px rgb(var(--color-accent-rgb) / 60%)',
        'accent-subtle': '0 0 12px rgb(var(--color-accent-rgb) / 15%)',
        text: '0 0 12px rgb(var(--color-text-rgb) / 45%)',
        surface: '0 1px 5px rgb(var(--color-shadow-rgb) / 55%)'
      },
      colors: {
        background: 'rgb(var(--color-background-rgb) / <alpha-value>)',
        'background-secondary': 'rgb(var(--color-background-secondary-rgb) / <alpha-value>)',
        'background-tertiary': 'rgb(var(--color-background-tertiary-rgb) / <alpha-value>)',
        surface: 'rgb(var(--color-surface-rgb) / <alpha-value>)',
        'surface-elevated': 'rgb(var(--color-surface-elevated-rgb) / <alpha-value>)',
        'surface-hover': 'rgb(var(--color-surface-hover-rgb) / <alpha-value>)',
        'surface-active': 'rgb(var(--color-surface-active-rgb) / <alpha-value>)',
        text: 'rgb(var(--color-text-rgb) / <alpha-value>)',
        'text-secondary': 'rgb(var(--color-text-secondary-rgb) / <alpha-value>)',
        'text-muted': 'rgb(var(--color-text-muted-rgb) / <alpha-value>)',
        'text-disabled': 'rgb(var(--color-text-disabled-rgb) / <alpha-value>)',
        'border-subtle': 'rgb(var(--color-border-subtle-rgb) / <alpha-value>)',
        border: 'rgb(var(--color-border-rgb) / <alpha-value>)',
        'border-strong': 'rgb(var(--color-border-strong-rgb) / <alpha-value>)',
        accent: 'rgb(var(--color-accent-rgb) / <alpha-value>)',
        'accent-hover': 'rgb(var(--color-accent-hover-rgb) / <alpha-value>)',
        'accent-active': 'rgb(var(--color-accent-active-rgb) / <alpha-value>)',
        success: 'rgb(var(--color-success-rgb) / <alpha-value>)',
        warning: 'rgb(var(--color-warning-rgb) / <alpha-value>)',
        error: 'rgb(var(--color-error-rgb) / <alpha-value>)',
        info: 'rgb(var(--color-info-rgb) / <alpha-value>)',
        overlay: 'rgb(var(--color-overlay-rgb) / <alpha-value>)',
        shadow: 'rgb(var(--color-shadow-rgb) / <alpha-value>)',
        player: 'rgb(var(--color-player-rgb) / <alpha-value>)',
        header: 'rgb(var(--color-header-rgb) / <alpha-value>)',
        sidebar: 'rgb(var(--color-sidebar-rgb) / <alpha-value>)'
      }
    }
  },
  plugins: []
};
