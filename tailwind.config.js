/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        cream: '#FFF5E6',
        mint: '#C8F5DC',
        coral: '#FFB3AB',
        navy: '#1E2A3A',
      },
      boxShadow: {
        retro: '0 18px 38px rgba(30, 42, 58, 0.16), 0 6px 18px rgba(30, 42, 58, 0.12)',
        'retro-soft': '0 14px 28px rgba(30, 42, 58, 0.12), 0 4px 12px rgba(30, 42, 58, 0.10)',
      },
      fontFamily: {
        display: ['"DM Sans"', 'Inter', 'system-ui', 'sans-serif'],
        body: ['"DM Sans"', 'Inter', 'system-ui', 'sans-serif'],
      },
    },
  },
  plugins: [],
}
