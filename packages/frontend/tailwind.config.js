/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        // Clinical blue brand — values switch per theme via semantic tokens
        // (rgb triplets defined in globals.css so alpha modifiers keep working).
        primary: {
          50: 'rgb(var(--primary-50) / <alpha-value>)',
          100: 'rgb(var(--primary-100) / <alpha-value>)',
          200: 'rgb(var(--primary-200) / <alpha-value>)',
          300: 'rgb(var(--primary-300) / <alpha-value>)',
          400: 'rgb(var(--primary-400) / <alpha-value>)',
          500: 'rgb(var(--primary-500) / <alpha-value>)',
          600: 'rgb(var(--primary-600) / <alpha-value>)',
          700: 'rgb(var(--primary-700) / <alpha-value>)',
          800: 'rgb(var(--primary-800) / <alpha-value>)',
          900: 'rgb(var(--primary-900) / <alpha-value>)',
          950: 'rgb(var(--primary-950) / <alpha-value>)',
        },
        healthcare: {
          blue: '#1769AA',
          green: '#16835B',
          red: '#C83B4A',
          yellow: '#B77900',
          purple: '#8b5cf6',
          teal: '#14b8a6',
        },
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', 'sans-serif'],
        arabic: ['IBM Plex Sans Arabic', 'Noto Sans Arabic', 'Tajawal', 'sans-serif'],
      },
    },
  },
  plugins: [require('@tailwindcss/forms')],
};
