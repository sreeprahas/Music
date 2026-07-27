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
      colors: {
        background: '#0F0F0F',
        surface: '#1C1B1B',
        'surface-container': '#201F1F',
        'surface-variant': '#353534',
        'surface-[#252525]': '#252525',
        primary: '#FF5540',
        'primary-container': '#FF5540',
        'on-surface': '#E5E2E1',
        'on-surface-variant': '#EBBBB4'
      }
    }
  },
  plugins: []
};
