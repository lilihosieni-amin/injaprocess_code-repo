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
        warn: 'var(--warn)', info: 'var(--info)', 'tile-info': 'var(--tile-info)',
        'icom-input': 'var(--icom-input-bg)', 'icom-control': 'var(--icom-control-bg)',
        'icom-output': 'var(--icom-output-bg)', 'icom-mech': 'var(--icom-mech-bg)',
      },
      textColor: {
        'icom-input': 'var(--icom-input-fg)', 'icom-control': 'var(--icom-control-fg)',
        'icom-output': 'var(--icom-output-fg)', 'icom-mech': 'var(--icom-mech-fg)',
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
        button: 'var(--radius-md)',
      },
      borderWidth: { hairline: 'var(--border-hairline)' },
      boxShadow: {
        card: 'var(--shadow-card)', 'card-hover': 'var(--shadow-card-hover)',
        coral: 'var(--shadow-coral)', violet: 'var(--shadow-violet)', green: 'var(--shadow-green)',
        modal: 'var(--shadow-modal)', pop: 'var(--shadow-pop)', sheet: 'var(--shadow-sheet)',
      },
      minHeight: { touch: 'var(--size-touch)' },
      minWidth: { touch: 'var(--size-touch)' },
      // The `s` prefix keeps this dense _ds scale (4, 5, 6, 8, 10px…) from shadowing
      // Tailwind's own numeric spacing keys, which are a sparser rem scale (4, 8, 12, 16, 20px…).
      spacing: {
        s1: 'var(--space-1)', s2: 'var(--space-2)', s3: 'var(--space-3)', s4: 'var(--space-4)',
        s5: 'var(--space-5)', s6: 'var(--space-6)', s7: 'var(--space-7)', s8: 'var(--space-8)',
        s9: 'var(--space-9)', s10: 'var(--space-10)', s11: 'var(--space-11)', s12: 'var(--space-12)',
        s14: 'var(--space-14)', s16: 'var(--space-16)',
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
