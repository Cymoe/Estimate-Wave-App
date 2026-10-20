/** @type {import('tailwindcss').Config} */
export default {
  // Hover styles only on devices that can hover: a tap on an iPad no longer leaves
  // the next thing under the finger lit up (the trash icon after a row is removed).
  future: { hoverOnlyWhenSupported: true },
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        'steel-blue': '#336699',
        'carbon-black': '#121212',
        'concrete-gray': '#333333',
        'equipment-yellow': '#F9D71C',
        'blueprint-blue': '#0D47A1',
        'warning-red': '#D32F2F',
        'success-green': '#388E3C',
        'industrial-silver': '#9E9E9E',
        'background-dark': '#121212',
        'background-medium': '#1E1E1E',
        'background-light': '#333333',
        'primary-blue': '#3b82f6',
      },
      fontFamily: {
        'condensed': ['Roboto Condensed', 'sans-serif'],
        'sans': ['Roboto', 'sans-serif'],
        'mono': ['Roboto Mono', 'monospace'],
      },
      keyframes: {
        'progress-fill': {
          '0%': { width: '0%' },
          '100%': { width: 'var(--progress-width)' }
        },
        'slide-in': {
          '0%': { transform: 'translateX(100%)' },
          '100%': { transform: 'translateX(0)' }
        },
        'slide-out': {
          '0%': { transform: 'translateX(0)' },
          '100%': { transform: 'translateX(100%)' }
        },
        'shimmer': {
          '100%': { transform: 'translateX(100%)' }
        },
        'fade-in': {
          '0%': { opacity: '0', transform: 'translateY(-10px) translateX(-50%)' },
          '100%': { opacity: '1', transform: 'translateY(0) translateX(-50%)' }
        },
        // A small "+$50" that lifts off a bid stepper and fades.
        'rise': {
          '0%': { opacity: '1', transform: 'translateY(0)' },
          '100%': { opacity: '0', transform: 'translateY(-6px)' }
        },
        // Table rows arriving and leaving: a short fade with a nudge, and a wash that marks a new row.
        'row-in': {
          '0%': { opacity: '0', transform: 'translateY(-4px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' }
        },
        'row-out': {
          '0%': { opacity: '1', transform: 'translateX(0)' },
          '100%': { opacity: '0', transform: 'translateX(8px)' }
        },
        'fade-out': {
          '0%': { opacity: '1' },
          '100%': { opacity: '0' }
        },
        'wash': {
          '0%': { backgroundColor: 'rgb(16 185 129 / 0.14)' },
          '100%': { backgroundColor: 'transparent' }
        },
        'fade-in-plain': {
          '0%': { opacity: '0' },
          '100%': { opacity: '1' }
        }
      },
      animation: {
        'progress-fill': 'progress-fill 0.5s ease-out forwards',
        'slide-in': 'slide-in 0.3s ease-out forwards',
        'slide-out': 'slide-out 0.3s ease-out forwards',
        'shimmer': 'shimmer 2s ease-out infinite',
        'fade-in': 'fade-in 0.3s ease-out forwards',
        'rise': 'rise 0.9s ease-out forwards',
        'row-in': 'row-in 0.2s ease-out both, wash 1.2s ease-out forwards',
        'row-out': 'row-out 0.18s ease-in forwards',
        'fade-out': 'fade-out 0.18s ease-in forwards',
        'wash': 'wash 1.2s ease-out forwards',
        'fade-in-plain': 'fade-in-plain 0.15s ease-out both'
      }
    },
  },
  plugins: [],
};