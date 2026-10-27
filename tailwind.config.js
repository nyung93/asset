/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        forest: {
          DEFAULT: '#176897',
          dark: '#12577f',
          pale: '#eaf4fb',
        },
        cream: '#f7fafc',
        peach: '#e6f2fa',
        coral: '#e37870',
        ink: '#27343e',
      },
      fontFamily: {
        sans: ['Pretendard Variable', 'Pretendard', 'Noto Sans KR', 'sans-serif'],
      },
      boxShadow: {
        cozy: '0 6px 20px rgb(39 52 62 / 6%)',
      },
    },
  },
  plugins: [],
};
