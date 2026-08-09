# Task 3 & 4 Report — Buttons and display primitives on tokens

**Status:** DONE
**Branch:** `feat/frontend-system`
**Commits:**
- `da9213a` — `feat(ui): buttons carry tokens, a focus ring and a real name` (Task 3)
- `dad5480` — `feat(ui): display primitives on tokens, and a status pill that speaks` (Task 4)

## What I implemented

Followed both briefs verbatim, TDD steps in order (failing test observed before
each implementation file was written).

**Task 3**
- `ui/src/test/a11y.ts` — new, `expectTouchTarget` helper (class-contract
  assertion for `min-h-touch`/`min-w-touch`, since jsdom has no layout).
- `ui/src/ui/primitives.test.tsx` — rewritten to the brief's exact content:
  `Button` (4 cases), `IconButton` (4 cases, new), `Chip` (1), `IdBadge` (1).
- `ui/src/ui/Button.tsx` — restyled onto tokens (`bg-coral`/`bg-violet`/
  `bg-green`/ghost variants, `min-h-touch min-w-touch`, `rounded-control`,
  `shadow-coral`/`shadow-violet`/`shadow-green`). Public API unchanged.
- `ui/src/ui/IconButton.tsx` — new. `label` is required and becomes
  `aria-label`+`title`; the icon element is cloned with `aria-hidden` and
  `focusable="false"` so only the label reaches assistive tech.

**Task 4**
- `ui/src/ui/StatusPill.tsx` + `StatusPill.test.tsx` — new. Five tones
  (`ok`/`warn`/`danger`/`neutral`/`info`), always renders `label` as text so
  state is never colour-only (F11).
- Used the brief's **corrected** form for `warn`/`info`, not its first draft:
  `bg-tile-warn text-warn` / `bg-tile-info text-info`, backed by new `colors`
  entries `warn: var(--warn)`, `info: var(--info)`, `tile-info: var(--tile-info)`
  in `ui/tailwind.config.js`. The draft's `text-[color:var(--warn)]` /
  `bg-[color:var(--tile-info)]` form was never written to disk — it would have
  tripped the `text-[` guard in `guards.test.ts`.
