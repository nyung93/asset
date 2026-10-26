/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        forest: {
          DEFAULT: '#58714e',
          dark: '#465d3e',
          pale: '#edf1e4',
        },
        cream: '#f7f6f0',
        peach: '#faf0e6',
        coral: '#e37870',
        ink: '#30362e',
      },
      fontFamily: {
        sans: ['Inter', 'Pretendard', 'system-ui', 'sans-serif'],
      },
      boxShadow: {
        cozy: '0 8px 28px rgb(48 54 46 / 8%)',
      },
    },
  },
  plugins: [],
};
