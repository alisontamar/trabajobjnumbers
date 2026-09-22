/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        brand: {
          50: '#f2f8ec',
          100: '#e1efd2',
          200: '#c3dfa6',
          300: '#a0cc74',
          400: '#7fb84c',
          500: '#5a9632',
          600: '#437526',
          700: '#345c20',
          800: '#28451c',
          900: '#1a2e13',
        },
        accent: {
          400: '#c9e05c',
          500: '#a9c93e',
        },
      },
    },
  },
  plugins: [],
}
