import { readFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

/* This file's own directory. Tailwind 3.4 loads a config through jiti, which
   does not always give ESM's `import.meta.url` a value, so fall back to the cwd
   — every entry point (vite, vitest, the postcss CLI) runs from `ui/`. */
const here = (() => {
  try {
    return dirname(fileURLToPath(import.meta.url))
  } catch {
    return process.cwd()
  }
})()

/**
 * The value `src/styles/tokens.css` — or one of the four frozen `_ds` files it
 * imports — declares for a custom property. Last declaration wins, as in CSS.
 */
function tokenValue(name) {
  const entry = join(here, 'src/styles/tokens.css')
  const src = readFileSync(entry, 'utf8')
  const files = [
    ...[...src.matchAll(/@import\s+'([^']+)'/g)].map((m) => resolve(dirname(entry), m[1])),
    entry,
  ]
  let value
  for (const f of files) {
    for (const m of readFileSync(f, 'utf8').matchAll(new RegExp(`(?<![-\\w])${name}\\s*:\\s*([^;]+);`, 'g'))) {
      value = m[1].trim()
    }
  }
  if (value === undefined) throw new Error(`tailwind.config.js: ${name} is not declared in tokens.css or its imports`)
  return value
}

/**
 * The single length inside a one-argument CSS function — `translateY(-2px)` is
 * `2px`, `blur(3px)` is `3px`. `--hover-lift` and `--blur-scrim` are whole
 * functions, and Tailwind's `translate` / `backdropBlur` scales take a bare
 * length, so the utility can only be named by the distance. Writing that
 * distance out here would make this file a second, silent record of the token's
 * value: edit `effects.css` and the utility would not move. It is read out of
 * the declaration instead, so the token stays the only place it is written.
 */
function lengthIn(name) {
  const value = tokenValue(name)
  const m = value.match(/\(\s*-?([\d.]+[a-z%]*)\s*\)/)
  if (!m) throw new Error(`tailwind.config.js: ${name} is \`${value}\`, not a one-length function`)
  return m[1]
}

/** @type {import('tailwindcss').Config} */
export default {
  content: [
    './index.html', './src/**/*.{ts,tsx}',
    './export/**/*.{ts,tsx}', './export/*.html',
    // The utility inventory — see the file's own header.
    './tailwind-probe.txt',
  ],
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
        'violet-mid': 'var(--violet-mid)', 'violet-edge': 'var(--violet-edge)',
        'violet-on-dark': 'var(--violet-on-dark)',
        'violet-on-dark-body': 'var(--violet-on-dark-body)',
        'violet-on-violet': 'var(--violet-on-violet)',
        desk: 'var(--desk)',
        'tile-v3': 'var(--tile-v3)', 'tile-v4': 'var(--tile-v4)',
        'tile-c2': 'var(--tile-c2)', 'tile-ctl': 'var(--tile-ctl)',
        'value-current': 'var(--value-current)',
        hair: 'var(--hair)', 'line-soft': 'var(--line-soft)',
        'line-dashed': 'var(--line-dashed)',
        // The five --border-* tokens live together on this one scale, so the
        // class is always `border-border-<x>` — long, but one rule with no
        // exception. `--border-card` was briefly named `card` on `borderColor`
        // instead, which gave the fifth of the family a second, shorter name its
        // four siblings did not have, and took the class `border-card` away from
        // the white `--card` that §8's coral count badge needs for its cut-out
        // ring. One token, one name; `border-card` is the white surface.
        'border-danger': 'var(--border-danger)', 'border-dead': 'var(--border-dead)',
        'border-current': 'var(--border-current)', 'border-ok': 'var(--border-ok)',
        'border-card': 'var(--border-card)',
        // `ink-current`/`ink-proposed`, not `current`/`proposed`: `text-current`
        // is one of Tailwind's own built-ins (currentColor) and shadowing it
        // would make the commonest colour utility in the app mean two things.
        strong: 'var(--text-strong)', 'body-ink': 'var(--text-body)',
        ghost: 'var(--text-ghost)', 'dialog-ghost': 'var(--text-dialog-ghost)',
        'ink-current': 'var(--text-current)', 'ink-proposed': 'var(--text-proposed)',
        'on-dark': 'var(--text-on-dark)', disabled: 'var(--text-disabled)',
        ok: 'var(--ok)', danger: 'var(--danger)',
        'warn-soft': 'var(--warn-soft)', 'info-soft': 'var(--info-soft)',
        'ok-soft': 'var(--ok-soft)', 'danger-soft': 'var(--danger-soft)',
        'toast-check': 'var(--toast-check)',
        'junction-xor': 'var(--junction-xor)', 'junction-and': 'var(--junction-and)',
        'junction-or': 'var(--junction-or)',
        'dept-numeral-violet': 'var(--dept-numeral-violet)',
        'dept-numeral-coral': 'var(--dept-numeral-coral)',
        'steps-sub': 'var(--steps-sub-bg)',
        'steps-sub-border': 'var(--steps-sub-border)',
        'steps-sub-hover': 'var(--steps-sub-hover)',
        'steps-group': 'var(--steps-group-bg)',
        'steps-group-border': 'var(--steps-group-border)',
        link: 'var(--link)', 'link-hover': 'var(--link-hover)',
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
        // The literal scale, prefixed `fs-` so no name collides with Tailwind's
        // own `text-xs|sm|base|lg|xl`, which guards.test.ts bans outright.
        'fs-display': ['var(--fs-display)', { lineHeight: 'var(--lh-tight)' }],
        'fs-h1': 'var(--fs-h1)', 'fs-h2': 'var(--fs-h2)', 'fs-h3': 'var(--fs-h3)',
        'fs-h4': 'var(--fs-h4)', 'fs-h5': 'var(--fs-h5)', 'fs-lg': 'var(--fs-lg)',
        'fs-body': 'var(--fs-body)', 'fs-sm': 'var(--fs-sm)',
        'fs-sm2': 'var(--fs-sm2)', 'fs-xs': 'var(--fs-xs)',
        'fs-xxs': 'var(--fs-xxs)', 'fs-micro': 'var(--fs-micro)',
        'fs-doc-base': 'var(--fs-doc-base)', 'fs-doc-h1': 'var(--fs-doc-h1)',
        'fs-doc-title': 'var(--fs-doc-title)', 'fs-doc-step': 'var(--fs-doc-step)',
        'fs-doc-body': 'var(--fs-doc-body)',
        // Minted by Task 1's fix pass, after this inventory was drawn up, and
        // not optional extras: they are the design's three commonest off-scale
        // steps (11 / 48 / 38 uses) and guards.test.ts bans `text-[`, so with no
        // name they cannot be written at all once src/screens/ is policed.
        'fs-dialog': 'var(--fs-dialog)',   // 18px — dialog, drawer, pane titles
        'fs-menu': 'var(--fs-menu)',       // 13.5px — menu, dropdown, dialog buttons
        'fs-caption': 'var(--fs-caption)', // 12px — caption, table meta, calendar day
      },
      fontWeight: {
        regular: 'var(--fw-regular)', semibold: 'var(--fw-semibold)',
        bold: 'var(--fw-bold)', extrabold: 'var(--fw-extrabold)',
      },
      lineHeight: {
        tight: 'var(--lh-tight)', snug: 'var(--lh-snug)',
        normal: 'var(--lh-normal)', relaxed: 'var(--lh-relaxed)',
        loose: 'var(--lh-loose)', looser: 'var(--lh-looser)',
      },
      borderRadius: {
        badge: 'var(--radius-badge)', chip: 'var(--radius-chip)', control: 'var(--radius-control)',
        card: 'var(--radius-card)', doc: 'var(--radius-doc)', panel: 'var(--radius-panel)',
        button: 'var(--radius-md)',
        // Named by role, never by t-shirt size: guards.test.ts bans
        // `rounded-sm|md|lg|xl|full`, and the design's ladder is roles anyway.
        tool: 'var(--radius-sm)',          // 9px  — flow tool button, dialog close
        input: 'var(--radius-input)',      // 11px — ghost button, menu row, tile
        search: 'var(--radius-lg)',        // 13px — the search field
        tile: 'var(--radius-tile)',        // 14px — department tile, KPI card
        feature: 'var(--radius-card-lg)',  // 20px — department card, wide modal
        pill: 'var(--radius-pill)',
        round: 'var(--radius-round)',
      },
      borderWidth: { hairline: 'var(--border-hairline)' },
      boxShadow: {
        card: 'var(--shadow-card)', 'card-hover': 'var(--shadow-card-hover)',
        coral: 'var(--shadow-coral)', violet: 'var(--shadow-violet)', green: 'var(--shadow-green)',
        modal: 'var(--shadow-modal)', pop: 'var(--shadow-pop)', sheet: 'var(--shadow-sheet)',
        drawer: 'var(--shadow-drawer)',
        'card-dark': 'var(--shadow-card-dark)',
        'stat-dark': 'var(--shadow-stat-dark)',
        'guide-hover': 'var(--shadow-guide-hover)',
        'ring-flash': 'var(--ring-flash)',
        'conflict-dot': 'var(--ring-conflict-dot)',
      },
      minHeight: { touch: 'var(--size-touch)' },
      minWidth: { touch: 'var(--size-touch)', menu: '220px' },
      // The `s` prefix keeps this dense _ds scale (4, 5, 6, 8, 10px…) from shadowing
      // Tailwind's own numeric spacing keys, which are a sparser rem scale (4, 8, 12, 16, 20px…).
      spacing: {
        s1: 'var(--space-1)', s2: 'var(--space-2)', s3: 'var(--space-3)', s4: 'var(--space-4)',
        s5: 'var(--space-5)', s6: 'var(--space-6)', s7: 'var(--space-7)', s8: 'var(--space-8)',
        s9: 'var(--space-9)', s10: 'var(--space-10)', s11: 'var(--space-11)', s12: 'var(--space-12)',
        s14: 'var(--space-14)', s16: 'var(--space-16)',
        'screen-x': 'var(--pad-screen-x)',  // 40px
        'screen-y': 'var(--pad-screen-y)',  // 30px
        topbar: 'var(--pad-topbar)',        // 22px
        half: 'var(--space-half)',          // 2px
      },
      maxWidth: {
        departments: 'var(--width-departments)', list: 'var(--width-list)',
        summary: 'var(--width-summary)', doc: 'var(--width-doc)', drawer: 'var(--width-drawer)',
      },
      width: {
        tile: 'var(--size-tile)', tool: 'var(--size-tool)', avatar: 'var(--size-avatar)',
        'logo-bar': 'var(--size-logo-bar)', 'logo-login': 'var(--size-logo-login)',
        touch: 'var(--size-touch)',
      },
      height: {
        tile: 'var(--size-tile)', tool: 'var(--size-tool)', avatar: 'var(--size-avatar)',
        'logo-bar': 'var(--size-logo-bar)', 'logo-login': 'var(--size-logo-login)',
        touch: 'var(--size-touch)',
      },
      letterSpacing: { eyebrow: 'var(--tracking-eyebrow)', display: 'var(--tracking-display)' },
      // A bare `transition` is .16s from here on — the design's one duration.
      transitionDuration: {
        DEFAULT: 'var(--duration)', fast: 'var(--duration-fast)',
        chev: 'var(--duration-chev)',
      },
      // `--hover-lift` is the whole `translateY(…)` function, which Tailwind's
      // translate scale cannot take; the distance is named here — written
      // `-translate-y-lift` — and read out of the token so there is still only
      // one place the number is written. See lengthIn() above.
      translate: { lift: lengthIn('--hover-lift') },
      // Likewise `--blur-scrim` is `blur(…)`, a filter function, not a radius.
      backdropBlur: { scrim: lengthIn('--blur-scrim') },
    },
  },
  // R7 / §6.16 — the design declares exactly two breakpoints, both max-width.
  //
  // They are registered as VARIANTS rather than added to `theme.extend.screens`,
  // and that is not a style choice. A max-width screen can only be written as an
  // object, and the moment any screen is an object Tailwind disables the whole
  // `min-*`/`max-*` variant family — corePlugins.js returns `[]` and logs
  // "The `min-*` and `max-*` variants are not supported with a `screens`
  // configuration containing objects". Measured: the `screens` form deletes
  // `@media (max-width:560px)` from the built CSS outright, silently taking with
  // it the 30 `max-[560px]:` utilities that carry the phone layout of
  // src/flow/DetailDrawer.tsx and export/flowchart/FlowViewer.tsx — with the
  // build still exiting 0. addVariant costs nothing and keeps both alive.
  // Emitted order is unaffected: Tailwind prints max-width blocks widest-first
  // (1080, 760, 560) ahead of the min-width ones, which is the cascade wanted.
  // src/test/theme.test.ts compiles all three and asserts exactly that.
  //
  // A bare function is a valid Tailwind plugin; `tailwindcss/plugin` has no ESM
  // entry in this version and nothing here needs its config half.
  plugins: [
    ({ addVariant }) => {
      addVariant('max1080', '@media (max-width: 1080px)')
      addVariant('max760', '@media (max-width: 760px)')
    },
  ],
}