- `ui/src/ui/Card.tsx` — `bg-card border border-warm rounded-card shadow-card`.
- `ui/src/ui/Chip.tsx` — kind→class map now `bg-icom-*` / `text-icom-*`.
  `ui/tailwind.config.js` got the four `icom-*` background colours under
  `colors` **and** a separate `extend.textColor` map for the `-fg` variables
  (foreground and background are different CSS custom properties per ICOM
  kind, so one map can't cover both).
- `ui/src/ui/IdBadge.tsx` — `bg-violet text-card` / `bg-tile-v2 text-muted`.

Verified before writing config that every referenced CSS variable
(`--warn`, `--info`, `--tile-info`, `--icom-*-fg`, `--icom-*-bg`) exists in
`design/_ds/.../tokens/colors.css` — all present, no invention.

Left `ui/src/index.css`'s `.btn*`/`.chip*`/`.id-badge` compatibility layer
untouched, as instructed; none of the restyled components reference it.
Did not touch `ui/src/flow/**` or `ui/export/**`.

## Verification (all four gates, run after both commits)

1. `npx vitest run` — **443 passed**, 0 failed (74 files; up from 437 by the
   6 new cases: 4 `IconButton` + 2 `StatusPill`).
2. `npx tsc -b` — clean, no output.
3. `npm run lint` — exit 0, 1 pre-existing unrelated warning
   (`src/write/ToastProvider.tsx` react-refresh/only-export-components).
4. `npm run build` — succeeded, **no new warnings**. Only the pre-existing
   Rollup chunk-size advisory on `dist/assets/index-*.js` (583 kB); the
   `export-dist` sub-build (flowchart.html/steps.html) also completed clean.

## Concerns / notes

- None outstanding. Both target test files (`primitives.test.tsx`,
  `StatusPill.test.tsx`) and both guard tests were run standalone per the
  brief's Step 3/6 before the full-suite run, exactly matching the specified
  TDD sequence (red, then green).
- `ui/design/.thumbnail` and `docs/superpowers/plans/2026-07-31-guard-false-positive-fix.md`
  were already untracked in the working tree before I started (per initial
  `git status`) and were left untouched — not part of either commit.

## Post-review fix — cascade regressions (2026-08-10)

Review found six defects plus minors, all traced to the brief, not the
transcription. Fixed in one follow-up commit.

**FIX 1/2 — `ui/src/ui/Button.tsx` `BASE`:** dropped `text-body` and `px-4`.
`.btn` (the old compat class) never set either — call sites did, e.g.
`ProcessList.tsx:113,114`, `FlowScreen.tsx:89`. Putting them in `BASE` put the
generated utility later in the built stylesheet than the call sites' own
`text-[…]`/`px-*` classes, so it won the cascade and silently overrode
nineteen call sites across screens this sub-project doesn't rebuild.

**FIX 3 — ghost border:** `border border-line` (1px) → `border-hairline
border-line` (1.5px, matching `.btn-ghost`). Added
`borderWidth: { hairline: 'var(--border-hairline)' }` to
`ui/tailwind.config.js` `theme.extend` — `--border-hairline` existed in
`tokens.css` but nothing referenced it until now.

**FIX 4 — `ui/src/ui/Chip.tsx` box:** `px-[0.6em] py-[0.25em]` (≈7.5px/3.1px,
an arbitrary-value regression on the previous commit's fix) → `px-s5 py-s1`,
the Task-1 spacing scale (`--space-5` = 10px, `--space-1` = 4px). Restores the
original box and removes the `em` literals.

**FIX 5 — button radius:** `.btn` was 12px (`--radius-md`); `rounded-control`
is 10px, so the component and the raw-class call sites disagreed. Added a
**named** (not `md`, which would shadow Tailwind's own key) `button:
'var(--radius-md)'` to `theme.extend.borderRadius`, and switched
`Button.tsx`'s `BASE` from `rounded-control` to `rounded-button`.

**FIX 6 — `IconButton` hiding test was vacuous:** the fixture
`const Icon = () => <svg … aria-hidden>` hardcoded the attribute, so
`cloneElement`'s injection in `IconButton.tsx` was provably untested — deleting
the injection line left the suite green. Replaced the fixture with a host
element (`const Icon = <svg data-testid="icon" …>`, no `aria-hidden` of its
own), passed as `icon={Icon}` everywhere, and rewrote the hiding test to
assert the rendered `[data-testid="icon"]` carries both
`aria-hidden="true"` and `focusable="false"`. Also, per the minors: dropped
the `as Record<string, unknown>` cast on the `cloneElement` call — this
required widening `icon`'s declared type from `ReactElement` to
`ReactElement<Record<string, unknown>>` so `tsc -b` still passes without the
cast papering over it — and moved `{...props}` before `aria-label`/`title` so
a caller can no longer override the accessible name and defeat the
required-`label` contract.

**FIX 7 — dropped mapping coverage restored:** `primitives.test.tsx` now
re-asserts `Button`'s variant→class map (`bg-coral` for `coral`, `bg-card
text-violet` for the ghost default) and `Chip`'s kind→class map for all four
ICOM kinds (`bg-icom-* text-icom-*`), so an emptied `V`/`K` map would fail the
suite again.

**Minors:** `StatusPill.test.tsx` now asserts the actual token class pair per
tone instead of only that two tones differ; `a11y.ts`'s regexes are anchored
(`/\bmin-h-touch\b/`, `/\bmin-w-touch\b/`); `ui/src/index.css`'s compat-layer
comment now names the real remaining consumers
(`src/shell/BackButton.tsx`, `src/shell/TopBar.tsx`, `src/write/ExportModal.tsx`)
instead of the stale "until Tasks 3-4" wording.

### Verification

1. `npx vitest run` — **445 passed**, 0 failed (74 files; up 2 from 443 —
   the restored `Button` variant-mapping test and `Chip` kind-mapping test;
   `StatusPill`'s test count is unchanged, one case rewritten in place).
2. `npx tsc -b` — clean (required widening `IconButton`'s `icon` prop type,
   see FIX 6, to drop the cast without a `cloneElement` overload error).
3. `npm run lint` — exit 0, same one pre-existing unrelated warning.
4. `npm run build` — clean, no new warnings, only the pre-existing Rollup
   chunk-size advisory.

**Grep confirmation against `ui/dist/assets/*.css`:**
- `.btn{...border-radius:.75rem...}` (12px) now agrees with the component's
  new `.rounded-button{border-radius:var(--radius-md)}` (also 12px, since
  `--radius-md:12px`).
- `.btn-ghost{border:var(--border-hairline) solid var(--line)}` now agrees
  with the component's new `.border-hairline{border-width:var(--border-hairline)}`
  utility — both 1.5px, same variable.
- `grep -o '.text-body{[^}]*}'` on the built CSS returns **nothing** — no
  `.text-body` rule is emitted at all, confirming no button is having a font
  size forced onto it anymore.

**Commit:** `fix(ui): the button base was overriding every call site that
styled itself` — see git log for the sha.
