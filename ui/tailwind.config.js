/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        bg: '#FBF7F1', ink: '#2A1D5E', violet: '#4A25A9', coral: '#FA5A52',
        green: '#1F8A5B', conflict: '#E23D35', muted: '#8a7db0', faint: '#a99fc4',
        warm: '#EFE7DC', line: '#E3D8F5',
        'tile-v': '#F0E9FB', 'tile-v2': '#F4EFFB', 'tile-c': '#FFE9E7',
        'login-bg': '#2E1668', 'login-orb': '#3A1D85',
      },
      fontFamily: {
        sans: ['Vazirmatn Variable', 'Vazirmatn', 'system-ui', 'sans-serif'],
      },
      boxShadow: {
        card: '0 3px 14px -8px rgba(74,37,169,.25)',
        'card-hover': '0 14px 30px -14px rgba(74,37,169,.45)',
        coral: '0 12px 26px -12px rgba(250,90,82,.9)',
        violet: '0 10px 22px -13px rgba(74,37,169,.9)',
        green: '0 10px 22px -13px rgba(31,138,91,.9)',
        modal: '0 40px 90px -30px rgba(0,0,0,.6)',
      },
    },
  },
  plugins: [],
}
