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
        // Task 3's surfaces, lines and discs (§1.2, §4.3, §5.1.9, §9.8). The key
        // is the token name with `--` stripped and nothing else, which is this
        // scale's default: only a `--text-` prefix (rule 4) and a `-bg` suffix
        // (rule 5) come off, and neither applies here. `--surface-sub` keeps its
        // stem rather than becoming a bare `sub` — `--lh-sub` (sub-copy) and
        // `--steps-sub-bg` (sub-process) already spend that word on two other
        // things — and rather than `subpanel`, which the plan's Part 3 table
        // already writes as `border-subpanel` meaning `--border-current`.
        'tile-v5': 'var(--tile-v5)',
        'surface-sub': 'var(--surface-sub)',
        'line-divider': 'var(--line-divider)',
        'line-row': 'var(--line-row)',
        'line-filter': 'var(--line-filter)',
        'disc-coral': 'var(--disc-coral)',
        'disc-violet': 'var(--disc-violet)',
        // The sixth `--border-*` token, and it joins its five siblings on this
        // scale rather than on `borderColor`, so the class is the family's long
        // `border-border-pick`. Naming it `pick` on `borderColor` would give one
        // member of the family a shorter name the other five do not have — the
        // exact split F2 undid for `--border-card`.
        'border-pick': 'var(--border-pick)',
        // §6.6's amber notice edge. It joins the --line-* / --border-* family on
        // THIS scale, where every other border colour in the theme lives, so the
        // class is the short `border-warn-edge` the plan already writes. It is
        // deliberately not named `--border-warn-edge`: the comment above reserves
        // that family for the long `border-border-<x>` form.
        'warn-edge': 'var(--warn-edge)',
      },
      textColor: {
        'icom-input': 'var(--icom-input-fg)', 'icom-control': 'var(--icom-control-fg)',
        'icom-output': 'var(--icom-output-fg)', 'icom-mech': 'var(--icom-mech-fg)',
        // §6.6's amber notice ink. The `-fg` stays IN the key, breaking the
        // convention its four neighbours follow, because dropping it gives
        // `textColor.warn` — which shadows `colors.warn` and makes `text-warn`
        // paint the notice ink instead of --warn's amber. One class, two
        // meanings, silently. theme.test.ts pins both classes apart.
        'warn-fg': 'var(--warn-fg)',
        // ---- §6.0 / §9.7k — "type on the violet field", the one role group in
        // roles.css that CANNOT be written by naming its token instead.
        //
        // Every other role this theme does not key is reachable the long way: the
        // token behind it has a class, so a screen can write the value even if it
        // cannot write the role. These three cannot, because their tokens are
        // DECOYS — the name a screen reaches for is a different colour, or the
        // same colour under a role that is not this one:
        //
        //   · --role-title-on-field is --card #FFFFFF by ledger L-01, decided 10
        //     against 1. The class that reads like the answer is `text-on-dark`,
        //     which is --text-on-dark #FBF7F1 — the value L-01 RETIRED, and which
        //     the plan writes on 19 screen titles today. That is the bug this
        //     group exists to make unwritable.
        //   · --role-subtitle-on-field is --violet-on-violet #C9BEEE by L-28, a
        //     token whose own declared role is "mono id inside a violet box"; and
        //     it sits one letter from --violet-on-dark-body, the token L-28 ruled
        //     AGAINST. Right value, wrong word, and a decoy beside it.
        //   · --role-eyebrow completes the group. Its token is honestly named, so
        //     this key is the cheap one — but a group written two ways is how the
        //     first two got wrong in the first place.
        //
        // The keys keep the WHOLE role stem. `fontSize` drops the `fs-` from its
        // role keys (--role-fs-body -> `role-body`), and shortening these the same
        // way would give `role-title`, which is already a font SIZE: one class,
        // two meanings, silently — the same trap `warn-fg` above avoids. A future
        // key for --role-fs-eyebrow must therefore be `role-fs-eyebrow`.
        'role-title-on-field': 'var(--role-title-on-field)',       // #FFFFFF — L-01
        'role-subtitle-on-field': 'var(--role-subtitle-on-field)', // #C9BEEE — L-28
        'role-eyebrow': 'var(--role-eyebrow)',                     // #B79FE6
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
        // Task 3 closed the panel scale (§2.4 / §9.4): nine steps S1 sets that
        // the ladder had no rung for. Same `fs-` prefix, same reason — half-pixel
        // sizes are not snapped to a neighbour, and `text-[…]` is banned.
        'fs-numeral': 'var(--fs-numeral)',           // 46px — ghosted dept-card index
        'fs-stat': 'var(--fs-stat)',                 // 27px — departments stat numeral
        'fs-steps-title': 'var(--fs-steps-title)',   // 26px — step-view process title
        'fs-display-hand': 'var(--fs-display-hand)', // 25px — [data-r-title] at <=760px
        'fs-stat-sm': 'var(--fs-stat-sm)',           // 21px — activity stat numeral
        'fs-body-lead': 'var(--fs-body-lead)',       // 14.5px — comment body, branch label
        'fs-nano': 'var(--fs-nano)',                 // 10px — calendar weekday, comment id
        'fs-badge-sm': 'var(--fs-badge-sm)',         // 9.5px — conflict badge on a node
        'fs-tag': 'var(--fs-tag)',                   // 9px — process-row id badge, tag chip
        // R3 — the reader is the same design at another scale, so its four type
        // steps are named beside the panel's rather than overriding them. The
        // home hero being smaller than the list title is ledger L-34, referred to
        // the owner; naming both is what lets the owner see it in one place.
        'fs-h1-reader-home': 'var(--fs-h1-reader-home)', // 26px
        'fs-h1-reader-list': 'var(--fs-h1-reader-list)', // 30px
        'fs-h1-reader-dept': 'var(--fs-h1-reader-dept)', // 24px
        'fs-body-reader': 'var(--fs-body-reader)',       // 15px
        // R3 — the four type roles that CHANGE with the surface. Everything
        // else on this scale is a fixed step; these four are the scale layer,
        // and they are the only writable form the roles have: guards.test.ts
        // bans `text-[…]`, so a role with no key here cannot be written at all.
        'role-body': 'var(--role-fs-body)',    // 14px panel / 15px reader
        'role-dense': 'var(--role-fs-dense)',  // 13px panel / 14.5px reader
        'role-title': 'var(--role-fs-title)',  // 22px panel / 30px reader
        'role-hero': 'var(--role-fs-hero)',    // 34px panel / 26px reader
        // …and a fifth, which is the only one of them that is NOT a copy of a
        // body step: a panel textarea sets one step below its input and a reader
        // textarea one step above it. --role-fs-dense cannot express that — owner
        // ruling R12 makes it one size on both surfaces.
        'role-textarea': 'var(--role-fs-textarea)', // 13px panel / 16px reader
      },
      fontWeight: {
        regular: 'var(--fw-regular)', semibold: 'var(--fw-semibold)',
        bold: 'var(--fw-bold)', extrabold: 'var(--fw-extrabold)',
      },
      lineHeight: {
        tight: 'var(--lh-tight)', snug: 'var(--lh-snug)',
        normal: 'var(--lh-normal)', relaxed: 'var(--lh-relaxed)',
        loose: 'var(--lh-loose)', looser: 'var(--lh-looser)',
        // Ledger L-17's third prose role: explanatory sub-copy under a control,
        // 1.8, 17 uses. `--lh-` comes off like every other key on this scale.
        sub: 'var(--lh-sub)',
        // §5.2 StatTile — `line-height:1` on the stat numeral. Tailwind already
        // ships `leading-none` at the same number, so this is a seventh
        // REDEFINITION rather than a new name: it puts the last leading in the
        // app behind a token, so `--lh-none` cannot drift from what the class
        // paints. Deleting the key leaves `leading-none` emitting Tailwind's own
        // `1` and only the pairing table notices.
        none: 'var(--lh-none)',
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
        // §5.2 — three radii the twelve primitives draw and the ladder
        // (6·7·9·10·11·12·13·14·16·18·20·24) has no rung for. Named by role,
        // never by t-shirt size (rule 1): `tick`/`tick-nested` pair with the two
        // boxes ledger L-10 fixes, and `reveal` is the password field's eye
        // button — the 8px L-23 records as having no token.
        tick: 'var(--radius-tick)',                // 6px  — the 19px tick
        'tick-nested': 'var(--radius-tick-nested)',// 5px  — the 16px tick
        reveal: 'var(--radius-reveal)',            // 8px  — the reveal button
        bar: 'var(--radius-bar)',                  // 2px  — the coral eyebrow bar
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
        // §4.2 — the comment FAB's own two-layer coral shadow. No other shadow
        // token matches it, so `shadow-coral` is not a substitute.
        fab: 'var(--shadow-fab)',
        // The department feature card's heavier rest shadow — one use, and the
        // ledger's "Referred to the owner" #9 reads it as a role rather than as
        // drift. If that is overturned the card takes `shadow-card` and this key
        // goes with the token.
        feature: 'var(--shadow-feature)',
      },
      minHeight: { touch: 'var(--size-touch)', chiprow: 'var(--size-chiprow)' }, // 44px, 24px
      minWidth: {
        touch: 'var(--size-touch)', menu: '220px',
        // §5.2 — three floors the twelve primitives state outright, and the FAB
        // badge's, which is a floor on one axis and a fixed height on the other
        // (`min-width:21px; height:21px`), so `count` is carried on `height`
        // below as well: one name, two properties.
        'page-label': 'var(--width-page-label)', // 74px  — the pager's page label
        stat: 'var(--width-stat)',               // 96px  — the header stat tile
        tab: 'var(--width-tab)',                 // 132px — an audit tab
        count: 'var(--size-count)',              // 21px  — the FAB count badge
      },
      // §5.2 Dropdown — the popover's scroll cap. On `maxHeight` and not on
      // `spacing`: a cap is not a step, the same reason the three search-icon
      // insets sit on `inset`.
      maxHeight: { popover: 'var(--height-popover)' },
      // §5.2 DataTable — the three column templates the design states exactly.
      // Named here rather than written as `grid-cols-[16px_1.4fr_…]` at the six
      // call sites (a head and a row per table), which is six places one column
      // count would have to be kept in step.
      gridTemplateColumns: {
        users: 'var(--grid-users)',
        audit: 'var(--grid-audit)',
        activity: 'var(--grid-activity)',
      },
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
        // R3 / §3.3 — the reader's own gutter and the two screens whose vertical
        // padding is not `--pad-screen-y`. The direction stays in the key even
        // though `pt-`/`pb-` repeat it, because `departments` alone cannot hold
        // two values: 38px at the top, 48px at the bottom. One key per token.
        'reader-x': 'var(--pad-reader-x)',                    // 24px
        'reader-bottom': 'var(--pad-reader-bottom)',          // 60px
        'departments-top': 'var(--pad-departments-top)',      // 38px
        'departments-bottom': 'var(--pad-departments-bottom)',// 48px
        // §5.2 — the six control paddings the design states and the _ds scale
        // (4·5·6·8·10·12·14·16·18·22·26·30·38·40) has no rung for. One key per
        // token, and the direction stays out of the key: `py-search-y` says
        // which axis, `search-y` says which value.
        modal: 'var(--pad-modal)',                            // 24px
        'search-y': 'var(--pad-search-y)',                    // 13px
        'search-x': 'var(--pad-search-x)',                    // 44px
        'search-x-dialog': 'var(--pad-search-x-dialog)',      // 42px
        'search-y-menu': 'var(--pad-search-y-menu)',          // 9px
        'search-x-menu': 'var(--pad-search-x-menu)',          // 34px
        // §5.2 — the empty-state card's two-axis padding. Two keys because the
        // design gives two numbers and `p-empty` could only ever carry one.
        'empty-y': 'var(--pad-empty-y)',                      // 48px
        'empty-x': 'var(--pad-empty-x)',                      // 20px
        // §5.2 — the twelve primitives' own geometry. Same rules as the six
        // above: one key per token, the direction stays out of the key, and a
        // value the _ds ladder already holds is not re-named here (the ticks'
        // 10px gap is `gap-s5`, the table's 18px gutter `px-s9`, the tab tray's
        // 4px `p-s1`). Every key on this scale is also reachable as `w-`, `h-`,
        // `min-w-`, `start-` and `end-`, which is Tailwind deriving those from
        // `spacing`, not five names for one token.
        'textarea-y': 'var(--pad-textarea-y)',                // 11px
        compose: 'var(--pad-compose)',                        // 13px
        reveal: 'var(--pad-reveal)',                          // 46px
        'tick-row': 'var(--gap-tick-row)',                    // 11px
        'tick-row-y': 'var(--pad-tick-row-y)',                // 13px
        'tick-nested-y': 'var(--pad-tick-nested-y)',          // 11px
        'radio-x': 'var(--pad-radio-x)',                      // 15px
        'dropdown-y-dialog': 'var(--pad-dropdown-y-dialog)',  // 11px
        'dropdown-y-filter': 'var(--pad-dropdown-y-filter)',  // 9px
        'dropdown-x-filter': 'var(--pad-dropdown-x-filter)',  // 13px
        popover: 'var(--pad-popover)',                        // 7px
        option: 'var(--gap-option)',                          // 9px
        'option-y': 'var(--pad-option-y)',                    // 11px
        'table-row-y': 'var(--pad-table-row-y)',              // 13px
        'empty-y-inline': 'var(--pad-empty-y-inline)',        // 44px
        'stat-x': 'var(--pad-stat-x)',                        // 20px
        'stat-y-grid': 'var(--pad-stat-y-grid)',              // 15px
        'stat-x-grid': 'var(--pad-stat-x-grid)',              // 17px
        'stat-grid': 'var(--space-stat-grid)',                // 20px
        'stat-label': 'var(--space-stat-label)',              // 7px
        'tab-y-audit': 'var(--pad-tab-y-audit)',              // 9px
        'tab-flow': 'var(--gap-tab-flow)',                    // 3px
        'note-y': 'var(--pad-note-y)',                        // 9px
        'note-x': 'var(--pad-note-x)',                        // 11px
        // Task 9 — the only arbitrary length left in DataTable.tsx, the row gap
        // below 760px. Eight tokens in tokens.css already hold 11px and every one
        // is minted for another role, so this is minted again under its own name
        // rather than borrowed.
        'table-row-mobile': 'var(--gap-table-row-mobile)',    // 11px
      },
      maxWidth: {
        departments: 'var(--width-departments)', list: 'var(--width-list)',
        summary: 'var(--width-summary)', doc: 'var(--width-doc)', drawer: 'var(--width-drawer)',
        // R3 / §3.3 — five more content columns and the five overlay widths.
        // `--width-` comes off, as it does for the five above.
        reader: 'var(--width-reader)',     // 720px
        profile: 'var(--width-profile)',   // 700px
        steps: 'var(--width-steps)',       // 760px
        access: 'var(--width-access)',     // 820px
        audit: 'var(--width-audit)',       // 980px
        // These five keep the ruling's own size names. Rule 1 bans a t-shirt
        // size where the design's ladder is roles — radii, type — and neither
        // guard regex reaches `max-w-dialog-lg`. A dialog width is genuinely a
        // size: the alternative is a role per screen (`…-conflict`,
        // `…-supervisor`), which would pin a shared width to one caller.
        'dialog-wide': 'var(--width-dialog-wide)', // 640px — conflict inbox
        'dialog-lg': 'var(--width-dialog-lg)',     // 540px — change supervisor
        dialog: 'var(--width-dialog)',             // 520px — new user, views
        'dialog-sm': 'var(--width-dialog-sm)',     // 460px — confirm content
        'dialog-xs': 'var(--width-dialog-xs)',     // 440px — confirm comment
        // Two measures for a paragraph, not for a box: the departments screen's
        // subtitle and the intro paragraph on the violet field. `--width-` comes
        // off, as it does for every key above.
        subtitle: 'var(--width-subtitle)',         // 440px — departments subtitle
        intro: 'var(--width-intro)',               // 600px — intro paragraph
      },
      // The ten `--size-*` tokens R3 adds are square boxes, so each is named once
      // and carried on both scales — `w-glyph`/`h-glyph` is one name on two
      // properties, the arrangement `tile`, `tool`, `avatar` and `touch` already
      // have, not a second name for one token.
      //
      // R3 — `tile`, `iconbtn` and `fab` read the ROLE, not the panel token, so
      // one class is 48/40/52 in the panel and 54/42/56 in the reader without a
      // single call site knowing which surface it is in. The panel and reader
      // tokens behind each role keep their own `-reader` names below, so the two
      // ends of the scale are still writable when a screen genuinely needs one.
      width: {
        tile: 'var(--role-tile)', tool: 'var(--size-tool)', avatar: 'var(--size-avatar)',
        'logo-bar': 'var(--size-logo-bar)', 'logo-login': 'var(--size-logo-login)',
        touch: 'var(--size-touch)',
        'tile-reader': 'var(--size-tile-reader)',       // 54px
        glyph: 'var(--size-glyph)',                     // 24px
        'glyph-reader': 'var(--size-glyph-reader)',     // 26px
        iconbtn: 'var(--role-iconbtn)',                 // 40px panel / 42px reader
        'iconbtn-reader': 'var(--size-iconbtn-reader)', // 42px
        fab: 'var(--role-fab)',                         // 52px panel / 56px reader
        'fab-reader': 'var(--size-fab-reader)',         // 56px
        tick: 'var(--size-tick)',                       // 19px — L-10, a tick in a row
        'tick-nested': 'var(--size-tick-nested)',       // 16px — L-10, a nested tick
        close: 'var(--size-close)',                     // 32px — L-23
        'search-glyph': 'var(--size-search-glyph)',     // 17px — §5.2 SearchField
        // §5.2 — six more square boxes, from the twelve primitives. Each is
        // named once and carried on both scales, exactly as the ten above are.
        // `close` and `search-glyph` hold 32px and 17px already, for L-23's
        // close button and the magnifier; these keep those roles and the reveal
        // button gets its own, so neither name has to mean two things.
        reveal: 'var(--size-reveal)',                   // 32px — the eye button
        'reveal-glyph': 'var(--size-reveal-glyph)',     // 17px — the eye path
        'tick-glyph': 'var(--size-tick-glyph)',         // 13px — check in a 19px box
        'tick-glyph-nested': 'var(--size-tick-glyph-nested)', // 11px — in a 16px box
        chevron: 'var(--size-chevron)',                 // 15px — dropdown + pager
        pager: 'var(--size-pager)',                     // 34px — a page button
        // The Tasks 12-25 sweep's own squares, carried on both scales like the
        // rest. `login` is on THIS scale only: the design gives the sign-in card
        // a fixed `width: 380` and the plan writes `w-login max-w-full`, so there
        // is no height and no max-width to name.
        'menu-more': 'var(--size-menu-more)',           // 36px — the … / home button
        login: 'var(--width-login)',                    // 380px — the sign-in card
        dot: 'var(--size-dot)',                         // 9px  — the table state dot
        chev: 'var(--size-chev)',                       // 30px — the table chevron cell
        'glyph-tile': 'var(--size-glyph-tile)',         // 42px — §6.15's glyph tile
      },
      height: {
        tile: 'var(--role-tile)', tool: 'var(--size-tool)', avatar: 'var(--size-avatar)',
        'logo-bar': 'var(--size-logo-bar)', 'logo-login': 'var(--size-logo-login)',
        touch: 'var(--size-touch)',
        'tile-reader': 'var(--size-tile-reader)',
        glyph: 'var(--size-glyph)',
        'glyph-reader': 'var(--size-glyph-reader)',
        iconbtn: 'var(--role-iconbtn)',
        'iconbtn-reader': 'var(--size-iconbtn-reader)',
        fab: 'var(--role-fab)',
        'fab-reader': 'var(--size-fab-reader)',
        tick: 'var(--size-tick)',
        'tick-nested': 'var(--size-tick-nested)',
        close: 'var(--size-close)',
        'search-glyph': 'var(--size-search-glyph)',
        reveal: 'var(--size-reveal)',
        'reveal-glyph': 'var(--size-reveal-glyph)',
        'tick-glyph': 'var(--size-tick-glyph)',
        'tick-glyph-nested': 'var(--size-tick-glyph-nested)',
        chevron: 'var(--size-chevron)',
        pager: 'var(--size-pager)',
        'menu-more': 'var(--size-menu-more)',
        dot: 'var(--size-dot)',
        chev: 'var(--size-chev)',
        'glyph-tile': 'var(--size-glyph-tile)',
        // The FAB badge is `min-width:21px; height:21px` — a floor on one axis
        // and a fixed box on the other — so `count` is on `minWidth` above and
        // on `height` here, and on `width` nowhere: it never sets one.
        count: 'var(--size-count)',
      },
      // §5.2 — the search field's icon sits `--inset-search-icon` from the edge.
      // It is an inset, not spacing: naming it here keeps `start-search-icon`
      // (inset-inline-start, so RTL is structural) out of the padding ladder.
      // The dialog and menu fields pin theirs closer in; all three sit on this
      // scale and not on `spacing`, for the reason above — an inset is not a
      // padding, and `p-search-icon-menu` would be a class with no meaning.
      inset: {
        'search-icon': 'var(--inset-search-icon)',              // 15px
        'search-icon-dialog': 'var(--inset-search-icon-dialog)', // 14px
        'search-icon-menu': 'var(--inset-search-icon-menu)',     // 11px
      },
      letterSpacing: { eyebrow: 'var(--tracking-eyebrow)', display: 'var(--tracking-display)' },
      // A bare `transition` is .16s from here on — the design's one duration.
      transitionDuration: {
        DEFAULT: 'var(--duration)', fast: 'var(--duration-fast)',
        chev: 'var(--duration-chev)',
        row: 'var(--duration-row)',
      },
      // The design's one easing curve is the bare CSS keyword `ease`, on all four
      // `transition:` declarations both deliverables write. It cannot be reached
      // as DEFAULT: Tailwind's filterDefault keeps DEFAULT out of the `ease-*`
      // class scale, exactly as it does for `duration-*`. So it is a named key,
      // and the `--ease-` stem comes off the way `--duration-` does. Moving
      // DEFAULT here as well would silently re-time every existing `transition`
      // in src/, which is a behaviour change and not a naming one; it is
      // mint-spec Q4 and is deliberately not done here.
      transitionTimingFunction: { css: 'var(--ease-css)' },
      // L-42..L-47 — the stacking ladder. Bootstrap 5's published $zindex-* scale,
      // adopted as a STANDARD rather than reverse-engineered from the
      // deliverables' 26 values over 50 declarations. Extending this scale adds
      // keys; Tailwind's own z-0..z-50 and z-auto survive beside them. Named by
      // ROLE, never by number, so guards.test.ts sees no t-shirt size and no
      // component can write a rung it does not mean.
      zIndex: {
        'canvas-overlay': 'var(--role-z-canvas-overlay)', // 15   — inside the flow canvas
        dropdown: 'var(--role-z-dropdown)',   // 1000 — anchored popover
        chrome: 'var(--role-z-chrome)',       // 1020 — top bar, flow bar, sticky head
        floating: 'var(--role-z-floating)',   // 1030 — the comment FAB
        drawer: 'var(--role-z-drawer)',       // 1045 — drawer, sheet, full-bleed pane
        modal: 'var(--role-z-modal)',         // 1055 — dialog scrim and box
        popover: 'var(--role-z-popover)',     // 1070 — reserved
        tooltip: 'var(--role-z-tooltip)',     // 1080 — reserved
        toast: 'var(--role-z-toast)',         // 1090 — the ceiling
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
