/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        primary: {
          DEFAULT: '#4F46E5',
          light: '#818CF8',
          dark: '#3730A3',
        },
        accent: '#B45309',
        success: '#166534',
        warning: '#92400E',
        error: '#991B1B',
        focus: '#2563EB',
      },
      fontSize: {
        'base-lg': '1.125rem',
      },
    },
  },
  plugins: [],
}
