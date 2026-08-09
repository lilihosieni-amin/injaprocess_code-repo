/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}', './export/**/*.{ts,tsx}', './export/*.html'],
  theme: {
    extend: {
      colors: {
        bg: 'var(--bg)', card: 'var(--card)', ink: 'var(--ink)',
        violet: 'var(--violet)', coral: 'var(--coral)', green: 'var(--green)',
        conflict: 'var(--conflict)', muted: 'var(--text-muted)', faint: 'var(--text-faint)',
        warm: 'var(--warm)', line: 'var(--line)',
        'tile-v': 'var(--tile-v)', 'tile-v2': 'var(--tile-v2)', 'tile-c': 'var(--tile-c)',
        'tile-ok': 'var(--tile-ok)', 'tile-warn': 'var(--tile-warn)', 'tile-dead': 'var(--tile-dead)',
        'login-bg': 'var(--login-bg)', 'login-orb': 'var(--login-orb)',
        scrim: 'var(--scrim)',
      },
      fontFamily: { sans: 'var(--font-sans)', mono: 'var(--font-mono)' },
      fontSize: {
        body: ['var(--fs-role-body)', { lineHeight: 'var(--lh-role-body)' }],
        caption: ['var(--fs-role-caption)', { lineHeight: 'var(--lh-role-body)' }],
        subtitle: ['var(--fs-role-subtitle)', { lineHeight: 'var(--lh-role-body)' }],
        title: ['var(--fs-role-title)', { lineHeight: 'var(--lh-tight)' }],
        prose: ['var(--fs-role-body)', { lineHeight: 'var(--lh-role-prose)' }],
      },
      borderRadius: {
        badge: 'var(--radius-badge)', chip: 'var(--radius-chip)', control: 'var(--radius-control)',
        card: 'var(--radius-card)', doc: 'var(--radius-doc)', panel: 'var(--radius-panel)',
      },
      boxShadow: {
        card: 'var(--shadow-card)', 'card-hover': 'var(--shadow-card-hover)',
        coral: 'var(--shadow-coral)', violet: 'var(--shadow-violet)', green: 'var(--shadow-green)',
        modal: 'var(--shadow-modal)', pop: 'var(--shadow-pop)', sheet: 'var(--shadow-sheet)',
      },
      minHeight: { touch: 'var(--size-touch)' },
      minWidth: { touch: 'var(--size-touch)' },
      spacing: {
        1: 'var(--space-1)', 2: 'var(--space-2)', 3: 'var(--space-3)', 4: 'var(--space-4)',
        5: 'var(--space-5)', 6: 'var(--space-6)', 7: 'var(--space-7)', 8: 'var(--space-8)',
        9: 'var(--space-9)', 10: 'var(--space-10)', 11: 'var(--space-11)', 12: 'var(--space-12)',
        14: 'var(--space-14)', 16: 'var(--space-16)',
      },
      maxWidth: {
        departments: 'var(--width-departments)', list: 'var(--width-list)',
        summary: 'var(--width-summary)', doc: 'var(--width-doc)', drawer: 'var(--width-drawer)',
      },
      width: { tile: 'var(--size-tile)', tool: 'var(--size-tool)', avatar: 'var(--size-avatar)' },
      height: { tile: 'var(--size-tile)', tool: 'var(--size-tool)', avatar: 'var(--size-avatar)' },
      letterSpacing: { eyebrow: 'var(--tracking-eyebrow)' },
    },
  },
  plugins: [],
}
