# UI Design Conformance Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the whole frontend — every screen, both surfaces, at three widths — look and behave like `ui/design/Inja Panel.dc.html` and `ui/design/Inja Reader.dc.html`.

**Architecture:** Foundations first, because the drift has one structural cause: 106 of the design system's 178 tokens have no Tailwind utility name, so implementers could not reach `--hover-lift`, `--duration`, `--pad-screen-x/y` or the checkbox size even when they tried. Expose the tokens and the two breakpoints, settle one semantic rule per role, build the twelve missing primitives, then rebuild the shell and the screens on top. Every page ends in a real-browser check at three widths, because `vitest` runs on jsdom and renders nothing — which is precisely why nine screens shipped where every individual value was legal and the page still looked wrong.

**Tech Stack:** React 19 · TypeScript · Vite · Tailwind · Vitest (jsdom, `globals: false`) · **Playwright 1.61.0 (new, `channel: 'chrome'`)** · @xyflow/react (frozen).

---

## Global Constraints

- **Design of record:** `ui/design/Inja Panel.dc.html` for panel screens, `ui/design/Inja Reader.dc.html` for reader screens. Where the extracted `_ds/` token set or its `readme.md` disagrees, **the deliverable wins** and the token is corrected with the reason recorded. (Ruling R1)
- **Where a deliverable contradicts itself, that is a design defect, not a specification.** One rule per role, taken from what an element *is*, never from which screen it sits on. Every normalisation is logged for owner veto. (R8)
- **The authoritative spec is `.superpowers/sdd/ui-design-spec.md`** (2810 lines) — every value in this plan is quoted from it. The three audits are `.superpowers/sdd/ui-audit-new-screens.md`, `ui-audit-existing.md`, `ui-audit-visual.md`. The owner's rulings are `.superpowers/sdd/ui-owner-rulings.md` and outrank any inference from the design files.
- **The app sits on the deep violet field `#2A1D5E`.** Both deliverables agree. `--bg: #FBF7F1` is the flow canvas ground, not the page background.
- **Panel and reader are two surfaces at two scales, not two themes.** They share every foundation (violet field, two-layer card shadow `0 1px 2px rgba(16,10,40,.16), 0 14px 30px -16px rgba(16,10,40,.55)`, border `1px solid rgba(42,29,94,.07)`, hover `translateY(-2px)` over `.16s`, focus `border-color: #FA5A52`, scrim `rgba(36,17,82,.45)`, 10px scrollbar) and differ in column width, padding, type scale, tile size, icon-button size, FAB size and chrome. A shared component set cannot satisfy both; components are surface-aware. (R3)
- **Never draw what you would refuse.** If a person cannot reach a thing it is absent — not disabled, not explained, not a row that 404s when clicked. Refusal screens remain for typed URLs; nothing inside the app may navigate to one. (R5)
- **A reader whose reachable departments number exactly one lands on that department's process list**, never on a one-tile list. Scope decides, never content. That list is then their root and carries no back bar. Reader-only. (R4)
- **Every page and component is responsive.** Two breakpoints only: **≤1080px** and **≤760px**, with the exact rules in R7. The app has 18 responsive utilities today, all in the dialog primitive; `src/screens/`, `src/write/`, `src/shell/` and `src/flow/` have zero. (R7)
- **Every page is verified in a real browser at 3 widths** — 1440, 1080, 760 — asserting computed values against the design's numbers, plus a screenshot. (R6)
- **Persian everywhere a reader sees a number** via `toFa()`. Latin survives only inside `dir="ltr"` mono runs (ids, IPs, usernames, session ids) and the one letter-spaced `INJA FOOD · مستندسازی فرآیند` eyebrow.
- **Vazirmatn only**, weights 400/600/700/800; every heading 800. Working type 11–15px with deliberate half-pixels (13.5/12.5/11.5/10.5); `12.5px` is the most common size in the design.
- **No gradients anywhere.** The one texture is the flow canvas's 20px `#E3D8F5` dot grid on `#FBF7F1`.
- **No emoji, no unicode-glyph icons** — inline line SVG at stroke 2.2–2.6. Two named exceptions: `⣿` and the IDEF0 arrows. One raster: the logo.
- **Nothing scales or bounces on press.** Focus is `border-color: #FA5A52` with no glow and no ring (15/15 uses in the design).
- Frontend tests: `cd ui && npx vitest run`, `globals: false` — import from `vitest` explicitly. **`npm run build` is mandatory**, and every task that writes Tailwind classes ends by running **`node ui/scripts/harvest-classes.mjs`** over the files it wrote: an invented class compiles to nothing while the build exits 0. A hand-kept list grepped against `dist/assets/*.css` does **not** catch it — that was measured, twice — see *The class-emission check* below.
- **Coral opens, violet commits (owner ruling).** Coral `#FA5A52` is the affordance that *starts* a creation flow («کاربر جدید», «فرآیند تازه»); violet `#4A25A9` is the commit inside the form or dialog; `--conflict #E23D35` stays destructive. Both deliverables are self-consistent under this rule — only the readme's blanket "coral for anything primary" is not, and the deliverable wins (R1).
- **Password reset is a direct set — D15 wins over the design (owner ruling).** §6.8 and §6.13 draw a one-time reset *link* and state no password is ever created or shown. That contradicts D15, which the owner reaffirmed: the administrator types the value and tells the person, because this system is Telegram-fed and has no delivery channel. Build the design's shell around the app's control and **rewrite the two sentences** that describe a link.
- **The 29 unspecified icons are authored to the set's own construction rules (owner ruling)** — stroke 2.2–2.6, matching joinery and optical weight. §5.1.2 fixes only 11 of 33 `InjaIcons` paths, and seven glyphs the panel renders have no key at all: the breadcrumb house, the hamburger, the users filter funnel, the eye and eye-off, the FAB comment mark, and the sign-out mark. **Every authored icon is listed in the ledger** so the owner can review or replace it.
- **The profile has no open-sessions card (owner ruling).** §6.13 draws one; the owner has removed it from the product. Do not build it, do not stub it, and add no `/api/auth/sessions` route. This is a deliberate divergence from the deliverable, recorded in the ledger.
- **Touch targets: draw the design's size, expand the hit area.** `--size-touch: 44px` (F11) and the design's 30/32/34/36/40/42px control ladder contradict each other, and no resizing satisfies both. **One rule for the whole plan:** the *drawn* control is always the design's size; the *touch target* is brought to 44px with a transparent `::before` overlay. Never shrink the hit area to match the design, and never inflate a drawn control to 44px — the second is what forced every process row from ~22px to 44px. `expectExpandedHitArea` in `ui/src/test/a11y.ts` asserts it. This supersedes any per-task treatment: three planners resolved this three ways, and this is the resolution.
- **Playwright is pinned to 1.61.0** — 1.62.1 declares `engines.node: ">=20"` and this machine runs Node v18.19.1. 1.61.0 is the newest release declaring `>=18`. Install with `PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1` and `channel: 'chrome'`; Chrome is at `/usr/bin/google-chrome` and the network is restricted. **Do not bump this without checking `engines.node` first.**
- **Do not touch** `ui/src/flow/**` (frozen — F16), `ui/export/**`, `engine/`, `data-repo`, or anything under `ui-backend/`. This plan changes no backend behaviour.
- **`ui/design/**` is read-only.** It is the specification, never an output.

---

### The class-emission check (`ui/scripts/harvest-classes.mjs`)

Every task that writes Tailwind classes ends with one invocation of the scanner:

```bash
cd ui && npx vite build
node scripts/harvest-classes.mjs <the files this task wrote>
```

It harvests the class candidates **out of the files themselves** — never from a
hand-kept list — looks each one up in an index it *parses* out of
`dist/assets/*.css` (selectors unescaped, declarations counted, every `var(--x)`
cross-checked against the declared custom properties), and buckets them
`ok` / `DEAD` / `EMPTY` / `NOVAR`. A negative control and an escaping control run
on every invocation and the script exits 1 if either fails, so the check cannot
go quietly dead. `HARVEST_LIST=1` prints the certified list, which is how the
numbers below were obtained.

**Why the old "build, then grep `dist/assets/*.css` for a hand-kept list" step is
gone.** It proved almost nothing here, and this was measured on a real build, not
argued:

- `ui/tailwind.config.js:59` puts `'./tailwind-probe.txt'` in Tailwind's
  `content`, and that probe names **every** theme class. So every theme class
  emits whether or not any component writes it. **All 14 classes Task 9's step
  grepped for are named verbatim in the probe** — the step passed whether or not
  `DataTable.tsx` and `Pager.tsx` existed at all.
- A hand-kept list drifts from the files, in both directions. Task 9's 14 named
  **5 classes its two files never write** and missed **52 they do**, including
  `grid-cols-users`, every `max760:*` and `before:-inset-[5px]`. Task 8's 52
  named 3 its three files never write and missed 56 they do, including
  `focus:border-coral` and `peer-focus-visible:border-coral`. Task 6's 33 missed
  123.
- Tailwind **escapes** the special characters in a class name: `hover:bg-tile-v2`
  is written `.hover\:bg-tile-v2:hover`, and `1.4fr` inside an arbitrary value
  becomes `1\.4fr`. A grep that escapes the name for a regex therefore reports
  every variant class missing. Task 6's step did exactly that and printed `MISS`
  for all eleven of its variant classes on a build where every one of them was
  present and correct.
- A substring grep for `.w-tick` is satisfied by `.w-tick-glyph`; index lookup is
  not. And a theme key pointing at nothing emits a rule with an **empty body**,
  which a grep scores as present and this scanner reports as `EMPTY`.

**What a failure means.** `DEAD` = the class compiled to no rule: a **typo in the
component**, fixed in the component. `EMPTY` = the theme key resolves to nothing.
`NOVAR` = the rule reads a `var(--…)` nothing declares. The last two are theme
regressions to report.

**Never "add it to the config."** `ui/tailwind.config.js`,
`ui/src/styles/tokens.css`, `ui/src/styles/roles.css` and
`ui/tailwind-probe.txt` are frozen for the duration of this plan and were
unfrozen exactly once, by the single minting pass specified in
`.superpowers/sdd/mint-spec.md`. Minting a name from inside a task to make a
misspelling compile is precisely the unreachable-token failure this rebuild
exists to end — 106 of the design system's 178 tokens had no reachable name,
which is why nine screens drifted while every individual value stayed legal. If a
value genuinely has no name, **stop and report it**, and put it in
`mint-spec.md`.

**What this check cannot prove.** That a component *writes* a class and that the
class compiles to a rule with declarations — yes. That the class reaches the
right element, that the element renders, that it is visible, or that its value is
the one the design asks for — **no**. That stays with the Playwright checks of
R6. A green run here is a floor, never a conformance result.

---

## File Structure

**New — foundations**
| Path | Responsibility |
|---|---|
| `ui/src/styles/roles.css` | The semantic table of R8: one custom property per role, the single source every component reads. |
| `docs/superpowers/ui-normalisation-ledger.md` | Every place the design contradicted itself, what was chosen, why. Owner-vetoable. |
| `ui/playwright.config.ts` | `channel: 'chrome'`, three projects (1440 / 1080 / 760), baseURL from the dev server. |
| `ui/e2e/_harness.ts` | `expectDesign(page, screen)` — asserts computed values against the design's numbers; `shot(page, name)`. |

**New — primitives** (`ui/src/ui/`)
| Path | Responsibility |
|---|---|
| `surface.tsx` | `SurfaceProvider` + `useSurface()` — `'panel' \| 'reader'`; the scale layer of R3. |
| `TextField.tsx`, `PasswordField.tsx` | The field the app lacks; 25 hand-rolled inputs collapse into it. |
| `Checkbox.tsx`, `Radio.tsx` | The custom controls; replaces 35 native OS boxes at two different sizes. |
| `Dropdown.tsx` | Replaces ~15 hand-rolled selects. |
| `DataTable.tsx` | The 6-column users grid and its siblings. |
| `SectionCard.tsx`, `StatTile.tsx`, `Pager.tsx`, `FAB.tsx`, `NavTabTray.tsx`, `Timeline.tsx` | Named in the deliverable, absent from the app. |
| `Icon.tsx`, `icons/` | The line-icon set at stroke 2.2–2.6; `IconTile`; the department glyphs. |

**Modified — foundations**
| Path | Change |
|---|---|
| `ui/tailwind.config.js` | Expose the 106 unreachable tokens; add breakpoints `1080px` / `760px`. |
| `ui/src/styles/tokens.css` | Correct the tokens the deliverable contradicts; record each. |
| `ui/src/test/guards.test.ts` | Retire `PENDING_REBUILD`; tighten the regexes; complete the `dir=` island list. |
| `ui/package.json` | `@playwright/test` devDependency; `test:e2e` script. |

**Modified — primitives**: `Button.tsx` (disabled appearance, danger, icon, block), `Card.tsx` (hoverLift, radius, padding, onDark), `Overlay.tsx` (subtitle, icon, width, footer, blurScrim), `SearchField.tsx`, `states/index.tsx`, `StatusPill.tsx`, `IdBadge.tsx`.

**Modified — shell**: `PanelShell.tsx` (logo, breadcrumb, nav, both breakpoints, Persian digits, the 1.04:1 hover), `ReaderShell.tsx` (back bar, no chrome on flow, reader scale, single-department landing).

**Modified — screens**: `Departments`, `ProcessList`, `Summary`, `Overview`, `SignIn`, `Refusal`, `Users`, `UserDetail`, `UserFields`, `NewUserDialog`, `EditUserDialog`, `SupervisorPicker`, `Profile`, `Visibility`, and `ui/src/write/**` except the frozen flow.

---

## Task List

Each task ends with an independently testable deliverable, and every screen task
ends with its Playwright check at all three widths.

| # | Task | Gate |
|---|---|---|
| **A — Foundations** |
| 1 | The semantic table and the normalisation ledger | **Owner veto point** |
| 2 | Tailwind config: the 106 tokens and the two breakpoints | build + `harvest-classes` |
| 3 | Token corrections the deliverable requires | vitest |
| 4 | The Playwright harness | e2e green on one existing page |
| **B — Primitives** |
| 5 | `surface.tsx` — the panel/reader scale layer | vitest |
| 6 | `Button`, `Card`, `Overlay`, `SearchField`, `states` brought up to the design | vitest + e2e |
| 7 | `TextField`, `PasswordField` | vitest |
| 8 | `Checkbox`, `Radio`, `Dropdown` | vitest |
| 9 | `DataTable`, `Pager` | vitest |
| 10 | `SectionCard`, `StatTile`, `NavTabTray`, `Timeline`, `FAB` | vitest |
| 11 | `Icon`, the icon set, `IconTile`, the department glyphs, the logo | vitest + `harvest-classes` |
| **C — Shell** |
| 12 | `PanelShell` — chrome, logo, breadcrumb, both breakpoints, Persian digits | e2e ×3 |
| 13 | `ReaderShell` — back bar, flow chrome, reader scale, single-department landing (R4) | e2e ×3 |
| **D — Screens** (each: design conformance · R5 · responsive · e2e ×3) |
| 14 | `Departments` (both surfaces) |
| 15 | `ProcessList` |
| 16 | `Summary` |
| 17 | `Overview` |
| 18 | `SignIn` and `Refusal` |
| 19 | `Users` — the 6-column table |
| 20 | `UserDetail` |
| 21 | `NewUserDialog`, `EditUserDialog`, `UserFields`, `SupervisorPicker` |
| 22 | `Profile` — the sessions card is removed by owner ruling |
| 23 | `Visibility` |
| 24 | `write/**` — ConfirmMark and the write flows |
| **E — Close it out** |
| 25 | Retire `PENDING_REBUILD`; tighten the guards; full sweep at 3 widths |

---
### Task 1: The semantic table and the normalisation ledger

**Owner veto point.** Nothing after this task chooses a value. Every later task
reads the value from `ui/src/styles/roles.css`, and every place the design
contradicted itself is written down in the ledger with what was chosen and why,
so the owner can overturn it before a line of it is built.

**Files**
- Create: `ui/src/styles/roles.css`
- Create: `docs/superpowers/ui-normalisation-ledger.md`
- Create: `ui/src/test/roles.test.ts`
- Modify: `ui/src/index.css` (import `roles.css`)

**Interfaces**

*Consumes* — the four frozen token files already imported by
`ui/src/styles/tokens.css`:
`--ink #2A1D5E`, `--bg #FBF7F1`, `--card #FFFFFF`, `--violet #4A25A9`,
`--coral #FA5A52`, `--green #1F8A5B`, `--conflict #E23D35`, `--warn #B4690E`,
`--info #1F6FB2`, `--tile-v #F0E9FB`, `--tile-v2 #F4EFFB`, `--tile-v4 #F8F4FE`,
`--tile-c #FFE9E7`, `--tile-c2 #FFF3F2`, `--tile-ok #E4F6EC`,
`--tile-warn #FBEEDC`, `--tile-info #E7F1FB`, `--tile-dead #EDEAF3`,
`--warm #EFE7DC`, `--line #E3D8F5`, `--hair #F2ECE3`, `--line-dashed #C9B8EC`,
`--border-danger #FDD9D6`, `--border-current #EDE5F5`, `--border-dead #E4DEF0`,
`--border-ok #C4E7D3`, `--text-strong #2A1D5E`, `--text-body #4A3F6B`,
`--text-muted #8a7db0`, `--text-faint #a99fc4`, `--text-ghost #c3bad6`,
`--text-disabled #cfc7e0`, `--text-on-dark #FBF7F1`,
`--violet-on-dark #B79FE6`, `--violet-on-dark-body #B7A6E0`,
`--scrim rgba(36,17,82,.45)`, `--shadow-card`, `--shadow-card-hover`,
`--shadow-modal`, `--shadow-pop`, `--shadow-drawer`, `--shadow-violet`,
`--shadow-coral`, `--shadow-green`, `--hover-lift translateY(-2px)`,
`--duration .16s`, `--duration-chev .18s`, `--radius-badge 6px`,
`--radius-chip 7px`, `--radius-md 12px`, `--radius-lg 13px`,
`--radius-tile 14px`, `--radius-card 16px`, `--radius-panel 24px`,
`--radius-pill 20px`, `--radius-round 50%`, `--fs-display 34px`,
`--fs-h2 22px`, `--fs-lg 15px`, `--fs-body 14px`, `--fs-sm 13px`,
`--fs-sm2 12.5px`, `--fs-xs 11.5px`, `--fs-xxs 11px`, `--fs-micro 10.5px`,
`--fw-semibold 600`, `--fw-bold 700`, `--fw-extrabold 800`, `--lh-tight 1.2`,
`--lh-normal 1.7`, `--lh-loose 1.9`, `--tracking-eyebrow .14em`,
`--tracking-display -.01em`.

*Produces*
- `ui/src/styles/roles.css` — 62 custom properties, all named `--role-*`, every
  one of them a `var()` into a token. **Normative: no later task may use a value
  this file does not name.** The full list is in Step 3.
- `docs/superpowers/ui-normalisation-ledger.md` — a markdown table with the
  columns `Role · What the design showed · Count · Chosen · Why`, one row per
  contradiction, plus the section **“Action versus state”** carrying the single
  ruling, plus the section **“Referred to the owner”**.
- `ui/src/test/roles.test.ts` — vitest, `globals: false`. Asserts roles.css holds
  no literal value, that every `var(--…)` it names resolves against the token
  files, and that the ledger's table is complete.

**Steps**

- [ ] **Step 1: Write the failing test for the semantic table.**
  Create `ui/src/test/roles.test.ts`:

  ```ts
  import { describe, it, expect } from 'vitest'
  import { readFileSync } from 'node:fs'
  import { join } from 'node:path'

  const UI = process.cwd()
  const DS = join(
    UI,
    'design/_ds/inja-food-design-system-1ef55d80-2e17-482f-b420-9d004eaa22de/tokens',
  )

  const roles = readFileSync(join(UI, 'src/styles/roles.css'), 'utf8')

  /** Every token name declared anywhere the app can see one. */
  function declaredTokens(): Set<string> {
    const sources = [
      join(DS, 'colors.css'), join(DS, 'spacing.css'),
      join(DS, 'typography.css'), join(DS, 'effects.css'),
      join(UI, 'src/styles/tokens.css'),
    ]
    const names = new Set<string>()
    for (const p of sources) {
      for (const m of readFileSync(p, 'utf8').matchAll(/^\s*(--[a-z0-9-]+)\s*:/gm)) {
        names.add(m[1])
      }
    }
    return names
  }

  /** Every `--role-*: <value>;` declaration in roles.css. */
  function roleDeclarations(): { name: string; value: string }[] {
    return [...roles.matchAll(/^\s*(--role-[a-z0-9-]+)\s*:\s*([^;]+);/gm)]
      .map((m) => ({ name: m[1], value: m[2].trim() }))
  }

  describe('R8 — one rule per role', () => {
    it('names every role the ledger decides', () => {
      expect(roleDeclarations().length).toBeGreaterThanOrEqual(62)
    })

    it('holds no literal value — every role points at a token', () => {
      const literal = roleDeclarations().filter(
        (d) => !/^var\(--[a-z0-9-]+\)$/.test(d.value),
      )
      expect(literal.map((d) => `${d.name}: ${d.value}`)).toEqual([])
    })

    it('points only at tokens that exist', () => {
      const known = declaredTokens()
      const dangling = roleDeclarations()
        .map((d) => ({ ...d, token: /var\((--[a-z0-9-]+)\)/.exec(d.value)?.[1] ?? '' }))
        .filter((d) => !known.has(d.token))
      expect(dangling.map((d) => `${d.name} -> ${d.token}`)).toEqual([])
    })

    it('declares no role twice', () => {
      const names = roleDeclarations().map((d) => d.name)
      expect(names.length).toBe(new Set(names).size)
    })
  })
  ```

- [ ] **Step 2: Run it and see it fail.**
  `cd ui && npx vitest run src/test/roles.test.ts`
  Expected: the suite errors before any test runs —
  `ENOENT: no such file or directory, open '.../ui/src/styles/roles.css'`.

- [ ] **Step 3: Create the semantic table.**
  Create `ui/src/styles/roles.css`:

  ```css
  /* The semantic table of R8 — one custom property per role.
     This file is NORMATIVE. Every later task reads its value from here; no
     screen, component or utility may use a value this file does not name.

     Two rules govern it:
       1. A role has one value. Where the deliverable showed two, the choice and
          the count behind it are in docs/superpowers/ui-normalisation-ledger.md.
       2. An action and a state share the role's HUE and never its TREATMENT.
          An action fills the hue; a state tints it. See the ledger's
          "Action versus state".

     No literal values live here: every value is a var() into src/styles/tokens.css
     (which is the only file in src/ allowed to hold one). Where a role's value is
     a token whose recorded value the deliverable contradicts, Task 3 corrects the
     token — not this file. */

  :root {
    /* ---- ground (§6.0, §9.1) ---- */
    --role-field: var(--ink);              /* the whole app sits on #2A1D5E */
    --role-canvas: var(--bg);              /* flow canvas ground, nothing else */
    --role-surface: var(--card);           /* every card, row, table, panel */
    --role-surface-tint: var(--tile-v4);   /* hover row, actor pill */
    --role-scrim: var(--scrim);

    /* ---- ink (§1.1, §9.9) ---- */
    --role-ink-strong: var(--text-strong);
    --role-ink-body: var(--text-body);     /* Task 3 re-points this to #5a5175 */
    --role-ink-muted: var(--text-muted);
    --role-ink-faint: var(--text-faint);
    --role-ink-ghost: var(--text-ghost);
    --role-ink-disabled: var(--text-disabled);

    /* ---- type on the violet field (§6.0, §9.7k) ---- */
    --role-title-on-field: var(--card);            /* #fff — ledger L-01 */
    --role-subtitle-on-field: var(--violet-on-dark-body); /* Task 3 -> #C9BEEE */
    --role-eyebrow: var(--violet-on-dark);

    /* ---- roles that carry meaning (R8's table) ---- */
    --role-primary: var(--violet);
    --role-primary-soft: var(--tile-v);
    --role-primary-ink: var(--card);
    --role-new: var(--coral);
    --role-confirmed: var(--green);
    --role-confirmed-soft: var(--tile-ok);
    --role-confirmed-edge: var(--border-ok);   /* Task 3 -> #BFE5D0 */
    --role-awaiting: var(--warn);              /* ledger L-05 */
    --role-awaiting-soft: var(--tile-warn);
    --role-danger: var(--conflict);
    --role-danger-soft: var(--tile-c);
    --role-danger-ghost: var(--tile-c2);
    --role-danger-edge: var(--border-danger);
    --role-info: var(--info);
    --role-info-soft: var(--tile-info);
    --role-dead: var(--text-muted);
    --role-dead-soft: var(--tile-dead);
    --role-dead-edge: var(--border-dead);

    /* ---- borders (§4.3) ---- */
    --role-border-control: var(--line);        /* 1.5px on every control */
    --role-border-sub: var(--border-current);  /* the sub-panel border */
    --role-border-hair: var(--hair);           /* a rule inside a card */
    --role-border-pick: var(--line-dashed);    /* unchecked tick, active filter */
    --role-border-warm: var(--warm);           /* top bar and drawer edges only */

    /* ---- interaction (§4.6) ---- */
    --role-focus: var(--coral);                /* 15/15, no ring, no glow */
    --role-hover-menu: var(--tile-v2);         /* 16/24 hover declarations */
    --role-hover-danger: var(--tile-c2);
    --role-lift: var(--hover-lift);
    --role-duration: var(--duration);
    --role-duration-chev: var(--duration-chev);

    /* ---- shadows (§4.2) ---- */
    --role-shadow-card: var(--shadow-card);
    --role-shadow-card-hover: var(--shadow-card-hover);  /* Task 3 fixes .6 -> .7 */
    --role-shadow-dialog: var(--shadow-modal);           /* Task 3 re-cuts it */
    --role-shadow-pop: var(--shadow-pop);                /* Task 3 re-cuts it */
    --role-shadow-drawer: var(--shadow-drawer);
    --role-shadow-primary: var(--shadow-violet);
    --role-shadow-new: var(--shadow-coral);              /* ledger L-03: -12px */
    --role-shadow-confirm: var(--shadow-green);

    /* ---- radii (§4.4) ---- */
    --role-radius-badge: var(--radius-badge);
    --role-radius-chip: var(--radius-chip);
    --role-radius-control: var(--radius-md);
    --role-radius-input: var(--radius-md);
    --role-radius-search: var(--radius-lg);
    --role-radius-tile: var(--radius-tile);
    --role-radius-card: var(--radius-card);
    --role-radius-dialog: var(--radius-panel);   /* ledger L-04: 24px, always */
    --role-radius-pill: var(--radius-pill);      /* Task 3 -> 999px */
    --role-radius-round: var(--radius-round);

    /* ---- type roles (§2) ---- */
    --role-fs-hero: var(--fs-display);
    --role-fs-title: var(--fs-h2);        /* ledger L-02: one screen title, 22px */
    --role-fs-section: var(--fs-lg);
    --role-fs-body: var(--fs-body);
    --role-fs-dense: var(--fs-sm);
    --role-fs-control: var(--fs-sm2);     /* the most common size in the design */
    --role-fs-eyebrow: var(--fs-xs);
    --role-fs-badge: var(--fs-xxs);
    --role-fs-micro: var(--fs-micro);
    --role-fw-heading: var(--fw-extrabold);
    --role-fw-strong: var(--fw-bold);
    --role-fw-meta: var(--fw-semibold);
    --role-lh-title: var(--lh-tight);
    --role-lh-body: var(--lh-normal);
    --role-lh-prose: var(--lh-loose);
    --role-tracking-eyebrow: var(--tracking-eyebrow);
    --role-tracking-display: var(--tracking-display);
  }
  ```

- [ ] **Step 4: Import it, after the tokens it points at.**
  In `ui/src/index.css`, replace the first two lines:

  ```css
  @import './styles/tokens.css';
  @import './styles/base.css';
  ```

  with:

  ```css
  @import './styles/tokens.css';
  @import './styles/roles.css';
  @import './styles/base.css';
  ```

- [ ] **Step 5: Run it and see it pass.**
  `cd ui && npx vitest run src/test/roles.test.ts`
  Expected: `Test Files 1 passed`, `Tests 4 passed`.

- [ ] **Step 6: Prove the new file does not trip the guards, then commit.**
  `cd ui && npx vitest run src/test/guards.test.ts && npx tsc -b && npx eslint . && npm run build`
  Expected: guards green (roles.css holds no hex, no `text-[`/`rounded-[`/`shadow-[`,
  no physical direction property and no `size:`/`variant:` declaration), tsc silent,
  eslint silent, `vite build` exits 0.
  ```
  git add ui/src/styles/roles.css ui/src/index.css ui/src/test/roles.test.ts
  git commit -m "feat(ui): one rule per role, written down where every screen can read it"
  ```

- [ ] **Step 7: Write the failing test for the ledger.**
  Append to `ui/src/test/roles.test.ts`:

  ```ts
  const ledger = readFileSync(
    join(UI, '..', 'docs/superpowers/ui-normalisation-ledger.md'), 'utf8',
  )

  describe('R8 — every normalisation is recorded', () => {
    const rows = ledger
      .split('\n')
      .filter((l) => /^\| L-\d\d /.test(l))
      .map((l) => l.split('|').slice(1, -1).map((c) => c.trim()))

    it('records every contradiction R8 catalogued, and the ones found since', () => {
      expect(rows.length).toBeGreaterThanOrEqual(24)
    })

    it('gives every row all five columns, none of them empty', () => {
      const broken = rows.filter((r) => r.length !== 5 || r.some((c) => c === ''))
      expect(broken.map((r) => r.join(' | '))).toEqual([])
    })

    it('rules on action versus state once, and says which', () => {
      expect(ledger).toContain('## Action versus state')
      expect(ledger).toContain('share the role’s hue and never its treatment')
    })

    it('names what it could not settle rather than choosing silently', () => {
      expect(ledger).toContain('## Referred to the owner')
    })
  })
  ```

- [ ] **Step 8: Run it and see it fail.**
  `cd ui && npx vitest run src/test/roles.test.ts`
  Expected: the suite errors —
  `ENOENT: no such file or directory, open '.../docs/superpowers/ui-normalisation-ledger.md'`.

- [ ] **Step 9: Write the ledger.**
  Create `docs/superpowers/ui-normalisation-ledger.md`:

  ````markdown
  # UI normalisation ledger

  **This is the owner's veto point.** Every row is a place where the design
  contradicts *itself* — not a place where a deliverable disagrees with the token
  file, which is R1's business and is recorded in `ui/src/styles/tokens.css`
  instead. R8 says an internal contradiction is a defect in the design, not a
  specification, so exactly one treatment is chosen per role and the losing
  variant is normalised to it.

  Resolution order, from R8: (1) the design's own stated semantics decide;
  (2) failing that, dominant usage wins; (3) failing that, it goes to the owner —
  see **Referred to the owner** at the end, which is not a list of things that
  were chosen quietly.

  Counts are from `.superpowers/sdd/ui-design-spec.md`, which counted them in the
  deliverables. The value chosen here is the value `ui/src/styles/roles.css`
  names, and no later task may use another.

  ## Action versus state

  Decided once, here, so no screen decides it again.

  **An action and a state share the role’s hue and never its treatment.**
  The hue comes from the role table: committed/accepted/approved/confirmed is
  `--green #1F8A5B`; new and primary-forward is `--coral #FA5A52`;
  danger/failure/conflict is `--conflict #E23D35`; primary is
  `--violet #4A25A9`.

  - An **action** *fills* the hue: `background: <hue>; color: #fff; border: 0`,
    plus the hue's glow shadow. A confirm button is therefore `#1F8A5B` on white
    ink with `0 10px 22px -13px rgba(31,138,91,.9)`.
  - A **state** *tints* the hue: `background: <hue-soft>; color: <hue>`, no
    shadow, no border. A confirmed badge is therefore `#1F8A5B` ink on `#E4F6EC`.
  - The one bridge the design already draws is the **ghost action**: an action of
    lower commitment that borrows the state's tint and is told apart from a state
    by having a `1.5px` border in the role's edge colour — affirmative ghost
    `#E4F6EC` / `#1F8A5B` / `1.5px #BFE5D0`; destructive ghost `#FFF3F2` /
    `#E23D35` / `1.5px #FDD9D6`.

  So the answer to *“is the confirm button the same colour as the confirmed
  badge?”* is **yes, the same hue; no, not the same treatment** — and a coral
  confirm is the error, because green *is* accept/approve in the design's own
  semantics, 38 times.

  ## The ledger

  | # | Role | What the design showed | Count | Chosen, and why |
  |---|---|---|---|---|
  | L-01 | Screen title on the violet field | `#fff` on thirteen screens; `#FBF7F1` on departments | 13 vs 1 | `#fff`. Dominant usage; `#FBF7F1` is the flow canvas's ground and reading it as a title colour is what made `--bg` look like a page background. |
  | L-02 | Screen title size | `22px` (six screens), `23px` (summary), `21px` (profile), `34px` (departments) | 6 / 1 / 1 / 1 | `22px` for a screen title (`--fs-h2`); `34px` stays as the **home hero**, a different role, not a fourth size for the same one. Summary and profile normalise to 22. |
  | L-03 | Coral button shadow | `0 12px 26px -12px` at screen level, `-14px` inside a drawer | 5 vs 5 across both deliverables | `-12px`. The tie is broken by the token: `--shadow-coral` is the `-12px` value, so one of the two variants is already the agreed one. |
  | L-04 | Dialog radius and shadow | `24px` + two-layer neutral (four dialogs), `22px` + two-layer (comment confirm), `20px` + `--shadow-modal` (conflict inbox) | 4 / 1 / 1 | `24px` with `0 4px 10px rgba(16,10,40,.28), 0 44px 90px -30px rgba(16,10,40,.8)`. Dominant usage; the inbox is the only dialog left on the old recipe. |
  | L-05 | “Awaiting / needs attention” amber | `#8A5A00` (comment awaiting, unconfirmed), `#B4690E` (sub-process tag, warn fg) | 2 maps vs 2 maps | `#B4690E` (`--warn`). Semantics decide: `#8A5A00` is `--icom-control-fg`, and the ICOM palette is the one place the design says *colour IS the meaning, never decorative*, so a status may not borrow it. |
  | L-06 | “Clear filters” link | `#7A52D0` on Users, `#E23D35` on User activity | 1 vs 1 | `#7A52D0` (`--violet-mid`). Semantics decide: `--conflict` is declared *destructive + conflicts*, and clearing a filter destroys nothing. |
  | L-07 | Department-info content width | `900px`; every sibling list screen `920px` | 1 vs 4 | `920px` (`--width-list`). Dominant usage, and 900 has no token. |
  | L-08 | Scrollbar width | `12px` in `tokens/base.css`, `10px` in both deliverables | 1 vs 2 | `10px`. Both deliverables agree against the token file. |
  | L-09 | Unchecked tick border | `#C9B8EC` everywhere; `#DCD3EC` on the visibility-policy rows | many vs 1 | `#C9B8EC`. Dominant usage; `#DCD3EC` has no token and no role of its own. |
  | L-10 | Checkbox size | `16px` (nested view option), `17px` (dept scope, new-user scope), `18px` (supervisor flag, whole system), `19px` (policy row, confirmed tick, radio) | 1 / 2 / 2 / 3 | Two sizes by role, not four by screen: a tick in a list row is `19px`; a tick nested inside another option is `16px`. `17` and `18` normalise to `19`. |
  | L-11 | Table-head background | Users none; audit none on the head, `#F8F4FE` on the filter bar; activity `#F8F4FE` on both | 1 / 1 / 1 | `#F8F4FE` on both head and filter bar. Dominant across the three tables, and it is the only value any of them paints. |
  | L-12 | `ProcessTag.plain` | byte-identical to `.kpi` — `--violet` on `--tile-v` | 2 of 5 tags indistinguishable | A plain process draws **no tag**. Tags mark an exception (sub-process, conflict, KPI, tombstone); a tag that says «فرآیند» on a screen of processes marks nothing. *The alternative, if the owner prefers a visible tag, is the muted skin `--text-muted` on `--tile-v3`.* |
  | L-13 | Reader compose drawer | two drawers mount at once on the flow screen: 340/380px, padding 20/24, title 18/19, textarea 13.5/15.5, radius 12/14, submit **violet / coral** | 2 | One drawer, the panel's: `380px`, padding `22px`, title `18px`, textarea `13.5px`, radius `12px`, **violet** submit. The submit is a normal save, not a destructive-forward act, so coral is the error. |
  | L-14 | Card on the violet field | `#fff` in both deliverables; cream `var(--bg)` + `--shadow-card-dark` in the design system's `Card onDark` / `DepartmentCard` / `StatCard` / `Modal` | 2 deliverables vs 1 component layer | `#fff` with `1px solid rgba(42,29,94,.07)` and the two-layer neutral shadow. **`Card` therefore gets no `onDark` prop** — the cream-card idiom is unused by both deliverables and its two shadows are dead. |
  | L-15 | Card border | `rgba(42,29,94,.07)` at `1px`; `#EFE7DC` at `1.5px` on the comments-inbox list card and the unselected scope tile | 46 vs 2 | `1px solid rgba(42,29,94,.07)`. Dominant usage. `#EFE7DC` keeps its own role — the top-bar, flow-bar and drawer edges. |
  | L-16 | Dialog title size | `18px` (eleven dialogs), `17px` (the two confirm dialogs) | 11 vs 2 | `18px`. Dominant usage. The panel type scale gains the step in Task 3. |
  | L-17 | Line-height for prose | `1.9` (14), `1.8` (17), `1.85` (2), `1.95` (2), `2.05` (1) | — | Two roles, two values: explanatory sub-copy under a control is `1.8`; long-form prose (department description, comment body, step description) is `1.9`. `1.85`, `1.95` and `2.05` normalise. |
  | L-18 | Row transition | `.16s` on the two lifting surfaces, `.14s` on a users-table row | 2 vs 1 | `.16s` (`--duration`). `.14s` is not a token and nothing else uses it. |
  | L-19 | The “more” affordance | vertical kebab (three `r=1.8` circles at `cx=12`), horizontal `InjaIcons.dots` (`cy=12`), and the literal character `⋯` in five places | 3 renderings | The vertical kebab SVG. The literal `⋯` is a unicode glyph used as an icon, which the design forbids in the same breath it sanctions `⣿` and the ICOM arrows. |
  | L-20 | Pill radius | `--radius-pill: 20px` in the tokens; `999px` in both deliverables | 0 vs many | `999px`. Neither deliverable ever uses the token, and a 20px radius on a 24px-tall pill is visibly not a pill. |
  | L-21 | Mono stack | `'JetBrains Mono',ui-monospace,SFMono-Regular,Menlo,monospace` written 23 times and **never loaded**; token `--font-mono: ui-monospace,'SF Mono',Menlo,Consolas,monospace` | 23 vs 1 | The token. The deliverable's first choice silently falls through to `ui-monospace` because no stylesheet it links loads JetBrains Mono, so the token is what the design actually renders. |
  | L-22 | The add button | `ListEditor`'s inline add (`11px`, radius `9px`) vs the exported `AddButton` (`12.5px`, radius `10px`) | 1 vs 1 | `AddButton`'s: `12.5px`, radius `10px`. It is the exported one, so it is the one a second caller would reuse. |
  | L-23 | Close button | `32×32` radius `8` (drawer), `32×32` radius `9` (modal), `28×28` radius `8` (`DetailDrawer`) | 3 | One close button: `32×32`, `--tile-v2` fill, radius `9px` (`--radius-sm`), glyph `×` at `18px` in `--text-muted`. |
  | L-24 | FAB count-badge ring | `#2A1D5E` in the panel, `#FBF7F1` in the reader | 1 vs 1 | `#2A1D5E`. The ring exists to cut the badge out of the field it sits on, and the field is `#2A1D5E` on both surfaces; the cream ring is a stray light halo the reader's own spec calls a defect. |
  | L-25 | Reader process-list empty state | renders the search-miss copy «فرآیندی با این نام پیدا نشد» even when the department is simply empty, ignoring its own computed `emptyText` | 1 | The computed text. An empty department says «فرآیندی برای این دپارتمان ثبت نشده است.»; only a search with no hit says «فرآیندی با این نام پیدا نشد». |
  | L-26 | Reader status vocabulary | two maps, `RST` and `ST`, identical colours, different labels («رسیدگی شد»/«رسیدگی‌شده», «رد شد»/«رد شده»), only one carrying `withdrawn` | 2 | `ST` — it is the panel's map and the superset; `cmtCard` dereferences it unguarded, so the other one is what breaks. |
  | L-27 | Panel body size | `14px` (27 uses, body copy and paragraphs) and `13px` (73 uses, buttons, table cells, hints, list body) | — | Two roles, not one size: **body copy is `14px`**, **dense/list/control copy is `13px`**. R3's “13–14px” names the range; this names which is which. |

  ## Referred to the owner

  Not chosen here, because neither semantics nor dominance settles them.

  1. **The reader's three H1 sizes.** R3 records `26px` on home, `30px` on the
     process list and `24px` on department info. The home screen's hero is
     therefore *smaller* than the screen titles beneath it, which inverts the
     panel's own relationship (`34px` hero over `22px` titles). Kept as written
     because R3 is an owner ruling, but it reads as a defect.
  2. **The Users screen has no subtitle.** Every one of the thirteen panel
     screens carries a one-sentence subtitle saying what the screen is for;
     Users has the slot and it ships empty. The copy does not exist in the
     design and cannot be inferred.
  3. **L-12** — whether a plain process shows no tag at all, or a muted one.
  4. **L-05** — whether the “awaiting” amber is `#B4690E` or `#8A5A00`. The
     semantic argument is given above; the deliverable paints `#8A5A00` for the
     two status maps, so a veto here is reasonable.
  ````

- [ ] **Step 10: Run it and see it pass, then commit.**
  `cd ui && npx vitest run src/test/roles.test.ts`
  Expected: `Test Files 1 passed`, `Tests 8 passed`.
  ```
  git add docs/superpowers/ui-normalisation-ledger.md ui/src/test/roles.test.ts
  git commit -m "docs(ui): every place the design contradicts itself, and which half won"
  ```

---

### Task 2: Tailwind config — the 106 tokens and the two breakpoints

The audit's root cause: `ui/tailwind.config.js` names 72 of the design system's
178 tokens, so `--hover-lift`, `--duration`, `--pad-screen-x/y`, the checkbox
size, eight of the thirteen type steps and seven of the fourteen radii cannot be
written as a class. That is why the older screens hold 33× `text-[13px]`, 23×
`[11px]`, 22× `[12.5px]`, 33× `rounded-[13px]`, 21× `[10px]`, 19× `[9px]` —
**every one of them an exact token value written the only way the build allowed.**
This task gives all of them a name, and adds the design's only two breakpoints.

**Files**
- Modify: `ui/tailwind.config.js`
- Create: `ui/tailwind-probe.txt`
- Create: `ui/src/test/theme.test.ts`

**Interfaces**

*Consumes* — the tokens listed in Task 1's *Consumes*, plus every remaining token
in `ui/design/_ds/.../tokens/{colors,spacing,typography,effects}.css`.

*Produces* — utility names. Every one is listed here because a later task may not
invent one:

| Group | Utilities added |
|---|---|
| colour (44) | `violet-mid` `violet-edge` `violet-on-dark` `violet-on-dark-body` `violet-on-violet` `desk` `tile-v3` `tile-v4` `tile-c2` `tile-ctl` `value-current` `hair` `line-soft` `line-dashed` `border-danger` `border-dead` `border-current` `border-ok` `strong` `body-ink` `ghost` `dialog-ghost` `ink-current` `ink-proposed` `on-dark` `disabled` `ok` `danger` `warn-soft` `info-soft` `ok-soft` `danger-soft` `toast-check` `junction-xor` `junction-and` `junction-or` `dept-numeral-violet` `dept-numeral-coral` `steps-sub` `steps-sub-border` `steps-sub-hover` `steps-group` `steps-group-border` `link` `border-card` — each usable as `bg-`, `text-`, `border-`, so the five whose own name starts with `border-` are written `border-border-danger`, `border-border-dead`, `border-border-current`, `border-border-ok`, `border-border-card`. The short `border-card` stays the white `--card`, drawn as a cut-out ring. |
| font size (18) | `text-fs-display` `text-fs-h1` `text-fs-h2` `text-fs-h3` `text-fs-h4` `text-fs-h5` `text-fs-lg` `text-fs-body` `text-fs-sm` `text-fs-sm2` `text-fs-xs` `text-fs-xxs` `text-fs-micro` `text-fs-doc-base` `text-fs-doc-h1` `text-fs-doc-title` `text-fs-doc-step` `text-fs-doc-body` |
| font weight (4) | `font-regular` `font-semibold` `font-bold` `font-extrabold` |
| line height (6) | `leading-tight` `leading-snug` `leading-normal` `leading-relaxed` `leading-loose` `leading-looser` |
| tracking (1) | `tracking-display` |
| radius (7) | `rounded-tool` `rounded-input` `rounded-search` `rounded-tile` `rounded-feature` `rounded-pill` `rounded-round` |
| shadow (6) | `shadow-drawer` `shadow-card-dark` `shadow-stat-dark` `shadow-guide-hover` `shadow-ring-flash` `shadow-conflict-dot` |
| spacing (4) | `screen-x` `screen-y` `topbar` `half` — as `p-`, `px-`, `py-`, `m-`, `gap-` |
| size (3) | `w-logo-bar`/`h-logo-bar` `w-logo-login`/`h-logo-login` `w-touch`/`h-touch` |
| motion (4) | `duration-fast` `duration-chev`, bare `transition` now `.16s`, `-translate-y-lift` |
| effect (1) | `backdrop-blur-scrim` |
| breakpoint (2) | `max1080:` `max760:` |

**Steps**

- [ ] **Step 1: Write the failing test.**
  Create `ui/src/test/theme.test.ts`:

  ```ts
  import { describe, it, expect } from 'vitest'
  import config from '../../tailwind.config.js'

  const theme = config.theme?.extend ?? {}
  const flat = (o: unknown): string[] =>
    typeof o === 'string' ? [o]
      : Array.isArray(o) ? o.flatMap(flat)
      : o && typeof o === 'object' ? Object.values(o).flatMap(flat)
      : []

  describe('R1 (structural) — every design token has a utility name', () => {
    it('names the tokens the older screens had to write as literals', () => {
      const referenced = new Set(
        flat(theme).flatMap((v) => [...v.matchAll(/var\((--[a-z0-9-]+)\)/g)].map((m) => m[1])),
      )
      const mustReach = [
        '--fs-display', '--fs-h1', '--fs-h2', '--fs-h3', '--fs-h4', '--fs-h5',
        '--fs-lg', '--fs-body', '--fs-sm', '--fs-sm2', '--fs-xs', '--fs-xxs',
        '--fs-micro', '--fs-doc-base', '--fs-doc-h1', '--fs-doc-title',
        '--fs-doc-step', '--fs-doc-body',
        '--radius-sm', '--radius-input', '--radius-lg', '--radius-tile',
        '--radius-card-lg', '--radius-pill', '--radius-round',
        '--shadow-drawer', '--shadow-card-dark', '--shadow-stat-dark',
        '--shadow-guide-hover', '--ring-flash', '--ring-conflict-dot',
        '--pad-screen-x', '--pad-screen-y', '--pad-topbar', '--space-half',
        '--hover-lift', '--duration', '--duration-fast', '--duration-chev',
        '--text-disabled', '--text-current', '--text-proposed', '--text-ghost',
        '--text-dialog-ghost', '--text-body', '--text-strong', '--text-on-dark',
        '--border-danger', '--border-current', '--border-dead', '--border-ok',
        '--line-dashed', '--line-soft', '--hair', '--tile-v3', '--tile-v4',
        '--tile-c2', '--tile-ctl', '--value-current', '--desk',
        '--violet-mid', '--violet-edge', '--violet-on-dark',
        '--violet-on-dark-body', '--violet-on-violet',
        '--dept-numeral-violet', '--dept-numeral-coral',
        '--junction-xor', '--junction-and', '--junction-or',
        '--steps-sub-bg', '--steps-sub-border', '--steps-sub-hover',
        '--steps-group-bg', '--steps-group-border',
        '--toast-check', '--ok', '--danger', '--warn-soft', '--info-soft',
        '--ok-soft', '--danger-soft', '--link', '--link-hover',
        '--fw-regular', '--fw-semibold', '--fw-bold', '--fw-extrabold',
        '--lh-tight', '--lh-snug', '--lh-normal', '--lh-relaxed',
        '--lh-loose', '--lh-looser', '--tracking-display',
        '--size-logo-bar', '--size-logo-login',
      ]
      expect(mustReach.filter((t) => !referenced.has(t))).toEqual([])
    })

    it('registers the design’s two breakpoints and no others', () => {
      // Asked of the plugin rather than of `theme.screens` — see Step 8, which
      // may not use `screens` at all. A breakpoint nothing references emits
      // nothing, so a third addVariant is invisible to any assertion made
      // against compiled CSS; this is the only place it can be seen.
      const got = []
      for (const plugin of config.plugins ?? []) plugin({ addVariant: (n, d) => got.push([n, d]) })
      expect(got).toEqual([
        ['max1080', '@media (max-width: 1080px)'],
        ['max760', '@media (max-width: 760px)'],
      ])
    })

    it('makes a bare `transition` last .16s, not Tailwind’s 150ms', () => {
      expect(theme.transitionDuration?.DEFAULT).toBe('var(--duration)')
    })

    it('keeps the probe in the content set, so every named utility is built', () => {
      expect(config.content).toContain('./tailwind-probe.txt')
    })
  })
  ```

- [ ] **Step 2: Run it and see it fail.**
  `cd ui && npx vitest run src/test/theme.test.ts`
  Expected: four failing tests; the first prints a list of ~100 unreachable token
  names beginning `[ '--fs-display', '--fs-h1', … ]`.

- [ ] **Step 3: Add the colour names.**
  In `ui/tailwind.config.js`, inside `theme.extend.colors`, after the
  `'icom-output'`/`'icom-mech'` line and before the closing `}`, add:

  ```js
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
        'border-danger': 'var(--border-danger)', 'border-dead': 'var(--border-dead)',
        'border-current': 'var(--border-current)', 'border-ok': 'var(--border-ok)',
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
  ```

- [ ] **Step 4: Add the type scale, weights, leading and tracking.**
  In `ui/tailwind.config.js`, inside `theme.extend.fontSize`, after the
  `prose: […]` line, add:

  ```js
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
  ```

  and, as new keys of `theme.extend` beside `fontSize`:

  ```js
      fontWeight: {
        regular: 'var(--fw-regular)', semibold: 'var(--fw-semibold)',
        bold: 'var(--fw-bold)', extrabold: 'var(--fw-extrabold)',
      },
      lineHeight: {
        tight: 'var(--lh-tight)', snug: 'var(--lh-snug)',
        normal: 'var(--lh-normal)', relaxed: 'var(--lh-relaxed)',
        loose: 'var(--lh-loose)', looser: 'var(--lh-looser)',
      },
  ```

  and add `display: 'var(--tracking-display)'` to the existing `letterSpacing`
  so the line reads:

  ```js
      letterSpacing: { eyebrow: 'var(--tracking-eyebrow)', display: 'var(--tracking-display)' },
  ```

- [ ] **Step 5: Add the seven missing radii.**
  In `ui/tailwind.config.js`, inside `theme.extend.borderRadius`, after
  `button: 'var(--radius-md)',` add:

  ```js
        // Named by role, never by t-shirt size: guards.test.ts bans
        // `rounded-sm|md|lg|xl|full`, and the design's ladder is roles anyway.
        tool: 'var(--radius-sm)',          // 9px  — flow tool button, dialog close
        input: 'var(--radius-input)',      // 11px — ghost button, menu row, tile
        search: 'var(--radius-lg)',        // 13px — the search field
        tile: 'var(--radius-tile)',        // 14px — department tile, KPI card
        feature: 'var(--radius-card-lg)',  // 20px — department card, wide modal
        pill: 'var(--radius-pill)',
        round: 'var(--radius-round)',
  ```

- [ ] **Step 6: Add the six missing shadows.**
  In `ui/tailwind.config.js`, inside `theme.extend.boxShadow`, after
  `modal: …, pop: …, sheet: …` add:

  ```js
        drawer: 'var(--shadow-drawer)',
        'card-dark': 'var(--shadow-card-dark)',
        'stat-dark': 'var(--shadow-stat-dark)',
        'guide-hover': 'var(--shadow-guide-hover)',
        'ring-flash': 'var(--ring-flash)',
        'conflict-dot': 'var(--ring-conflict-dot)',
  ```

- [ ] **Step 7: Add the gutters, the sizes and the motion.**
  In `ui/tailwind.config.js`, inside `theme.extend.spacing`, after the `s16` line
  add:

  ```js
        'screen-x': 'var(--pad-screen-x)',  // 40px
        'screen-y': 'var(--pad-screen-y)',  // 30px
        topbar: 'var(--pad-topbar)',        // 22px
        half: 'var(--space-half)',          // 2px
  ```

  and extend the existing `width`/`height` keys and add four new `theme.extend`
  keys:

  ```js
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
      // A bare `transition` is .16s from here on — the design's one duration.
      transitionDuration: {
        DEFAULT: 'var(--duration)', fast: 'var(--duration-fast)',
        chev: 'var(--duration-chev)',
      },
      // `--hover-lift` is the whole `translateY(-2px)` function, which Tailwind's
      // translate scale cannot take; the distance is named here and the token
      // stays the record of it. Written `-translate-y-lift`.
      translate: { lift: '2px' },
      // Likewise `--blur-scrim` is `blur(3px)`, a filter function, not a radius.
      backdropBlur: { scrim: '3px' },
  ```

- [ ] **Step 8: Add the two breakpoints — as variants, never as `theme.screens`.**
  Corrected after Task 2 built it both ways and diffed the CSS: a max-width
  screen can only be written as an object, and one object anywhere in `screens`
  makes Tailwind return `[]` for its whole `min-*`/`max-*` variant family, which
  deletes `@media (max-width: 560px)` and the 30 shipped `max-[560px]:`
  utilities carrying the phone layout of `src/flow/DetailDrawer.tsx` and
  `export/flowchart/FlowViewer.tsx` — with the build still exiting 0.

  Nothing changes at the call site: write `max1080:` and `max760:` as planned.
  Emitted order is still widest-first (1080 → 760 → 560), so the narrower
  breakpoint wins where both fire.

  In `ui/tailwind.config.js`, as a top-level key beside `theme` — a bare
  function is a valid Tailwind plugin, and `tailwindcss/plugin` has no ESM entry
  in 3.4:

  ```js
    plugins: [
      ({ addVariant }) => {
        addVariant('max1080', '@media (max-width: 1080px)')
        addVariant('max760', '@media (max-width: 760px)')
      },
    ],
  ```

- [ ] **Step 9: Create the probe and put it in the content set.**
  A theme key that nothing uses compiles to nothing, so the built CSS cannot be
  grepped for it. The probe is the inventory of every utility the theme names;
  keeping it in `content` guarantees each one is emitted, which is what makes the
  grep in Step 12 — and in every later task — mean something.

  Create `ui/tailwind-probe.txt`:

  ```
  # Every utility this theme names. Listed here so Tailwind emits all of them and
  # the built CSS can be grepped for any class before a component uses it.
  # Add a line when you add a theme key; never delete one to "clean up".
  bg-bg bg-card bg-ink bg-violet bg-coral bg-green bg-conflict bg-muted bg-faint
  bg-warm bg-line bg-tile-v bg-tile-v2 bg-tile-c bg-tile-ok bg-tile-warn
  bg-tile-dead bg-login-bg bg-login-orb bg-scrim bg-warn bg-info bg-tile-info
  bg-icom-input bg-icom-control bg-icom-output bg-icom-mech
  bg-violet-mid bg-violet-edge bg-violet-on-dark bg-violet-on-dark-body
  bg-violet-on-violet bg-desk bg-tile-v3 bg-tile-v4 bg-tile-c2 bg-tile-ctl
  bg-value-current bg-hair bg-line-soft bg-line-dashed bg-border-danger
  bg-border-dead bg-border-current bg-border-ok bg-strong bg-body-ink bg-ghost
  bg-dialog-ghost bg-ink-current bg-ink-proposed bg-on-dark bg-disabled bg-ok
  bg-danger bg-warn-soft bg-info-soft bg-ok-soft bg-danger-soft bg-toast-check
  bg-junction-xor bg-junction-and bg-junction-or bg-dept-numeral-violet
  bg-dept-numeral-coral bg-steps-sub bg-steps-sub-border bg-steps-sub-hover
  bg-steps-group bg-steps-group-border bg-link bg-link-hover
  text-violet-on-dark text-violet-on-dark-body text-violet-on-violet text-strong
  text-body-ink text-ghost text-dialog-ghost text-ink-current text-ink-proposed
  text-on-dark text-disabled text-ok text-danger text-toast-check text-link
  text-link-hover text-icom-input text-icom-control text-icom-output text-icom-mech
  border-warm border-line border-line-soft border-line-dashed border-border-danger
  border-border-dead border-border-current border-border-ok border-hair
  border-steps-sub-border border-steps-group-border border-coral border-violet
  text-fs-display text-fs-h1 text-fs-h2 text-fs-h3 text-fs-h4 text-fs-h5
  text-fs-lg text-fs-body text-fs-sm text-fs-sm2 text-fs-xs text-fs-xxs
  text-fs-micro text-fs-doc-base text-fs-doc-h1 text-fs-doc-title
  text-fs-doc-step text-fs-doc-body
  text-body text-caption text-subtitle text-title text-prose
  font-regular font-semibold font-bold font-extrabold
  leading-tight leading-snug leading-normal leading-relaxed leading-loose
  leading-looser
  tracking-eyebrow tracking-display
  rounded-badge rounded-chip rounded-control rounded-card rounded-doc
  rounded-panel rounded-button rounded-tool rounded-input rounded-search
  rounded-tile rounded-feature rounded-pill rounded-round
  shadow-card shadow-card-hover shadow-coral shadow-violet shadow-green
  shadow-modal shadow-pop shadow-sheet shadow-drawer shadow-card-dark
  shadow-stat-dark shadow-guide-hover shadow-ring-flash shadow-conflict-dot
  p-screen-x p-screen-y p-topbar p-half px-screen-x py-screen-y gap-topbar
  p-s1 p-s2 p-s3 p-s4 p-s5 p-s6 p-s7 p-s8 p-s9 p-s10 p-s11 p-s12 p-s14 p-s16
  w-tile h-tile w-tool h-tool w-avatar h-avatar w-logo-bar h-logo-bar
  w-logo-login h-logo-login w-touch h-touch min-h-touch min-w-touch min-w-menu
  max-w-departments max-w-list max-w-summary max-w-doc max-w-drawer
  border-hairline
  duration-fast duration-chev
  -translate-y-lift
  backdrop-blur-scrim
  max1080:hidden max760:hidden
  ```

  Then in `ui/tailwind.config.js` change the `content` line to:

  ```js
    content: [
      './index.html', './src/**/*.{ts,tsx}',
      './export/**/*.{ts,tsx}', './export/*.html',
      // The utility inventory — see the file's own header.
      './tailwind-probe.txt',
    ],
  ```

- [ ] **Step 10: Run the test and see it pass.**
  `cd ui && npx vitest run src/test/theme.test.ts`
  Expected: `Test Files 1 passed`, `Tests 4 passed`.

- [ ] **Step 11: Run the whole suite, the types and the linter.**
  `cd ui && npx vitest run && npx tsc -b && npx eslint .`
  Expected: every existing suite still green — in particular `guards.test.ts`,
  which must not have gained a hit from the new names — tsc silent, eslint silent.

- [ ] **Step 12: Build, then prove every name this task minted actually emits.**
  ```bash
  cd ui && npx vite build
  node scripts/harvest-classes.mjs tailwind-probe.txt
  ```
  Expected: the run ends `DEAD 0   EMPTY 0   NOVAR 0`, both controls hold
  (`control (negative): N/N invented names reported dead` and
  `control (escaping): … escaped variant classes unescaped`), and the last line
  is `PASS`. The script exits 1 on any failure, so it can be `&&`-chained.
  The class list is **harvested out of these files**, never hand-kept, so it
  cannot drift from what they write and `tailwind-probe.txt` cannot certify it
  on their behalf — see *The class-emission check* in Global Constraints for the
  measurement that retired the old grep.

  `tailwind-probe.txt` **is** this task's deliverable — the inventory that names
  every theme class — so scanning it is the strongest form of this check the plan
  has. It certifies the whole theme rather than a 34-name sample of it, and
  because the scanner parses the CSS instead of grepping it, a key that resolves
  to nothing and emits an empty body is reported `EMPTY` rather than scored as
  present. The only class this step cannot judge is one that is in the theme but
  not in the probe; that is what `theme.test.ts` is for.

  **A failure.** `DEAD` — the class compiled to no rule at all; that is a **typo
  in the component**, so fix the class string, rebuild, re-run. `EMPTY` — the
  selector emitted with an empty body, so the theme key resolves to nothing.
  `NOVAR` — the rule reads a `var(--…)` nothing declares. The last two are theme
  regressions: **stop and report them.** Do **not** add the name to
  `ui/tailwind.config.js`, `src/styles/tokens.css`, `src/styles/roles.css` or
  `tailwind-probe.txt`. All four are frozen for the duration of this plan and
  were unfrozen exactly once, by the single minting pass in
  `.superpowers/sdd/mint-spec.md`; minting one here to make a misspelling compile
  recreates the unreachable-token problem the whole rebuild exists to fix. A
  value that genuinely has no name goes into `mint-spec.md`, not into the config
  and not into this task's commit.

  **What this step cannot prove:** that these files write a class and that the
  class compiles to a rule with declarations, yes. That the class reaches the
  right element, that the element renders, that it is visible, or that its value
  is the one the design asks for — no. That stays with the Playwright checks.

  Then prove the two breakpoints compiled at the right widths:

  ```bash
  cd ui && node -e '
  const fs=require("node:fs");
  const css=fs.readdirSync("dist/assets").filter(f=>/\.css$/.test(f))
    .map(f=>fs.readFileSync("dist/assets/"+f,"utf8")).join("\n");
  const a=/@media\s*\(max-width:\s*1080px\)/.test(css)&&/max1080\\:hidden/.test(css);
  const b=/@media\s*\(max-width:\s*760px\)/.test(css)&&/max760\\:hidden/.test(css);
  console.log(a&&b?"OK both breakpoints compiled":`MISSING r1080=${a} r760=${b}`);
  process.exit(a&&b?0:1);'
  ```
  Expected: `OK both breakpoints compiled`. The regexes look for the **escaped**
  selector `max1080\:hidden`, which is what Tailwind writes.
  ```
  git add ui/tailwind.config.js ui/tailwind-probe.txt ui/src/test/theme.test.ts
  git commit -m "feat(ui): the other 106 tokens get a name, and the design's two breakpoints arrive"
  ```

---

### Task 3: Token corrections the deliverable requires

R1: where the extracted `_ds/` token set disagrees with the deliverables, **the
deliverable wins and the token is corrected, with the reason recorded.**
`ui/design/**` is read-only, so every correction is an override appended to
`ui/src/styles/tokens.css` — the one file in `src/` allowed to hold a literal —
each carrying the spec section that proves it. This task also adds the values the
deliverables paint that no token holds at all, and the reader scale R3 needs.

**Files**
- Modify: `ui/src/styles/tokens.css`
- Modify: `ui/src/styles/base.css` (scrollbar 12px → 10px, ledger L-08)
- Modify: `ui/tailwind.config.js` (name the tokens this task creates)
- Modify: `ui/tailwind-probe.txt`
- Modify: `ui/src/styles/roles.css` (the roles that were blocked on these tokens)
- Create: `ui/src/test/tokens.test.ts`

**Interfaces**

*Consumes* — `ui/src/styles/roles.css` from Task 1 (`--role-ink-body`,
`--role-subtitle-on-field`, `--role-confirmed-edge`, `--role-shadow-dialog`,
`--role-shadow-pop`, `--role-shadow-card-hover`, `--role-radius-pill` already
point at the tokens this task corrects, so each correction lands through the
role without roles.css changing); the Tailwind theme from Task 2.

*Produces* — corrected tokens `--border-ok #BFE5D0`, `--steps-group-bg #FDF1F0`,
`--steps-group-border #F8DDDA`, `--text-body #5a5175`,
`--violet-on-dark-body #C9BEEE`, `--radius-pill 999px`,
`--shadow-card-hover`, `--shadow-modal`, `--shadow-pop`; new tokens
`--tile-v5 #F3EEFC`, `--line-divider #D9CEF0`, `--surface-sub #FBF9FE`,
`--line-row #F4F0FA`, `--line-filter #E9E0F7`, `--border-card rgba(42,29,94,.07)`,
`--border-pick #C9B8EC`, `--disc-coral #FFF0EE`, `--disc-violet #F3EDFC`,
`--shadow-fab`; twelve type steps `--fs-numeral 46px`, `--fs-stat 27px`,
`--fs-steps-title 26px`, `--fs-display-hand 25px`, `--fs-stat-sm 21px`,
`--fs-dialog 18px`, `--fs-body-lead 14.5px`, `--fs-menu 13.5px`,
`--fs-caption 12px`, `--fs-nano 10px`, `--fs-badge-sm 9.5px`, `--fs-tag 9px`;
`--lh-sub 1.8`; the reader/geometry scale `--width-reader 720px`,
`--width-profile 700px`, `--width-steps 760px`, `--width-access 820px`,
`--width-audit 980px`, `--width-dialog-wide 640px`, `--width-dialog-lg 540px`,
`--width-dialog 520px`, `--width-dialog-sm 460px`, `--width-dialog-xs 440px`,
`--pad-reader-x 24px`, `--pad-reader-bottom 60px`, `--pad-departments-top 38px`,
`--pad-departments-bottom 48px`, `--size-tile-reader 54px`, `--size-glyph 24px`,
`--size-glyph-reader 26px`, `--size-iconbtn 40px`, `--size-iconbtn-reader 42px`,
`--size-fab 52px`, `--size-fab-reader 56px`, `--size-tick 19px`,
`--size-tick-nested 16px`, `--size-close 32px`, `--fs-h1-reader-home 26px`,
`--fs-h1-reader-list 30px`, `--fs-h1-reader-dept 24px`, `--fs-body-reader 15px`,
`--inset-search-icon 15px`; and the roles
`--role-surface-sub`, `--role-border-card`, `--role-border-row`,
`--role-fs-dialog`, `--role-fs-menu`, `--role-fs-caption`, `--role-lh-sub`.

Utilities added in the same task: `bg-tile-v5` `bg-line-divider`
`bg-surface-sub` `border-border-card` `border-line-row` `border-line-filter`
`border-border-pick` `bg-disc-coral` `bg-disc-violet` `shadow-fab`
`text-fs-numeral` `text-fs-stat` `text-fs-steps-title` `text-fs-display-hand`
`text-fs-stat-sm` `text-fs-dialog` `text-fs-body-lead` `text-fs-menu`
`text-fs-caption` `text-fs-nano` `text-fs-badge-sm` `text-fs-tag` `leading-sub`
`max-w-reader` `max-w-profile` `max-w-steps` `max-w-access` `max-w-audit`
`max-w-dialog-wide` `max-w-dialog-lg` `max-w-dialog` `max-w-dialog-sm`
`max-w-dialog-xs` `p-reader-x` `p-reader-bottom` `p-departments-top`
`p-departments-bottom` `w-tile-reader` `h-tile-reader` `w-iconbtn` `h-iconbtn`
`w-iconbtn-reader` `h-iconbtn-reader` `w-fab` `h-fab` `w-fab-reader`
`h-fab-reader` `w-tick` `h-tick` `w-tick-nested` `h-tick-nested` `w-close`
`h-close`.

**Steps**

- [ ] **Step 1: Write the failing test for the four colours both deliverables agree on.**
  Create `ui/src/test/tokens.test.ts`:

  ```ts
  import { describe, it, expect } from 'vitest'
  import { readFileSync } from 'node:fs'
  import { join } from 'node:path'

  const css = readFileSync(join(process.cwd(), 'src/styles/tokens.css'), 'utf8')

  /** The last declaration of a token wins, exactly as the cascade resolves it. */
  function token(name: string): string {
    const all = [...css.matchAll(new RegExp(`^\\s*${name}\\s*:\\s*([^;]+);`, 'gm'))]
    return all.length ? all[all.length - 1][1].trim() : ''
  }

  describe('R1 — the deliverable wins over the extracted token', () => {
    it('§9.8 — corrects the four values both deliverables paint', () => {
      expect(token('--border-ok')).toBe('#BFE5D0')
      expect(token('--steps-group-bg')).toBe('#FDF1F0')
      expect(token('--steps-group-border')).toBe('#F8DDDA')
      expect(token('--tile-v5')).toBe('#F3EEFC')
      expect(token('--line-divider')).toBe('#D9CEF0')
    })

    it('§9.9 — re-points the three tokens named for a role they do not serve', () => {
      expect(token('--text-body')).toBe('#5a5175')
      expect(token('--violet-on-dark-body')).toBe('#C9BEEE')
      expect(token('--border-pick')).toBe('#C9B8EC')
    })

    it('§9.2 — carries the shadows S1 actually paints', () => {
      expect(token('--shadow-card-hover'))
        .toBe('0 3px 6px rgba(16, 10, 40, .2), 0 26px 52px -22px rgba(16, 10, 40, .7)')
      expect(token('--shadow-modal'))
        .toBe('0 4px 10px rgba(16, 10, 40, .28), 0 44px 90px -30px rgba(16, 10, 40, .8)')
      expect(token('--shadow-pop')).toBe('0 20px 45px -20px rgba(74, 37, 169, .45)')
    })

    it('§4.3 / §1.2 — names the values S1 introduces and no token holds', () => {
      expect(token('--border-card')).toBe('rgba(42, 29, 94, .07)')
      expect(token('--surface-sub')).toBe('#FBF9FE')
      expect(token('--line-row')).toBe('#F4F0FA')
      expect(token('--line-filter')).toBe('#E9E0F7')
    })

    it('§9.4 — closes the panel type scale; twelve steps, not ten', () => {
      const added = {
        '--fs-numeral': '46px', '--fs-stat': '27px', '--fs-steps-title': '26px',
        '--fs-display-hand': '25px', '--fs-stat-sm': '21px', '--fs-dialog': '18px',
        '--fs-body-lead': '14.5px', '--fs-menu': '13.5px', '--fs-caption': '12px',
        '--fs-nano': '10px', '--fs-badge-sm': '9.5px', '--fs-tag': '9px',
      }
      for (const [name, value] of Object.entries(added)) expect(token(name)).toBe(value)
    })

    it('ledger L-20 — a pill is 999px, the radius both deliverables write', () => {
      expect(token('--radius-pill')).toBe('999px')
    })

    it('R3 — carries the reader scale, so a component can be surface-aware', () => {
      expect(token('--width-reader')).toBe('720px')
      expect(token('--pad-reader-x')).toBe('24px')
      expect(token('--pad-reader-bottom')).toBe('60px')
      expect(token('--size-tile-reader')).toBe('54px')
      expect(token('--size-iconbtn')).toBe('40px')
      expect(token('--size-iconbtn-reader')).toBe('42px')
      expect(token('--size-fab')).toBe('52px')
      expect(token('--size-fab-reader')).toBe('56px')
      expect(token('--fs-h1-reader-list')).toBe('30px')
      expect(token('--fs-body-reader')).toBe('15px')
    })

    it('ledger L-10 — two tick sizes by role, not four by screen', () => {
      expect(token('--size-tick')).toBe('19px')
      expect(token('--size-tick-nested')).toBe('16px')
    })
  })

  describe('ledger L-08 — the scrollbar is 10px', () => {
    it('base.css uses the width both deliverables set, not the token file’s 12px', () => {
      const base = readFileSync(join(process.cwd(), 'src/styles/base.css'), 'utf8')
      expect(base).toContain('::-webkit-scrollbar { width: 10px; height: 10px; }')
      expect(base).not.toContain('12px')
    })
  })
  ```

- [ ] **Step 2: Run it and see it fail.**
  `cd ui && npx vitest run src/test/tokens.test.ts`
  Expected: nine failing tests; the first prints
  `expected '' to be '#BFE5D0'` because `--border-ok` is only declared in the
  read-only `_ds` file and never overridden here.

- [ ] **Step 3: Append the R1 colour and shadow corrections.**
  At the end of `ui/src/styles/tokens.css`, append:

  ```css
  /* ─────────────────────────────────────────────────────────────────────────
     R1 — where a deliverable contradicts `_ds/tokens/`, the deliverable wins.
     `ui/design/**` is read-only, so every correction is an override here, with
     the section of `.superpowers/sdd/ui-design-spec.md` that proves it.
     ───────────────────────────────────────────────────────────────────────── */
  :root {
    /* §9.8 — four values BOTH deliverables paint and the token file contradicts.
       Two independent files drifting the same way is a moved design, not a typo. */
    --border-ok: #BFE5D0;           /* was #C4E7D3 — green ghost-button border */
    --steps-group-bg: #FDF1F0;      /* was #FFF4F3 — junction-group card fill */
    --steps-group-border: #F8DDDA;  /* was #F5CFCB — junction-group card border */
    --tile-v5: #F3EEFC;             /* sub-process node fill, steps hint strip;
                                       hard-coded identically in S1, S2 and the
                                       design system's own ActivityNode */
    --line-divider: #D9CEF0;        /* tool-group divider; same three sources */

    /* §1.2 / §4.3 — four more S1 introduces that no token holds (24/4/1/46 uses). */
    --surface-sub: #FBF9FE;         /* THE sub-panel surface */
    --line-row: #F4F0FA;            /* table row separator */
    --line-filter: #E9E0F7;         /* users filter bar */
    --border-card: rgba(42, 29, 94, .07); /* THE card border, 46 uses */

    /* §5.1.9 — the department card's two raw chevron discs. */
    --disc-coral: #FFF0EE;
    --disc-violet: #F3EDFC;

    /* §9.9 — three tokens named for a role they do not serve. The value the
       product paints wins; the name keeps the role it actually has.
       --text-body was #4A3F6B, which nothing in either deliverable paints.
       --violet-on-dark-body was #B7A6E0, used once in the whole product; the
       other thirteen dark-field subtitles are #C9BEEE (ledger, §9.7k).
       --border-pick is new: #C9B8EC has no token for the role it serves, and
       --line-dashed keeps its own (dashed "add" affordances). */
    --text-body: #5a5175;
    --violet-on-dark-body: #C9BEEE;
    --border-pick: #C9B8EC;

    /* §9.2 / §4.2 — the shadows S1 actually paints. --shadow-card is already
       corrected above (F7); these three were not. The card-hover value in this
       file ended .6 where both deliverables end .7. */
    --shadow-card-hover: 0 3px 6px rgba(16, 10, 40, .2), 0 26px 52px -22px rgba(16, 10, 40, .7);
    --shadow-modal: 0 4px 10px rgba(16, 10, 40, .28), 0 44px 90px -30px rgba(16, 10, 40, .8);
    --shadow-pop: 0 20px 45px -20px rgba(74, 37, 169, .45);
    --shadow-fab: 0 6px 14px rgba(16, 10, 40, .22), 0 18px 40px -14px rgba(250, 90, 82, .9);

    /* Ledger L-20 — neither deliverable ever writes 20px for a pill. */
    --radius-pill: 999px;
  }
  ```

- [ ] **Step 4: Append the twelve missing type steps and the one missing leading.**
  At the end of `ui/src/styles/tokens.css`, append:

  ```css
  /* §2.4 / §9.4 — the panel scale is not closed. Twelve of the twenty-five sizes
     S1 sets have no token in the panel scale: the spec's §9.4 lists ten and omits
     27px (three uses, the departments stat numerals — it exists only as the
     staff-guide's --fs-doc-title) and 13.5px (forty-eight uses, the second
     densest size in the file, and named in typography.css's own header comment
     as one of the half-pixel sizes that must not be snapped).
     Two are structural, not outliers: 18px is the standard dialog title
     (eleven uses, ledger L-16) and 12px is a common caption (thirty-eight). */
  :root {
    --fs-numeral: 46px;       /* ghosted two-digit index on a department card */
    --fs-stat: 27px;          /* departments-header stat numeral */
    --fs-steps-title: 26px;   /* step-view process title */
    --fs-display-hand: 25px;  /* [data-r-title] at <=760px */
    --fs-stat-sm: 21px;       /* profile H1, activity stat numeral */
    --fs-dialog: 18px;        /* THE dialog title */
    --fs-body-lead: 14.5px;   /* comment body, branch step label */
    --fs-menu: 13.5px;        /* menu item, dropdown value, dialog button */
    --fs-caption: 12px;       /* small caption, table meta, calendar day */
    --fs-nano: 10px;          /* calendar weekday, comment-card id */
    --fs-badge-sm: 9.5px;     /* conflict badge on a flow node */
    --fs-tag: 9px;            /* process-row id badge, tag chip */

    /* §2.5, ledger L-17 — sub-copy under a control. 1.85/1.95/2.05 normalise:
       1.85 -> 1.8, and 1.95/2.05 -> --lh-loose 1.9 for long-form prose. */
    --lh-sub: 1.8;
  }
  ```

- [ ] **Step 5: Append the reader and geometry scale R3 needs.**
  At the end of `ui/src/styles/tokens.css`, append:

  ```css
  /* R3 — panel and reader are two surfaces at two scales. These are the values
     the ruling's table gives, plus the recurring geometry §3.4 and §5.2 name and
     the token file does not. Task 5 binds them to [data-surface]; nothing else
     may hard-code them. */
  :root {
    /* content columns (§3.3), with department info normalised to 920 (L-07) */
    --width-reader: 720px;
    --width-profile: 700px;
    --width-steps: 760px;
    --width-access: 820px;
    --width-audit: 980px;

    /* overlay widths (§3.3) */
    --width-dialog-wide: 640px;   /* conflict inbox */
    --width-dialog-lg: 540px;     /* change supervisor */
    --width-dialog: 520px;        /* new user, views */
    --width-dialog-sm: 460px;     /* confirm content */
    --width-dialog-xs: 440px;     /* confirm comment */

    /* screen padding (§3.3, R3) */
    --pad-reader-x: 24px;
    --pad-reader-bottom: 60px;
    --pad-departments-top: 38px;
    --pad-departments-bottom: 48px;

    /* recurring control geometry (§3.4, §5.2, R3) */
    --size-tile-reader: 54px;
    --size-glyph: 24px;           /* half the 48px tile, rounded */
    --size-glyph-reader: 26px;
    --size-iconbtn: 40px;
    --size-iconbtn-reader: 42px;
    --size-fab: 52px;
    --size-fab-reader: 56px;
    --size-tick: 19px;            /* ledger L-10 */
    --size-tick-nested: 16px;
    --size-close: 32px;           /* ledger L-23 */
    --inset-search-icon: 15px;    /* §5.2 SearchField, the large field */

    /* reader type (R3) — recorded as the ruling states it. The reader's home
       hero (26px) is smaller than its own screen titles (30px), which inverts
       the panel's relationship; that is referred to the owner in the ledger
       rather than silently "fixed" here. */
    --fs-h1-reader-home: 26px;
    --fs-h1-reader-list: 30px;
    --fs-h1-reader-dept: 24px;
    --fs-body-reader: 15px;
  }
  ```

- [ ] **Step 6: Correct the scrollbar in `base.css`.**
  In `ui/src/styles/base.css`, replace:

  ```css
    ::-webkit-scrollbar { width: 12px; height: 12px; }
  ```

  with:

  ```css
    /* Ledger L-08 — 10px. tokens/base.css says 12px and both deliverables say
       10px in their own <style> block; two deliverables beat one token file. */
    ::-webkit-scrollbar { width: 10px; height: 10px; }
  ```

  and replace:

  ```css
      border: 2px solid transparent;
  ```

  with:

  ```css
      border: var(--space-half) solid transparent;
  ```

- [ ] **Step 7: Run the token test and see it pass.**
  `cd ui && npx vitest run src/test/tokens.test.ts`
  Expected: `Test Files 1 passed`, `Tests 9 passed`.

- [ ] **Step 8: Add the roles these tokens unlock.**
  In `ui/src/styles/roles.css`, inside `:root`, after the
  `--role-surface-tint: var(--tile-v4);` line add:

  ```css
    --role-surface-sub: var(--surface-sub);      /* the sub-panel, 24 uses */
  ```

  after `--role-border-warm: var(--warm);` add:

  ```css
    --role-border-card: var(--border-card);      /* 1px, 46 uses — the default */
    --role-border-row: var(--line-row);          /* table row separator */
    --role-border-filter: var(--line-filter);    /* filter bar */
  ```

  replace `--role-border-pick: var(--line-dashed);` with:

  ```css
    --role-border-pick: var(--border-pick);      /* §9.9 — its own token now */
  ```

  and after `--role-fs-micro: var(--fs-micro);` add:

  ```css
    --role-fs-dialog: var(--fs-dialog);          /* ledger L-16 — 18px, always */
    --role-fs-menu: var(--fs-menu);
    --role-fs-caption: var(--fs-caption);
  ```

  and after `--role-lh-prose: var(--lh-loose);` add:

  ```css
    --role-lh-sub: var(--lh-sub);                /* ledger L-17 */
  ```

- [ ] **Step 9: Run the role test and see it still pass.**
  `cd ui && npx vitest run src/test/roles.test.ts`
  Expected: `Tests 8 passed` — the new roles resolve, because Step 3–5 declared
  every token they name. Raise the `toBeGreaterThanOrEqual(62)` floor to `70` in
  `src/test/roles.test.ts` and re-run; expected `Tests 8 passed` again.

- [ ] **Step 10: Name the new tokens in the theme.**
  `--border-card` is **not** in the list below: Task 2 already names it, on
  `colors`, beside its four `--border-*` siblings. Every token whose own name
  starts with `border-` lives on that one scale, so its class is
  `border-border-<x>` — `border-border-card`, `border-border-pick`,
  `border-border-danger`, `border-border-dead`, `border-border-current`,
  `border-border-ok`. Long, but one rule with no exception, and it leaves the
  short `border-card` free for the white `--card`, which §8's coral count badge
  needs as a cut-out ring. Do not add a second, shorter name for any of them.

  In `ui/tailwind.config.js`, add to `theme.extend.colors`:

  ```js
        'tile-v5': 'var(--tile-v5)', 'line-divider': 'var(--line-divider)',
        'surface-sub': 'var(--surface-sub)', 'line-row': 'var(--line-row)',
        'line-filter': 'var(--line-filter)',
        'border-pick': 'var(--border-pick)',
        'disc-coral': 'var(--disc-coral)', 'disc-violet': 'var(--disc-violet)',
  ```

  to `theme.extend.fontSize`:

  ```js
        'fs-numeral': 'var(--fs-numeral)', 'fs-stat': 'var(--fs-stat)',
        'fs-steps-title': 'var(--fs-steps-title)',
        'fs-display-hand': 'var(--fs-display-hand)',
        'fs-stat-sm': 'var(--fs-stat-sm)', 'fs-dialog': 'var(--fs-dialog)',
        'fs-body-lead': 'var(--fs-body-lead)', 'fs-menu': 'var(--fs-menu)',
        'fs-caption': 'var(--fs-caption)', 'fs-nano': 'var(--fs-nano)',
        'fs-badge-sm': 'var(--fs-badge-sm)', 'fs-tag': 'var(--fs-tag)',
  ```

  to `theme.extend.lineHeight`: `sub: 'var(--lh-sub)',`

  to `theme.extend.boxShadow`: `fab: 'var(--shadow-fab)',`

  to `theme.extend.maxWidth`:

  ```js
        reader: 'var(--width-reader)', profile: 'var(--width-profile)',
        steps: 'var(--width-steps)', access: 'var(--width-access)',
        audit: 'var(--width-audit)',
        'dialog-wide': 'var(--width-dialog-wide)',
        'dialog-lg': 'var(--width-dialog-lg)', dialog: 'var(--width-dialog)',
        'dialog-sm': 'var(--width-dialog-sm)', 'dialog-xs': 'var(--width-dialog-xs)',
  ```

  to `theme.extend.spacing`:

  ```js
        'reader-x': 'var(--pad-reader-x)',
        'reader-bottom': 'var(--pad-reader-bottom)',
        'departments-top': 'var(--pad-departments-top)',
        'departments-bottom': 'var(--pad-departments-bottom)',
        'search-icon': 'var(--inset-search-icon)',
  ```

  and to **both** `theme.extend.width` and `theme.extend.height`:

  ```js
        'tile-reader': 'var(--size-tile-reader)',
        glyph: 'var(--size-glyph)', 'glyph-reader': 'var(--size-glyph-reader)',
        iconbtn: 'var(--size-iconbtn)', 'iconbtn-reader': 'var(--size-iconbtn-reader)',
        fab: 'var(--size-fab)', 'fab-reader': 'var(--size-fab-reader)',
        tick: 'var(--size-tick)', 'tick-nested': 'var(--size-tick-nested)',
        close: 'var(--size-close)',
  ```

- [ ] **Step 11: Add the new utilities to the probe.**
  Append to `ui/tailwind-probe.txt`:

  ```
  bg-tile-v5 bg-line-divider bg-surface-sub bg-disc-coral bg-disc-violet
  border-border-card border-line-row border-line-filter border-border-pick
  shadow-fab leading-sub
  text-fs-numeral text-fs-stat text-fs-steps-title text-fs-display-hand
  text-fs-stat-sm text-fs-dialog text-fs-body-lead text-fs-menu text-fs-caption
  text-fs-nano text-fs-badge-sm text-fs-tag
  max-w-reader max-w-profile max-w-steps max-w-access max-w-audit
  max-w-dialog-wide max-w-dialog-lg max-w-dialog max-w-dialog-sm max-w-dialog-xs
  p-reader-x p-reader-bottom p-departments-top p-departments-bottom
  start-search-icon
  w-tile-reader h-tile-reader w-glyph h-glyph w-glyph-reader h-glyph-reader
  w-iconbtn h-iconbtn w-iconbtn-reader h-iconbtn-reader w-fab h-fab
  w-fab-reader h-fab-reader w-tick h-tick w-tick-nested h-tick-nested
  w-close h-close
  ```

- [ ] **Step 12: Run the whole suite, the types and the linter.**
  `cd ui && npx vitest run && npx tsc -b && npx eslint .`
  Expected: every suite green. In particular `guards.test.ts` is unchanged —
  every literal added in this task is in `src/styles/tokens.css`, the one file on
  the guard's `ALLOWED` list — and `theme.test.ts` still passes.

- [ ] **Step 13: Build, and prove every name this task corrected still emits.**
  ```bash
  cd ui && npx vite build
  node scripts/harvest-classes.mjs tailwind-probe.txt
  ```
  Expected: the run ends `DEAD 0   EMPTY 0   NOVAR 0`, both controls hold
  (`control (negative): N/N invented names reported dead` and
  `control (escaping): … escaped variant classes unescaped`), and the last line
  is `PASS`. The script exits 1 on any failure, so it can be `&&`-chained.
  The class list is **harvested out of these files**, never hand-kept, so it
  cannot drift from what they write and `tailwind-probe.txt` cannot certify it
  on their behalf — see *The class-emission check* in Global Constraints for the
  measurement that retired the old grep.

  The probe is the inventory, so this run covers the 17 names this task touches
  and every other theme class at the same time. A token corrected to point at a
  custom property that does not exist shows up here as `NOVAR`, and a theme key
  left pointing at nothing shows up as `EMPTY` — neither of which a grep can see.

  **A failure.** `DEAD` — the class compiled to no rule at all; that is a **typo
  in the component**, so fix the class string, rebuild, re-run. `EMPTY` — the
  selector emitted with an empty body, so the theme key resolves to nothing.
  `NOVAR` — the rule reads a `var(--…)` nothing declares. The last two are theme
  regressions: **stop and report them.** Do **not** add the name to
  `ui/tailwind.config.js`, `src/styles/tokens.css`, `src/styles/roles.css` or
  `tailwind-probe.txt`. All four are frozen for the duration of this plan and
  were unfrozen exactly once, by the single minting pass in
  `.superpowers/sdd/mint-spec.md`; minting one here to make a misspelling compile
  recreates the unreachable-token problem the whole rebuild exists to fix. A
  value that genuinely has no name goes into `mint-spec.md`, not into the config
  and not into this task's commit.

  **What this step cannot prove:** that these files write a class and that the
  class compiles to a rule with declarations, yes. That the class reaches the
  right element, that the element renders, that it is visible, or that its value
  is the one the design asks for — no. That stays with the Playwright checks.

  Then prove the scrollbar correction actually reached the built CSS. Grepping
  for a literal `width: 10px` cannot work: the rule is written against a token,
  so the CSS says `width: var(--space-5)` and the number only exists on the
  custom property. Resolve it:

  ```bash
  cd ui && node -e '
  const fs=require("node:fs");
  const css=fs.readdirSync("dist/assets").filter(f=>/\.css$/.test(f))
    .map(f=>fs.readFileSync("dist/assets/"+f,"utf8")).join("\n");
  const m=css.match(/::-webkit-scrollbar\s*\{[^}]*width:\s*([^;}]+)/);
  const v=m&&m[1].trim();
  const name=v&&v.match(/^var\((--[\w-]+)\)$/);
  const decl=name&&css.match(new RegExp(name[1]+":\\s*([^;}]+)"));
  const px=decl?decl[1].trim():v;
  console.log(m?`scrollbar width: ${v}${decl?" = "+px:""}`:"NO ::-webkit-scrollbar RULE");
  process.exit(px==="10px"?0:1);'
  ```
  Expected: `scrollbar width: var(--space-5) = 10px`, exit 0 — never `12px`.

- [ ] **Step 14: Commit.**
  ```
  git add ui/src/styles/tokens.css ui/src/styles/base.css ui/src/styles/roles.css \
          ui/tailwind.config.js ui/tailwind-probe.txt ui/src/test/tokens.test.ts \
          ui/src/test/roles.test.ts
  git commit -m "fix(ui): the tokens say what the design paints, and the type scale finally closes"
  ```

---

### Task 4: The Playwright harness

R6: `vitest` runs on jsdom, which renders nothing — no layout, no computed
colour, no font metrics. That is the direct reason nine screens shipped where
every individual value was legal and the page still looked wrong. This task
builds the missing gate: a committed Playwright project that opens the real app
in real Chrome at 1440 / 1080 / 760 and asserts **computed values against the
design's numbers**, and proves it works against `/departments` — the one screen
the visual audit calls near pixel-faithful.

Chrome is installed at `/usr/bin/google-chrome` (150.0.7871.114) and the network
is restricted, so the config uses `channel: 'chrome'` and **no browser is ever
downloaded**: the install command sets `PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1`,
because `@playwright/test` depends on `playwright`, whose install script
otherwise fetches three browser bundles.

**Files**
- Modify: `ui/package.json` (`@playwright/test` devDependency, `test:e2e` script)
- Modify: `ui/vite.config.ts` (keep vitest out of `e2e/`)
- Modify: `ui/tsconfig.json`, Create: `ui/tsconfig.e2e.json`
- Modify: `ui/eslint.config.js` (ignore the shot directory)
- Modify: `.gitignore`
- Create: `ui/playwright.config.ts`
- Create: `ui/e2e/_harness.ts`
- Create: `ui/e2e/departments.spec.ts`
- Modify: `ui/src/screens/Departments.tsx` (the five measurement hooks)

**Interfaces**

*Consumes* — `ui/src/styles/roles.css` (Task 1) and the corrected tokens
(Task 3) for the numbers it asserts; the dev server on
`http://127.0.0.1:5173`; the app's two read endpoints `GET /api/auth/me`
(returns `SessionDescriptor`) and `GET /api/departments` (returns
`Department[]`, i.e. `{ code, name, count, subs, conflicts? }[]`).

*Produces*

```ts
// ui/e2e/_harness.ts
export type Measured = { size: string; weight?: string; color?: string }
export interface ScreenDesign {
  field?: string                       // computed background of [data-screen]
  column?: string                      // computed max-width of [data-col]
  padding?: string                     // computed padding of [data-screen]
  h1?: { size: string; weight: string }// computed on [data-h1]
  body?: { size: string }              // computed on [data-body]
  card?: { radius?: string; shadow?: string; border?: string; background?: string }
  focus?: string                       // selector; asserts border-color === FOCUS
  lift?: string                        // selector; asserts transform on hover
}
export const DESIGN: Record<'departments', ScreenDesign>
export const FIELD: 'rgb(42, 29, 94)'
export const SURFACE: 'rgb(255, 255, 255)'
export const CARD_BORDER: 'rgba(42, 29, 94, 0.07)'
export const CARD_SHADOW: string   // the two-layer neutral shadow, as Chrome serialises it
export const FOCUS: 'rgb(250, 90, 82)'
export const LIFT: 'matrix(1, 0, 0, 1, 0, -2)'
export async function signedIn(page: Page, over?: Partial<Session>): Promise<void>
export async function serve(page: Page, table: Record<string, unknown>): Promise<void>
export async function expectDesign(page: Page, screen: keyof typeof DESIGN): Promise<void>
export async function shot(page: Page, name: string): Promise<void>
```

**The five measurement hooks** — the contract every screen task from 12 onward
implements, so a screen's browser check is one line:

| Attribute | On |
|---|---|
| `data-screen="<name>"` | the scrolling screen region: it paints the field and carries the screen padding |
| `data-col` | the max-width content column inside it |
| `data-h1` | the screen title |
| `data-body` | one representative run of body copy |
| `data-card` | one representative card (the harness measures the first) |

**Steps**

- [ ] **Step 1: Install Playwright without downloading a browser.**
  ```
  cd ui && PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1 npm install -D @playwright/test@1.61.0
  npx playwright --version
  ```
  Expected: `npm install` completes with no `Downloading Chromium…` lines, and
  `npx playwright --version` prints `Version 1.61.0`.

- [ ] **Step 2: Add the script and see the config missing.**
  In `ui/package.json`, add to `scripts`, after `"test:watch": "vitest",`:

  ```json
      "test:e2e": "playwright test"
  ```

  (add a comma to the `test:watch` line). Then run
  `cd ui && npx playwright test`
  Expected: `Error: no tests found` / `Playwright Test did not expect
  test.describe()` is *not* what appears — instead
  `Error: Cannot find any tests` or, on this repo's layout,
  Playwright picks up `src/**/*.test.tsx` and fails on the first vitest import.
  Either way it exits non-zero, which is the failure this task removes.

- [ ] **Step 3: Write the config.**
  Create `ui/playwright.config.ts`:

  ```ts
  import { defineConfig } from '@playwright/test'

  /**
   * R6 — the gate vitest cannot be. jsdom computes no layout, no colour and no
   * font metrics, so a screen can pass every unit test and still look wrong.
   *
   * `channel: 'chrome'` drives the Chrome already installed at
   * /usr/bin/google-chrome. Nothing is downloaded: the network here is
   * restricted, and `PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1` is set at install time.
   *
   * Three projects, one per width the design specifies: 1440 (desktop),
   * 1080 (the first breakpoint) and 760 (the mobile pass). Every screen check
   * runs at all three.
   */
  export default defineConfig({
    testDir: './e2e',
    fullyParallel: true,
    forbidOnly: !!process.env.CI,
    reporter: [['list']],
    use: {
      baseURL: 'http://127.0.0.1:5173',
      browserName: 'chromium',
      channel: 'chrome',
      locale: 'fa-IR',
      timezoneId: 'Asia/Tehran',
      // Screenshots are for comparison against ui/design/, so nothing may move
      // under the camera.
      reducedMotion: 'reduce',
    },
    webServer: {
      command: 'npm run dev -- --port 5173 --strictPort --host 127.0.0.1',
      url: 'http://127.0.0.1:5173',
      reuseExistingServer: !process.env.CI,
      timeout: 120_000,
    },
    projects: [
      { name: 'w1440', use: { viewport: { width: 1440, height: 1000 } } },
      { name: 'w1080', use: { viewport: { width: 1080, height: 900 } } },
      { name: 'w760', use: { viewport: { width: 760, height: 900 } } },
    ],
  })
  ```

- [ ] **Step 4: Keep vitest out of `e2e/`.**
  A `.spec.ts` under `e2e/` matches vitest's default include, and vitest would
  try to run it in jsdom. In `ui/vite.config.ts`, replace the `test` block with:

  ```ts
    test: {
      environment: 'jsdom',
      globals: false,
      setupFiles: ['./src/test/setup.ts'],
      css: true,
      // e2e/ belongs to Playwright; vitest must not try to run it in jsdom.
      exclude: ['**/node_modules/**', '**/dist/**', '**/dist-export/**', 'e2e/**'],
    },
  ```

- [ ] **Step 5: Type-check the new directory.**
  Create `ui/tsconfig.e2e.json`:

  ```json
  {
    "compilerOptions": {
      "tsBuildInfoFile": "./node_modules/.tmp/tsconfig.e2e.tsbuildinfo",
      "target": "ES2022",
      "lib": ["ES2023", "DOM", "DOM.Iterable"],
      "module": "ESNext",
      "skipLibCheck": true,
      "moduleResolution": "bundler",
      "verbatimModuleSyntax": true,
      "moduleDetection": "force",
      "noEmit": true,
      "strict": true,
      "noUnusedLocals": true,
      "noUnusedParameters": true,
      "erasableSyntaxOnly": true,
      "noFallthroughCasesInSwitch": true,
      "types": ["node"]
    },
    "include": ["e2e", "playwright.config.ts"]
  }
  ```

  and in `ui/tsconfig.json` add the reference so `npx tsc -b` covers it:

  ```json
  {
    "files": [],
    "references": [
      { "path": "./tsconfig.app.json" },
      { "path": "./tsconfig.node.json" },
      { "path": "./tsconfig.e2e.json" }
    ]
  }
  ```

- [ ] **Step 6: Ignore the outputs.**
  Append to `.gitignore`:

  ```
  # Playwright — the browser check of R6. The specs and the harness are committed;
  # its screenshots and reports are working output.
  ui/e2e/__shots__/
  ui/test-results/
  ui/playwright-report/
  ```

  and in `ui/eslint.config.js` change the ignores line to:

  ```js
    { ignores: ['dist', 'dist-export', 'e2e/__shots__', 'playwright-report', 'test-results'] },
  ```

- [ ] **Step 7: Write the harness.**
  Create `ui/e2e/_harness.ts`:

  ```ts
  import { expect, type Page } from '@playwright/test'

  /* The design's numbers, as Chrome serialises them from getComputedStyle.
     Every one is quoted from .superpowers/sdd/ui-design-spec.md. */

  /** §6.0 — the whole application sits on the deep violet field #2A1D5E. */
  export const FIELD = 'rgb(42, 29, 94)'
  /** §9.1 — every card on that field is #fff in both deliverables (ledger L-14). */
  export const SURFACE = 'rgb(255, 255, 255)'
  /** §4.3 — the default card border, 46 uses (ledger L-15). */
  export const CARD_BORDER = 'rgba(42, 29, 94, 0.07)'
  /** §4.2 — THE card shadow: two-layer, neutral-dark, 25 uses. */
  export const CARD_SHADOW =
    'rgba(16, 10, 40, 0.16) 0px 1px 2px 0px, rgba(16, 10, 40, 0.55) 0px 14px 30px -16px'
  /** §4.6 — focus is a coral border. 15 of 15 declarations, no ring, no glow. */
  export const FOCUS = 'rgb(250, 90, 82)'
  /** §4.5 — --hover-lift: translateY(-2px). */
  export const LIFT = 'matrix(1, 0, 0, 1, 0, -2)'

  export interface ScreenDesign {
    field?: string
    column?: string
    padding?: string
    h1?: { size: string; weight: string }
    body?: { size: string }
    card?: { radius?: string; shadow?: string; border?: string; background?: string }
    /** A selector to focus; its border must turn coral and gain no outline. */
    focus?: string
    /** A selector to hover; its transform must become the -2px lift. */
    lift?: string
  }

  /**
   * One entry per screen. A screen task adds its own row and calls
   * `expectDesign(page, '<name>')` at all three widths.
   *
   * `departments` is deliberately partial: the visual audit calls this screen
   * near pixel-faithful, and it is — on the field, the column, the padding, the
   * title and the card's radius. Its card is still cream `#FBF7F1` with
   * `--shadow-card-dark` and a `#EFE7DC` border, which ledger L-14/L-15 retire;
   * Task 14 rebuilds it white with `CARD_BORDER` and `CARD_SHADOW` and adds
   * `background`, `border` and `shadow` to this record in the same commit.
   * The screen has no focusable control, so `focus` is absent by fact.
   */
  export const DESIGN = {
    departments: {
      field: FIELD,
      column: '1120px',
      padding: '38px 40px 48px',
      h1: { size: '34px', weight: '800' },
      body: { size: '14px' },
      card: { radius: '20px' },
      lift: '[data-card]',
    },
  } satisfies Record<string, ScreenDesign>

  interface Session {
    username: string; displayName: string; role: string
    capabilities: string[]; scopes: string[]
    supervisor: string | null; canSupervise: boolean; pendingApprovals: number
  }

  const EDITOR: Session = {
    username: 'editor', displayName: 'ویراستار', role: 'editor',
    capabilities: ['view', 'comment', 'export_pdf', 'edit', 'confirm'],
    scopes: ['*'], supervisor: null, canSupervise: false, pendingApprovals: 0,
  }

  /** Answers GET /api/auth/me so the app renders past RequireAuth. */
  export async function signedIn(page: Page, over: Partial<Session> = {}) {
    const body = JSON.stringify({ ...EDITOR, ...over })
    await page.route('**/api/auth/me', (r) =>
      r.fulfill({ status: 200, contentType: 'application/json', body }))
  }

  /**
   * Answers the read endpoints from fixtures. Nothing reaches the vite proxy, so
   * the check needs no backend and cannot go red because a database moved.
   */
  export async function serve(page: Page, table: Record<string, unknown>) {
    for (const [path, value] of Object.entries(table)) {
      const body = JSON.stringify(value)
      await page.route(`**${path}`, (r) =>
        r.fulfill({ status: 200, contentType: 'application/json', body }))
    }
  }

  const css = (page: Page, selector: string, prop: string) =>
    page.locator(selector).first().evaluate(
      (el, p) => getComputedStyle(el).getPropertyValue(p),
      prop,
    )

  /** Asserts the screen's computed values against the design's numbers. */
  export async function expectDesign(page: Page, screen: keyof typeof DESIGN) {
    const d: ScreenDesign = DESIGN[screen]
    await expect(page.locator(`[data-screen="${screen}"]`)).toBeVisible()

    if (d.field) {
      expect(await css(page, `[data-screen="${screen}"]`, 'background-color')).toBe(d.field)
    }
    if (d.column) {
      expect(await css(page, '[data-col]', 'max-width')).toBe(d.column)
    }
    if (d.padding) {
      const [top, x, bottom] = d.padding.split(' ')
      const s = `[data-screen="${screen}"]`
      expect(await css(page, s, 'padding-top')).toBe(top)
      expect(await css(page, s, 'padding-left')).toBe(x)
      expect(await css(page, s, 'padding-right')).toBe(x)
      expect(await css(page, s, 'padding-bottom')).toBe(bottom ?? top)
    }
    if (d.h1) {
      expect(await css(page, '[data-h1]', 'font-size')).toBe(d.h1.size)
      expect(await css(page, '[data-h1]', 'font-weight')).toBe(d.h1.weight)
    }
    if (d.body) {
      expect(await css(page, '[data-body]', 'font-size')).toBe(d.body.size)
    }
    if (d.card) {
      const c = d.card
      if (c.radius) expect(await css(page, '[data-card]', 'border-top-left-radius')).toBe(c.radius)
      if (c.shadow) expect(await css(page, '[data-card]', 'box-shadow')).toBe(c.shadow)
      if (c.border) {
        expect(await css(page, '[data-card]', 'border-top-color')).toBe(c.border)
        expect(await css(page, '[data-card]', 'border-top-width')).toBe('1px')
      }
      if (c.background) {
        expect(await css(page, '[data-card]', 'background-color')).toBe(c.background)
      }
    }
    if (d.focus) {
      await page.locator(d.focus).first().focus()
      expect(await css(page, d.focus, 'border-top-color')).toBe(FOCUS)
      // §4.6 — no glow, no ring, no outline anywhere in the panel.
      expect(await css(page, d.focus, 'box-shadow')).toBe('none')
    }
    if (d.lift) {
      const target = page.locator(d.lift).first()
      expect(await css(page, d.lift, 'transform')).toBe('none')
      await target.hover()
      await expect
        .poll(() => css(page, d.lift!, 'transform'))
        .toBe(LIFT)
    }
  }

  /** A screenshot at the running project's width, for comparison against ui/design/. */
  export async function shot(page: Page, name: string) {
    const width = page.viewportSize()?.width ?? 0
    await page.screenshot({ path: `e2e/__shots__/${name}-${width}.png`, fullPage: true })
  }
  ```

- [ ] **Step 8: Add the five measurement hooks to the one screen that already fits.**
  In `ui/src/screens/Departments.tsx`, make five attribute additions and nothing
  else:

  - line 21 — `<div className="flex-1 overflow-auto pt-[38px] pb-12 px-10 bg-ink">`
    becomes
    `<div data-screen="departments" className="flex-1 overflow-auto pt-[38px] pb-12 px-10 bg-ink">`
  - line 22 — `<div className="max-w-[1120px] mx-auto">`
    becomes
    `<div data-col className="max-w-[1120px] mx-auto">`
  - line 31 — `<div className="font-extrabold text-[34px] text-bg tracking-[-.01em]">دپارتمان‌ها</div>`
    becomes
    `<div data-h1 className="font-extrabold text-[34px] text-bg tracking-[-.01em]">دپارتمان‌ها</div>`
  - line 32 — `<div className="text-[14px] text-[#B7A6E0] mt-2 max-w-[440px] leading-[1.7]">`
    becomes
    `<div data-body className="text-[14px] text-[#B7A6E0] mt-2 max-w-[440px] leading-[1.7]">`
  - line 56–57 — `<div key={d.code} onClick={() => nav(\`/departments/${d.code}\`)}`
    becomes
    `<div key={d.code} data-card onClick={() => nav(\`/departments/${d.code}\`)}`

- [ ] **Step 9: Write the browser check.**
  Create `ui/e2e/departments.spec.ts`:

  ```ts
  import { test } from '@playwright/test'
  import { expectDesign, serve, shot, signedIn } from './_harness'

  const DEPARTMENTS = [
    { code: 'management', name: 'مدیریت', count: 4, subs: 1, conflicts: 0 },
    { code: 'accounting', name: 'حسابداری', count: 3, subs: 0, conflicts: 2 },
    { code: 'warehouse', name: 'انبار', count: 5, subs: 2, conflicts: 0 },
    { code: 'procurement', name: 'کارپردازی', count: 2, subs: 0, conflicts: 0 },
    { code: 'cooking', name: 'پخت', count: 6, subs: 3, conflicts: 0 },
    { code: 'preparation', name: 'آماده‌سازی', count: 1, subs: 0, conflicts: 0 },
  ]

  test('departments renders the design’s numbers', async ({ page }) => {
    await signedIn(page)
    await serve(page, { '/api/departments': DEPARTMENTS, '/api/pending': [] })
    await page.goto('/departments')
    await expectDesign(page, 'departments')
    await shot(page, 'departments')
  })
  ```

- [ ] **Step 10: Run it and see it pass at all three widths.**
  `cd ui && npx playwright test`
  Expected: `Running 3 tests using 3 workers` and
  `3 passed` — one per project (`w1440`, `w1080`, `w760`) — and three files under
  `ui/e2e/__shots__/`: `departments-1440.png`, `departments-1080.png`,
  `departments-760.png`.

- [ ] **Step 11: Prove the harness can fail, then restore it.**
  A green assertion that cannot go red is furniture. Temporarily change
  `column: '1120px'` to `column: '1119px'` in `ui/e2e/_harness.ts` and run
  `cd ui && npx playwright test --project=w1440`
  Expected: `1 failed`, with
  `Expected: "1119px"` / `Received: "1120px"`.
  Change it back to `'1120px'` and re-run; expected `1 passed`.

- [ ] **Step 12: Run everything else and commit.**
  `cd ui && npx vitest run && npx tsc -b && npx eslint . && npm run build`
  Expected: vitest reports the same file count as before Step 4 (it must not have
  picked up `e2e/`), tsc silent across all three projects, eslint silent, build
  exits 0.
  ```
  git add ui/package.json ui/package-lock.json ui/playwright.config.ts \
          ui/tsconfig.json ui/tsconfig.e2e.json ui/vite.config.ts \
          ui/eslint.config.js ui/e2e ui/src/screens/Departments.tsx .gitignore
  git commit -m "test(ui): the design is measured in a real browser at three widths, starting where it already fits"
  ```

---

### Task 5: `ui/src/ui/surface.tsx` — the panel/reader scale layer

R3: panel and reader are **two surfaces at two scales, not two themes**. They
share every foundation — the violet field, the two-layer card shadow, the
`rgba(42,29,94,.07)` border, `translateY(-2px)` over `.16s`, the coral focus
border, the scrim, the 10px scrollbar — and differ in content column, screen
padding, department layout, tile size, screen H1, body size, icon-button size,
FAB size and chrome. *"A single shared component set cannot satisfy both."*

The scale is expressed **twice, from one source**: as CSS custom properties under
`[data-surface]`, so a component names one utility and gets the right number on
either surface; and as a React context, for the handful of decisions that are
structural rather than dimensional (which chrome, which department layout, and
R4's single-department landing).

Note on `data-shell`: it stays. It is F8's *type-density* switch and already
ships. `data-surface` is R3's *geometry* switch and is new. Task 13 folds the two
into one attribute once `ReaderShell` is rebuilt; until then neither duplicates a
declaration of the other.

**Files**
- Create: `ui/src/ui/surface.tsx`
- Create: `ui/src/ui/surface.test.tsx`
- Modify: `ui/src/styles/roles.css` (the `[data-surface]` scale blocks)
- Modify: `ui/src/shell/AppShell.tsx` (wrap in the provider)

**Interfaces**

*Consumes* — the geometry tokens Task 3 created (`--width-reader`,
`--pad-reader-x`, `--pad-reader-bottom`, `--size-tile-reader`, `--size-glyph`,
`--size-glyph-reader`, `--size-iconbtn`, `--size-iconbtn-reader`, `--size-fab`,
`--size-fab-reader`, `--fs-h1-reader-home/list/dept`, `--fs-body-reader`) and the
panel tokens they scale against (`--width-list`, `--pad-screen-x`,
`--pad-screen-y`, `--size-tile`, `--radius-tile`, `--radius-card`, `--fs-h2`,
`--fs-display`, `--fs-body`, `--fs-sm`, `--space-9`, `--space-7`);
`selectShell(capabilities): 'panel' | 'reader'` from `../auth/session`.

*Produces*

```ts
// ui/src/ui/surface.tsx
export type Surface = 'panel' | 'reader'
export function SurfaceProvider(props: { surface: Surface; children: ReactNode }): JSX.Element
export function useSurface(): Surface           // defaults to 'panel' outside a provider
```

and, in `ui/src/styles/roles.css`, the eleven scale properties — panel values on
`:root`, reader values under `[data-surface='reader']`:

| Role property | Panel | Reader |
|---|---|---|
| `--role-column` | `var(--width-list)` **920px** | `var(--width-reader)` **720px** |
| `--role-pad-x` | `var(--pad-screen-x)` **40px** | `var(--pad-reader-x)` **24px** |
| `--role-pad-y` | `var(--pad-screen-y)` **30px** | `var(--pad-screen-y)` **30px** |
| `--role-pad-bottom` | `var(--pad-screen-y)` **30px** | `var(--pad-reader-bottom)` **60px** |
| `--role-dept-gap` | `var(--space-9)` **18px** | `var(--space-7)` **14px** |
| `--role-tile` | `var(--size-tile)` **48px** | `var(--size-tile-reader)` **54px** |
| `--role-tile-radius` | `var(--radius-tile)` **14px** | `var(--radius-card)` **16px** |
| `--role-tile-glyph` | `var(--size-glyph)` **24px** | `var(--size-glyph-reader)` **26px** |
| `--role-fs-title` | `var(--fs-h2)` **22px** | `var(--fs-h1-reader-list)` **30px** |
| `--role-fs-hero` | `var(--fs-display)` **34px** | `var(--fs-h1-reader-home)` **26px** |
| `--role-fs-body` | `var(--fs-body)` **14px** | `var(--fs-body-reader)` **15px** |
| `--role-fs-dense` | `var(--fs-sm)` **13px** | `var(--fs-body-lead)` **14.5px** |
| `--role-iconbtn` | `var(--size-iconbtn)` **40px** | `var(--size-iconbtn-reader)` **42px** |
| `--role-fab` | `var(--size-fab)` **52px** | `var(--size-fab-reader)` **56px** |

(`--role-fs-title`, `--role-fs-hero`, `--role-fs-body` and `--role-fs-dense`
already exist from Task 1 with the panel values; this task adds the reader
override, it does not re-declare them on `:root`.)

**Steps**

- [ ] **Step 1: Write the failing test.**
  Create `ui/src/ui/surface.test.tsx`:

  ```tsx
  import { describe, it, expect } from 'vitest'
  import { render, screen } from '@testing-library/react'
  import { readFileSync } from 'node:fs'
  import { join } from 'node:path'
  import { SurfaceProvider, useSurface } from './surface'

  function Probe() {
    return <span data-testid="surface">{useSurface()}</span>
  }

  describe('R3 — the scale layer', () => {
    it('reports the surface it was given', () => {
      render(<SurfaceProvider surface="reader"><Probe /></SurfaceProvider>)
      expect(screen.getByTestId('surface').textContent).toBe('reader')
    })

    it('is panel outside a provider, so nothing renders at the wrong scale by accident', () => {
      render(<Probe />)
      expect(screen.getByTestId('surface').textContent).toBe('panel')
    })

    it('marks the tree so CSS can scale it without a prop reaching every component', () => {
      const { container } = render(<SurfaceProvider surface="reader"><Probe /></SurfaceProvider>)
      expect(container.querySelector('[data-surface="reader"]')).not.toBeNull()
    })

    it('adds no box: the wrapper is display:contents', () => {
      const { container } = render(<SurfaceProvider surface="panel"><Probe /></SurfaceProvider>)
      expect(container.querySelector('[data-surface]')?.className).toBe('contents')
    })
  })

  describe('R3 — the two scales differ where the ruling says they differ', () => {
    const roles = readFileSync(join(process.cwd(), 'src/styles/roles.css'), 'utf8')
    const readerBlock = /\[data-surface=['"]reader['"]\]\s*\{([^}]*)\}/.exec(roles)?.[1] ?? ''
    const value = (name: string) =>
      new RegExp(`${name}\\s*:\\s*([^;]+);`).exec(readerBlock)?.[1].trim() ?? ''

    it('overrides exactly the rows of R3’s table', () => {
      expect(value('--role-column')).toBe('var(--width-reader)')
      expect(value('--role-pad-x')).toBe('var(--pad-reader-x)')
      expect(value('--role-pad-bottom')).toBe('var(--pad-reader-bottom)')
      expect(value('--role-dept-gap')).toBe('var(--space-7)')
      expect(value('--role-tile')).toBe('var(--size-tile-reader)')
      expect(value('--role-tile-radius')).toBe('var(--radius-card)')
      expect(value('--role-tile-glyph')).toBe('var(--size-glyph-reader)')
      expect(value('--role-fs-title')).toBe('var(--fs-h1-reader-list)')
      expect(value('--role-fs-hero')).toBe('var(--fs-h1-reader-home)')
      expect(value('--role-fs-body')).toBe('var(--fs-body-reader)')
      expect(value('--role-fs-dense')).toBe('var(--fs-body-lead)')
      expect(value('--role-iconbtn')).toBe('var(--size-iconbtn-reader)')
      expect(value('--role-fab')).toBe('var(--size-fab-reader)')
    })

    it('shares every foundation — the reader block redefines no colour or shadow', () => {
      const shared = readerBlock.match(/--role-(field|surface|scrim|focus|shadow|lift|duration|border)[a-z-]*\s*:/g)
      expect(shared).toBeNull()
    })
  })
  ```

- [ ] **Step 2: Run it and see it fail.**
  `cd ui && npx vitest run src/ui/surface.test.tsx`
  Expected: the suite errors —
  `Failed to resolve import "./surface" from "src/ui/surface.test.tsx"`.

- [ ] **Step 3: Write the provider.**
  Create `ui/src/ui/surface.tsx`:

  ```tsx
  import { createContext, useContext, type ReactNode } from 'react'

  /**
   * R3 — panel and reader are two surfaces at two scales, not two themes.
   *
   * The scale itself is CSS: `[data-surface='reader']` in src/styles/roles.css
   * redefines the eleven role properties the ruling's table lists, so a
   * component writes `w-[…] var(--role-tile)`-backed utilities once and gets
   * 48px in the panel and 54px in the reader without a prop.
   *
   * This context carries only what CSS cannot decide: which chrome the shell
   * draws, whether departments are a grid or a list, and R4's rule that a reader
   * reaching exactly one department lands on that department's process list.
   *
   * The wrapper is `display: contents`, so it introduces no box and no layout —
   * it exists to put the attribute and the context on the same node, which is
   * what keeps them from disagreeing.
   */
  export type Surface = 'panel' | 'reader'

  // Panel is the default: anything rendered outside a provider (a test, an
  // export document) is a panel-scale surface, which is also what
  // src/styles/roles.css's :root block declares.
  const SurfaceContext = createContext<Surface>('panel')

  export function SurfaceProvider({ surface, children }: {
    surface: Surface
    children: ReactNode
  }) {
    return (
      <SurfaceContext.Provider value={surface}>
        <div data-surface={surface} className="contents">{children}</div>
      </SurfaceContext.Provider>
    )
  }

  export function useSurface(): Surface {
    return useContext(SurfaceContext)
  }
  ```

- [ ] **Step 4: Write the scale into the semantic table.**
  In `ui/src/styles/roles.css`, inside `:root`, after
  `--role-scrim: var(--scrim);` add the panel scale:

  ```css
    /* ---- R3, the scale layer: panel values. The reader overrides them below;
       every other role above is shared and must NOT appear in that block. ---- */
    --role-column: var(--width-list);        /* 920px */
    --role-pad-x: var(--pad-screen-x);       /* 40px  */
    --role-pad-y: var(--pad-screen-y);       /* 30px  */
    --role-pad-bottom: var(--pad-screen-y);  /* 30px  */
    --role-dept-gap: var(--space-9);         /* 18px, a 3-column grid */
    --role-tile: var(--size-tile);           /* 48px */
    --role-tile-radius: var(--radius-tile);  /* 14px */
    --role-tile-glyph: var(--size-glyph);    /* 24px, half the tile */
    --role-iconbtn: var(--size-iconbtn);     /* 40px */
    --role-fab: var(--size-fab);             /* 52px */
  ```

  and append, after the closing `}` of `:root`:

  ```css
  /* R3 — the reader is the same product read at a different size. It shares the
     violet field, the two-layer card shadow, the rgba(42,29,94,.07) border, the
     -2px lift over .16s, the coral focus border, the scrim and the 10px
     scrollbar; only the geometry below differs. Nothing colour-, shadow- or
     motion-shaped may be declared here. */
  [data-surface='reader'] {
    --role-column: var(--width-reader);          /* 720px */
    --role-pad-x: var(--pad-reader-x);           /* 24px  */
    --role-pad-bottom: var(--pad-reader-bottom); /* 60px  */
    --role-dept-gap: var(--space-7);             /* 14px, a single column */
    --role-tile: var(--size-tile-reader);        /* 54px */
    --role-tile-radius: var(--radius-card);      /* 16px */
    --role-tile-glyph: var(--size-glyph-reader); /* 26px */
    --role-iconbtn: var(--size-iconbtn-reader);  /* 42px */
    --role-fab: var(--size-fab-reader);          /* 56px */
    --role-fs-title: var(--fs-h1-reader-list);   /* 30px */
    --role-fs-hero: var(--fs-h1-reader-home);    /* 26px — see the ledger's
                                                    "Referred to the owner": the
                                                    hero is smaller than the
                                                    titles beneath it. */
    --role-fs-body: var(--fs-body-reader);       /* 15px */
    --role-fs-dense: var(--fs-body-lead);        /* 14.5px */
  }
  ```

- [ ] **Step 5: Run the test and see it pass.**
  `cd ui && npx vitest run src/ui/surface.test.tsx`
  Expected: `Test Files 1 passed`, `Tests 6 passed`.

- [ ] **Step 6: Put the provider where the shell is chosen.**
  In `ui/src/shell/AppShell.tsx`, add the import beside the others:

  ```tsx
  import { SurfaceProvider } from '../ui/surface'
  ```

  and replace the final two lines of the component:

  ```tsx
    const Shell = selectShell(session.capabilities) === 'panel' ? PanelShell : ReaderShell
    return <ToastProvider><Shell session={session} /></ToastProvider>
  ```

  with:

  ```tsx
    // R3 — the surface is chosen exactly where the shell is, from the same
    // descriptor, so the scale and the chrome can never disagree about which
    // product this is.
    const surface = selectShell(session.capabilities)
    const Shell = surface === 'panel' ? PanelShell : ReaderShell
    return (
      <SurfaceProvider surface={surface}>
        <ToastProvider><Shell session={session} /></ToastProvider>
      </SurfaceProvider>
    )
  ```

- [ ] **Step 7: Run the whole suite, the types and the linter.**
  `cd ui && npx vitest run && npx tsc -b && npx eslint .`
  Expected: every suite green — `shells.test.tsx` in particular, because the
  `display:contents` wrapper adds no box and `data-shell` is untouched; the
  raised role-count floor in `roles.test.ts` still passes; tsc silent; eslint
  silent (`surface.tsx` exports one component and one hook, and
  `react-refresh/only-export-components` allows a hook beside its provider only
  as a warning — confirm the run reports **zero** warnings and errors).

- [ ] **Step 8: Build, check the reader block and the classes, run the browser check, commit.**
  ```bash
  cd ui && npx vite build
  node scripts/harvest-classes.mjs src/ui/surface.tsx src/shell/AppShell.tsx
  ```
  Expected: the run ends `DEAD 0   EMPTY 0   NOVAR 0`, both controls hold
  (`control (negative): N/N invented names reported dead` and
  `control (escaping): … escaped variant classes unescaped`), and the last line
  is `PASS`. The script exits 1 on any failure, so it can be `&&`-chained.
  The class list is **harvested out of these files**, never hand-kept, so it
  cannot drift from what they write and `tailwind-probe.txt` cannot certify it
  on their behalf — see *The class-emission check* in Global Constraints for the
  measurement that retired the old grep.

  **A failure.** `DEAD` — the class compiled to no rule at all; that is a **typo
  in the component**, so fix the class string, rebuild, re-run. `EMPTY` — the
  selector emitted with an empty body, so the theme key resolves to nothing.
  `NOVAR` — the rule reads a `var(--…)` nothing declares. The last two are theme
  regressions: **stop and report them.** Do **not** add the name to
  `ui/tailwind.config.js`, `src/styles/tokens.css`, `src/styles/roles.css` or
  `tailwind-probe.txt`. All four are frozen for the duration of this plan and
  were unfrozen exactly once, by the single minting pass in
  `.superpowers/sdd/mint-spec.md`; minting one here to make a misspelling compile
  recreates the unreachable-token problem the whole rebuild exists to fix. A
  value that genuinely has no name goes into `mint-spec.md`, not into the config
  and not into this task's commit.

  **What this step cannot prove:** that these files write a class and that the
  class compiles to a rule with declarations, yes. That the class reaches the
  right element, that the element renders, that it is visible, or that its value
  is the one the design asks for — no. That stays with the Playwright checks.

  Then check the reader block survived the build. The old grep here
  (`data-surface='reader'\|\[data-surface=.reader.\]`) matched **nothing** on a
  real build and would have reported the block missing when it was present:
  the minifier drops the quotes, so the CSS holds `[data-surface=reader]` and
  both halves of that pattern require a character on either side of `reader`.

  ```bash
  cd ui && CSS=$(ls dist/assets/*.css | head -1)
  grep -o -- "\[data-surface=[^]]*\]" "$CSS" | sort -u
  grep -c -- "\[data-surface=[\"']\?reader[\"']\?\]" "$CSS"
  npx playwright test
  ```
  Expected: the first grep lists `[data-surface=reader]` (quoted or not — that is
  the point), the second prints a non-zero count, and Playwright reports
  `3 passed` — `/departments` is a panel surface and none of its numbers moved.
  ```
  git add ui/src/ui/surface.tsx ui/src/ui/surface.test.tsx \
          ui/src/styles/roles.css ui/src/shell/AppShell.tsx
  git commit -m "feat(ui): the reader is the same product at its own size, and every component can tell"
  ```

---

### Task 6: `Button`, `Card`, `Overlay`, `SearchField`, `states` brought up to the design

Four primitives are materially thinner than the design components they stand for,
and the audit shows the consequence is not cosmetic but **causal**: because
`Overlay` has no `subtitle`, `icon`, `width`, `footer` or `blurScrim`, five older
dialogs hand-rolled their own scrim and box and **three of them cannot be closed
from the keyboard at all**; because `Button` has no disabled appearance, every
disabled button in the app looks enabled *and still brightens under the pointer*;
because `Card` has no `hoverLift` or `radius`, the department card hand-rolls all
four of its properties. This task makes the primitives capable. Migrating the five
dialogs onto `Overlay` is Task 24's; nothing here changes a screen.

**Files**
- Modify: `ui/src/ui/Button.tsx`, `ui/src/ui/Card.tsx`, `ui/src/ui/Overlay.tsx`,
  `ui/src/ui/SearchField.tsx`, `ui/src/ui/states/index.tsx`
- Modify: `ui/src/styles/tokens.css` (the six control values the design names and
  the scale does not hold), `ui/tailwind.config.js`, `ui/tailwind-probe.txt`
- Modify: `ui/src/test/guards.test.ts` (one named exception, mirroring `Button`'s)
- Create: `ui/src/ui/primitives.design.test.tsx`
- Create: `ui/e2e/primitives.spec.ts`
- Modify: `ui/src/ui/primitives.test.tsx`, `ui/src/ui/Overlay.test.tsx` (existing
  suites; only where a changed default breaks an assertion)

**Interfaces**

*Consumes* — `useSurface()` from `../ui/surface` (Task 5); the role properties
`--role-fs-dense`, `--role-fs-body`, `--role-pad-x`, `--role-pad-y`,
`--role-column`; the tokens and utilities from Tasks 2 and 3.

*Produces*

```tsx
// Button.tsx
type Variant = 'coral' | 'violet' | 'green' | 'ghost' | 'danger'
export function Button(props: ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: Variant
  loading?: boolean
  loadingLabel?: ReactNode
  /** A leading node — an inline SVG today, an <Icon/> from Task 11. */
  icon?: ReactNode
  /** Full width, for a dialog footer or a stacked mobile action. */
  block?: boolean
}): JSX.Element
export function Spinner(props: { className?: string }): JSX.Element

// Card.tsx
export function Card(props: HTMLAttributes<HTMLDivElement> & {
  radius?: 'card' | 'feature' | 'tile' | 'doc' | 'control'
  padding?: 'none' | 'tight' | 'card' | 'feature'
  hoverLift?: boolean
}): JSX.Element

// Overlay.tsx
export function Dialog(props: {
  open: boolean; onClose: () => void; title: string
  subtitle?: ReactNode; icon?: ReactNode; footer?: ReactNode
  width?: 'wide' | 'lg' | 'md' | 'sm' | 'xs'      // 640 | 540 | 520 | 460 | 440
  blurScrim?: boolean
  children: ReactNode
}): JSX.Element | null
export function Sheet(props: /* same, minus width */): JSX.Element | null

// SearchField.tsx
export function SearchField(props: {
  label: string; value: string; onChange: (v: string) => void
  placeholder?: string
  /** Where it sits, which is what the design scales it by. Not a density. */
  place?: 'screen' | 'dialog' | 'menu'
}): JSX.Element

// states/index.tsx
export function EmptyState(props: {
  title: string; hint?: string
  variant?: 'card' | 'dashed' | 'inline'
}): JSX.Element
```

New tokens: `--pad-modal 24px`, `--pad-search-y 13px`, `--pad-search-x 44px`,
`--pad-search-x-dialog 42px`, `--pad-search-y-menu 9px`,
`--pad-search-x-menu 34px`, `--inset-search-icon-dialog 14px`,
`--inset-search-icon-menu 11px`, `--size-search-glyph 17px`.
New utilities: `p-modal` `py-search-y` `px-search-x` `px-search-x-dialog`
`py-search-y-menu` `ps-search-x-menu` `start-search-icon-dialog`
`start-search-icon-menu` `w-search-glyph` `h-search-glyph`, and the three
geometry keys `w-tile`/`w-iconbtn`/`w-fab` (and their `h-` twins) re-pointed
from the raw token to the role, so they scale with the surface.

**On `onDark`, deliberately absent.** The design system's `Card onDark` turns a
card cream `#FBF7F1` with `--shadow-card-dark`, and `DepartmentCard`, `StatCard`
and `Modal` are all built on it. **Neither deliverable ever draws one** — every
card on the violet field is `#fff` in S1 and in S2 — so the prop would ship a
second card surface that the design never paints, and `ProcessTag.plain` is the
cautionary tale for what that costs. Recorded as ledger row L-14, vetoable there.

**Steps**

- [ ] **Step 1: Write the failing test for `Button`'s disabled appearance.**
  Create `ui/src/ui/primitives.design.test.tsx`:

  ```tsx
  import { describe, it, expect } from 'vitest'
  import { render, screen } from '@testing-library/react'
  import { Button } from './Button'
  import { Card } from './Card'

  describe('P1 — a disabled button does not look or behave like a working one', () => {
    it('fades, drops its glow and stops being a pointer target', () => {
      render(<Button variant="coral" disabled>حذف</Button>)
      const b = screen.getByRole('button')
      expect(b.className).toContain('disabled:opacity-60')
      expect(b.className).toContain('disabled:shadow-none')
      expect(b.className).toContain('disabled:cursor-default')
    })

    it('does not brighten under the pointer while disabled', () => {
      render(<Button variant="coral" disabled>حذف</Button>)
      const b = screen.getByRole('button')
      // The bug: `hover:brightness-105` matches a disabled <button> too, because
      // nothing sets pointer-events. `enabled:` is what stops it.
      expect(b.className).not.toMatch(/(^|\s)hover:brightness/)
      expect(b.className).toContain('enabled:hover:brightness-105')
    })

    it('fades the glyph rather than the surface on a ghost, as the design says', () => {
      render(<Button variant="ghost" disabled>انصراف</Button>)
      expect(screen.getByRole('button').className).toContain('disabled:text-disabled')
    })
  })
  ```

- [ ] **Step 2: Run it and see it fail.**
  `cd ui && npx vitest run src/ui/primitives.design.test.tsx`
  Expected: three failures; the first reads
  `expected 'inline-flex items-center justify-center gap-2 min-h-touch …' to contain 'disabled:opacity-60'`.

- [ ] **Step 3: Give `Button` its disabled appearance, the `danger` variant, `icon` and `block`.**
  Replace the whole of `ui/src/ui/Button.tsx` with:

  ```tsx
  import type { ButtonHTMLAttributes, ReactNode } from 'react'

  type Variant = 'coral' | 'violet' | 'green' | 'ghost' | 'danger'

  // I5 — still no horizontal padding or type size here. Nineteen call sites set
  // their own, and one of them is src/flow/, which F16 freezes permanently: a
  // default padding would double up against `px-3 py-[7px]` in a file this plan
  // may not touch, and Tailwind's output order, not the class string's, would
  // decide which won. Padding and size stay with the caller, and the surface has
  // nothing to scale here. Task 25 re-checks this once every unfrozen caller is
  // rebuilt.
  const BASE =
    'inline-flex items-center justify-center gap-2 min-h-touch min-w-touch ' +
    'rounded-button font-bold cursor-pointer border-0 transition ' +
    // P1 — "Disabled keeps its surface and fades"; a disabled control is never
    // hidden, never a pointer target, and never keeps a coloured glow that says
    // "press me".
    'disabled:cursor-default disabled:shadow-none'

  // `enabled:hover:` and not `hover:`: :hover still matches a disabled <button>,
  // so the old `hover:brightness-105` lit up buttons that do nothing.
  const V: Record<Variant, string> = {
    coral: 'bg-coral text-card shadow-coral enabled:hover:brightness-105 disabled:opacity-60',
    violet: 'bg-violet text-card shadow-violet enabled:hover:brightness-110 disabled:opacity-60',
    green: 'bg-green text-card shadow-green enabled:hover:brightness-105 disabled:opacity-60',
    ghost: 'bg-card text-violet border-hairline border-line enabled:hover:bg-tile-v2 disabled:text-disabled',
    // §5.2 — the destructive ghost: #FFF3F2 / #E23D35 / 1.5px #FDD9D6. It is an
    // action of lower commitment, told apart from the "conflict" *state* by
    // having a border (see the ledger's "Action versus state"). The design
    // declares no hover for it, so it has none.
    danger: 'bg-tile-c2 text-conflict border-hairline border-border-danger disabled:text-disabled disabled:border-line',
  }

  /** Inline "work in progress" ring. Sized in em so it tracks the button's text. */
  export function Spinner({ className = '' }: { className?: string }) {
    return (
      <svg data-testid="btn-spinner" aria-hidden
        className={`animate-spin w-[1.05em] h-[1.05em] shrink-0 ${className}`}
        viewBox="0 0 24 24" fill="none">
        <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="3" opacity=".25" />
        <path d="M21 12a9 9 0 0 0-9-9" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
      </svg>
    )
  }

  export function Button({
    variant = 'ghost', className = '', loading = false, loadingLabel,
    icon, block = false, children, disabled, ...props
  }: ButtonHTMLAttributes<HTMLButtonElement> & {
    variant?: Variant
    loading?: boolean
    loadingLabel?: ReactNode
    /** A leading node — an inline SVG today, an <Icon/> from Task 11. */
    icon?: ReactNode
    /** Full width: a dialog footer button, or a stacked action at <=760px. */
    block?: boolean
  }) {
    return (
      // a slow save must look busy, not frozen: the spinner is the feedback and the
      // forced `disabled` is what stops a second submit while the first is in flight
      <button
        className={`${BASE} ${V[variant]} ${block ? 'w-full' : ''} ${loading ? 'cursor-progress' : ''} ${className}`}
        disabled={disabled || loading}
        aria-busy={loading || undefined}
        {...props}
      >
        {/* S4's busy contract: the spinner takes the icon's place, it does not
            join it, so the label never shifts sideways when a save starts. */}
        {loading ? <Spinner /> : icon}
        {loading && loadingLabel !== undefined ? loadingLabel : children}
      </button>
    )
  }
  ```

- [ ] **Step 4: Run it and see it pass.**
  `cd ui && npx vitest run src/ui/primitives.design.test.tsx src/ui/primitives.test.tsx src/ui/controls.test.tsx`
  Expected: `Tests 3 passed` in the new file, and the two existing suites still
  green. If an existing assertion pinned the exact `BASE` string, update that
  assertion — not the component.

- [ ] **Step 5: Commit `Button`.**
  ```
  git add ui/src/ui/Button.tsx ui/src/ui/primitives.design.test.tsx
  git commit -m "fix(ui): a disabled button says so, and stops lighting up for a press that does nothing"
  ```

- [ ] **Step 6: Write the failing test for `Card`.**
  Append to `ui/src/ui/primitives.design.test.tsx`:

  ```tsx
  describe('P4 — Card carries the design’s recipe, not four hand-rolled copies of it', () => {
    it('is #fff on the card border and the two-layer shadow (ledger L-14, L-15)', () => {
      const { container } = render(<Card>x</Card>)
      const cls = (container.firstElementChild as HTMLElement).className
      expect(cls).toContain('bg-card')
      expect(cls).toContain('border-border-card')
      expect(cls).toContain('shadow-card')
      expect(cls).not.toContain('border-warm')
    })

    it('lifts -2px over .16s and turns its border #C9B8EC, only when asked', () => {
      const { container, rerender } = render(<Card>x</Card>)
      expect((container.firstElementChild as HTMLElement).className)
        .not.toContain('-translate-y-lift')
      rerender(<Card hoverLift>x</Card>)
      const cls = (container.firstElementChild as HTMLElement).className
      expect(cls).toContain('hover:-translate-y-lift')
      expect(cls).toContain('hover:shadow-card-hover')
      expect(cls).toContain('hover:border-border-pick')
    })

    it('names its radius and padding instead of making every caller invent one', () => {
      const { container } = render(<Card radius="feature" padding="feature">x</Card>)
      const cls = (container.firstElementChild as HTMLElement).className
      expect(cls).toContain('rounded-feature')
      expect(cls).toContain('p-s10')
    })
  })
  ```

- [ ] **Step 7: Run it and see it fail.**
  `cd ui && npx vitest run src/ui/primitives.design.test.tsx`
  Expected: three new failures, the first
  `expected 'bg-card border border-warm rounded-card shadow-card ' to contain 'border-border-card'`.

- [ ] **Step 8: Rewrite `Card`.**
  Replace the whole of `ui/src/ui/Card.tsx` with:

  ```tsx
  import type { HTMLAttributes } from 'react'

  /** §4.4 — the radii a card actually takes, by role. */
  const RADIUS = {
    card: 'rounded-card',        // 16px — rows, list cards, sub-panels
    feature: 'rounded-feature',  // 20px — the department card, a wide modal
    tile: 'rounded-tile',        // 14px — KPI card, stat card, filter bar
    doc: 'rounded-doc',          // 18px — summary card, the table shell
    control: 'rounded-button',   // 12px — a card inside a drawer
  } as const

  /** §5.2 — the interiors the design uses. `none` is for a card that is a shell. */
  const PADDING = {
    none: '',
    tight: 'p-s8',     // 16px — a sub-card inside a dialog
    card: 'p-s9',      // 18px — the sub-panel, the default
    feature: 'p-s10',  // 22px — the department card
  } as const

  /**
   * One card recipe: #fff, a 1px rgba(42,29,94,.07) hairline and the two-layer
   * neutral shadow, because the whole app sits on #2A1D5E and that shadow is
   * what reads on it (§4.2, 25 uses; §4.3, 46 uses).
   *
   * There is no `onDark`. The design system's cream-card-on-a-dark-screen idiom
   * is drawn by neither deliverable, and its two shadows are dead — ledger L-14.
   */
  export function Card({
    className = '', radius = 'card', padding = 'none', hoverLift = false, ...props
  }: HTMLAttributes<HTMLDivElement> & {
    radius?: keyof typeof RADIUS
    padding?: keyof typeof PADDING
    hoverLift?: boolean
  }) {
    // §4.6 — the one hover the design gives a surface: -2px, a deeper shadow and
    // a #C9B8EC border, over .16s. Two surfaces use it: the department card and
    // the process row.
    const lift = hoverLift
      ? 'transition hover:-translate-y-lift hover:shadow-card-hover hover:border-border-pick'
      : ''
    return (
      <div
        className={`bg-card border border-border-card shadow-card ${RADIUS[radius]} ${PADDING[padding]} ${lift} ${className}`}
        {...props}
      />
    )
  }
  ```

- [ ] **Step 9: Run it, check nothing that used `Card` broke, commit.**
  `cd ui && npx vitest run`
  Expected: the whole suite green. `ui/src/ui/states/index.tsx` renders `Card`
  with `p-8`, which still wins over the new `padding="none"` default, so the
  state cards are unchanged until Step 19.
  ```
  git add ui/src/ui/Card.tsx ui/src/ui/primitives.design.test.tsx
  git commit -m "fix(ui): one card recipe, and the lift the design gives it"
  ```

- [ ] **Step 10: Confirm the control geometry this field needs is already named — do not mint it.**
  §5.2 states control geometry the 14-step spacing scale
  (4·5·6·8·10·12·14·16·18·22·26·30·38·40) does not hold. It was named **once**, in
  the single minting pass, ahead of this task and deliberately so — several
  primitives are built in parallel and a mint from inside one clobbers the others.
  **This step adds nothing to any file.** It confirms what is there and stops if
  it is not.

  Nine tokens in `ui/src/styles/tokens.css`: `--pad-modal` 24px (the scrim's
  inset around a dialog), `--pad-search-y` 13px, `--pad-search-x` 44px (both
  sides, as S1 writes it), `--pad-search-x-dialog` 42px, `--pad-search-y-menu`
  9px, `--pad-search-x-menu` 34px, `--inset-search-icon-dialog` 14px
  (`--inset-search-icon` 15px is the large one), `--inset-search-icon-menu` 11px,
  `--size-search-glyph` 17px.

  Their theme keys are in `ui/tailwind.config.js`, and **where** matters. The
  three search-icon offsets are on `theme.extend.inset`, **not** `spacing` — an
  inset is not a padding, `p-search-icon-menu` would be a class with no meaning,
  and it is `inset` that makes `start-search-icon` logical so RTL is structural.
  And `tile` / `iconbtn` / `fab` on **both** `width` and `height` point at
  `var(--role-…)`, not at the panel's pixel number, so they are 48/40/52 in the
  panel and 54/42/56 in the reader without a call site knowing which surface it
  is in (R3).

  ```bash
  cd ui
  grep -c -- '--pad-modal:\|--pad-search-y:\|--pad-search-x:\|--pad-search-x-dialog:\|--pad-search-y-menu:\|--pad-search-x-menu:\|--inset-search-icon-dialog:\|--inset-search-icon-menu:\|--size-search-glyph:' src/styles/tokens.css
  node --input-type=module -e "import c from './tailwind.config.js';const t=c.theme.extend;
  const need={spacing:['modal','search-y','search-x','search-x-dialog','search-y-menu','search-x-menu'],
    inset:['search-icon','search-icon-dialog','search-icon-menu'],
    width:['search-glyph','tile','iconbtn','fab'],height:['search-glyph','tile','iconbtn','fab']};
  for(const[k,v]of Object.entries(need))for(const n of v)if(!(n in (t[k]||{})))console.log('MISSING',k,n);
  for(const k of ['width','height'])for(const n of ['tile','iconbtn','fab'])
    if(!/^var\(--role-/.test(t[k][n]||''))console.log('NOT ROLE-SCALED',k,n,t[k][n]);
  console.log('checked')"
  ```
  Expected: `9`, then `checked` and nothing else — no `MISSING`, no
  `NOT ROLE-SCALED`. `ui/tailwind-probe.txt` already names the twelve utilities
  these produce (`p-modal py-search-y px-search-x px-search-x-dialog
  py-search-y-menu ps-search-x-menu pe-s6 start-search-icon
  start-search-icon-dialog start-search-icon-menu w-search-glyph
  h-search-glyph`), which is why Task 2's probe scan already certifies them.

  **If anything is missing, stop and report it. Do not add it here.**
  `tokens.css`, `tailwind.config.js` and `tailwind-probe.txt` are frozen after the
  single minting pass (`.superpowers/sdd/mint-spec.md`). Minting from inside a
  primitive task is the unreachable-token failure this rebuild exists to end, and
  it buries the new name in a component's commit where no one reviewing the theme
  will ever see it.

- [ ] **Step 11: Write the failing test for `SearchField`.**
  Append to `ui/src/ui/primitives.design.test.tsx`:

  ```tsx
  import { SearchField } from './SearchField'
  import { SurfaceProvider } from './surface'

  describe('P6 — the search field is the design’s search field', () => {
    const noop = () => {}

    it('has the 1.5px control border, the 13px radius and the coral focus', () => {
      render(<SearchField label="جست‌وجو" value="" onChange={noop} />)
      const cls = screen.getByLabelText('جست‌وجو').className
      expect(cls).toContain('border-hairline')   // 1.5px, not 1px
      expect(cls).toContain('border-line')
      expect(cls).toContain('rounded-search')    // 13px, not --radius-control 10px
      expect(cls).toContain('focus:border-coral')
      // §4.6 — no glow, no ring, no outline. The border IS the focus.
      expect(cls).toContain('outline-none')
    })

    it('scales with the surface, not with a prop', () => {
      const { container } = render(
        <SurfaceProvider surface="reader">
          <SearchField label="جست‌وجو" value="" onChange={noop} />
        </SurfaceProvider>,
      )
      expect(container.querySelector('input')?.className).toContain('text-role-dense')
    })

    it('takes its place in the composition, and that is all `place` means', () => {
      render(<SearchField label="ج" value="" onChange={noop} place="menu" />)
      const cls = screen.getByLabelText('ج').className
      expect(cls).toContain('py-search-y-menu')
      expect(cls).toContain('rounded-control')
    })
  })
  ```

- [ ] **Step 12: Run it and see it fail.**
  `cd ui && npx vitest run src/ui/primitives.design.test.tsx`
  Expected: three failures, the first
  `expected 'min-h-touch w-full px-4 rounded-control border border-line bg-card text-body text-ink' to contain 'border-hairline'`.

- [ ] **Step 13: Rewrite `SearchField`.**
  Replace the whole of `ui/src/ui/SearchField.tsx` with:

  ```tsx
  import { useId } from 'react'

  /**
   * §5.2 — the design gives the field three scales, and they are not densities:
   * they are where it sits. A screen-level field, a field inside a dialog, and
   * the little one inside a dropdown's popover are three different compositions,
   * and the shell cannot know which one a caller is building (F8 puts *density*
   * on the shell, and the surface still scales the type below).
   */
  const PLACE = {
    screen: 'py-search-y px-search-x rounded-search',
    dialog: 'py-s6 px-search-x-dialog rounded-button',
    menu: 'py-search-y-menu ps-search-x-menu pe-s6 rounded-control',
  } as const

  const ICON = {
    screen: 'start-search-icon w-search-glyph h-search-glyph',
    dialog: 'start-search-icon-dialog w-s8 h-s8',
    menu: 'start-search-icon-menu w-s7 h-s7',
  } as const

  export function SearchField({
    label, value, onChange, placeholder, place = 'screen',
  }: {
    label: string
    value: string
    onChange: (v: string) => void
    placeholder?: string
    place?: keyof typeof PLACE
  }) {
    const id = useId()
    return (
      <div className="flex flex-col gap-1">
        {/* F11 — bound label. The mockups use placeholders alone, which vanish on
            focus and are not announced as names. */}
        <label htmlFor={id} className="text-caption font-bold text-muted">{label}</label>
        <div className="relative">
          <input
            id={id}
            type="search"
            value={value}
            placeholder={placeholder}
            onChange={(e) => onChange(e.target.value)}
            // §4.3 — 1.5px #E3D8F5 on every control and input; §4.6 — focus is
            // border-color:#FA5A52 and nothing else, 15 declarations out of 15.
            // The type size comes from the surface (R3): 13px panel, 14.5 reader.
            className={`min-h-touch w-full border-hairline border-line bg-card text-role-dense text-ink outline-none focus:border-coral transition ${PLACE[place]}`}
          />
          {/* §8 — the magnifier is pinned to the inline start. The design writes
              it as a physical `right`, which is the same edge in an app whose
              html is direction:rtl and which never runs ltr. */}
          <svg
            aria-hidden
            className={`absolute top-1/2 -translate-y-1/2 pointer-events-none text-faint ${ICON[place]}`}
            viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
            strokeLinecap="round" strokeLinejoin="round"
          >
            <circle cx="11" cy="11" r="7" />
            <path d="m21 21-4.3-4.3" />
          </svg>
        </div>
      </div>
    )
  }
  ```

- [ ] **Step 14: Confirm the surface-scaled type roles are already named — do not mint them.**
  Four `fontSize` keys change with the surface: `role-body` (14px panel / 15px
  reader), `role-dense` (13 / 14.5), `role-title` (22 / 30) and `role-hero`
  (34 / 26). Everything else in that scale is a fixed step; these four **are** the
  scale layer of R3. They were minted once with the rest, and
  `ui/tailwind-probe.txt` already names `text-role-body text-role-dense
  text-role-title text-role-hero`. **This step adds nothing to any file.**

  ```bash
  cd ui
  node --input-type=module -e "import c from './tailwind.config.js';
  const f=c.theme.extend.fontSize||{};
  for(const n of ['role-body','role-dense','role-title','role-hero'])
    if(!/^var\(--role-fs-/.test(f[n]||''))console.log('MISSING OR NOT ROLE-BACKED',n,f[n]);
  console.log('checked')"
  grep -c 'text-role-body' tailwind-probe.txt
  ```
  Expected: `checked` with no line before it, then `1`.

  **If one is missing, stop and report it** — never add it to
  `tailwind.config.js`. See Step 10 for why.

- [ ] **Step 15: Run it and see it pass, then commit.**
  `cd ui && npx vitest run src/ui/primitives.design.test.tsx && npx vitest run`
  Expected: the new block green and the whole suite green. `screens/SignIn.tsx`
  and the other hand-rolled inputs are untouched — they are Tasks 18 and 21.
  ```
  git add ui/src/ui/SearchField.tsx ui/src/ui/primitives.design.test.tsx
  git commit -m "fix(ui): the search field takes the design's border, radius and coral focus"
  ```
  `ui/src/styles/tokens.css`, `ui/tailwind.config.js` and `ui/tailwind-probe.txt`
  are **not** in this commit and must not be. Steps 10 and 14 changed no file, and
  a frozen path riding along in a primitive's commit is exactly how a mint escapes
  review.

- [ ] **Step 16: Write the failing test for `Overlay`.**
  Append to `ui/src/ui/Overlay.test.tsx`:

  ```tsx
  describe('P3 — Overlay is as capable as the dialog the design draws', () => {
    it('carries a subtitle, an icon and a footer', () => {
      render(
        <Dialog open onClose={() => {}} title="کاربر جدید"
          subtitle="حساب تازه‌ای بسازید"
          icon={<svg data-testid="dlg-icon" />}
          footer={<button>ذخیره</button>}
        >
          <p>بدنه</p>
        </Dialog>,
      )
      expect(screen.getByText('حساب تازه‌ای بسازید')).toBeTruthy()
      expect(screen.getByTestId('dlg-icon')).toBeTruthy()
      expect(screen.getByRole('button', { name: 'ذخیره' })).toBeTruthy()
    })

    it('takes one of the five widths the design uses, 520px by default', () => {
      const { container, rerender } = render(
        <Dialog open onClose={() => {}} title="ت"><p>ب</p></Dialog>,
      )
      expect(container.querySelector('[role="dialog"]')?.className).toContain('max-w-dialog')
      rerender(<Dialog open onClose={() => {}} title="ت" width="wide"><p>ب</p></Dialog>)
      expect(container.querySelector('[role="dialog"]')?.className).toContain('max-w-dialog-wide')
    })

    it('blurs the scrim only when asked — the export dialog is the one case', () => {
      const { container, rerender } = render(
        <Dialog open onClose={() => {}} title="ت"><p>ب</p></Dialog>,
      )
      expect(container.firstElementChild?.className).not.toContain('backdrop-blur-scrim')
      rerender(<Dialog open onClose={() => {}} title="ت" blurScrim><p>ب</p></Dialog>)
      expect(container.firstElementChild?.className).toContain('backdrop-blur-scrim')
    })

    it('is the design’s dialog: 24px radius, 26px interior, the two-layer shadow', () => {
      const { container } = render(
        <Dialog open onClose={() => {}} title="ت"><p>ب</p></Dialog>,
      )
      const cls = container.querySelector('[role="dialog"]')!.className
      expect(cls).toContain('rounded-panel')     // ledger L-04 — 24px, always
      expect(cls).toContain('p-s11')             // 26px
      expect(cls).toContain('shadow-modal')      // Task 3 re-cut it to two layers
      expect(cls).toContain('border-border-card')
    })

    it('becomes a bottom sheet at the design’s breakpoint, not Tailwind’s md', () => {
      const { container } = render(
        <Dialog open onClose={() => {}} title="ت"><p>ب</p></Dialog>,
      )
      expect(container.firstElementChild?.className).toContain('max760:items-end')
      expect(container.querySelector('[role="dialog"]')?.className)
        .toContain('max760:rounded-b-none')
    })

    it('titles at 18px/800 — one dialog title size (ledger L-16)', () => {
      render(<Dialog open onClose={() => {}} title="کاربر جدید"><p>ب</p></Dialog>)
      const h = screen.getByRole('heading', { name: 'کاربر جدید' })
      expect(h.className).toContain('text-fs-dialog')
      expect(h.className).toContain('font-extrabold')
    })
  })
  ```

- [ ] **Step 17: Run it and see it fail.**
  `cd ui && npx vitest run src/ui/Overlay.test.tsx`
  Expected: six failures; the first is a TypeScript-level rejection of the
  `subtitle` prop at runtime — `Unable to find an element with the text:
  حساب تازه‌ای بسازید`.

- [ ] **Step 18: Widen `Overlay`.**
  In `ui/src/ui/Overlay.tsx`, replace the `OverlayProps` interface, the
  `Overlay` signature, the `shape` constant, the returned markup and the two
  exported wrappers — i.e. everything from line 29 to the end of the file — with:

  ```tsx
  /** §3.3 — the five dialog widths S1 uses. 520px is the standard dialog. */
  const WIDTH = {
    wide: 'max-w-dialog-wide',  // 640 — conflict inbox
    lg: 'max-w-dialog-lg',      // 540 — change supervisor
    md: 'max-w-dialog',         // 520 — new user, views
    sm: 'max-w-dialog-sm',      // 460 — confirm content
    xs: 'max-w-dialog-xs',      // 440 — confirm comment
  } as const

  interface OverlayProps {
    open: boolean
    onClose: () => void
    title: string
    children: ReactNode
    /** §5.2 — 12.5px #8a7db0 at lh 1.8. Every screen and dialog explains itself. */
    subtitle?: ReactNode
    /** A leading node in the header — an inline SVG today, <Icon/> from Task 11. */
    icon?: ReactNode
    /** A pinned action bar. Its children go `flex:1`, as the design's do. */
    footer?: ReactNode
    /** §3.3 — one of the five widths. Ignored by `sheet`, which is 340px. */
    width?: keyof typeof WIDTH
    /** §4.5 — `blur(3px)`. The export dialog is the only case in the design. */
    blurScrim?: boolean
    /** 'dialog' centres above the breakpoint; 'sheet' anchors to the inline start. */
    presentation?: 'dialog' | 'sheet'
  }

  function Overlay({
    open, onClose, title, children, subtitle, icon, footer,
    width = 'md', blurScrim = false, presentation = 'dialog',
  }: OverlayProps) {
    const box = useRef<HTMLDivElement>(null)
    const restoreTo = useRef<HTMLElement | null>(null)
    const identity = useRef(Symbol('overlay')).current
    const titleId = useId()
    const [depth, setDepth] = useState(0)

    useEffect(() => {
      if (!open) return
      restoreTo.current = document.activeElement as HTMLElement | null

      if (openOverlays.length === 0) {
        savedBodyOverflow = document.body.style.overflow
        document.body.style.overflow = 'hidden'
      }
      setDepth(openOverlays.length)
      openOverlays = [...openOverlays, identity]
      pushDismissible(identity)

      box.current?.querySelector<HTMLElement>(FOCUSABLE)?.focus()

      return () => {
        openOverlays = openOverlays.filter((id) => id !== identity)
        popDismissible(identity)
        if (openOverlays.length === 0) {
          document.body.style.overflow = savedBodyOverflow ?? ''
        }
        // FIX 6 — a delete confirmation's trigger is often the row it just deleted;
        // focusing a detached element is a silent no-op in some browsers but not
        // guaranteed, so check it's still attached before trying.
        if (restoreTo.current && document.contains(restoreTo.current)) {
          restoreTo.current.focus()
        }
      }
    }, [open, identity])

    useEffect(() => {
      if (!open) return
      function onKey(e: KeyboardEvent) {
        // FIX 2 / I7 — with dismissibles stacked (Overlay or Menu), only the
        // topmost responds.
        if (!isTopDismissible(identity)) return

        if (e.key === 'Escape') { onClose(); return }
        if (e.key !== 'Tab' || !box.current) return
        // F11 — Tab wraps inside the overlay rather than escaping to the page behind it.
        const items = Array.from(box.current.querySelectorAll<HTMLElement>(FOCUSABLE))
        const first = items[0]
        const last = items[items.length - 1]
        const active = document.activeElement

        // FIX 1 — a mousedown on non-focusable chrome (the title, the padding) blurs
        // to <body>, which is neither `first` nor `last`.
        if (!box.current.contains(active)) {
          e.preventDefault()
          ;(e.shiftKey ? last : first).focus()
          return
        }
        if (!e.shiftKey && active === last) { e.preventDefault(); first.focus() }
        if (e.shiftKey && active === first) { e.preventDefault(); last.focus() }
      }
      document.addEventListener('keydown', onKey)
      return () => document.removeEventListener('keydown', onKey)
    }, [open, onClose, identity])

    if (!open) return null

    // §5.2 — above 760px a centred dialog at one of five widths; at or below it,
    // every modal in the design becomes a bottom sheet: the scrim loses its
    // padding and aligns to the end, the box goes full width, 92vh tall, and
    // rounds only its top corners. The breakpoint is the design's 760px, not
    // Tailwind's md (768px), which is what this used before.
    const shape =
      presentation === 'sheet'
        ? 'md:w-[var(--width-drawer)] md:h-full md:max-h-none md:me-auto md:ms-0 max-h-[88vh]'
        : `${WIDTH[width]} max-h-[86vh] max760:max-w-full max760:max-h-[92vh]`

    return (
      <div
        className={`fixed inset-0 flex items-center justify-center bg-scrim p-modal max760:p-0 max760:items-end ${blurScrim ? 'backdrop-blur-scrim' : ''}`}
        style={{ zIndex: 50 + depth * 10 }}
        onMouseDown={(e) => { if (e.target === e.currentTarget) onClose() }}
      >
        <div
          ref={box}
          role="dialog"
          aria-modal="true"
          aria-labelledby={titleId}
          className={`bg-card border border-border-card shadow-modal overflow-auto p-s11 w-full rounded-panel max760:rounded-b-none ${shape}`}
        >
          <div className="flex items-start gap-s6 mb-s8">
            {icon}
            <div className="flex-1 min-w-0">
              {/* Ledger L-16 — 18px/800, the one dialog title size. */}
              <h2 id={titleId} className="text-fs-dialog font-extrabold text-ink m-0">{title}</h2>
              {subtitle && (
                <p className="text-fs-sm2 text-muted leading-sub mt-half mb-0 [text-wrap:pretty]">{subtitle}</p>
              )}
            </div>
            {/* Ledger L-23 — one close button: 32x32, --tile-v2, 9px radius. */}
            <IconButton label="بستن" icon={<CloseIcon />} onClick={onClose}
              className="w-close h-close bg-tile-v2 rounded-tool text-muted" />
          </div>
          {children}
          {footer && (
            // §5.2 — "two equal buttons" is the footer's doing here, not every
            // caller's: gap 10px, each child flex:1.
            <div className="flex gap-s5 mt-s10 [&>*]:flex-1">{footer}</div>
          )}
        </div>
      </div>
    )
  }

  export function Dialog(props: Omit<OverlayProps, 'presentation'>) {
    return <Overlay {...props} presentation="dialog" />
  }

  export function Sheet(props: Omit<OverlayProps, 'presentation' | 'width'>) {
    return <Overlay {...props} presentation="sheet" />
  }
  ```

- [ ] **Step 19: Run it and see it pass, then commit.**
  `cd ui && npx vitest run src/ui/Overlay.test.tsx`
  Expected: the whole file green, the six new tests included, and the existing
  focus-trap, Escape-stack, scroll-lock and focus-restore tests untouched.
  If `IconButton` rejects `className`, add `className?: string` to its props and
  append it to its own class string — that is the only change permitted to it here.
  ```
  git add ui/src/ui/Overlay.tsx ui/src/ui/Overlay.test.tsx ui/src/ui/IconButton.tsx
  git commit -m "feat(ui): the dialog primitive gains what five screens went around it to get"
  ```

- [ ] **Step 20: Bring `states/` onto the scale and make its own docstring true.**
  In `ui/src/test/guards.test.ts`, extend the F4/F8 exception list — the same
  named-exception pattern `Button.tsx` already uses:

  ```ts
    // `variant` on EmptyState selects a *visual form* the design defines —
    // a card, a dashed block, a line inside a table — not a density. Named here
    // rather than loosening the pattern for every file, exactly as Button's
    // colour `variant` is.
    const EXCEPTIONS = ['src/ui/Button.tsx', 'src/ui/states/index.tsx']
  ```

  In `ui/src/ui/states/index.tsx` make five edits:

  - line 11 — `className="h-16 rounded-card bg-tile-v2 animate-pulse"` becomes
    `className="h-s16 rounded-card bg-tile-v2 animate-pulse"` (40px, a step on
    the scale; 64px is on no scale).
  - replace `EmptyState` with:

    ```tsx
    /** §5.2 — the design gives emptiness three forms, by what contains it. */
    const EMPTY = {
      card: 'p-s12 text-center',      // 48px 20px inside a card on a screen
      dashed: 'p-s9 text-center border border-dashed border-line rounded-tile bg-card',
      inline: 'py-s16 px-s10 text-center', // 44px 20px inside a table or a drawer
    } as const

    export function EmptyState({ title, hint, variant = 'card' }: {
      title: string
      hint?: string
      variant?: keyof typeof EMPTY
    }) {
      // "Emptiness is a fact, not an apology" — the copy rule is the caller's;
      // the shape is this component's.
      const body = (
        <>
          <p className="text-subtitle font-bold text-ink m-0">{title}</p>
          {hint && <p className="text-fs-sm text-faint mt-s1 mb-0 leading-relaxed">{hint}</p>}
        </>
      )
      if (variant === 'card') return <Card className={EMPTY.card}>{body}</Card>
      return <div className={EMPTY[variant]}>{body}</div>
    }
    ```

  - in `ErrorState`, `DeniedState` and `NotFoundState`, replace `className="p-8 text-center"`
    with `className="p-s12 text-center"` (30px — the scale steps 30 → 38, and 32
    is between them), replace `mt-2` with `mt-s2` and `mt-4` with `mt-s7`, and
    delete the `className="px-4"` from the retry `Button`, replacing it with
    `className="px-s8"`.
  - in `LoadFailedScreen`, replace
    `className="flex-1 overflow-auto py-s12 px-s12"` with
    `className="flex-1 overflow-auto py-screen-y px-screen-x"` — the docstring
    says it is *"laid out like `RefusalScreen`, because it stands in the same
    place"*, and until now it stood at a 30px gutter where the refusal stands at
    40px. `--pad-screen-x` is what both mean.

- [ ] **Step 21: Run everything, build, prove every class these five files write emits.**
  ```bash
  cd ui && npx vitest run && npx tsc -b && npx eslint .
  ```
  Expected: all three exit 0. Then:
  ```bash
  cd ui && npx vite build
  node scripts/harvest-classes.mjs src/ui/Button.tsx src/ui/Card.tsx src/ui/Overlay.tsx src/ui/SearchField.tsx src/ui/IconButton.tsx src/ui/states/index.tsx
  ```
  Expected: the run ends `DEAD 0   EMPTY 0   NOVAR 0`, both controls hold
  (`control (negative): N/N invented names reported dead` and
  `control (escaping): … escaped variant classes unescaped`), and the last line
  is `PASS`. The script exits 1 on any failure, so it can be `&&`-chained.
  The class list is **harvested out of these files**, never hand-kept, so it
  cannot drift from what they write and `tailwind-probe.txt` cannot certify it
  on their behalf — see *The class-emission check* in Global Constraints for the
  measurement that retired the old grep.

  Measured on the built primitives: **156 classes come back `ok`, 0 dead.** The
  hand-kept list this step used to carry held 33 of them — it missed 123,
  `max760:max-h-[92vh]`, `min-h-touch`, `before:-inset-[6px]`, `bg-scrim` and
  `md:w-[var(--width-drawer)]` among them — and its `Expected:` line said 31,
  which is not even the length of its own list. Worse, it escaped each name for a
  regex and so printed `MISS` for **all eleven of its variant classes**
  (`disabled:*`, `enabled:hover:brightness-105`, `hover:-translate-y-lift`,
  `hover:shadow-card-hover`, `hover:border-border-pick`, `max760:items-end`,
  `max760:rounded-b-none`, `focus:border-coral`) on a build where every one was
  present: the CSS holds `.disabled\:opacity-60`, and the pattern asked for
  `.disabled:opacity-60`.

  **A failure.** `DEAD` — the class compiled to no rule at all; that is a **typo
  in the component**, so fix the class string, rebuild, re-run. `EMPTY` — the
  selector emitted with an empty body, so the theme key resolves to nothing.
  `NOVAR` — the rule reads a `var(--…)` nothing declares. The last two are theme
  regressions: **stop and report them.** Do **not** add the name to
  `ui/tailwind.config.js`, `src/styles/tokens.css`, `src/styles/roles.css` or
  `tailwind-probe.txt`. All four are frozen for the duration of this plan and
  were unfrozen exactly once, by the single minting pass in
  `.superpowers/sdd/mint-spec.md`; minting one here to make a misspelling compile
  recreates the unreachable-token problem the whole rebuild exists to fix. A
  value that genuinely has no name goes into `mint-spec.md`, not into the config
  and not into this task's commit.

  **What this step cannot prove:** that these files write a class and that the
  class compiles to a rule with declarations, yes. That the class reaches the
  right element, that the element renders, that it is visible, or that its value
  is the one the design asks for — no. That stays with the Playwright checks.

- [ ] **Step 22: Write the browser check for the primitives, run it at three widths, commit.**
  Create `ui/e2e/primitives.spec.ts`:

  ```ts
  import { expect, test } from '@playwright/test'
  import { CARD_SHADOW, FOCUS, LIFT, SURFACE, serve, shadowOf, signedIn } from './_harness'

  const DEPARTMENTS = [
    { code: 'management', name: 'مدیریت', count: 4, subs: 1, conflicts: 0 },
    { code: 'accounting', name: 'حسابداری', count: 3, subs: 0, conflicts: 2 },
  ]

  const css = (page: import('@playwright/test').Page, sel: string, prop: string) =>
    page.locator(sel).first().evaluate(
      (el, p) => getComputedStyle(el).getPropertyValue(p), prop)

  test('the primitives compute to the design’s numbers in a real browser', async ({ page }) => {
    await signedIn(page)
    await serve(page, { '/api/departments': DEPARTMENTS, '/api/pending': [] })
    await page.goto('/departments')

    // The whole app sits on the deep violet field, whatever the width.
    expect(await css(page, '[data-screen="departments"]', 'background-color'))
      .toBe('rgb(42, 29, 94)')

    // A disabled button is visibly disabled and does not brighten under hover —
    // the defect jsdom could never have caught, because jsdom paints nothing.
    await page.evaluate(() => {
      const b = document.createElement('button')
      b.id = 'probe-disabled'
      b.disabled = true
      b.className =
        'bg-coral text-card shadow-coral enabled:hover:brightness-105 ' +
        'disabled:opacity-60 disabled:shadow-none disabled:cursor-default'
      document.body.append(b)
    })
    expect(await css(page, '#probe-disabled', 'opacity')).toBe('0.6')
    // `shadowOf`, never a raw compare: Tailwind 3 composes EVERY shadow utility
    // as `var(--tw-ring-offset-shadow), var(--tw-ring-shadow), var(--tw-shadow)`,
    // so Chrome serialises two fully transparent ring layers ahead of the real
    // ones and `shadow-none` computes to three transparent layers rather than to
    // the keyword. `_harness.ts`'s own docstring says both raw forms can never
    // pass. Do NOT repair a red here by pasting what the browser printed — that
    // writes Tailwind's ring scaffolding into the design's ledger.
    expect(shadowOf(await css(page, '#probe-disabled', 'box-shadow'))).toBe('none')
    expect(await css(page, '#probe-disabled', 'cursor')).toBe('default')
    await page.locator('#probe-disabled').hover({ force: true })
    expect(await css(page, '#probe-disabled', 'filter')).toBe('none')

    // The focus idiom: a coral border and no ring, glow or outline.
    await page.evaluate(() => {
      const i = document.createElement('input')
      i.id = 'probe-focus'
      i.className = 'border-hairline border-line rounded-search outline-none focus:border-coral'
      document.body.append(i)
    })
    await page.locator('#probe-focus').focus()
    expect(await css(page, '#probe-focus', 'border-top-color')).toBe(FOCUS)
    expect(await css(page, '#probe-focus', 'border-top-width')).toBe('1.5px')
    expect(await css(page, '#probe-focus', 'border-top-left-radius')).toBe('13px')
    expect(await css(page, '#probe-focus', 'box-shadow')).toBe('none')

    // The card recipe and its lift.
    await page.evaluate(() => {
      const d = document.createElement('div')
      d.id = 'probe-card'
      d.textContent = 'کارت'
      d.className =
        'bg-card border border-border-card shadow-card rounded-card ' +
        'transition hover:-translate-y-lift hover:shadow-card-hover'
      document.body.append(d)
    })
    expect(await css(page, '#probe-card', 'background-color')).toBe(SURFACE)
    expect(await css(page, '#probe-card', 'border-top-color')).toBe('rgba(42, 29, 94, 0.07)')
    expect(shadowOf(await css(page, '#probe-card', 'box-shadow'))).toBe(CARD_SHADOW)
    expect(await css(page, '#probe-card', 'transition-duration')).toBe('0.16s')
    await page.locator('#probe-card').hover()
    await expect.poll(() => css(page, '#probe-card', 'transform')).toBe(LIFT)
  })
  ```

  `cd ui && npx playwright test`
  Expected: `6 passed` — the departments check and the primitives check, each at
  `w1440`, `w1080` and `w760`.
  ```
  git add ui/src/ui/states/index.tsx ui/src/test/guards.test.ts ui/e2e/primitives.spec.ts
  git commit -m "fix(ui): the state screens stand where they claim to, and the primitives are measured in a browser"
  ```

---
### Task 7: `TextField`, `PasswordField`

The app has no field component at all, and the audit counted **25 hand-rolled
`<input>`/`<textarea>` elements across 13 files** (P2). That is not carelessness:
`SearchField` is the only input primitive, the design's `invalid` and `hint` states do
not exist to be reused, so every form invented its own. This task builds the field once,
with the border carrying the whole state machine.

**Files:**
- Create: `ui/src/ui/fieldFrame.ts`, `ui/src/ui/TextField.tsx`, `ui/src/ui/PasswordField.tsx`, `ui/src/ui/fields.test.tsx`
- Modify: `ui/src/test/guards.test.ts` (one line: `TextField.tsx` joins the `dir=` island list)

**Interfaces:**

- Consumes:
  - `useSurface(): 'panel' | 'reader'` and `SurfaceProvider` (props `{ value: 'panel' | 'reader'; children: ReactNode }`) from `ui/src/ui/surface.tsx` (Task 5).
  - Task 2's utilities. Every one is the theme key Task 2 registered, with its
    Tailwind prefix — **named by role, never by size**. `tailwind.config.js` is frozen
    and `guards.test.ts` bans `text-[`, `rounded-[` and the t-shirt names, so a class
    invented from a pixel value compiles to nothing while the build still exits 0.
    The ones this task uses:

    | utility | resolves to | source |
    |---|---|---|
    | `text-fs-lg` `text-fs-body` `text-fs-sm` `text-fs-sm2` `text-fs-xs` | `15px` `14px` `13px` `12.5px` `11.5px` | `--fs-lg` `--fs-body` `--fs-sm` `--fs-sm2` `--fs-xs` |
    | `rounded-button` `rounded-tool` | `12px` `9px` | `--radius-md` `--radius-sm` |
    | `border-hairline` | `1.5px` | `--border-hairline` (already in the theme) |
    | `border-line` `border-coral` `border-conflict` | `#E3D8F5` `#FA5A52` `#E23D35` | `--line` `--coral` `--conflict` |
    | `bg-card` `text-ink` `text-violet` `text-faint` `text-muted` `text-conflict` | `#FFFFFF` `#2A1D5E` `#4A25A9` `#a99fc4` `#8a7db0` `#E23D35` | already in the theme |
    | `bg-surface-sub` | `#FBF9FE` | `--surface-sub` — §1.2's sub-panel surface, 24 uses in S1 |
    | `bg-tile-v2` | `#F4EFFB` | `--tile-v2` |
    | `transition` `transition-[border-color]` | `.16s` | `--duration`, which Task 2 registers as `transitionDuration.DEFAULT`; every `transition-*` utility already carries it and there is no `duration-*` class for it |

- Produces:
  - `ui/src/ui/fieldFrame.ts`
    - `FIELD_FRAME: string` — the class string every field shares.
    - `fieldScale(surface: 'panel' | 'reader'): { text: string; pad: string; padReveal: string; label: string }`
  - `ui/src/ui/TextField.tsx`
    - `interface TextFieldProps { label: string; value: string; onChange: (next: string) => void; hint?: string; invalid?: boolean; multiline?: boolean; rows?: number; type?: 'text' | 'email' | 'tel' | 'url'; ltr?: boolean; placeholder?: string; autoComplete?: string; disabled?: boolean; required?: boolean; name?: string; id?: string; className?: string }`
    - `function TextField(props: TextFieldProps): JSX.Element`
  - `ui/src/ui/PasswordField.tsx`
    - `interface PasswordFieldProps { label: string; value: string; onChange: (next: string) => void; hint?: string; invalid?: boolean; autoComplete?: 'current-password' | 'new-password'; name?: string; id?: string; className?: string }`
    - `function PasswordField(props: PasswordFieldProps): JSX.Element`
  - **No `size` prop.** The design's `TextField` has `size='sm'|'md'|'lg'`; R3 puts scale on
    the surface instead, and `guards.test.ts:164` forbids a size prop on a shared component.
  - The eye / eye-off SVGs are inlined here and **folded into `Icon` by Task 11, step 8.**

- [ ] **Step 1: Write the failing test**

Create `ui/src/ui/fields.test.tsx`:

```tsx
import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { ReactNode } from 'react'
import { SurfaceProvider } from './surface'
import { TextField } from './TextField'
import { PasswordField } from './PasswordField'

function on(surface: 'panel' | 'reader', node: ReactNode) {
  return render(<SurfaceProvider surface={surface}>{node}</SurfaceProvider>)
}

describe('TextField', () => {
  it('binds a real label to the control', () => {
    // F11 — the design labels its fields with a placeholder in several places;
    // a placeholder vanishes on focus and is not announced as a name.
    on('panel', <TextField label="نام و نام خانوادگی" value="" onChange={() => {}} />)
    expect(screen.getByLabelText('نام و نام خانوادگی')).toBeInTheDocument()
  })

  it('reports every keystroke', async () => {
    const seen: string[] = []
    on('panel', <TextField label="نام" value="" onChange={(v) => seen.push(v)} />)
    await userEvent.type(screen.getByLabelText('نام'), 'سحر')
    expect(seen.join('')).toBe('سحر')
  })

  it('rests on the control border and turns coral on focus', () => {
    on('panel', <TextField label="نام" value="" onChange={() => {}} />)
    const el = screen.getByLabelText('نام')
    expect(el).toHaveClass('border-hairline', 'border-line', 'focus:border-coral')
    expect(el.className).not.toMatch(/\bring-|\boutline-/)
  })

  it('lets invalid beat focus, and turns the hint into the error line', () => {
    // §5.1.5 — invalid wins over focus, so a field that is wrong stays red while
    // it is being fixed rather than looking accepted the moment it is touched.
    on('panel', <TextField label="نام" value="" onChange={() => {}} invalid hint="این نام قبلاً گرفته شده است" />)
    const el = screen.getByLabelText('نام')
    expect(el).toHaveClass('border-conflict', 'focus:border-conflict')
    expect(el).toHaveAttribute('aria-invalid', 'true')
    const hint = screen.getByText('این نام قبلاً گرفته شده است')
    expect(hint).toHaveClass('text-conflict', 'font-semibold')
    expect(el).toHaveAttribute('aria-describedby', hint.id)
  })

  it('keeps a neutral hint neutral', () => {
    on('panel', <TextField label="نام" value="" onChange={() => {}} hint="نام کامل، همان‌طور که در فیش حقوقی آمده" />)
    expect(screen.getByText('نام کامل، همان‌طور که در فیش حقوقی آمده')).toHaveClass('text-faint')
  })

  it('reads at 14px in the panel and 15px in the reader', () => {
    // R3 — the only thing that moves between the two surfaces is the type size.
    const { unmount } = on('panel', <TextField label="نام" value="" onChange={() => {}} />)
    expect(screen.getByLabelText('نام')).toHaveClass('text-fs-body')
    unmount()
    on('reader', <TextField label="نام" value="" onChange={() => {}} />)
    expect(screen.getByLabelText('نام')).toHaveClass('text-fs-lg')
  })

  it('renders a textarea on the tinted surface when multiline', () => {
    on('panel', <TextField label="توضیح" value="" onChange={() => {}} multiline rows={5} />)
    const el = screen.getByLabelText('توضیح')
    expect(el.tagName).toBe('TEXTAREA')
    expect(el).toHaveAttribute('rows', '5')
    expect(el).toHaveClass('bg-surface-sub', 'resize-y')
  })

  it('pins a latin island LTR and sets it in mono', () => {
    // §8 — usernames, ids and IPs are the only latin runs in an RTL app.
    on('panel', <TextField label="نام کاربری" value="" onChange={() => {}} ltr />)
    const el = screen.getByLabelText('نام کاربری')
    expect(el).toHaveAttribute('dir', 'ltr')
    expect(el).toHaveClass('font-mono')
  })
})

describe('PasswordField', () => {
  it('hides the value until the reveal is pressed, and says which state it is in', () => {
    on('panel', <PasswordField label="گذرواژهٔ فعلی" value="hunter2" onChange={() => {}} />)
    expect(screen.getByLabelText('گذرواژهٔ فعلی')).toHaveAttribute('type', 'password')
    expect(screen.getByRole('button', { name: 'نمایش گذرواژه' })).toHaveAttribute('aria-pressed', 'false')
  })

  it('reveals and re-hides', async () => {
    on('panel', <PasswordField label="گذرواژهٔ فعلی" value="hunter2" onChange={() => {}} />)
    await userEvent.click(screen.getByRole('button', { name: 'نمایش گذرواژه' }))
    expect(screen.getByLabelText('گذرواژهٔ فعلی')).toHaveAttribute('type', 'text')
    const hide = screen.getByRole('button', { name: 'پنهان کردن گذرواژه' })
    expect(hide).toHaveAttribute('aria-pressed', 'true')
    await userEvent.click(hide)
    expect(screen.getByLabelText('گذرواژهٔ فعلی')).toHaveAttribute('type', 'password')
  })

  it('reserves the inline-start room the reveal button occupies', () => {
    // §5.2 — 46px of padding-inline-start for a 32×32 button pinned at left:8px.
    on('panel', <PasswordField label="گذرواژه" value="" onChange={() => {}} />)
    expect(screen.getByLabelText('گذرواژه')).toHaveClass('ps-[46px]')
  })

  it('carries the design placeholder', () => {
    on('panel', <PasswordField label="گذرواژه" value="" onChange={() => {}} />)
    expect(screen.getByLabelText('گذرواژه')).toHaveAttribute('placeholder', '••••••••')
  })
})
```

- [ ] **Step 2: Run it and watch it fail**

Run: `cd ui && npx vitest run src/ui/fields.test.tsx`
Expected: FAIL — `Failed to resolve import "./TextField" from "src/ui/fields.test.tsx"`.

- [ ] **Step 3: Write the shared frame**

Create `ui/src/ui/fieldFrame.ts`:

```ts
/**
 * The frame every field in the product shares (§5.2).
 *
 * The border carries the whole state machine and nothing else does: `1.5px`
 * `--line` at rest, `--coral` on focus, `--conflict` when invalid. There is no
 * ring, no glow and no outline — focus is `border-color:#FA5A52` in 15 of 15
 * uses in the deliverable (§4.6), and adding a ring here would be the one
 * decoration the design refuses.
 *
 * Split out of TextField.tsx so PasswordField can share it without either file
 * exporting a non-component (react-refresh/only-export-components), the same
 * reason dismissibleStack.ts sits beside Overlay.tsx rather than inside it.
 */
export const FIELD_FRAME =
  'block w-full box-border text-ink rounded-button border-hairline outline-none ' +
  'leading-[1.7] transition-[border-color]'

/**
 * R3 — the one thing that moves between the two surfaces is the type size: the
 * panel reads at 14px and the reader at 15px (§6.17). Radius, border weight,
 * focus colour and leading are shared foundations, so they are in FIELD_FRAME.
 *
 * `padReveal` exists because PasswordField cannot compose `ps-*` on top of
 * `px-*`: both resolve to `padding-right` in RTL and which one wins is decided
 * by Tailwind's output order, not by the order of the class attribute.
 */
export function fieldScale(surface: 'panel' | 'reader') {
  return surface === 'reader'
    ? {
        text: 'text-fs-lg',
        pad: 'px-[15px] py-[13px]',
        padReveal: 'ps-[46px] pe-[15px] py-[13px]',
        label: 'text-fs-sm',
      }
    : {
        text: 'text-fs-body',
        pad: 'px-[14px] py-[12px]',
        padReveal: 'ps-[46px] pe-[14px] py-[12px]',
        label: 'text-fs-sm2',
      }
}
```

- [ ] **Step 4: Write `TextField`**

Create `ui/src/ui/TextField.tsx`:

```tsx
import { useId } from 'react'
import { useSurface } from './surface'
import { FIELD_FRAME, fieldScale } from './fieldFrame'

export interface TextFieldProps {
  /** F11 — a bound label, never a placeholder standing in for one. */
  label: string
  value: string
  onChange: (next: string) => void
  /**
   * The rule statement under the control. When `invalid` it becomes the error
   * line — §4.6: "there is no field-level error style in S1; errors are stated
   * in copy: a 11.5px/600 #E23D35 line under the offending control". The design
   * system's own TextField leaves the hint neutral while invalid, which is
   * §9.11's complaint about it; this is the fix, not a deviation.
   */
  hint?: string
  invalid?: boolean
  multiline?: boolean
  rows?: number
  type?: 'text' | 'email' | 'tel' | 'url'
  /** §8 — a latin island: username, process id, IP. Pins LTR and sets mono. */
  ltr?: boolean
  placeholder?: string
  autoComplete?: string
  disabled?: boolean
  required?: boolean
  name?: string
  id?: string
  className?: string
}

export function TextField({
  label, value, onChange, hint, invalid = false, multiline = false, rows = 3,
  type = 'text', ltr = false, placeholder, autoComplete, disabled = false,
  required = false, name, id: given, className = '',
}: TextFieldProps) {
  const auto = useId()
  const id = given ?? auto
  const hintId = `${id}-hint`
  const scale = fieldScale(useSurface())
  // §5.1.5 — invalid wins over focus. A field that is wrong must not look
  // accepted the moment the cursor lands in it.
  const edge = invalid
    ? 'border-conflict focus:border-conflict'
    : 'border-line focus:border-coral'

  return (
    <div className={className}>
      <label htmlFor={id} className={`block font-semibold text-violet mb-[6px] ${scale.label}`}>
        {label}
      </label>
      {multiline ? (
        <textarea
          id={id} name={name} value={value} rows={rows} required={required}
          disabled={disabled} placeholder={placeholder}
          aria-invalid={invalid || undefined}
          aria-describedby={hint === undefined ? undefined : hintId}
          onChange={(e) => onChange(e.target.value)}
          className={`${FIELD_FRAME} ${edge} ${scale.text} ${scale.pad} bg-surface-sub resize-y`}
        />
      ) : (
        <input
          id={id} name={name} value={value} type={type} required={required}
          disabled={disabled} placeholder={placeholder} autoComplete={autoComplete}
          dir={ltr ? 'ltr' : undefined}
          aria-invalid={invalid || undefined}
          aria-describedby={hint === undefined ? undefined : hintId}
          onChange={(e) => onChange(e.target.value)}
          className={`${FIELD_FRAME} ${edge} ${scale.text} ${scale.pad} bg-card ${ltr ? 'font-mono' : ''}`}
        />
      )}
      {hint !== undefined && (
        <p
          id={hintId}
          className={`m-0 mt-[7px] text-fs-xs leading-[1.8] ${invalid ? 'font-semibold text-conflict' : 'text-faint'}`}
        >
          {hint}
        </p>
      )}
    </div>
  )
}
```

- [ ] **Step 5: Write `PasswordField`**

Create `ui/src/ui/PasswordField.tsx`:

```tsx
import { useId, useState } from 'react'
import { useSurface } from './surface'
import { FIELD_FRAME, fieldScale } from './fieldFrame'

// Folded into `Icon` by Task 11. The design names the glyph and its size
// («17×17 eye / eye-off») but ships no path for it, and InjaIcons' 33 keys have
// no eye — so these two are drawn to the set's stated construction (24×24 box,
// currentColor stroke, round caps) rather than quoted.
const EYE = <><path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7-10-7-10-7z" /><circle cx="12" cy="12" r="3" /></>
const EYE_OFF = <><path d="M10.6 6.2A9.7 9.7 0 0 1 12 6c6.4 0 10 7 10 7a17.6 17.6 0 0 1-3.4 4.3M6.6 7.7A17.6 17.6 0 0 0 2 13s3.6 7 10 7a9.6 9.6 0 0 0 4.2-.9" /><path d="M3 3l18 18" /></>

export interface PasswordFieldProps {
  label: string
  value: string
  onChange: (next: string) => void
  hint?: string
  invalid?: boolean
  autoComplete?: 'current-password' | 'new-password'
  name?: string
  id?: string
  className?: string
}

export function PasswordField({
  label, value, onChange, hint, invalid = false,
  autoComplete = 'current-password', name, id: given, className = '',
}: PasswordFieldProps) {
  const auto = useId()
  const id = given ?? auto
  const hintId = `${id}-hint`
  const [shown, setShown] = useState(false)
  const scale = fieldScale(useSurface())
  const edge = invalid
    ? 'border-conflict focus:border-conflict'
    : 'border-line focus:border-coral'

  return (
    <div className={className}>
      <label htmlFor={id} className={`block font-semibold text-violet mb-[6px] ${scale.label}`}>
        {label}
      </label>
      <div className="relative">
        <input
          id={id} name={name} value={value} autoComplete={autoComplete}
          type={shown ? 'text' : 'password'}
          placeholder="••••••••"
          aria-invalid={invalid || undefined}
          aria-describedby={hint === undefined ? undefined : hintId}
          onChange={(e) => onChange(e.target.value)}
          className={`${FIELD_FRAME} ${edge} ${scale.text} ${scale.padReveal} bg-card`}
        />
        {/* §8 — the reveal button is one of the physical pins the design keeps
            (`left:8px`) and the spec says to reproduce as written rather than
            "fix" into a logical property. `left-[8px]` rather than `left-2`
            because guards.test.ts:112 rightly refuses the latter. */}
        <button
          type="button"
          onClick={() => setShown((v) => !v)}
          aria-pressed={shown}
          aria-label={shown ? 'پنهان کردن گذرواژه' : 'نمایش گذرواژه'}
          className="absolute left-[8px] top-1/2 -translate-y-1/2 w-[32px] h-[32px] inline-flex items-center justify-center border-0 bg-transparent rounded-tool text-muted cursor-pointer hover:bg-tile-v2 hover:text-violet"
        >
          <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor"
            strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden focusable="false">
            {shown ? EYE_OFF : EYE}
          </svg>
        </button>
      </div>
      {hint !== undefined && (
        <p
          id={hintId}
          className={`m-0 mt-[7px] text-fs-xs leading-[1.8] ${invalid ? 'font-semibold text-conflict' : 'text-faint'}`}
        >
          {hint}
        </p>
      )}
    </div>
  )
}
```

- [ ] **Step 6: Declare the new `dir=` island**

In `ui/src/test/guards.test.ts`, add one entry to `ISLANDS` (currently line 135–142),
immediately after `'src/ui/IdBadge.tsx'`:

```ts
      'src/ui/IdBadge.tsx',
      // TextField pins `dir="ltr"` when its caller asks for a latin island — the
      // username on the new-user dialog, a process id, an IP. Declared here
      // rather than worked around inside the component, because the workaround
      // (spreading a `{ dir: 'ltr' }` object so the string `dir=` never appears)
      // would defeat the guard without changing the markup it exists to police.
      'src/ui/TextField.tsx',
```

- [ ] **Step 7: Run it and watch it pass**

Run: `cd ui && npx vitest run src/ui/fields.test.tsx src/test/guards.test.ts`
Expected: PASS — 12 tests in `fields.test.tsx`, 6 in `guards.test.ts`.

- [ ] **Step 8: Commit**

```
git add ui/src/ui/fieldFrame.ts ui/src/ui/TextField.tsx ui/src/ui/PasswordField.tsx ui/src/ui/fields.test.tsx ui/src/test/guards.test.ts
git commit -m "feat(ui): one field, whose border is the whole state machine"
```

- [ ] **Step 9: Run the whole suite and the type-checker**

Run: `cd ui && npx vitest run && npx tsc -b && npx eslint .`
Expected: all three exit 0. `tsc -b` is the one that catches a `TextFieldProps` field
that no caller can satisfy; `eslint .` is the one that catches a non-component export
sneaking back into a `.tsx`.

- [ ] **Step 10: Build, and prove every class the field primitives write emits**
  ```bash
  cd ui && npx vite build
  node scripts/harvest-classes.mjs src/ui/fieldFrame.ts src/ui/TextField.tsx src/ui/PasswordField.tsx
  ```
  Expected: the run ends `DEAD 0   EMPTY 0   NOVAR 0`, both controls hold
  (`control (negative): N/N invented names reported dead` and
  `control (escaping): … escaped variant classes unescaped`), and the last line
  is `PASS`. The script exits 1 on any failure, so it can be `&&`-chained.
  The class list is **harvested out of these files**, never hand-kept, so it
  cannot drift from what they write and `tailwind-probe.txt` cannot certify it
  on their behalf — see *The class-emission check* in Global Constraints for the
  measurement that retired the old grep.

  `fieldFrame.ts` is named on purpose: it is a helper module with no `className`
  attribute anywhere in it, and the scanner still judges its class strings — a
  literal holding two-or-more tokens of which at least one emits is corroborated
  as a class list. That is precisely the file a `className`-only heuristic would
  skip, and it is where the whole border state machine lives.

  Measured on the built primitives: **57 classes `ok`, 0 dead.** The hand-kept
  list this step used to carry named 20.

  **A failure.** `DEAD` — the class compiled to no rule at all; that is a **typo
  in the component**, so fix the class string, rebuild, re-run. `EMPTY` — the
  selector emitted with an empty body, so the theme key resolves to nothing.
  `NOVAR` — the rule reads a `var(--…)` nothing declares. The last two are theme
  regressions: **stop and report them.** Do **not** add the name to
  `ui/tailwind.config.js`, `src/styles/tokens.css`, `src/styles/roles.css` or
  `tailwind-probe.txt`. All four are frozen for the duration of this plan and
  were unfrozen exactly once, by the single minting pass in
  `.superpowers/sdd/mint-spec.md`; minting one here to make a misspelling compile
  recreates the unreachable-token problem the whole rebuild exists to fix. A
  value that genuinely has no name goes into `mint-spec.md`, not into the config
  and not into this task's commit.

  **What this step cannot prove:** that these files write a class and that the
  class compiles to a rule with declarations, yes. That the class reaches the
  right element, that the element renders, that it is visible, or that its value
  is the one the design asks for — no. That stays with the Playwright checks.


- [ ] **Step 11: Nothing to commit — and nothing to mint**

  Step 10 changes no file. If it was green there is nothing to add here.

  If it was **not** green, the fix is in the component, not in the theme. The old
  text here said a miss meant "Task 2 has not exposed that token yet — fix it
  there", and then staged `ui/tailwind.config.js` on its own. Do neither.
  `tailwind.config.js`, `src/styles/tokens.css`, `src/styles/roles.css` and
  `tailwind-probe.txt` are frozen after the single minting pass
  (`.superpowers/sdd/mint-spec.md`), and a `DEAD` here is a misspelled class in
  `TextField.tsx`, `PasswordField.tsx` or `fieldFrame.ts` — minting a name to make
  the misspelling compile is the unreachable-token failure this rebuild exists to
  end. If a value the field genuinely needs has no name at all, **stop and report
  it** and put it in `mint-spec.md`.

---

### Task 8: `Checkbox`, `Radio`, `Dropdown`

Three primitives replace **35 native OS controls** — rendered at two sizes 2.75× apart,
44×44 on one screen and 16×16 two files away — and **~15 hand-rolled selects**. The
design has no native `<select>` anywhere: every choice in the product is a custom
trigger-and-popover, and every tick is a green- or violet-filled square with a white
check drawn at stroke 3.

**R8 normalisations this task makes, each for the ledger:**

| The design shows | Chosen | Why |
|---|---|---|
| Tick box at 16 / 17 / 18 / 19px, radius 5 (at 16) or 6 (17–19) | **19×19, radius 6 (`w-tick` / `rounded-tick`)** | **Not this task's choice — ledger L-10 already made it.** The ladder is keyed to nesting depth, not to what the element *is*, so two sizes by role replace four by screen: 19px for a tick in a list row, 16px for a tick nested inside another option (`w-tick-nested`), and 17 and 18 normalise up to 19. L-10 is an **Owner veto** row and is still open; the value it names is the one `tokens.css` declares, and no later task may use another. |
| Row border off: `#E3D8F5` or `#EFE7DC` | **`#E3D8F5` (`--line`)** | §4.3 gives `1.5px #E3D8F5` to "every control, input, ghost button, secondary button". A checkbox row is a control. |
| Row background on: `#F8F4FE` or `#F0E9FB` | **`#F8F4FE` (`--tile-v4`)** | Nine department scope tiles against one «کل سامانه» row. |
| Unchecked tick border `#C9B8EC` except the policy rows' `#DCD3EC` | **`#C9B8EC` (`--line-dashed`)** | §9.7 b catalogues the policy row as the single exception. §9.9 records that the token's *name* is wrong for this role, not its value. |
| Popover `max-height: 212–280px` | **280px** | The larger, so no list is clipped at a height nothing in the design justifies. |

**Files:**
- Create: `ui/src/ui/Checkbox.tsx`, `ui/src/ui/Radio.tsx`, `ui/src/ui/Dropdown.tsx`, `ui/src/ui/choices.test.tsx`

**Interfaces:**

- Consumes:
  - `useSurface()` / `SurfaceProvider` from `ui/src/ui/surface.tsx` (Task 5).
  - `pushDismissible`, `popDismissible`, `isTopDismissible` from `ui/src/ui/dismissibleStack.ts` (existing).
  - Task 2's utilities: `text-fs-lg` `text-fs-menu` `text-fs-sm` `text-fs-sm2` `text-fs-xs` (15 / 13.5 / 13 / 12.5 / 11.5px) · `rounded-card` `rounded-tile` `rounded-button` `rounded-input` `rounded-control` `rounded-tick` `rounded-round` (16 / 14 / 12 / 11 / 10 / 6px / 50%) · `border-hairline` (1.5px) · `border-line` `#E3D8F5` · `border-line-dashed` `#C9B8EC` (`--line-dashed`) · `border-coral` `#FA5A52` · `border-violet` `#4A25A9` · `border-warm` `#EFE7DC` · `bg-violet` `bg-green` `bg-card` `bg-tile-v2` `bg-tile-v4` (`--tile-v4` `#F8F4FE`) · `border-border-card` `rgba(42,29,94,.07)` (`--border-card` — §4.3's default card border, 46 uses; the class is the family's long form, see Task 2) · `shadow-pop` (Task 3 corrects it to S1's `0 20px 45px -20px rgba(74,37,169,.45)`) · `text-ink` `text-card` `text-violet` `text-muted` `text-faint`.
  - The geometry utilities the pre-flight minted for these three primitives (`.superpowers/sdd/ui-primitives-tokens-report.md`), which is why this task writes **no `[…]` arbitrary value at all**: `w-tick` `h-tick` (19px, ledger L-10) · `gap-tick-row` (11px) · `py-tick-nested-y` (11px) · `px-radio-x` (15px) · `gap-option` (9px) · `p-popover` (7px) · `max-h-popover` (280px) · `py-search-y-menu` (9px) · `ps-search-x-menu` (34px) · and the `_ds` ladder's own `s1` `half` `s3` `s4` `s5` `s6` `s7` rungs (4 / 2 / 6 / 8 / 10 / 12 / 14px), each of which is reachable as `p-` `m-` `gap-` `w-` `h-` `start-` `end-`. Map by ROLE, never by pixel value: 13px alone is `--pad-search-y`, `--pad-compose`, `--size-tick-glyph`, `--pad-tick-row-y`, `--pad-dropdown-x-filter` and `--pad-table-row-y`.
  - `z-dropdown` — the anchored-popover rung of the z-index ladder (ledger **L-42/L-43**, Bootstrap 5's `$zindex-dropdown` 1000, token `--role-z-dropdown`). **It replaces the deliverable's `z-index:35`.** A dropdown opened inside a dialog needs no second rung: the popover is a DOM descendant of its anchor and the scrim carries a z-index, so the scrim forms a stacking context and this rung resolves locally inside the dialog — which is exactly why L-43 collapses the deliverable's 25/27/30/35/37/39/57 onto one value. If the ladder is not minted when this task starts, mint it first; do not fall back to a number.
- Produces:
  - `ui/src/ui/Checkbox.tsx`
    - `function TickBox({ on, tone, className }: { on: boolean; tone?: 'violet' | 'green'; className?: string }): JSX.Element` — the 19×19 square on its own (`w-tick`, ledger L-10), so `Dropdown`'s multi-select options and the flow bar's confirm toggle draw the same tick rather than a fourth copy of it.
    - `interface CheckboxProps { label: string; checked: boolean; onChange: (next: boolean) => void; hint?: string; tone?: 'violet' | 'green'; disabled?: boolean; id?: string; className?: string }`
    - `function Checkbox(props: CheckboxProps): JSX.Element`
  - `ui/src/ui/Radio.tsx`
    - `interface RadioProps { name: string; value: string; checked: boolean; onChange: (value: string) => void; label: string; note?: string; id?: string; className?: string }`
    - `function Radio(props: RadioProps): JSX.Element`
    - **No `disabled`, and no `reason` line.** The design draws a blocked supervisor option greyed with a red explanation; R5's last clause is explicit that where a control's availability depends on the *target* rather than the caller it is **absent**, not explained. Callers filter the list; the primitive cannot render an option nobody may pick.
  - `ui/src/ui/Dropdown.tsx`
    - `interface DropdownOption { value: string; label: string; note?: string }`
    - `interface DropdownProps { label: string; options: DropdownOption[]; placeholder: string; value?: string; onChange?: (next: string) => void; values?: string[]; onToggle?: (value: string) => void; searchable?: boolean; searchPlaceholder?: string; noHit?: string; hideLabel?: boolean; className?: string }` — supplying `values` puts it in multi-select mode.
    - `function Dropdown(props: DropdownProps): JSX.Element`
  - The chevron-down and check SVGs are inlined here and **folded into `Icon` by Task 11, step 8.**

- [ ] **Step 1: Write the failing test for the two ticks**

Create `ui/src/ui/choices.test.tsx`:

```tsx
import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import type { ReactNode } from 'react'
import { SurfaceProvider } from './surface'
import { Checkbox } from './Checkbox'
import { Radio } from './Radio'
import { Dropdown } from './Dropdown'

function on(surface: 'panel' | 'reader', node: ReactNode) {
  return render(<SurfaceProvider surface={surface}>{node}</SurfaceProvider>)
}

describe('Checkbox', () => {
  it('is a real checkbox with a bound label', () => {
    on('panel', <Checkbox label="سرپرست‌شدن" checked={false} onChange={() => {}} />)
    const el = screen.getByRole('checkbox', { name: /سرپرست‌شدن/ })
    expect(el).not.toBeChecked()
  })

  it('reports the new state, not the old one', async () => {
    const seen: boolean[] = []
    on('panel', <Checkbox label="کل سامانه" checked={false} onChange={(v) => seen.push(v)} />)
    await userEvent.click(screen.getByRole('checkbox'))
    expect(seen).toEqual([true])
  })

  it('fills violet when on and shows the control border when off', () => {
    const { unmount, container } = on('panel', <Checkbox label="کل سامانه" checked onChange={() => {}} />)
    expect(container.querySelector('[data-tick]')).toHaveClass('bg-violet', 'border-violet')
    unmount()
    const second = on('panel', <Checkbox label="کل سامانه" checked={false} onChange={() => {}} />)
    expect(second.container.querySelector('[data-tick]')).toHaveClass('bg-card', 'border-line-dashed')
  })

  it('takes the green fill for a confirmation, not a second component', () => {
    // §4.6 — the green variant is the "confirmed" tick and the policy rows.
    const { container } = on('panel', <Checkbox label="تأییدشده" checked tone="green" onChange={() => {}} />)
    expect(container.querySelector('[data-tick]')).toHaveClass('bg-green', 'border-green')
  })

  it('binds its explanation to the control', () => {
    on('panel', (
      <Checkbox
        label="سرپرست‌شدن"
        checked={false}
        onChange={() => {}}
        hint="این پرچم هیچ دسترسی نمی‌دهد؛ فقط او را در فهرست سرپرست‌های قابل انتخاب می‌آورد."
      />
    ))
    const el = screen.getByRole('checkbox')
    const hint = screen.getByText(/این پرچم هیچ دسترسی نمی‌دهد/)
    expect(el).toHaveAttribute('aria-describedby', hint.id)
  })

  it('shows focus the one way the design shows focus', () => {
    // §4.6 — 15 of 15 focus declarations are `border-color:#FA5A52`. The input
    // itself is sr-only, so the coral has to land on the painted square.
    const { container } = on('panel', <Checkbox label="کل سامانه" checked={false} onChange={() => {}} />)
    expect(container.querySelector('[data-tick]')).toHaveClass('peer-focus-visible:border-coral')
  })
})

describe('Radio', () => {
  it('is a real radio in a named group', () => {
    on('panel', <Radio name="sup" value="09120000000" checked={false} onChange={() => {}} label="سحر بیات" />)
    const el = screen.getByRole('radio', { name: /سحر بیات/ })
    expect(el).toHaveAttribute('name', 'sup')
  })

  it('reports its own value when picked', async () => {
    const seen: string[] = []
    on('panel', <Radio name="sup" value="09120000000" checked={false} onChange={(v) => seen.push(v)} label="سحر بیات" />)
    await userEvent.click(screen.getByRole('radio'))
    expect(seen).toEqual(['09120000000'])
  })

  it('turns its card violet when picked', () => {
    const { container } = on('panel', <Radio name="sup" value="a" checked onChange={() => {}} label="سحر بیات" />)
    expect(container.querySelector('label')).toHaveClass('bg-tile-v2', 'border-violet')
  })

  it('offers no way to draw a candidate nobody may pick', () => {
    // R5 — where availability depends on the target rather than the caller, the
    // option is absent, not disabled-with-a-reason. The design greys it out and
    // explains; the ruling outranks the design. Asserted against the source, the
    // way guards.test.ts does, because a prop that does not exist cannot be
    // observed through the rendered output.
    const src = readFileSync(join(process.cwd(), 'src/ui/Radio.tsx'), 'utf8')
    expect(src).not.toMatch(/\bdisabled\b/)
    expect(src).not.toMatch(/opacity-60/)
  })
})
```

- [ ] **Step 2: Run it and watch it fail**

Run: `cd ui && npx vitest run src/ui/choices.test.tsx`
Expected: FAIL — `Failed to resolve import "./Checkbox" from "src/ui/choices.test.tsx"`.

- [ ] **Step 3: Write `Checkbox` and `TickBox`**

Create `ui/src/ui/Checkbox.tsx`:

```tsx
import { useId } from 'react'
import { useSurface } from './surface'

const TONE = {
  violet: 'bg-violet border-violet',
  green: 'bg-green border-green',
} as const

/**
 * The square tick on its own (§5.2), so the dropdown's multi-select options and
 * the flow bar's «تأییدشده» toggle draw this one rather than a fourth copy.
 *
 * 19×19 at radius 6 — `w-tick h-tick rounded-tick`, ledger L-10. The design
 * draws the same control at 16, 17, 18 and 19px keyed to how deeply nested it
 * is; R8 says the treatment comes from what the element *is*, so L-10 keeps two
 * by role — 19 in a list row, 16 nested inside another option — and normalises
 * 17 and 18 up to 19. The 13×13 check inside it (`w-tick-glyph h-tick-glyph`)
 * is stroke 3, which is what §"Iconography" gives for a check in a 12–13px box
 * and what the design draws inside its own 19px tick.
 */
export function TickBox({ on, tone = 'violet', className = '' }: {
  on: boolean
  tone?: 'violet' | 'green'
  className?: string
}) {
  return (
    <span
      data-tick
      aria-hidden
      className={`w-tick h-tick flex-none inline-flex items-center justify-center rounded-tick border-hairline text-card ${on ? TONE[tone] : 'bg-card border-line-dashed'} ${className}`}
    >
      {on && (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor"
          strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" focusable="false"
          className="w-tick-glyph h-tick-glyph">
          <path d="M20 6L9 17l-5-5" />
        </svg>
      )}
    </span>
  )
}

export interface CheckboxProps {
  label: string
  checked: boolean
  onChange: (next: boolean) => void
  /** The explanatory line under the title — 11.5px #a99fc4 lh 1.7 (§5.2). */
  hint?: string
  tone?: 'violet' | 'green'
  /** Only for a row that is on and locked, like the policy's «نام گام». */
  disabled?: boolean
  id?: string
  className?: string
}

export function Checkbox({
  label, checked, onChange, hint, tone = 'violet', disabled = false,
  id: given, className = '',
}: CheckboxProps) {
  const auto = useId()
  const id = given ?? auto
  const hintId = `${id}-hint`
  const text = useSurface() === 'reader' ? 'text-fs-lg' : 'text-fs-menu'
  return (
    <label
      htmlFor={id}
      className={`relative flex items-center gap-tick-row px-s6 py-tick-nested-y rounded-button border-hairline ${checked ? 'bg-tile-v4 border-line-dashed' : 'bg-card border-line'} ${disabled ? 'cursor-default opacity-60' : 'cursor-pointer'} ${className}`}
    >
      {/* The native input keeps the role, the state and the keyboard; the span
          beside it is paint. `sr-only` rather than `display:none`, which would
          take it out of the tab order — and `peer`, so the painted square can
          answer focus with the design's one focus idiom (§4.6). */}
      <input
        id={id}
        type="checkbox"
        checked={checked}
        disabled={disabled}
        aria-describedby={hint === undefined ? undefined : hintId}
        onChange={(e) => onChange(e.target.checked)}
        className="peer sr-only"
      />
      <TickBox on={checked} tone={tone} className="peer-focus-visible:border-coral" />
      <span className="min-w-0">
        <span className={`block font-bold text-ink ${text}`}>{label}</span>
        {hint !== undefined && (
          <span id={hintId} className="block mt-s1 text-fs-xs text-faint leading-normal">{hint}</span>
        )}
      </span>
    </label>
  )
}
```

- [ ] **Step 4: Write `Radio`**

Create `ui/src/ui/Radio.tsx`:

```tsx
import { useId } from 'react'
import { useSurface } from './surface'

export interface RadioProps {
  name: string
  value: string
  checked: boolean
  onChange: (value: string) => void
  label: string
  note?: string
  id?: string
  className?: string
}

/**
 * The round pick (§5.2), used by the change-supervisor dialog and nothing else.
 *
 * There is deliberately no `disabled` and no reason line. The design draws a
 * blocked candidate at reduced opacity with a red explanation beneath it; R5 is
 * explicit that where a control's availability depends on the target rather
 * than the caller — "this account holds more than you do" — the option is
 * **absent**, not explained. The caller filters; this cannot render a choice
 * that would be refused.
 */
export function Radio({
  name, value, checked, onChange, label, note, id: given, className = '',
}: RadioProps) {
  const auto = useId()
  const id = given ?? auto
  const text = useSurface() === 'reader' ? 'text-fs-lg' : 'text-fs-menu'
  return (
    <label
      htmlFor={id}
      className={`relative flex items-start gap-s6 px-radio-x py-s7 rounded-tile border-hairline cursor-pointer ${checked ? 'bg-tile-v2 border-violet' : 'bg-card border-warm'} ${className}`}
    >
      <input
        id={id} type="radio" name={name} value={value} checked={checked}
        onChange={() => onChange(value)}
        className="peer sr-only"
      />
      <span
        aria-hidden
        className={`w-tick h-tick mt-half flex-none inline-flex items-center justify-center rounded-round border-hairline peer-focus-visible:border-coral ${checked ? 'bg-violet border-violet' : 'bg-card border-line-dashed'}`}
      >
        {checked && <span className="w-s4 h-s4 rounded-round bg-card" />}
      </span>
      <span className="min-w-0">
        <span className={`block font-bold text-ink ${text}`}>{label}</span>
        {note !== undefined && (
          <span className="block mt-s1 text-fs-xs text-faint leading-normal">{note}</span>
        )}
      </span>
    </label>
  )
}
```

- [ ] **Step 5: Run the two tick suites and watch them pass**

Run: `cd ui && npx vitest run src/ui/choices.test.tsx -t 'Checkbox|Radio'`
Expected: PASS — 10 tests. The `Dropdown` describe block is not written yet.

- [ ] **Step 6: Commit**

```
git add ui/src/ui/Checkbox.tsx ui/src/ui/Radio.tsx ui/src/ui/choices.test.tsx
git commit -m "feat(ui): a tick the design drew, and a pick nobody is offered and refused"
```

- [ ] **Step 7: Write the failing test for `Dropdown`**

Append to `ui/src/ui/choices.test.tsx`:

```tsx
const ROLES = [
  { value: 'reader', label: 'خواننده' },
  { value: 'editor', label: 'ادیتور' },
  { value: 'admin', label: 'مدیر' },
]

describe('Dropdown', () => {
  it('is a closed listbox trigger carrying its placeholder', () => {
    on('panel', <Dropdown label="نقش" options={ROLES} placeholder="نقش" onChange={() => {}} />)
    const trigger = screen.getByRole('button', { name: 'نقش' })
    expect(trigger).toHaveAttribute('aria-haspopup', 'listbox')
    expect(trigger).toHaveAttribute('aria-expanded', 'false')
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument()
  })

  it('opens, and turns its border coral while open', async () => {
    on('panel', <Dropdown label="نقش" options={ROLES} placeholder="نقش" onChange={() => {}} />)
    const trigger = screen.getByRole('button', { name: 'نقش' })
    await userEvent.click(trigger)
    expect(trigger).toHaveAttribute('aria-expanded', 'true')
    expect(trigger).toHaveClass('border-coral')
    expect(screen.getAllByRole('option')).toHaveLength(3)
  })

  it('reports the value and closes', async () => {
    const seen: string[] = []
    on('panel', <Dropdown label="نقش" options={ROLES} placeholder="نقش" onChange={(v) => seen.push(v)} />)
    await userEvent.click(screen.getByRole('button', { name: 'نقش' }))
    await userEvent.click(screen.getByRole('option', { name: 'ادیتور' }))
    expect(seen).toEqual(['editor'])
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument()
  })

  it('marks the picked option, and only that one', async () => {
    on('panel', <Dropdown label="نقش" options={ROLES} placeholder="نقش" value="admin" onChange={() => {}} />)
    await userEvent.click(screen.getByRole('button'))
    expect(screen.getByRole('option', { name: 'مدیر' })).toHaveAttribute('aria-selected', 'true')
    expect(screen.getByRole('option', { name: 'ادیتور' })).toHaveAttribute('aria-selected', 'false')
  })

  it('closes on Escape and gives focus back to the trigger', async () => {
    on('panel', <Dropdown label="نقش" options={ROLES} placeholder="نقش" onChange={() => {}} />)
    const trigger = screen.getByRole('button')
    await userEvent.click(trigger)
    await userEvent.keyboard('{Escape}')
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument()
    expect(trigger).toHaveFocus()
  })

  it('walks the options with the arrow keys', async () => {
    on('panel', <Dropdown label="نقش" options={ROLES} placeholder="نقش" onChange={() => {}} />)
    await userEvent.click(screen.getByRole('button'))
    await userEvent.keyboard('{ArrowDown}')
    expect(screen.getByRole('option', { name: 'خواننده' })).toHaveFocus()
    await userEvent.keyboard('{ArrowDown}')
    expect(screen.getByRole('option', { name: 'ادیتور' })).toHaveFocus()
    await userEvent.keyboard('{End}')
    expect(screen.getByRole('option', { name: 'مدیر' })).toHaveFocus()
  })

  it('filters when searchable, and states the miss rather than showing a blank', async () => {
    on('panel', (
      <Dropdown
        label="سرپرست" options={ROLES} placeholder="سرپرست" onChange={() => {}}
        searchable searchPlaceholder="جست‌وجو…" noHit="سرپرستی با این نام نیست"
      />
    ))
    await userEvent.click(screen.getByRole('button', { name: 'سرپرست' }))
    await userEvent.type(screen.getByPlaceholderText('جست‌وجو…'), 'ادی')
    expect(screen.getAllByRole('option')).toHaveLength(1)
    await userEvent.type(screen.getByPlaceholderText('جست‌وجو…'), 'xyz')
    expect(screen.queryAllByRole('option')).toHaveLength(0)
    expect(screen.getByText('سرپرستی با این نام نیست')).toBeInTheDocument()
  })

  it('multi-selects with the same tick the checkbox draws, and stays open', async () => {
    const seen: string[] = []
    on('panel', (
      <Dropdown
        label="دپارتمان" options={ROLES} placeholder="دپارتمان"
        values={['reader']} onToggle={(v) => seen.push(v)}
      />
    ))
    await userEvent.click(screen.getByRole('button', { name: 'دپارتمان' }))
    const list = screen.getByRole('listbox')
    expect(list).toHaveAttribute('aria-multiselectable', 'true')
    expect(list.querySelectorAll('[data-tick]')).toHaveLength(3)
    await userEvent.click(screen.getByRole('option', { name: 'مدیر' }))
    expect(seen).toEqual(['admin'])
    expect(screen.getByRole('listbox')).toBeInTheDocument()
  })

  it('keeps its label bound even when the trigger text is the label', () => {
    // The filter bar shows «نقش» as the trigger text, so a second visible label
    // would be a duplicate — but dropping the label would leave the control
    // unnamed. `hideLabel` hides it; it never removes it.
    const { container } = on('panel', <Dropdown label="نقش" options={ROLES} placeholder="نقش" onChange={() => {}} hideLabel />)
    const name = container.querySelector('.sr-only')
    expect(name).toHaveTextContent('نقش')
  })
})
```

- [ ] **Step 8: Run it and watch it fail**

Run: `cd ui && npx vitest run src/ui/choices.test.tsx -t Dropdown`
Expected: FAIL — `Failed to resolve import "./Dropdown"`.

- [ ] **Step 9: Write `Dropdown`**

Create `ui/src/ui/Dropdown.tsx`:

```tsx
import { useEffect, useId, useRef, useState } from 'react'
import { useSurface } from './surface'
import { pushDismissible, popDismissible, isTopDismissible } from './dismissibleStack'
import { TickBox } from './Checkbox'

export interface DropdownOption {
  value: string
  label: string
  note?: string
}

export interface DropdownProps {
  /** Always the accessible name. `hideLabel` hides it; nothing removes it. */
  label: string
  options: DropdownOption[]
  placeholder: string
  /** Single-select. */
  value?: string
  onChange?: (next: string) => void
  /** Supplying `values` puts the control in multi-select mode. */
  values?: string[]
  onToggle?: (value: string) => void
  searchable?: boolean
  searchPlaceholder?: string
  /** Stated, never blank — §"EmptyState": emptiness is a fact, not an apology. */
  noHit?: string
  hideLabel?: boolean
  className?: string
}

const OPTION =
  'w-full flex items-center gap-option px-s6 py-s5 rounded-input border-0 ' +
  'text-start text-fs-sm text-ink cursor-pointer hover:bg-tile-v2'

export function Dropdown({
  label, options, placeholder, value, onChange, values, onToggle,
  searchable = false, searchPlaceholder = 'جست‌وجو…', noHit = 'موردی پیدا نشد',
  hideLabel = false, className = '',
}: DropdownProps) {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const box = useRef<HTMLDivElement>(null)
  const trigger = useRef<HTMLButtonElement>(null)
  const list = useRef<HTMLDivElement>(null)
  const identity = useRef(Symbol('dropdown')).current
  const id = useId()
  const multiple = values !== undefined
  const text = useSurface() === 'reader' ? 'text-fs-lg' : 'text-fs-menu'

  useEffect(() => {
    if (!open) return
    // I7 — joins Overlay's dismissible stack, so a dropdown opened inside a
    // dialog answers Escape without taking the dialog down with it.
    pushDismissible(identity)
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape' && isTopDismissible(identity)) {
        setOpen(false)
        trigger.current?.focus()
      }
    }
    // §5.2 — a document listener rather than a full-screen invisible backdrop,
    // "so the wheel is not stolen from the scrolling dialog" behind it.
    function onDown(e: MouseEvent) {
      if (box.current && !box.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('keydown', onKey)
    document.addEventListener('mousedown', onDown)
    return () => {
      popDismissible(identity)
      document.removeEventListener('keydown', onKey)
      document.removeEventListener('mousedown', onDown)
    }
  }, [open, identity])

  const shown = query ? options.filter((o) => o.label.includes(query)) : options
  const chosen = multiple
    ? options.filter((o) => values.includes(o.value))
    : options.filter((o) => o.value === value)

  function move(step: number | 'first' | 'last') {
    const nodes = Array.from(list.current?.querySelectorAll<HTMLElement>('[role="option"]') ?? [])
    if (nodes.length === 0) return
    if (step === 'first') return nodes[0].focus()
    if (step === 'last') return nodes[nodes.length - 1].focus()
    const at = nodes.indexOf(document.activeElement as HTMLElement)
    nodes[Math.min(nodes.length - 1, Math.max(0, at + step))].focus()
  }

  function onListKey(e: React.KeyboardEvent) {
    if (e.key === 'ArrowDown') { e.preventDefault(); move(1) }
    else if (e.key === 'ArrowUp') { e.preventDefault(); move(-1) }
    else if (e.key === 'Home') { e.preventDefault(); move('first') }
    else if (e.key === 'End') { e.preventDefault(); move('last') }
  }

  return (
    <div ref={box} data-dd className={`relative ${className}`}>
      <span
        id={`${id}-label`}
        className={hideLabel ? 'sr-only' : `block font-semibold text-violet mb-s3 text-fs-sm2`}
      >
        {label}
      </span>
      <button
        ref={trigger}
        type="button"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-labelledby={`${id}-label`}
        onClick={() => setOpen((v) => !v)}
        onKeyDown={(e) => {
          if (e.key === 'ArrowDown') { e.preventDefault(); setOpen(true); requestAnimationFrame(() => move('first')) }
        }}
        className={`w-full flex items-center gap-s5 px-s7 py-s5 rounded-button bg-card text-ink text-start cursor-pointer border-hairline ${open ? 'border-coral' : 'border-line'} ${text}`}
      >
        <span className={`flex-1 overflow-hidden text-ellipsis whitespace-nowrap ${chosen.length ? '' : 'text-faint'}`}>
          {chosen.length ? chosen.map((o) => o.label).join('، ') : placeholder}
        </span>
        {/* Folded into `Icon` by Task 11. chevron-down, 15×15 @2.2 (§5.2). */}
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor"
          strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"
          aria-hidden focusable="false" className="flex-none text-muted">
          <path d="M6 9l6 6 6-6" />
        </svg>
      </button>
      {open && (
        <div
          ref={list}
          role="listbox"
          aria-labelledby={`${id}-label`}
          aria-multiselectable={multiple || undefined}
          onKeyDown={onListKey}
          className="absolute top-full mt-s3 start-0 end-0 z-dropdown max-h-popover overflow-auto flex flex-col gap-half p-popover bg-card border border-border-card rounded-card shadow-pop"
        >
          {searchable && (
            <input
              type="search"
              value={query}
              placeholder={searchPlaceholder}
              aria-label={searchPlaceholder}
              onChange={(e) => setQuery(e.target.value)}
              className="w-full box-border ps-search-x-menu pe-s6 py-search-y-menu mb-s1 rounded-control text-fs-sm2 text-ink bg-card border-hairline border-line outline-none focus:border-coral"
            />
          )}
          {shown.length === 0 ? (
            <p className="m-0 px-s6 py-s7 text-center text-fs-sm2 text-muted">{noHit}</p>
          ) : shown.map((o) => {
            const picked = multiple ? values.includes(o.value) : o.value === value
            return (
              <button
                key={o.value}
                type="button"
                role="option"
                aria-selected={picked}
                onClick={() => {
                  if (multiple) onToggle?.(o.value)
                  else { onChange?.(o.value); setOpen(false); trigger.current?.focus() }
                }}
                className={`${OPTION} ${picked ? 'bg-tile-v2 font-bold' : 'bg-transparent font-semibold'}`}
              >
                {multiple ? (
                  <TickBox on={picked} />
                ) : picked ? (
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor"
                    strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"
                    aria-hidden focusable="false" className="flex-none text-violet">
                    <path d="M20 6L9 17l-5-5" />
                  </svg>
                ) : (
                  <span aria-hidden className="w-s7 flex-none" />
                )}
                <span className="min-w-0 flex-1">
                  <span className="block">{o.label}</span>
                  {o.note !== undefined && (
                    <span className="block mt-half text-fs-xs font-normal text-faint">{o.note}</span>
                  )}
                </span>
              </button>
            )
          })}
        </div>
      )}
    </div>
  )
}
```

- [ ] **Step 10: Run it and watch it pass**

Run: `cd ui && npx vitest run src/ui/choices.test.tsx`
Expected: PASS — 19 tests.

- [ ] **Step 11: Commit**

```
git add ui/src/ui/Dropdown.tsx ui/src/ui/choices.test.tsx
git commit -m "feat(ui): one dropdown replaces fifteen, and says so when nothing matches"
```

- [ ] **Step 12: Run the whole suite, the type-checker and the linter**

Run: `cd ui && npx vitest run && npx tsc -b && npx eslint .`
Expected: all three exit 0. `guards.test.ts` is the one to watch: `TickBox`'s `tone` and
`Checkbox`'s `tone` are not on its banned prop list (`density|size|scale|compact|dense|roomy|variant`),
and none of the three files contains a hex, a `text-[`, a `rounded-[`, a `shadow-[` or a
physical direction property. Stronger than the guard asks, and deliberately: after the
token sweep these three files contain **no `[…]` arbitrary value of any kind**. The guard
only bans three prefixes, so `px-[12px]` and `z-[35]` would pass it while bypassing the
token layer entirely — `grep -n '\[' src/ui/{Checkbox,Radio,Dropdown}.tsx` must return
nothing but TypeScript array types and array indexing.

- [ ] **Step 13: Build, and prove every class these three files write emits**
  ```bash
  cd ui && npx vite build
  node scripts/harvest-classes.mjs src/ui/Checkbox.tsx src/ui/Radio.tsx src/ui/Dropdown.tsx
  ```
  Expected: the run ends `DEAD 0   EMPTY 0   NOVAR 0`, both controls hold
  (`control (negative): N/N invented names reported dead` and
  `control (escaping): … escaped variant classes unescaped`), and the last line
  is `PASS`. The script exits 1 on any failure, so it can be `&&`-chained.
  The class list is **harvested out of these files**, never hand-kept, so it
  cannot drift from what they write and `tailwind-probe.txt` cannot certify it
  on their behalf — see *The class-emission check* in Global Constraints for the
  measurement that retired the old grep.

  Measured on the built primitives: **105 classes `ok`, 0 dead.** The hand-kept
  list this step used to carry named 52 — three of which (`bg-green`,
  `border-line-dashed`, `py-tick-nested-y`) these files never write, while 56 they
  do write were absent from it, `focus:border-coral`,
  `peer-focus-visible:border-coral`, `start-search-icon-menu`, `py-tick-row-y` and
  `border-border-pick` among them. Both halves of that drift are invisible to a
  grep: the probe emits the three phantoms anyway, and nothing was looking for the
  56.

  Do **not** name the three test files here. They carry invented class names as
  fixtures (`rounded-tickk`, `w-tick-nineteen`) and quote CSS *property* names in
  assertions (`text-align`, `inset-inline-end`) that collide with live utility
  namespaces; the scanner reports those as dead, correctly and uselessly.

  **A failure.** `DEAD` — the class compiled to no rule at all; that is a **typo
  in the component**, so fix the class string, rebuild, re-run. `EMPTY` — the
  selector emitted with an empty body, so the theme key resolves to nothing.
  `NOVAR` — the rule reads a `var(--…)` nothing declares. The last two are theme
  regressions: **stop and report them.** Do **not** add the name to
  `ui/tailwind.config.js`, `src/styles/tokens.css`, `src/styles/roles.css` or
  `tailwind-probe.txt`. All four are frozen for the duration of this plan and
  were unfrozen exactly once, by the single minting pass in
  `.superpowers/sdd/mint-spec.md`; minting one here to make a misspelling compile
  recreates the unreachable-token problem the whole rebuild exists to fix. A
  value that genuinely has no name goes into `mint-spec.md`, not into the config
  and not into this task's commit.

  **What this step cannot prove:** that these files write a class and that the
  class compiles to a rule with declarations, yes. That the class reaches the
  right element, that the element renders, that it is visible, or that its value
  is the one the design asks for — no. That stays with the Playwright checks.


- [ ] **Step 14: Nothing to commit**

  Step 13 changes no file. Green means these three primitives and the frozen theme
  agree.

  **If a class comes back `DEAD`, do NOT add it to `ui/tailwind.config.js`.** That
  file, along with `ui/src/styles/tokens.css`, `ui/src/styles/roles.css` and
  `ui/tailwind-probe.txt`, is FROZEN for this task — every token these three
  primitives need was minted ahead of time so several primitives could be built in
  parallel without clobbering one another. A dead class means either the name is
  wrong (check it against the theme, mapping by ROLE and never by pixel value) or
  a genuine gap in the mint. **Stop and report it.** Minting here silently
  recreates the unreachable-token problem this whole rebuild exists to fix.

---

### Task 9: `DataTable`, `Pager`

The users screen's centrepiece is a six-column grid in an 18px-radius card, and the audit
and activity screens are the same object with different tracks. Building it once is the
difference between one table and three; Task 19 consumes it for the users screen.

**R8 normalisations for the ledger:**

| The design shows | Chosen | Why |
|---|---|---|
| Table head fill: none (users), none (audit), `#F8F4FE` (activity) | **a `headFill` prop, default off** | §9.7 c catalogues this as an inconsistency, and it is a real composition choice — a head above a filter bar that is already `#F8F4FE` would be two tinted strips. The screens pass it, they do not each re-invent it. |
| Row hover transition `.14s` | **`.16s` (`--duration`)** | §4.5: `.14s` is not a token, and it is the only place in 4018 lines that uses it. |
| Head/row padding `12–13px 18px` / `13–14px 18px`, gap `12–14px` | **`13px 18px` and gap `12px`** | One rule per role; the design's spread is per-screen drift, not three roles. |
| «پاک کردن فیلترها» in `--violet-mid` (users) vs `#E23D35` (activity) | **not this task's** — the link is a screen concern; §9.7 a is settled in Task 1's ledger | |

**Files:**
- Create: `ui/src/ui/DataTable.tsx`, `ui/src/ui/Pager.tsx`, `ui/src/ui/table.test.tsx`
- Modify: `ui/src/test/a11y.ts` (add `expectExpandedHitArea`)

**Interfaces:**

- Consumes:
  - `toFa` from `ui/src/lib/format.ts` (existing).
  - Task 2's utilities: `rounded-doc` `rounded-control` (18 / 10px) · `border-border-card` `rgba(42,29,94,.07)` · `border-border-current` `#EDE5F5` (`--border-current`, §4.3's sub-panel border) · `border-line-row` `#F4F0FA` (`--line-row` — §1.2's table row separator, 4 uses) · `bg-surface-sub` `#FBF9FE` · `bg-tile-v4` `#F8F4FE` · `text-fs-xs` `text-fs-sm` `text-fs-sm2` `text-fs-caption` · `text-body-ink` `#5a5175` (`--text-body`; §9.9 corrects that token to `#5a5175`, the colour that carries all secondary body copy — not `--text-current`, which keeps the diff-view role `text-ink-current` names) · `text-disabled` `#cfc7e0` (`--text-disabled`) · `shadow-card` · `transition-[background]` (Task 2 makes `--duration` the theme's default transition duration, so there is no `duration-*` class for `.16s`) · `max760:` (Task 2's `≤760px` max-width screen).
- Produces:
  - `ui/src/ui/DataTable.tsx`
    - `interface DataColumn<Row> { key: string; head: string; track: string; cell: (row: Row) => ReactNode; mobile?: boolean }` — `track` is one CSS grid track (`'16px'`, `'1.4fr'`, `'34px'`); `mobile: false` drops the column at ≤760px.
    - `interface DataTableProps<Row> { label: string; columns: DataColumn<Row>[]; rows: Row[]; rowKey: (row: Row) => string; empty: string; onOpen?: (row: Row) => void; rowLabel?: (row: Row) => string; headFill?: boolean; filters?: ReactNode; pager?: ReactNode }`
    - `function DataTable<Row>(props: DataTableProps<Row>): JSX.Element`
    - **`onOpen` is what makes a row openable.** Absent, the shell is a `table` and no row
      invites a click — R5: a list never renders a row it would then refuse to open.
  - `ui/src/ui/Pager.tsx`
    - `interface PagerProps { from: number; to: number; count: number; page: number; pages: number; onPage: (next: number) => void }`
    - `function Pager(props: PagerProps): JSX.Element` — every number rendered through `toFa`.
  - `ui/src/test/a11y.ts`
    - `expectExpandedHitArea(el: HTMLElement): void` — asserts the 34×34 design box carries the transparent 44×44 hit area.
  - The two chevron SVGs are inlined here and **folded into `Icon` by Task 11, step 8.**

- [ ] **Step 1: Write the failing test**

Create `ui/src/ui/table.test.tsx`:

```tsx
import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { DataTable, type DataColumn } from './DataTable'
import { Pager } from './Pager'
import { expectExpandedHitArea } from '../test/a11y'

interface Row { id: string; name: string; role: string }

const ROWS: Row[] = [
  { id: '09120000001', name: 'سحر بیات', role: 'ادیتور' },
  { id: '09120000002', name: 'رضا کریمی', role: 'خواننده' },
]

// §6.7 — the users grid, exactly: status dot · نام · نقش · سرپرست · دپارتمان · chevron.
const COLUMNS: DataColumn<Row>[] = [
  { key: 'dot', head: '', track: '16px', cell: () => <span data-dot /> },
  { key: 'name', head: 'نام', track: '1.4fr', cell: (r) => r.name },
  { key: 'role', head: 'نقش', track: '1fr', cell: (r) => r.role },
  { key: 'sup', head: 'سرپرست', track: '1.1fr', cell: () => '—', mobile: false },
  { key: 'dept', head: 'دپارتمان', track: '1fr', cell: () => 'سالن', mobile: false },
  { key: 'go', head: '', track: '34px', cell: () => null },
]

describe('DataTable', () => {
  it('lays the head and every row on the same six tracks', () => {
    const { container } = render(
      <DataTable label="کاربران" columns={COLUMNS} rows={ROWS} rowKey={(r) => r.id} empty="کاربری با این نام پیدا نشد" />,
    )
    const tracks = Array.from(container.querySelectorAll<HTMLElement>('[role="row"]'))
      .map((el) => el.style.gridTemplateColumns)
    expect(tracks).toEqual(Array(3).fill('16px 1.4fr 1fr 1.1fr 1fr 34px'))
  })

  it('is a plain table, and no row invites a click, when nothing may be opened', () => {
    // R5 — a list never renders a row it would then refuse to open.
    render(<DataTable label="کاربران" columns={COLUMNS} rows={ROWS} rowKey={(r) => r.id} empty="خالی" />)
    expect(screen.getByRole('table', { name: 'کاربران' })).toBeInTheDocument()
    expect(screen.queryAllByRole('gridcell')).toHaveLength(0)
  })

  it('becomes a keyboard-reachable grid when rows open', async () => {
    const opened: string[] = []
    render(
      <DataTable
        label="کاربران" columns={COLUMNS} rows={ROWS} rowKey={(r) => r.id} empty="خالی"
        onOpen={(r) => opened.push(r.id)} rowLabel={(r) => `پروندهٔ ${r.name}`}
      />,
    )
    expect(screen.getByRole('grid', { name: 'کاربران' })).toBeInTheDocument()
    const row = screen.getByRole('row', { name: 'پروندهٔ سحر بیات' })
    expect(row).toHaveAttribute('tabindex', '0')
    row.focus()
    await userEvent.keyboard('{Enter}')
    await userEvent.click(screen.getByRole('row', { name: 'پروندهٔ رضا کریمی' }))
    expect(opened).toEqual(['09120000001', '09120000002'])
  })

  it('states the emptiness rather than drawing an empty grid', () => {
    render(<DataTable label="کاربران" columns={COLUMNS} rows={[]} rowKey={(r) => r.id} empty="کاربری با این نام پیدا نشد" />)
    expect(screen.getByText('کاربری با این نام پیدا نشد')).toBeInTheDocument()
    expect(screen.queryAllByRole('cell')).toHaveLength(0)
  })

  it('hides the head and drops the two wide columns at 760px', () => {
    // §6.7 — at ≤760px the head goes, the row becomes a flex line, and the
    // department and supervisor columns are dropped rather than squeezed.
    const { container } = render(
      <DataTable label="کاربران" columns={COLUMNS} rows={ROWS} rowKey={(r) => r.id} empty="خالی" />,
    )
    const head = container.querySelector('[data-r-thead]') as HTMLElement
    expect(head.className).toMatch(/\bmax760:hidden\b/)
    const dropped = container.querySelectorAll('[data-col="sup"], [data-col="dept"]')
    expect(dropped).toHaveLength(2)
    dropped.forEach((el) => expect(el.className).toMatch(/\bmax760:hidden\b/))
  })

  it('fills its head only when asked to', () => {
    const { container, unmount } = render(
      <DataTable label="ک" columns={COLUMNS} rows={ROWS} rowKey={(r) => r.id} empty="خالی" />,
    )
    expect(container.querySelector('[data-r-thead]')?.className).not.toMatch(/bg-tile-v4/)
    unmount()
    const filled = render(
      <DataTable label="ک" columns={COLUMNS} rows={ROWS} rowKey={(r) => r.id} empty="خالی" headFill />,
    )
    expect(filled.container.querySelector('[data-r-thead]')).toHaveClass('bg-tile-v4')
  })
})

describe('Pager', () => {
  it('writes every number in Persian', () => {
    render(<Pager from={1} to={5} count={12} page={1} pages={3} onPage={() => {}} />)
    expect(screen.getByText('۱ تا ۵ از ۱۲')).toBeInTheDocument()
    expect(screen.getByText('صفحهٔ ۱ از ۳')).toBeInTheDocument()
  })

  it('refuses to step off either end', () => {
    const { unmount } = render(<Pager from={1} to={5} count={12} page={1} pages={3} onPage={() => {}} />)
    expect(screen.getByRole('button', { name: 'صفحهٔ قبلی' })).toBeDisabled()
    expect(screen.getByRole('button', { name: 'صفحهٔ بعدی' })).toBeEnabled()
    unmount()
    render(<Pager from={11} to={12} count={12} page={3} pages={3} onPage={() => {}} />)
    expect(screen.getByRole('button', { name: 'صفحهٔ بعدی' })).toBeDisabled()
  })

  it('steps', async () => {
    const seen: number[] = []
    render(<Pager from={6} to={10} count={12} page={2} pages={3} onPage={(p) => seen.push(p)} />)
    await userEvent.click(screen.getByRole('button', { name: 'صفحهٔ بعدی' }))
    await userEvent.click(screen.getByRole('button', { name: 'صفحهٔ قبلی' }))
    expect(seen).toEqual([3, 1])
  })

  it('fades the glyph when disabled rather than hiding the control', () => {
    // §4.6 — "Disabled keeps its surface and fades the glyph to #cfc7e0;
    // controls are never hidden."
    render(<Pager from={1} to={5} count={12} page={1} pages={3} onPage={() => {}} />)
    expect(screen.getByRole('button', { name: 'صفحهٔ قبلی' })).toHaveClass('disabled:text-disabled')
  })

  it('keeps the 34px box the design draws and a 44px box the thumb can hit', () => {
    render(<Pager from={1} to={5} count={12} page={2} pages={3} onPage={() => {}} />)
    expectExpandedHitArea(screen.getByRole('button', { name: 'صفحهٔ بعدی' }))
  })
})
```

- [ ] **Step 2: Run it and watch it fail**

Run: `cd ui && npx vitest run src/ui/table.test.tsx`
Expected: FAIL — `Failed to resolve import "./DataTable" from "src/ui/table.test.tsx"`.

- [ ] **Step 3: Add the hit-area helper**

Append to `ui/src/test/a11y.ts`:

```ts
/**
 * F11's 44px floor against the design's 34×34 and 36×36 icon buttons.
 *
 * These two are not reconcilable by resizing: the design's pager button, crumb
 * home button and row chevron are 34–36px, and growing them to 44 changes every
 * bar they sit in. So the painted box stays the design's and an invisible
 * `::before` grows the hit area to 44 — five pixels on every side of a 34px box.
 * Nothing about it is visible, which is why the design has no opinion on it.
 */
export function expectExpandedHitArea(el: HTMLElement) {
  expect(el.className).toMatch(/\brelative\b/)
  expect(el.className).toMatch(/\bbefore:absolute\b/)
  expect(el.className).toMatch(/before:-inset-\[5px\]/)
}
```

- [ ] **Step 4: Write `DataTable`**

Create `ui/src/ui/DataTable.tsx`:

```tsx
import type { ReactNode } from 'react'

export interface DataColumn<Row> {
  key: string
  /** Empty for a column whose head carries no label (the status dot, the chevron). */
  head: string
  /** One CSS grid track: '16px' | '1.4fr' | '34px'. */
  track: string
  cell: (row: Row) => ReactNode
  /** `false` drops the column at ≤760px, where the grid collapses (§6.7). */
  mobile?: boolean
}

export interface DataTableProps<Row> {
  /** F11 — every table needs a name; the design gives none, so the screen does. */
  label: string
  columns: DataColumn<Row>[]
  rows: Row[]
  rowKey: (row: Row) => string
  /** Stated, never a blank grid. */
  empty: string
  /**
   * Present ⇒ the rows open something, so the shell is a `grid` and each row is
   * focusable. Absent ⇒ a plain `table` and no row invites a click. R5: a list
   * never renders a row it would then refuse to open, so the screen decides
   * this per person, not per screen.
   */
  onOpen?: (row: Row) => void
  rowLabel?: (row: Row) => string
  /** §9.7 c — the design fills the head on one of its three tables. */
  headFill?: boolean
  filters?: ReactNode
  pager?: ReactNode
}

// §5.2 — the shell is the card: 18px radius, the near-invisible violet hairline,
// the two-layer neutral shadow that does the work on the violet field.
const SHELL = 'bg-card border border-border-card rounded-doc overflow-hidden shadow-card'

// The head and every row are the same grid. At ≤760px both become flex lines and
// the template stops applying, which is exactly how the design collapses them.
const LINE = 'grid items-center gap-[12px] px-[18px] py-[13px] max760:flex max760:gap-[11px] max760:p-[14px]'

export function DataTable<Row>({
  label, columns, rows, rowKey, empty, onOpen, rowLabel,
  headFill = false, filters, pager,
}: DataTableProps<Row>) {
  const template = { gridTemplateColumns: columns.map((c) => c.track).join(' ') }
  const openable = onOpen !== undefined
  return (
    <div role={openable ? 'grid' : 'table'} aria-label={label} className={SHELL}>
      {filters !== undefined && (
        <div className="flex flex-wrap gap-[8px] px-[18px] py-[14px] bg-tile-v4 border-b border-border-current">
          {filters}
        </div>
      )}
      <div
        data-r-thead
        role="row"
        style={template}
        className={`${LINE} border-b border-border-current max760:hidden ${headFill ? 'bg-tile-v4' : ''}`}
      >
        {columns.map((c) => (
          <span key={c.key} role="columnheader" className="text-fs-xs font-bold text-muted">{c.head}</span>
        ))}
      </div>
      {rows.length === 0 ? (
        <p className="m-0 px-[20px] py-[44px] text-center text-fs-sm text-faint">{empty}</p>
      ) : (
        rows.map((row) => (
          <div
            key={rowKey(row)}
            data-r-trow
            role="row"
            style={template}
            aria-label={openable && rowLabel ? rowLabel(row) : undefined}
            tabIndex={openable ? 0 : undefined}
            onClick={openable ? () => onOpen(row) : undefined}
            onKeyDown={
              openable
                ? (e) => {
                    if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onOpen(row) }
                  }
                : undefined
            }
            className={`${LINE} border-b border-line-row transition-[background] ${openable ? 'cursor-pointer hover:bg-surface-sub' : ''}`}
          >
            {columns.map((c) => (
              <div
                key={c.key}
                data-col={c.key}
                role={openable ? 'gridcell' : 'cell'}
                className={`min-w-0 ${c.mobile === false ? 'max760:hidden' : ''}`}
              >
                {c.cell(row)}
              </div>
            ))}
          </div>
        ))
      )}
      {pager}
    </div>
  )
}
```

- [ ] **Step 5: Write `Pager`**

Create `ui/src/ui/Pager.tsx`:

```tsx
import { toFa } from '../lib/format'

export interface PagerProps {
  from: number
  to: number
  count: number
  page: number
  pages: number
  onPage: (next: number) => void
}

// §5.2 — 34×34, 1.5px --line, radius 10, --violet. The `before:` box is the
// invisible 44px hit area (see expectExpandedHitArea); it changes nothing that
// is painted, which is why the design has no opinion about it.
const NAV =
  'relative before:absolute before:content-[""] before:-inset-[5px] ' +
  'w-[34px] h-[34px] inline-flex items-center justify-center flex-none ' +
  'bg-card text-violet border-hairline border-line rounded-control cursor-pointer ' +
  'disabled:text-disabled disabled:cursor-default'

export function Pager({ from, to, count, page, pages, onPage }: PagerProps) {
  return (
    <div className="flex items-center justify-between gap-[12px] px-[18px] py-[14px]">
      {/* §2.7 — every count, position and index a reader sees is Persian, with
          no exception for "technical" numbers. */}
      <span className="text-fs-caption text-muted">{toFa(from)} تا {toFa(to)} از {toFa(count)}</span>
      <div className="flex items-center gap-[8px]">
        <button
          type="button" aria-label="صفحهٔ قبلی" disabled={page <= 1}
          onClick={() => onPage(page - 1)} className={NAV}
        >
          {/* Folded into `Icon` by Task 11 — chevronPrev, 15×15 @2.4 (§8). */}
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor"
            strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden focusable="false">
            <path d="M15 6l-6 6 6 6" />
          </svg>
        </button>
        <span aria-live="polite" className="min-w-[74px] text-center text-fs-sm2 font-semibold text-body-ink">
          صفحهٔ {toFa(page)} از {toFa(pages)}
        </span>
        <button
          type="button" aria-label="صفحهٔ بعدی" disabled={page >= pages}
          onClick={() => onPage(page + 1)} className={NAV}
        >
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor"
            strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden focusable="false">
            <path d="M9 6l6 6-6 6" />
          </svg>
        </button>
      </div>
    </div>
  )
}
```

- [ ] **Step 6: Run it and watch it pass**

Run: `cd ui && npx vitest run src/ui/table.test.tsx`
Expected: PASS — 11 tests.

- [ ] **Step 7: Commit**

```
git add ui/src/ui/DataTable.tsx ui/src/ui/Pager.tsx ui/src/ui/table.test.tsx ui/src/test/a11y.ts
git commit -m "feat(ui): one table on six tracks, and a pager that counts in Persian"
```

- [ ] **Step 8: Run the whole suite, the type-checker and the linter**

Run: `cd ui && npx vitest run && npx tsc -b && npx eslint .`
Expected: all three exit 0. `tsc -b` is load-bearing here — `DataTable<Row>` is the first
generic component in the app, and a `cell` signature that does not match its `Row` is
exactly the mistake Task 19 would otherwise make at the call site.

- [ ] **Step 9: Build, and prove every class the table and pager write emits**
  ```bash
  cd ui && npx vite build
  node scripts/harvest-classes.mjs src/ui/DataTable.tsx src/ui/Pager.tsx
  ```
  Expected: the run ends `DEAD 0   EMPTY 0   NOVAR 0`, both controls hold
  (`control (negative): N/N invented names reported dead` and
  `control (escaping): … escaped variant classes unescaped`), and the last line
  is `PASS`. The script exits 1 on any failure, so it can be `&&`-chained.
  The class list is **harvested out of these files**, never hand-kept, so it
  cannot drift from what they write and `tailwind-probe.txt` cannot certify it
  on their behalf — see *The class-emission check* in Global Constraints for the
  measurement that retired the old grep.

  This is the step whose old form proved the least in the whole plan, and it is
  worth knowing why before trusting the new one. It grepped for 14 names — and
  **all 14 are written verbatim in `ui/tailwind-probe.txt`**, which
  `tailwind.config.js:59` puts in Tailwind's `content`. Every one of them
  therefore emitted whether or not `DataTable.tsx` and `Pager.tsx` existed at all;
  the step would have printed `OK 14 classes present` against an empty repository.
  Five of the 14 (`bg-surface-sub`, `border-border-card`, `rounded-doc`,
  `shadow-card`, `text-disabled`) are not written by these two files at any point,
  and **52 classes they do write were unlisted** — `grid-cols-users`,
  `grid-cols-audit`, `grid-cols-activity`, every `max760:*`, `before:-inset-[5px]`,
  `py-table-row-y`, `min-w-page-label`, `hover:bg-surface-sub`.

  Measured on the built primitives: **61 classes `ok`, 0 dead.**

  **A failure.** `DEAD` — the class compiled to no rule at all; that is a **typo
  in the component**, so fix the class string, rebuild, re-run. `EMPTY` — the
  selector emitted with an empty body, so the theme key resolves to nothing.
  `NOVAR` — the rule reads a `var(--…)` nothing declares. The last two are theme
  regressions: **stop and report them.** Do **not** add the name to
  `ui/tailwind.config.js`, `src/styles/tokens.css`, `src/styles/roles.css` or
  `tailwind-probe.txt`. All four are frozen for the duration of this plan and
  were unfrozen exactly once, by the single minting pass in
  `.superpowers/sdd/mint-spec.md`; minting one here to make a misspelling compile
  recreates the unreachable-token problem the whole rebuild exists to fix. A
  value that genuinely has no name goes into `mint-spec.md`, not into the config
  and not into this task's commit.

  **What this step cannot prove:** that these files write a class and that the
  class compiles to a rule with declarations, yes. That the class reaches the
  right element, that the element renders, that it is visible, or that its value
  is the one the design asks for — no. That stays with the Playwright checks.

  Then confirm the two responsive rules actually compiled at the right width — a
  screen key that never reached the config would leave `max760:hidden` out of the
  CSS entirely, and the scanner would report it `DEAD` without saying why:

  ```bash
  cd ui && node -e '
  const fs=require("node:fs");
  const css=fs.readdirSync("dist/assets").filter(f=>/\.css$/.test(f))
    .map(f=>fs.readFileSync("dist/assets/"+f,"utf8")).join("\n");
  const ok=/@media\s*\(max-width:\s*760px\)/.test(css) && /max760\\:hidden/.test(css);
  console.log(ok?"OK r760 compiles to a max-width:760px query":"MISSING r760");
  process.exit(ok?0:1);'
  ```

  Expected: `OK r760 compiles to a max-width:760px query`.

- [ ] **Step 10: Nothing to commit**

  Step 9 changes no file, and there is nothing here to stage. The old text said
  *"Otherwise fix `ui/tailwind.config.js`"* and then staged it on its own —
  **do not.** That file, `src/styles/tokens.css`, `src/styles/roles.css` and
  `tailwind-probe.txt` are frozen after the single minting pass
  (`.superpowers/sdd/mint-spec.md`). A `DEAD` class is a typo in `DataTable.tsx`
  or `Pager.tsx`; a `MISSING r760` is a theme regression — the breakpoint plugin
  has been lost from the config — and both are reported, not patched from here.

---

### Task 10: `SectionCard`, `StatTile`, `NavTabTray`, `Timeline`, `FAB`

Five composites the deliverable names and the app does not have. `SectionCard` is the
dominant container inside every form-ish screen; `NavTabTray` is the single most repeated
composite in S1 (five trays); `StatTile` is inlined twice in `Departments.tsx` alone
(audit O9) because the design system's `StatCard` has a `dot` prop and the app's copy did
not; `FAB` is the one control whose size the two surfaces genuinely disagree about.

**R8 normalisations for the ledger:**

| The design shows | Chosen | Why |
|---|---|---|
| `SectionCard` padding `18px`, or `16px` inside a dialog | **18px** | One rule per role. A sub-card is a sub-card; the dialog is already 26px-padded around it. |
| `SectionCard` eyebrow margin `12px`, or `14px` when the body is a list | **12px** | Same. The 14px is one screen's local adjustment. |
| `StatTile` value `27px` (home), `23px` centred (audit), `21px/lh 1.2` start-aligned (activity) | **two skins: `feature` 27px (`--fs-stat`), `compact` 21px centred (`--fs-stat-sm`)** | Not one role with three treatments — a header stat over the violet field and a stat in a 4-up grid are different roles with different containers. **Owner ruling R14 settles ledger L-29 at 21px**, closing the 23-or-21 question this row used to leave open: 23px is `--fs-h1`, the *process summary title*, and a stat numeral borrowing a heading token is the drift this rebuild exists to end. `--fs-stat-sm` was minted for exactly this numeral. The 23px centred variant normalises into `compact`. |
| Audit's fourth stat in `#E8A33D` | **`--warn` `#B4690E`** | `#E8A33D` is `--junction-or`, whose palette §1.1 calls "one fixed map, never re-assigned". Amber-as-warning is `--warn`. |
| FAB badge ring `#2A1D5E` (panel) vs `#FBF7F1` (reader) | **`--ink` `#2A1D5E` on both** | The ring exists to cut the badge out of the field behind it, and §6.0/§6.17 agree the field is `#2A1D5E` on both surfaces. §6.17 defect 5 already calls the reader's cream ring "a stray light halo". |
| `Timeline` rail line `min-height:{{h.lineH}}px`, computed per node | **`min-h-s7` with `flex-1`** | A prototype layout constant with no design meaning; the row's own `padding-bottom:14px` — `pb-s7`, the same rung — sets the rhythm. |

**Files:**
- Create: `ui/src/ui/SectionCard.tsx`, `ui/src/ui/StatTile.tsx`, `ui/src/ui/NavTabTray.tsx`, `ui/src/ui/Timeline.tsx`, `ui/src/ui/FAB.tsx`, `ui/src/ui/composites.test.tsx`
- Delete: `ui/src/ui/Tabs.tsx`
- Modify: `ui/src/ui/controls.test.tsx` (drop the `Tabs` import and its describe block)

**Interfaces:**

- Consumes:
  - `SurfaceProvider` from `ui/src/ui/surface.tsx` (Task 5) — in `composites.test.tsx`, to
    render the FAB on each surface. **No component in this task calls `useSurface()`**:
    `w-fab`/`h-fab` read `--role-fab`, so the surface reaches the FAB through CSS and no
    call site has to know which one it is in (`tailwind.config.js`'s own R3 comment).
  - `toFa` from `ui/src/lib/format.ts`.
  - Task 2's utilities — **every class below already emits today** (compiled from
    `src/index.css` against the frozen config), with the single exception noted at the end:
    - radii `rounded-card` `rounded-tile` `rounded-button` `rounded-tool` `rounded-pill` `rounded-round`
    - type `text-fs-stat` `text-fs-stat-sm` `text-fs-sm` `text-fs-sm2` `text-fs-caption` `text-fs-xs` `text-fs-xxs` · `leading-none` (`--lh-none`) · `leading-normal` (`--lh-normal`, 1.7)
    - colour, surfaces `bg-card` · `bg-surface-sub` `#FBF9FE` · `bg-tile-v2` `#F4EFFB` · `bg-tile-v4` `#F8F4FE` · `bg-tile-ok` `bg-tile-warn` `bg-tile-c` · `bg-coral` `bg-violet` · `bg-border-current` `#EDE5F5` (the timeline rail, a line drawn as a filled 2px box)
    - colour, edges `border-border-card` `rgba(42,29,94,.07)` · `border-border-current` `#EDE5F5` · `border-ink` (L-24's cut-out ring)
    - colour, ink `text-card` `text-violet` `text-ink` `text-conflict` `text-green` `text-warn` `text-muted` `text-faint` · `text-icom-control` `#8A5A00` · `text-body-ink` `#5a5175`
    - shadow `shadow-card` · `shadow-conflict-dot` (`--ring-conflict-dot`, `0 0 0 3px #FFE4E1`) · `shadow-fab` (`--shadow-fab`, §6.15's `0 6px 14px rgba(16,10,40,.22), 0 18px 40px -14px rgba(250,90,82,.9)` — Task 1 minted it and `boxShadow.fab` carries it)
    - geometry, from the pre-flight mint (`.superpowers/sdd/ui-primitives-tokens-report.md`)
      and the `_ds` ladder: `p-s9` `mb-s6` · `px-stat-x` `py-s7` `min-w-stat` `px-stat-x-grid` `py-stat-y-grid` `mt-s2` `w-s4` `h-s4` · `gap-s1` `p-s1` `px-s7` `py-s4` · `gap-s6` `w-s11` `h-s11` `w-half` `min-h-s7` `pb-s7` `mt-half` `mt-s3` `px-note-x` `py-note-y` · `w-fab` `h-fab` `bottom-s10` `right-s10` `-top-half` `-start-half` `min-w-count` `h-count` `px-s3`
  - stacking `z-floating` (`--role-z-floating`, 1030 — "the comment FAB", L-42). This was
    the one class in this task that waited on the single minting pass
    (`.superpowers/sdd/mint-spec.md` §1.1 rung 3, §3); that pass has landed and it now
    emits `z-index:var(--role-z-floating)`. Nothing here is blocked.
  - **`gap-stat-dot`** (`--gap-stat-dot`, 7px) is the gap between the stat
    numeral and its conflict dot (`design/Inja Panel.dc.html:221`, `display:flex;
    align-items:center;gap:7px`). `tokens.css` holds two 7px tokens — `--pad-popover` (the
    dropdown popover's inset) and `--space-stat-label` (the 4-up label's margin-top) — and
    the R8 block's own rule says a number that already has an owner is minted again under
    its own name rather than borrowed. Neither the pre-flight nor `mint-spec.md` minted one
    for this role, so it stays written out and is listed for the owner rather than
    silently attached to a token that means something else.
- Produces:
  - `ui/src/ui/SectionCard.tsx` — `function SectionCard({ eyebrow, skin, children, className }: { eyebrow?: string; skin?: 'tint' | 'white'; children: ReactNode; className?: string }): JSX.Element`
  - `ui/src/ui/StatTile.tsx` — `type StatTone = 'violet' | 'ink' | 'conflict' | 'ok' | 'warn'`; `function StatTile({ value, label, tone, dot, skin, className }: { value: number | string; label: string; tone?: StatTone; dot?: boolean; skin?: 'feature' | 'compact'; className?: string }): JSX.Element`. A `number` is run through `toFa`; a `string` is passed through, so a caller that has already formatted a range is not double-converted.
  - `ui/src/ui/NavTabTray.tsx` — `interface NavTab { id: string; label: string }`; `function NavTabTray({ tabs, value, onChange, label, stretch, className }: { tabs: NavTab[]; value: string; onChange: (id: string) => void; label: string; stretch?: boolean; className?: string }): JSX.Element`. A real `tablist`, for real tab sets only — **the top bar's nav is links and does not use this** (Task 12).
  - `ui/src/ui/Timeline.tsx` — `type TimelineState = 'done' | 'awaiting' | 'rejected' | 'pending'`; `interface TimelineNode { id: string; name: string; role: string; state: TimelineState; stateLabel: string; mark?: string; note?: string }`; `function Timeline({ nodes, label }: { nodes: TimelineNode[]; label: string }): JSX.Element`
  - `ui/src/ui/FAB.tsx` — `function FAB({ label, count, onClick, className }: { label: string; count?: number; onClick: () => void; className?: string }): JSX.Element`
  - The FAB's comment glyph is inlined here and **folded into `Icon` by Task 11, step 8.**

- [ ] **Step 1: Write the failing test**

Create `ui/src/ui/composites.test.tsx`:

```tsx
import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { ReactNode } from 'react'
import { SurfaceProvider } from './surface'
import { SectionCard } from './SectionCard'
import { StatTile } from './StatTile'
import { NavTabTray } from './NavTabTray'
import { Timeline } from './Timeline'
import { FAB } from './FAB'

function on(surface: 'panel' | 'reader', node: ReactNode) {
  return render(<SurfaceProvider surface={surface}>{node}</SurfaceProvider>)
}

describe('SectionCard', () => {
  it('names its section with its own eyebrow', () => {
    const { container } = render(<SectionCard eyebrow="نقش و دپارتمان"><p>x</p></SectionCard>)
    const section = container.querySelector('section') as HTMLElement
    const eyebrow = screen.getByText('نقش و دپارتمان')
    expect(section).toHaveAttribute('aria-labelledby', eyebrow.id)
  })

  it('is tinted and shadowless by default, white and shadowed on request', () => {
    const { container, unmount } = render(<SectionCard><p>x</p></SectionCard>)
    const tint = container.querySelector('section') as HTMLElement
    expect(tint).toHaveClass('bg-surface-sub', 'border-border-current')
    expect(tint.className).not.toMatch(/shadow-/)
    unmount()
    const white = render(<SectionCard skin="white"><p>x</p></SectionCard>)
    expect(white.container.querySelector('section')).toHaveClass('bg-card', 'border-border-card', 'shadow-card')
  })
})

describe('StatTile', () => {
  it('converts a number to Persian and leaves a string alone', () => {
    const { unmount } = render(<StatTile value={12} label="فرآیند مستند" />)
    expect(screen.getByText('۱۲')).toBeInTheDocument()
    unmount()
    render(<StatTile value="۱ تا ۵" label="ردیف" />)
    expect(screen.getByText('۱ تا ۵')).toBeInTheDocument()
  })

  it('reads at 27px as a header stat and 21px in a grid, on the stat scale both times', () => {
    // R14 / L-29 — the 4-up numeral is `--fs-stat-sm` (21px) and NOT `--fs-h1`
    // (23px, the process summary title). Two points apart, both plausible on
    // screen, and only one of them is a stat: which is why this is asserted by
    // class and not by size. The failure guarded against is a stat numeral
    // wearing a heading token.
    const { unmount } = render(<StatTile value={9} label="دپارتمان" />)
    expect(screen.getByText('۹')).toHaveClass('text-fs-stat')
    unmount()
    render(<StatTile value={9} label="دپارتمان" skin="compact" />)
    expect(screen.getByText('۹')).toHaveClass('text-fs-stat-sm')
  })

  it('carries the conflict dot with its ring only when asked', () => {
    const { container, unmount } = render(<StatTile value={3} label="تعارض باز" tone="conflict" dot />)
    expect(container.querySelector('[data-dot]')).toHaveClass('bg-coral', 'shadow-conflict-dot')
    unmount()
    const quiet = render(<StatTile value={0} label="تعارض باز" tone="ok" />)
    expect(quiet.container.querySelector('[data-dot]')).toBeNull()
  })
})

describe('NavTabTray', () => {
  it('is a named tablist with exactly one selected tab', () => {
    render(
      <NavTabTray
        label="نمای صندوق" value="mine"
        tabs={[{ id: 'mine', label: 'رسیده به شما' }, { id: 'all', label: 'همه' }]}
        onChange={() => {}}
      />,
    )
    expect(screen.getByRole('tablist', { name: 'نمای صندوق' })).toBeInTheDocument()
    expect(screen.getByRole('tab', { name: 'رسیده به شما' })).toHaveAttribute('aria-selected', 'true')
    expect(screen.getByRole('tab', { name: 'همه' })).toHaveAttribute('aria-selected', 'false')
  })

  it('keeps one tab stop and moves the selection with the arrow keys, mirrored for RTL', () => {
    // The app runs `html[dir=rtl]`, so ArrowLeft advances and ArrowRight goes back.
    document.documentElement.setAttribute('dir', 'rtl')
    const seen: string[] = []
    render(
      <NavTabTray
        label="نما" value="mine"
        tabs={[{ id: 'mine', label: 'الف' }, { id: 'all', label: 'ب' }, { id: 'closed', label: 'پ' }]}
        onChange={(id) => seen.push(id)}
      />,
    )
    expect(screen.getByRole('tab', { name: 'الف' })).toHaveAttribute('tabindex', '0')
    expect(screen.getByRole('tab', { name: 'ب' })).toHaveAttribute('tabindex', '-1')
    screen.getByRole('tab', { name: 'الف' }).focus()
    return userEvent.keyboard('{ArrowLeft}{End}').then(() => {
      expect(seen).toEqual(['all', 'closed'])
    })
  })

  it('fills violet when active and stays transparent when not', () => {
    render(
      <NavTabTray label="نما" value="all" tabs={[{ id: 'mine', label: 'الف' }, { id: 'all', label: 'ب' }]} onChange={() => {}} />,
    )
    expect(screen.getByRole('tab', { name: 'ب' })).toHaveClass('bg-violet', 'text-card')
    expect(screen.getByRole('tab', { name: 'الف' })).toHaveClass('bg-transparent', 'text-violet')
  })
})

describe('Timeline', () => {
  const NODES = [
    { id: 'a', name: 'سحر بیات', role: 'سرپرست سالن', state: 'done' as const, stateLabel: 'تأیید کرد' },
    { id: 'b', name: 'رضا کریمی', role: 'ادیتور', state: 'awaiting' as const, stateLabel: 'در انتظار تأیید', note: 'روی میز از دیروز' },
  ]

  it('is an ordered list with a name', () => {
    render(<Timeline label="زنجیرهٔ تأیید" nodes={NODES} />)
    expect(screen.getByRole('list', { name: 'زنجیرهٔ تأیید' })).toBeInTheDocument()
    expect(screen.getAllByRole('listitem')).toHaveLength(2)
  })

  it('numbers its rail in Persian and colours each node by its state', () => {
    const { container } = render(<Timeline label="زنجیره" nodes={NODES} />)
    const dots = container.querySelectorAll('[data-node-dot]')
    expect(dots[0]).toHaveTextContent('۱')
    expect(dots[0]).toHaveClass('bg-tile-ok', 'text-green')
    expect(dots[1]).toHaveClass('bg-tile-warn', 'text-icom-control')
  })

  it('stops the rail at the last node', () => {
    const { container } = render(<Timeline label="زنجیره" nodes={NODES} />)
    const rails = container.querySelectorAll('[data-node-line]')
    expect(rails[0]).toHaveClass('bg-border-current')
    expect(rails[1]).toHaveClass('bg-transparent')
  })
})

describe('FAB', () => {
  it('takes its box from the surface role rather than from a branch of its own', () => {
    // R3 — 52px in the panel and 56px in the reader, and `--role-fab` is what
    // holds the difference: one class on both surfaces, resolved by CSS, so the
    // component never asks which surface it is in. The 52/56 split is asserted
    // where it lives, in src/ui/surface.test.tsx. What is asserted here is that
    // the FAB reads the ROLE and not one end of it — `w-fab-reader` on the
    // reader would paint the right number today and stop tracking the role.
    const { unmount } = on('panel', <FAB label="کامنت تازه" onClick={() => {}} />)
    expect(screen.getByRole('button')).toHaveClass('w-fab', 'h-fab')
    unmount()
    on('reader', <FAB label="کامنت تازه" onClick={() => {}} />)
    expect(screen.getByRole('button')).toHaveClass('w-fab', 'h-fab')
  })

  it('says how many are waiting, in Persian, in its accessible name', () => {
    // S4 in the audit: the two shells were the only surfaces in the app rendering
    // a latin digit. A count that is only in a badge is a count a screen reader
    // never hears.
    on('panel', <FAB label="کامنت تازه" count={3} onClick={() => {}} />)
    expect(screen.getByRole('button', { name: 'کامنت تازه، ۳ مورد' })).toBeInTheDocument()
    expect(screen.getByText('۳')).toHaveClass('border-ink')
  })

  it('drops the badge at zero rather than drawing a zero', () => {
    const { container } = on('panel', <FAB label="کامنت تازه" count={0} onClick={() => {}} />)
    expect(container.querySelector('[data-fab-badge]')).toBeNull()
    expect(screen.getByRole('button', { name: 'کامنت تازه' })).toBeInTheDocument()
  })

  it('sits where the design pins it, on the stacking ladder’s floating rung', () => {
    // §8 — the FAB is one of the surviving physical pins: bottom:22px; right:22px;
    // left:auto, reproduced as written rather than mirrored. The 22px is
    // `--space-10`, the _ds ladder's own rung, so the pin is named without the
    // physical spelling changing.
    //
    // `z-floating` is L-42's rung for exactly this control (1030). Tailwind's
    // own `z-40` emits and would look correct in every test and every build —
    // it is the number nothing in this design system chose.
    on('panel', <FAB label="کامنت تازه" onClick={() => {}} />)
    expect(screen.getByRole('button')).toHaveClass('fixed', 'bottom-s10', 'right-s10', 'left-auto', 'z-floating')
  })
})
```

- [ ] **Step 2: Run it and watch it fail**

Run: `cd ui && npx vitest run src/ui/composites.test.tsx`
Expected: FAIL — `Failed to resolve import "./SectionCard" from "src/ui/composites.test.tsx"`.

- [ ] **Step 3: Write `SectionCard` and `StatTile`**

Create `ui/src/ui/SectionCard.tsx`:

```tsx
import { useId, type ReactNode } from 'react'

/**
 * The sub-panel (§5.2) — the dominant container inside a form-ish screen, and
 * the reason `#FBF9FE` is the 24-times-used surface the token file has no name
 * for. Two skins, used side by side on the Access screen: tinted and shadowless,
 * or white with the card shadow.
 *
 * The eyebrow is the section's accessible name, not decoration: eight of these
 * stack on one screen and a screen reader needs to know where each begins.
 */
export function SectionCard({
  eyebrow, skin = 'tint', children, className = '',
}: {
  eyebrow?: string
  skin?: 'tint' | 'white'
  children: ReactNode
  className?: string
}) {
  const id = useId()
  const shell = skin === 'white'
    ? 'bg-card border-border-card shadow-card'
    : 'bg-surface-sub border-border-current'
  return (
    <section
      aria-labelledby={eyebrow === undefined ? undefined : id}
      className={`border rounded-card p-s9 ${shell} ${className}`}
    >
      {eyebrow !== undefined && (
        <p id={id} className="m-0 mb-s6 text-fs-xxs font-bold text-muted">{eyebrow}</p>
      )}
      {children}
    </section>
  )
}
```

Create `ui/src/ui/StatTile.tsx`:

```tsx
import { toFa } from '../lib/format'

export type StatTone = 'violet' | 'ink' | 'conflict' | 'ok' | 'warn'

const TONE: Record<StatTone, string> = {
  violet: 'text-violet',
  ink: 'text-ink',
  conflict: 'text-conflict',
  ok: 'text-green',
  warn: 'text-warn',
}

/**
 * §5.2 — the stat card, in the two shapes the design actually has: the header
 * tile that sits over the violet field on the departments screen, and the
 * compact tile that lives in a 4-up grid on audit and activity.
 *
 * Unlike the design system's `StatCard`, a numeric `value` is converted here.
 * That component leaves it to the caller and the caller forgot — which is how
 * the app came to render a latin `3` in a Persian header (audit S4).
 */
export function StatTile({
  value, label, tone = 'violet', dot = false, skin = 'feature', className = '',
}: {
  value: number | string
  label: string
  tone?: StatTone
  /** The open-conflict tile's coral dot with its `0 0 0 3px #FFE4E1` ring. */
  dot?: boolean
  skin?: 'feature' | 'compact'
  className?: string
}) {
  const shell = skin === 'feature'
    ? 'rounded-card px-stat-x py-s7 min-w-stat'
    : 'rounded-tile px-stat-x-grid py-stat-y-grid text-center'
  // R14 / L-29 — 27px and 21px, both off the stat scale. Not `text-fs-h1`:
  // that is the process summary title, and it is not what a stat numeral is.
  const size = skin === 'feature' ? 'text-fs-stat' : 'text-fs-stat-sm'
  return (
    <div className={`bg-card border border-border-card shadow-card ${shell} ${className}`}>
      {/* `gap-stat-dot` is this gap's own token. Do NOT borrow it for the other
          design's own `gap:7px` (Inja Panel.dc.html:221), and both 7px tokens
          the theme holds — `--pad-popover` and `--space-stat-label` — were
          minted for other roles. Borrowing one would put this gap behind a name
          that means something else. Listed in the Interfaces block above. */}
      <div className={`flex items-center gap-stat-dot ${skin === 'compact' ? 'justify-center' : ''}`}>
        <span className={`font-extrabold leading-none ${size} ${TONE[tone]}`}>
          {typeof value === 'number' ? toFa(value) : value}
        </span>
        {dot && <span data-dot aria-hidden className="w-s4 h-s4 flex-none rounded-round bg-coral shadow-conflict-dot" />}
      </div>
      {/* `mt-s2` is 5px — the header tile's own `margin-top:5px`
          (Inja Panel.dc.html:213). `--space-stat-label` is the 4-up tile's 7px
          and is NOT this; see the note in the sweep report. */}
      <div className="mt-s2 text-fs-xs font-semibold text-muted">{label}</div>
    </div>
  )
}
```

- [ ] **Step 4: Write `NavTabTray`**

Create `ui/src/ui/NavTabTray.tsx`:

```tsx
import { useRef, type KeyboardEvent } from 'react'

export interface NavTab { id: string; label: string }

/**
 * The segmented tray (§5.2) — the most repeated composite in the deliverable.
 *
 * This is a **tablist**, for a real set of alternative views: the comments tabs,
 * the audit tabs, the flow view switch. The top bar's nav tray looks identical
 * and is not one — those entries navigate, so PanelShell composes the same shell
 * around links rather than importing this and lying about the role.
 */
export function NavTabTray({
  tabs, value, onChange, label, stretch = false, className = '',
}: {
  tabs: NavTab[]
  value: string
  onChange: (id: string) => void
  label: string
  /** `flex:1` on every tab, for a tray that spans its container. */
  stretch?: boolean
  className?: string
}) {
  const box = useRef<HTMLDivElement>(null)

  function onKeyDown(e: KeyboardEvent) {
    const rtl = document.documentElement.getAttribute('dir') === 'rtl'
    const at = tabs.findIndex((t) => t.id === value)
    // Arrow keys follow the writing direction, so in RTL the left arrow advances.
    const step =
      e.key === 'ArrowLeft' ? (rtl ? 1 : -1)
      : e.key === 'ArrowRight' ? (rtl ? -1 : 1)
      : 0
    let next = -1
    if (step !== 0) next = Math.min(tabs.length - 1, Math.max(0, at + step))
    else if (e.key === 'Home') next = 0
    else if (e.key === 'End') next = tabs.length - 1
    if (next < 0 || next === at) return
    e.preventDefault()
    onChange(tabs[next].id)
    box.current?.querySelectorAll<HTMLElement>('[role="tab"]')[next]?.focus()
  }

  return (
    <div
      ref={box}
      role="tablist"
      aria-label={label}
      onKeyDown={onKeyDown}
      className={`inline-flex gap-s1 p-s1 rounded-button bg-tile-v2 ${className}`}
    >
      {tabs.map((t) => {
        const active = t.id === value
        return (
          <button
            key={t.id}
            type="button"
            role="tab"
            aria-selected={active}
            tabIndex={active ? 0 : -1}
            onClick={() => onChange(t.id)}
            className={`px-s7 py-s4 rounded-tool border-0 cursor-pointer text-fs-sm2 font-bold ${stretch ? 'flex-1' : ''} ${active ? 'bg-violet text-card' : 'bg-transparent text-violet'}`}
          >
            {t.label}
          </button>
        )
      })}
    </div>
  )
}
```

- [ ] **Step 5: Write `Timeline` and `FAB`**

Create `ui/src/ui/Timeline.tsx`:

```tsx
import { toFa } from '../lib/format'

export type TimelineState = 'done' | 'awaiting' | 'rejected' | 'pending'

export interface TimelineNode {
  id: string
  name: string
  role: string
  state: TimelineState
  stateLabel: string
  /** Overrides the Persian ordinal in the rail dot. */
  mark?: string
  note?: string
}

// §1.2's approval-chain map, verbatim: rejected → #FFE9E7/#E23D35;
// not-yet-reached → #F4EFFB/#a99fc4; awaiting → #FBEEDC/#8A5A00;
// otherwise → #E4F6EC/#1F8A5B.
const DOT: Record<TimelineState, string> = {
  done: 'bg-tile-ok text-green',
  awaiting: 'bg-tile-warn text-icom-control',
  rejected: 'bg-tile-c text-conflict',
  pending: 'bg-tile-v2 text-faint',
}
const STATE: Record<TimelineState, string> = {
  done: 'text-green',
  awaiting: 'text-icom-control',
  rejected: 'text-conflict',
  pending: 'text-faint',
}

/** The approval chain (§5.2). An ordered list, because it is one. */
export function Timeline({ nodes, label }: { nodes: TimelineNode[]; label: string }) {
  return (
    <ol aria-label={label} className="flex flex-col list-none m-0 p-0">
      {nodes.map((n, i) => (
        <li key={n.id} className="flex gap-s6">
          <span className="flex flex-col items-center flex-none">
            <span
              data-node-dot
              aria-hidden
              className={`w-s11 h-s11 inline-flex items-center justify-center rounded-round text-fs-xxs font-bold ${DOT[n.state]}`}
            >
              {n.mark ?? toFa(i + 1)}
            </span>
            {/* `min-h-s7` is the R8 row's 14px: the same rung as the body's own
                `pb-s7` below, which is what sets the rhythm. */}
            <span
              data-node-line
              aria-hidden
              className={`flex-1 w-half min-h-s7 ${i === nodes.length - 1 ? 'bg-transparent' : 'bg-border-current'}`}
            />
          </span>
          <div className="pb-s7 min-w-0">
            <p className="m-0 text-fs-sm font-bold text-ink">
              {n.name} <span className="text-fs-xxs font-normal text-muted">{n.role}</span>
            </p>
            <p className={`m-0 mt-half text-fs-caption font-semibold ${STATE[n.state]}`}>{n.stateLabel}</p>
            {n.note !== undefined && (
              <p className="m-0 mt-s3 px-note-x py-note-y rounded-tool bg-tile-v4 text-fs-caption text-body-ink leading-normal">
                {n.note}
              </p>
            )}
          </div>
        </li>
      ))}
    </ol>
  )
}
```

Create `ui/src/ui/FAB.tsx`:

```tsx
import { toFa } from '../lib/format'

/**
 * §6.15 — the comment FAB. 52×52 in the panel, 56×56 in the reader (R3): the
 * one control whose size the two deliverables genuinely disagree about, and the
 * disagreement is deliberate rather than drift.
 *
 * The size is `w-fab h-fab` on both surfaces and nothing here branches on the
 * surface: those read `--role-fab`, which is `--size-fab` under `:root` and
 * `--size-fab-reader` under `[data-surface='reader']`. That is R3's whole
 * arrangement — the config's own comment puts it as "one class is 48/40/52 in
 * the panel and 54/42/56 in the reader without a single call site knowing which
 * surface it is in" — so this component does not call `useSurface()` at all.
 *
 * The badge's 2px ring is `--ink` on both surfaces. The reader deliverable rings
 * it in cream `#FBF7F1` over a `#2A1D5E` field — §6.17 calls that a stray light
 * halo, and R8 says a deliverable contradicting itself is a defect, not a spec.
 *
 * §8 — `bottom:22px; right:22px; left:auto` is one of the physical pins the
 * design keeps, reproduced as written; the 22px is `--space-10`, so the pin is
 * named without its spelling changing. `z-floating` is L-42's rung for a
 * floating control (1030).
 */
export function FAB({
  label, count = 0, onClick, className = '',
}: {
  label: string
  count?: number
  onClick: () => void
  className?: string
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={count > 0 ? `${label}، ${toFa(count)} مورد` : label}
      className={`fixed bottom-s10 right-s10 left-auto z-floating w-fab h-fab inline-flex items-center justify-center rounded-round bg-coral text-card border-0 cursor-pointer shadow-fab ${className}`}
    >
      {/* Folded into `Icon` by Task 11, step 8 — 22×22 @2.2. The design names the
          size and the stroke but ships no path, and InjaIcons has no comment key. */}
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor"
        strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden focusable="false">
        <path d="M21 12a8 8 0 0 1-8 8H7l-4 3v-5.5A8 8 0 0 1 11 4h2a8 8 0 0 1 8 8z" />
      </svg>
      {count > 0 && (
        <span
          data-fab-badge
          aria-hidden
          className="absolute -top-half -start-half min-w-count h-count px-s3 inline-flex items-center justify-center rounded-pill bg-violet text-card text-fs-xxs font-bold border-2 border-ink"
        >
          {toFa(count)}
        </span>
      )}
    </button>
  )
}
```

- [ ] **Step 6: Run it and watch it pass**

Run: `cd ui && npx vitest run src/ui/composites.test.tsx`
Expected: PASS — 15 tests (SectionCard 2, StatTile 3, NavTabTray 3, Timeline 3, FAB 4).

- [ ] **Step 7: Commit**

```
git add ui/src/ui/SectionCard.tsx ui/src/ui/StatTile.tsx ui/src/ui/NavTabTray.tsx ui/src/ui/Timeline.tsx ui/src/ui/FAB.tsx ui/src/ui/composites.test.tsx
git commit -m "feat(ui): five composites the design names and the app never had"
```

- [ ] **Step 8: Retire the tab component nobody imported**

`ui/src/ui/Tabs.tsx` has no non-test consumer (audit P11) and is now a second, differently
shaped tab tray sitting beside `NavTabTray` — an invitation for a screen to import the
wrong one. Delete it:

```
git rm ui/src/ui/Tabs.tsx
```

In `ui/src/ui/controls.test.tsx`, delete the import on line 5 (`import { Tabs } from './Tabs'`)
and the whole `describe('Tabs', …)` block (lines 24–38).

- [ ] **Step 9: Run the suite and watch it stay green**

Run: `cd ui && npx vitest run`
Expected: PASS, with `controls.test.tsx` down to three describe blocks (`SearchField`,
`Accordion`, `Menu`) and no unresolved import.

- [ ] **Step 10: Commit**

```
git add ui/src/ui/controls.test.tsx
git commit -m "refactor(ui): one tab tray, not two — the unused one goes"
```

- [ ] **Step 11: Run the type-checker and the linter**

Run: `cd ui && npx tsc -b && npx eslint .`
Expected: both exit 0. `StatTile`'s `skin` and `SectionCard`'s `skin` are composition
axes, not density, so `guards.test.ts`'s F4/F8 guard (which bans `density|size|scale|compact|dense|roomy|variant`)
stays quiet — check it actually does, because "compact" appears as a *value* of `skin`
and the regex looks for it as a prop **name** followed by `:`.

- [ ] **Step 12: Build, and prove every class the five composites write emits**
  ```bash
  cd ui && npx vite build
  node scripts/harvest-classes.mjs src/ui/SectionCard.tsx src/ui/StatTile.tsx src/ui/NavTabTray.tsx src/ui/Timeline.tsx src/ui/FAB.tsx
  ```
  Expected: the run ends `DEAD 0   EMPTY 0   NOVAR 0`, both controls hold
  (`control (negative): N/N invented names reported dead` and
  `control (escaping): … escaped variant classes unescaped`), and the last line
  is `PASS`. The script exits 1 on any failure, so it can be `&&`-chained.
  The class list is **harvested out of these files**, never hand-kept, so it
  cannot drift from what they write and `tailwind-probe.txt` cannot certify it
  on their behalf — see *The class-emission check* in Global Constraints for the
  measurement that retired the old grep.

  Measured on the built components: **102 classes `ok`, 0 dead.** The hand-kept
  list this step used to carry named 75 and called itself *"the whole set of
  theme-named classes the five components write — not a sample"*. It was not:
  two of the 75 (`-top-half`, `-start-half`) are written nowhere in the five, and
  29 that are written were missing from it, including `gap-stat-dot`,
  `mt-stat-label` and `before:-inset-[5px]` — the last being the transparent 44px
  hit-area overlay the touch-target rule turns on, i.e. the one class in the set
  whose absence would break a global constraint.

  `z-floating` no longer needs its footnote: the minting pass landed, and it
  compiles to `.z-floating{z-index:var(--role-z-floating)}`. If it ever comes back
  `DEAD`, the stacking ladder has been lost from `tailwind.config.js` — a theme
  regression to report, not a class to re-mint.

  **A failure.** `DEAD` — the class compiled to no rule at all; that is a **typo
  in the component**, so fix the class string, rebuild, re-run. `EMPTY` — the
  selector emitted with an empty body, so the theme key resolves to nothing.
  `NOVAR` — the rule reads a `var(--…)` nothing declares. The last two are theme
  regressions: **stop and report them.** Do **not** add the name to
  `ui/tailwind.config.js`, `src/styles/tokens.css`, `src/styles/roles.css` or
  `tailwind-probe.txt`. All four are frozen for the duration of this plan and
  were unfrozen exactly once, by the single minting pass in
  `.superpowers/sdd/mint-spec.md`; minting one here to make a misspelling compile
  recreates the unreachable-token problem the whole rebuild exists to fix. A
  value that genuinely has no name goes into `mint-spec.md`, not into the config
  and not into this task's commit.

  **What this step cannot prove:** that these files write a class and that the
  class compiles to a rule with declarations, yes. That the class reaches the
  right element, that the element renders, that it is visible, or that its value
  is the one the design asks for — no. That stays with the Playwright checks.

  Tailwind's own utilities (`flex`, `flex-col`, `inline-flex`, `items-center`,
  `justify-center`, `flex-1`, `flex-none`, `text-center`, `min-w-0`, `list-none`,
  `m-0`, `p-0`, `border`, `border-0`, `border-2`, `fixed`, `absolute`,
  `left-auto`, `bg-transparent`, `font-bold`, `font-semibold`, `font-extrabold`,
  `font-normal`, `cursor-pointer`) are checked too, and pass — the scanner does
  not exempt them, because a typo in one of them (`flexx`, `hiddne`) compiles to
  nothing just as quietly. That is the `bare word in a class string` promotion in
  the classifier.

- [ ] **Step 13: Nothing to commit**

  Step 12 changes no file. Green means the five components and the frozen theme
  agree. Anything else is a component bug, fixed in the component and folded into
  the Step 7 or Step 10 commit — **never** by adding a name to
  `ui/tailwind.config.js`, `ui/src/styles/tokens.css`, `ui/src/styles/roles.css`
  or `ui/tailwind-probe.txt`. Those four are frozen for the duration of this plan
  and were unfrozen exactly once, by the minting pass, for the 23 tokens / 9 roles
  / 29 keys it specifies. If a genuinely unnamed value turns up, stop and add it
  to `mint-spec.md`.

---

### Task 11: `Icon`, the icon set, `IconTile`, the department glyphs, the logo

Two facts frame this task. The nine newest screens contain **zero `<svg>` elements**, and
`grep "<img" ui/src` returns **zero** — while `ui/src/assets/inja-logo.jpg` has existed
since July and is imported by no file in `src/`. The design's whole visual language is a
glyph tile plus a line icon at stroke 2.2–2.6, and its one raster is the logo. The
product currently has no brand mark at all (audit S2).

Unicode characters are not an escape hatch: **no icon font, no PNG icons, no emoji, no
unicode-glyph icons**, with exactly two sanctioned exceptions carried over from the
source — the drag handle `⣿` in the reorder dialog, and the ICOM arrows `↓ → ← ↑` on the
IDEF0 card. The `×`, `−`, `+` and `⋯` characters used as glyphs today (audit P7) are not
among them.

**What the design does and does not give.** §5.1.2 fixes **eleven** of the 33 `InjaIcons`
paths literally. The other twenty-two, and the seven glyphs S1 renders that the set has
no key for at all — the crumb-bar house, the hamburger, the users filter funnel, the eye
and eye-off, the comment glyph and a sign-out mark — have no `d` anywhere in any source.
Those are drawn here to the set's stated construction (24×24 box, `stroke="currentColor"`,
`fill="none"`, round caps and joins) and are **flagged to the owner**: they are the one
place in this plan where a shape is authored rather than quoted.

**R8 normalisations for the ledger:**

| The design shows | Chosen | Why |
|---|---|---|
| The "more" affordance as a vertical kebab (S1 rows), a horizontal `InjaIcons.dots`, and the literal `⋯` in five places | **the vertical kebab: three `r=1.8` circles at `cx=12, cy=5\|12\|19`** | §9.7 l calls this "three different renderings of one idea". S1's row kebab is the one an implementation can reach, and `⋯` is a unicode glyph the design forbids. |
| `IconTile` inner glyph = exactly half the tile | **kept, except the reader's stated 26px on a 54px tile** | §5.1.2's rule is `Math.round(size/2)`; §6.17 states 26px for the reader's 54×54 tile. The stated number wins over the derived one. |

**Files:**
- Create: `ui/src/ui/icons/index.tsx`, `ui/src/ui/Icon.tsx`, `ui/src/ui/IconTile.tsx`, `ui/src/ui/Logo.tsx`, `ui/src/ui/icons.test.tsx`
- Modify: `ui/src/lib/departments.ts` (add `numeralClass` to `deptMeta`), `ui/src/ui/PasswordField.tsx`, `ui/src/ui/Dropdown.tsx`, `ui/src/ui/Pager.tsx`, `ui/src/ui/FAB.tsx` (each swaps its inline SVG for `<Icon>`), `ui/src/ui/Accordion.tsx` (step 9 — its `−`/`+` is the last unicode glyph in `src/ui/`)

**Interfaces:**

- Consumes:
  - `useSurface()` / `SurfaceProvider` from `ui/src/ui/surface.tsx` (Task 5).
  - `deptMeta` and `DEPT_CODES` from `ui/src/lib/departments.ts` (existing — the nine
    24×24 `d` strings and their fixed violet/coral accents are already there, verbatim
    from the deliverable's `DEPTS`).
  - Task 2's utilities: `rounded-card` `rounded-tile` `rounded-input` `rounded-feature` · `bg-tile-v` `text-violet` · `bg-tile-c` `text-conflict` · `bg-tile-warn` `text-warn` · `bg-tile-ok` `text-green` · `text-dept-numeral-violet` `#EDE4FA` (`--dept-numeral-violet`) · `text-dept-numeral-coral` `#FBE4E1` (`--dept-numeral-coral`).
- Produces:
  - `ui/src/ui/icons/index.tsx` — `const ICONS: Record<IconName, ReactNode>`, `type IconName`. Twenty-one keys; the rest arrive with the screen that renders them.
  - `ui/src/ui/Icon.tsx` — `function Icon({ name, d, px, stroke, className }: { name?: IconName; d?: string; px?: number; stroke?: number; className?: string }): JSX.Element`. `d` wins over `name` (§5.1.2), which is how the nine department paths reach it without joining the set. **`px`, not `size`** — `guards.test.ts`'s F4/F8 guard forbids a `size` prop on a shared component, and the value here is a pixel box rather than a density.
  - `ui/src/ui/IconTile.tsx` — `function IconTile({ dept, name, d, accent, px, className }: { dept?: string; name?: IconName; d?: string; accent?: 'violet' | 'coral' | 'warn' | 'ok'; px?: number; className?: string }): JSX.Element`
  - `ui/src/ui/Logo.tsx` — `function Logo({ px, radius, className }: { px?: number; radius?: string; className?: string }): JSX.Element`
  - `ui/src/lib/departments.ts` — `deptMeta(code)` gains `numeralClass: string`.

- [ ] **Step 1: Write the failing test**

Create `ui/src/ui/icons.test.tsx`:

```tsx
import { describe, it, expect } from 'vitest'
import { render } from '@testing-library/react'
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'
import type { ReactNode } from 'react'
import { SurfaceProvider } from './surface'
import { Icon } from './Icon'
import { ICONS } from './icons'
import { IconTile } from './IconTile'
import { Logo } from './Logo'
import { deptMeta, DEPT_CODES } from '../lib/departments'

function on(surface: 'panel' | 'reader', node: ReactNode) {
  return render(<SurfaceProvider surface={surface}>{node}</SurfaceProvider>)
}

describe('Icon', () => {
  it('draws on the 24-box the design specifies, in the caller colour', () => {
    const { container } = render(<Icon name="check" />)
    const svg = container.querySelector('svg') as SVGElement
    expect(svg.getAttribute('viewBox')).toBe('0 0 24 24')
    expect(svg.getAttribute('stroke')).toBe('currentColor')
    expect(svg.getAttribute('fill')).toBe('none')
    expect(svg.getAttribute('stroke-linecap')).toBe('round')
    expect(svg.getAttribute('aria-hidden')).toBe('true')
  })

  it('takes its box and its stroke from the caller', () => {
    const { container } = render(<Icon name="chevronStart" px={15} stroke={2.4} />)
    const svg = container.querySelector('svg') as SVGElement
    expect(svg.getAttribute('width')).toBe('15')
    expect(svg.getAttribute('height')).toBe('15')
    expect(svg.getAttribute('stroke-width')).toBe('2.4')
  })

  it('lets an explicit path beat a named one', () => {
    // §5.1.2 — `d` wins over `name`. It is how the nine department glyphs reach
    // the component without joining the icon set.
    const { container } = render(<Icon name="check" d="M4 20l16-16" />)
    const paths = container.querySelectorAll('path')
    expect(paths).toHaveLength(1)
    expect(paths[0].getAttribute('d')).toBe('M4 20l16-16')
  })

  it('carries the eleven paths the design fixes, byte for byte', () => {
    const fixed: Record<string, string> = {
      chevronEnd: 'M9 18l6-6-6-6',
      chevronStart: 'M15 18l-6-6 6-6',
      chevronNext: 'M9 6l6 6-6 6',
      chevronPrev: 'M15 6l-6 6 6 6',
      chevronDown: 'M6 9l6 6 6-6',
      chevronUp: 'M18 15l-6-6-6 6',
      check: 'M20 6L9 17l-5-5',
    }
    for (const [name, d] of Object.entries(fixed)) {
      const { container, unmount } = render(<Icon name={name as keyof typeof ICONS} />)
      expect(container.querySelector('path')?.getAttribute('d'), name).toBe(d)
      unmount()
    }
    const search = render(<Icon name="search" />)
    expect(search.container.querySelector('circle')?.getAttribute('r')).toBe('7')
    expect(search.container.querySelector('path')?.getAttribute('d')).toBe('m21 21-4.3-4.3')
  })

  it('draws the kebab vertically, the way S1 does', () => {
    // §9.7 l — three renderings of one idea; this is the one S1 uses on a row.
    const { container } = render(<Icon name="dots" />)
    const cys = Array.from(container.querySelectorAll('circle')).map((c) => c.getAttribute('cy'))
    expect(cys).toEqual(['5', '12', '19'])
    expect(container.querySelectorAll('circle')[0].getAttribute('cx')).toBe('12')
  })
})

describe('IconTile', () => {
  it('is 48/14 in the panel and 54/16 in the reader, with a half-size glyph', () => {
    const { container, unmount } = on('panel', <IconTile dept="dining" />)
    const tile = container.querySelector('[data-tile]') as HTMLElement
    expect(tile.style.width).toBe('48px')
    expect(tile).toHaveClass('rounded-tile')
    expect(container.querySelector('svg')?.getAttribute('width')).toBe('24')
    unmount()
    const reader = on('reader', <IconTile dept="dining" />)
    const big = reader.container.querySelector('[data-tile]') as HTMLElement
    expect(big.style.width).toBe('54px')
    expect(big).toHaveClass('rounded-card')
    // §6.17 states 26px, not the 27 the half-the-tile rule would give.
    expect(reader.container.querySelector('svg')?.getAttribute('width')).toBe('26')
  })

  it('takes each department’s fixed accent, never a decorative one', () => {
    const { container, unmount } = on('panel', <IconTile dept="dining" />)
    expect(container.querySelector('[data-tile]')).toHaveClass('bg-tile-c', 'text-conflict')
    unmount()
    const violet = on('panel', <IconTile dept="warehouse" />)
    expect(violet.container.querySelector('[data-tile]')).toHaveClass('bg-tile-v', 'text-violet')
  })

  it('draws the department glyph at stroke 1.9', () => {
    const { container } = on('panel', <IconTile dept="cooking" />)
    const svg = container.querySelector('svg') as SVGElement
    expect(svg.getAttribute('stroke-width')).toBe('1.9')
    expect(container.querySelector('path')?.getAttribute('d')).toBe(deptMeta('cooking').icon)
  })
})

describe('the department accent map', () => {
  it('gives every one of the nine a numeral tint as well as a tile', () => {
    // The audit's §4: deptMeta returned tileClass and not the numeral tint, which
    // is why Departments.tsx hard-codes #FBE4E1 and #EDE4FA.
    for (const code of DEPT_CODES) {
      const m = deptMeta(code)
      expect(m.numeralClass, code).toBe(
        m.accent === 'coral' ? 'text-dept-numeral-coral' : 'text-dept-numeral-violet',
      )
    }
    expect(DEPT_CODES).toHaveLength(9)
  })
})

describe('Logo', () => {
  it('draws the one raster the product ships', () => {
    const { container } = render(<Logo />)
    const img = container.querySelector('img') as HTMLImageElement
    expect(img.getAttribute('src')).toMatch(/inja-logo/)
    expect(img).toHaveClass('object-cover', 'rounded-input')
    expect(img.getAttribute('width')).toBe('38')
    // Decorative beside the wordmark it sits next to; naming it twice is worse
    // than not naming it once.
    expect(img.getAttribute('alt')).toBe('')
  })

  it('takes the login size too', () => {
    const { container } = render(<Logo px={76} radius="rounded-feature" />)
    const img = container.querySelector('img') as HTMLImageElement
    expect(img.getAttribute('width')).toBe('76')
    expect(img).toHaveClass('rounded-feature')
  })
})

describe('the icon rule', () => {
  it('leaves no unicode glyph standing in for an icon in src/ui/', () => {
    // "No icon font, no PNG icons, no emoji, no unicode-glyph icons", with two
    // sanctioned exceptions that live in src/write/ and src/flow/, not here.
    //
    // COMMENTS ARE BLANKED FIRST, and that is not a loophole — it is the
    // difference between the rule and a spellcheck. `×` is the multiplication
    // sign this codebase writes every box with (`34×34`, `2×5`, `24×24 box`,
    // `48×48/radius 14`, `52×52`), `…` is an ellipsis (`transition-…`), `→` is
    // an arrow in an explanation (`gap-s4 → gap-s99 emits nothing`). Scanned
    // raw, this test fails on seven lines in src/ui/ today — six of them prose
    // — and on three of this task's own files, none of which renders anything.
    // The rule is about what reaches the screen. Blanked rather than deleted so
    // the line numbers in the failure still point at the real line.
    const dir = join(process.cwd(), 'src/ui')
    const files: string[] = []
    ;(function walk(d: string) {
      for (const name of readdirSync(d)) {
        const p = join(d, name)
        if (statSync(p).isDirectory()) walk(p)
        else if (/\.tsx?$/.test(name) && !/\.test\.tsx?$/.test(name)) files.push(p)
      }
    })(dir)
    const blank = (m: string) => m.replace(/[^\n]/g, ' ')
    // The `[^:"'\`\\]` lookbehind-by-capture keeps `https://` and a `//` inside
    // a string literal from swallowing the rest of the line.
    const decomment = (src: string) =>
      src
        .replace(/\/\*[\s\S]*?\*\//g, blank)
        .replace(/(^|[^:"'`\\])\/\/[^\n]*/g, (m, lead: string) => lead + blank(m.slice(lead.length)))
    const hits = files.flatMap((p) => {
      const raw = readFileSync(p, 'utf8')
      const shown = raw.split('\n')
      return decomment(raw)
        .split('\n')
        .map((line, i) => ({ p: p.slice(p.indexOf('src/')), n: i + 1, line, raw: shown[i] }))
        .filter(({ line }) => /[×−⋯…✓✔➜←→↑↓]/.test(line))
    })
    expect(hits.map((h) => `${h.p}:${h.n} ${h.raw.trim()}`)).toEqual([])
  })

  it('has folded the four inline SVGs Tasks 7–10 left behind into Icon', () => {
    // Four, named — not "every SVG in src/ui/". `Overlay.tsx`'s close cross,
    // `SearchField.tsx`'s magnifier, `Button.tsx`'s spinner and `Checkbox.tsx`'s
    // 13px tick keep theirs: each is drawn by the task that owns it and none is
    // on this task's Modify list. A test named for all of them would be read as
    // licence to rewrite four files this task never opened.
    const named = ['PasswordField', 'Dropdown', 'Pager', 'FAB']
    for (const f of named) {
      const src = readFileSync(join(process.cwd(), `src/ui/${f}.tsx`), 'utf8')
      expect(src, f).not.toMatch(/<svg/)
      expect(src, f).toMatch(/<Icon/)
    }
  })
})
```

- [ ] **Step 2: Run it and watch it fail**

Run: `cd ui && npx vitest run src/ui/icons.test.tsx`
Expected: FAIL — `Failed to resolve import "./Icon" from "src/ui/icons.test.tsx"`.

- [ ] **Step 3: Write the icon set**

Create `ui/src/ui/icons/index.tsx`:

```tsx
import type { ReactNode } from 'react'

/**
 * The line-icon set (§"Iconography").
 *
 * Every glyph is drawn on a 24×24 box with `stroke="currentColor"`, `fill="none"`
 * and round caps and joins, so an icon always inherits its role colour and the
 * caller decides the stroke — which carries meaning here: 1.9 for the nine
 * department glyphs, 2 general, 2.2 hamburger/small chevrons/FAB, 2.4
 * chevrons/back arrows/plus, 2.6 checks/calendar nav/step chevron, 3 for the
 * check inside a 12–13px tick box.
 *
 * **Provenance.** The seven chevrons and checks, `search`, `user` and `dots` are
 * the paths the design fixes literally (§5.1.2) and are quoted byte for byte.
 * `file`, `inbox` and `logout` are the paths already in this codebase, carried
 * over from the prototype. The rest are authored to the construction above,
 * because neither deliverable, the token files nor the 33-key `InjaIcons` export
 * carries a `d` for them — see the plan's owner questions.
 */
export const ICONS = {
  chevronStart: <path d="M15 18l-6-6 6-6" />,
  chevronEnd: <path d="M9 18l6-6-6-6" />,
  chevronNext: <path d="M9 6l6 6-6 6" />,
  chevronPrev: <path d="M15 6l-6 6 6 6" />,
  chevronDown: <path d="M6 9l6 6 6-6" />,
  chevronUp: <path d="M18 15l-6-6-6 6" />,
  check: <path d="M20 6L9 17l-5-5" />,
  search: <><circle cx="11" cy="11" r="7" /><path d="m21 21-4.3-4.3" /></>,
  user: <><circle cx="12" cy="8" r="4" /><path d="M4 21a8 8 0 0 1 16 0" /></>,
  userBust: <><circle cx="12" cy="7.5" r="3.5" /><path d="M5.5 20a6.5 6.5 0 0 1 13 0" /></>,
  // S1's row kebab: three filled circles stacked vertically (§9.7 l).
  dots: <><circle cx="12" cy="5" r="1.8" fill="currentColor" stroke="none" /><circle cx="12" cy="12" r="1.8" fill="currentColor" stroke="none" /><circle cx="12" cy="19" r="1.8" fill="currentColor" stroke="none" /></>,
  file: <><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" /><path d="M14 2v6h6" /></>,
  inbox: <><rect x="3" y="5" width="18" height="14" rx="2" /><path d="M3 8l9 6 9-6" /></>,
  logout: <><path d="M15 4h3a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2h-3" /><path d="M10 16l-4-4 4-4M6 12h10" /></>,
  home: <><path d="M3 11l9-7 9 7" /><path d="M5.5 9.5V20h13V9.5" /></>,
  menu: <path d="M4 7h16M4 12h16M4 17h16" />,
  comment: <path d="M21 12a8 8 0 0 1-8 8H7l-4 3v-5.5A8 8 0 0 1 11 4h2a8 8 0 0 1 8 8z" />,
  funnel: <path d="M3 5h18l-7 8v6l-4 2v-8z" />,
  trash: <path d="M4 7h16M9 7V5a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2M6 7l1 13a1 1 0 0 0 1 1h8a1 1 0 0 0 1-1l1-13" />,
  eye: <><path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7-10-7-10-7z" /><circle cx="12" cy="12" r="3" /></>,
  eyeOff: <><path d="M10.6 6.2A9.7 9.7 0 0 1 12 6c6.4 0 10 7 10 7a17.6 17.6 0 0 1-3.4 4.3M6.6 7.7A17.6 17.6 0 0 0 2 13s3.6 7 10 7a9.6 9.6 0 0 0 4.2-.9" /><path d="M3 3l18 18" /></>,
} satisfies Record<string, ReactNode>

export type IconName = keyof typeof ICONS
```

- [ ] **Step 4: Write `Icon`**

Create `ui/src/ui/Icon.tsx`:

```tsx
import { ICONS, type IconName } from './icons'

/**
 * One inline SVG for every glyph in the product.
 *
 * `px` rather than `size`: `guards.test.ts`'s F4/F8 guard forbids a size prop on a shared
 * component (F4/F8 puts density on the shell), and this is a pixel box rather
 * than a density anyway — a 12px file chip and a 26px department glyph are two
 * different drawings, not two densities of one.
 *
 * `d` wins over `name` (§5.1.2), which is how the nine department paths — which
 * live in `lib/departments.ts` beside their fixed accents — reach the component
 * without being copied into the icon set.
 */
export function Icon({
  name, d, px = 16, stroke = 2, className = '',
}: {
  name?: IconName
  d?: string
  px?: number
  stroke?: number
  className?: string
}) {
  return (
    <svg
      width={px}
      height={px}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={stroke}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
      focusable="false"
      className={`block flex-none ${className}`}
    >
      {d !== undefined ? <path d={d} /> : name !== undefined ? ICONS[name] : null}
    </svg>
  )
}
```

- [ ] **Step 5: Write `IconTile` and `Logo`, and give the departments their numeral tint**

Create `ui/src/ui/IconTile.tsx`:

```tsx
import { Icon } from './Icon'
import { useSurface } from './surface'
import { deptMeta } from '../lib/departments'
import type { IconName } from './icons'

// §5.1.2 — four accents, and colour here is meaning: each of the nine
// departments is fixed violet or coral and is never re-assigned (§1.1).
const ACCENT = {
  violet: 'bg-tile-v text-violet',
  coral: 'bg-tile-c text-conflict',
  warn: 'bg-tile-warn text-warn',
  ok: 'bg-tile-ok text-green',
} as const

export function IconTile({
  dept, name, d, accent, px, className = '',
}: {
  dept?: string
  name?: IconName
  d?: string
  accent?: keyof typeof ACCENT
  px?: number
  className?: string
}) {
  const reader = useSurface() === 'reader'
  // R3 — the department tile is 48×48/radius 14 in the panel and 54×54/radius 16
  // in the reader. The glyph is half the tile (§5.1.2) except in the reader,
  // where §6.17 states 26 rather than the 27 the rule would give: a stated
  // number beats a derived one.
  const box = px ?? (reader ? 54 : 48)
  const glyph = px !== undefined ? Math.round(px / 2) : reader ? 26 : 24
  const meta = dept !== undefined ? deptMeta(dept) : undefined
  const tone = ACCENT[accent ?? meta?.accent ?? 'violet']
  return (
    <span
      data-tile
      className={`inline-flex items-center justify-center flex-none ${box >= 54 ? 'rounded-card' : 'rounded-tile'} ${tone} ${className}`}
      style={{ width: box, height: box }}
    >
      <Icon name={name} d={d ?? meta?.icon} px={glyph} stroke={1.9} />
    </span>
  )
}
```

Create `ui/src/ui/Logo.tsx`:

```tsx
import logoSrc from '../assets/inja-logo.jpg'

/**
 * The only brand raster the product ships: `object-fit: cover`, 38px at radius
 * 11 in the app bar and 76px at radius 20 on login (`--size-logo-bar`,
 * `--size-logo-login`). Never recoloured, re-cropped or redrawn as SVG.
 *
 * `alt=""` because every place it appears it sits beside the wordmark
 * «اینجا فست‌فود»; a second announcement of the same name is noise, not access.
 */
export function Logo({
  px = 38, radius = 'rounded-input', className = '',
}: {
  px?: number
  radius?: string
  className?: string
}) {
  return (
    <img
      src={logoSrc}
      alt=""
      width={px}
      height={px}
      className={`object-cover flex-none ${radius} ${className}`}
    />
  )
}
```

In `ui/src/lib/departments.ts`, extend the accent map and the return value:

```ts
const TILE: Record<Accent, string> = {
  violet: 'bg-tile-v text-violet',
  coral: 'bg-tile-c text-conflict',
}

// The ghosted two-digit index on a department card (§6.1) — `--dept-numeral-violet`
// and `--dept-numeral-coral`. They lived here as raw hexes in Departments.tsx
// because this map returned the tile and not the numeral; the accent belongs in
// one place, whole.
const NUMERAL: Record<Accent, string> = {
  violet: 'text-dept-numeral-violet',
  coral: 'text-dept-numeral-coral',
}

export function deptMeta(code: string): {
  icon: string; accent: Accent; tileClass: string; numeralClass: string
} {
  const m = META[code] ?? { accent: 'violet' as Accent, icon: '' }
  return { ...m, tileClass: TILE[m.accent], numeralClass: NUMERAL[m.accent] }
}
```

- [ ] **Step 6: Run it and watch the icon half pass**

Run: `cd ui && npx vitest run src/ui/icons.test.tsx`
Expected: **11 passed, 2 failed, 13 total.** The whole file, not a `-t` slice: the obvious
filter (`-t 'Icon|IconTile|department accent|Logo'`) does not do what it looks like — the
pattern is matched against the *full* test name, and `has folded … into Icon` contains
`Icon`, so the slice would drag in one of the two tests that are supposed to be red and
report a failure as a surprise.

The 11 green are `Icon` (5), `IconTile` (3), `the department accent map` (1) and `Logo` (2).
The 2 red are both in `the icon rule`, and both for reasons step 8 and step 9 fix:
`Accordion.tsx`'s `−`/`+` is still there, and Tasks 7–10 left four inline SVGs behind.

- [ ] **Step 7: Commit**

```
git add ui/src/ui/icons/index.tsx ui/src/ui/Icon.tsx ui/src/ui/IconTile.tsx ui/src/ui/Logo.tsx ui/src/ui/icons.test.tsx ui/src/lib/departments.ts
git commit -m "feat(ui): the line-icon set, the glyph tile, and the logo that was always in the repo"
```

- [ ] **Step 8: Fold the four inline SVGs into `Icon`**

Each of Tasks 7–10 inlined the glyph it needed because this task had not run yet. Replace
them now — four edits, **no behaviour change and no change to any painted value**.

The four do not all size their glyph the same way, and the swap must follow each file
rather than impose one shape on all four. Two of them size with a **class** off the token
scale (`w-reveal-glyph`, `w-chevron`) and two with a **width/height attribute**. Where the
class is what the file has, `px` must NOT replace it: `px` writes a bare number into the
component and drops the token, and in `PasswordField`'s case it also turns a Task 7 test
red — `fields.test.tsx` resolves the glyph's `width` through the CSS cascade and asserts it
is `var(--size-reveal-glyph)`, which an attribute does not satisfy.

- `ui/src/ui/PasswordField.tsx`: delete the `EYE` / `EYE_OFF` constants and the `<svg>`;
  the button's child becomes
  **`<Icon name={shown ? 'eyeOff' : 'eye'} className="w-reveal-glyph h-reveal-glyph" />`.**
  No `px` (the class carries the 17px) and no `stroke` — `Icon`'s default is 2, which is
  what `fields.test.tsx` asserts. **Keep the wrapper `<span className="absolute start-s4
  top-1/2 -translate-y-1/2 inline-flex">`**: the button needs `relative` for its hit area
  and `relative` and `absolute` are the same property, so the pin lives on the wrapper.
  The paths in `ICONS.eye` / `ICONS.eyeOff` are byte-identical to the constants being
  deleted, so `fields.test.tsx`'s strike assertion (`d === 'M3 3l18 18'`) still holds.
- `ui/src/ui/Dropdown.tsx`: the trigger's chevron becomes
  `<Icon name="chevronDown" px={15} stroke={2.2} className="text-muted" />`; the picked
  check becomes `<Icon name="check" px={14} stroke={3} className="text-violet" />`. `px`
  here, because attributes are what Task 8 wrote — this is a like-for-like swap, not a
  re-sizing. (`Icon` adds `flex-none`, which both SVGs carry today.)
- `ui/src/ui/Pager.tsx`: **`<Icon name="chevronPrev" stroke={2.4} className="w-chevron
  h-chevron" />`** and **`<Icon name="chevronNext" stroke={2.4} className="w-chevron
  h-chevron" />`** — the class, not `px={15}`: `w-chevron` is `--size-chevron`, the token
  Task 9 put there deliberately. Delete the `CHEVRON` constant, and **carry its doc comment
  onto the two `<Icon>` calls**: it is the only written record of why «قبلی» points right
  in an RTL row, and `table.test.tsx` pins the two `d` values to the two labels. The
  `d`s in `ICONS.chevronPrev` / `ICONS.chevronNext` are byte-identical to `CHEVRON.prev` /
  `CHEVRON.next`, so that test does not move.
- `ui/src/ui/FAB.tsx`: `<Icon name="comment" px={22} stroke={2.2} />` — attributes, as
  Task 10 wrote them.

- [ ] **Step 9: Run the whole icon suite and watch it pass**

Run: `cd ui && npx vitest run src/ui/icons.test.tsx src/ui/fields.test.tsx src/ui/choices.test.tsx src/ui/table.test.tsx src/ui/composites.test.tsx`
Expected: PASS — **all 13 tests in `icons.test.tsx`**, and every test in the four suites
Tasks 7–10 wrote still green. (A total is not stated for those four: three of them have
been revised since this section was written, and a number that goes stale is a number that
gets ignored. What matters is that none of them moves.)

`has folded the four inline SVGs Tasks 7–10 left behind into Icon` is the test step 8 just
turned. `leaves no unicode glyph standing in for an icon in src/ui/` is the other, and it
now names exactly one line — `Accordion.tsx`'s `−`/`+` (audit P7), the last unicode glyph
in `src/ui/`. **Fix it in the same edit**: swap
`<span aria-hidden>{open ? '−' : '+'}</span>` for
`<Icon name={open ? 'chevronUp' : 'chevronDown'} px={16} stroke={2.4} />`. The span is
already `aria-hidden` and `Icon` is too, so the header's accessible name does not change
and `controls.test.tsx`'s `getByRole('button', { name: 'سرپرست سالن' })` does not move.

- [ ] **Step 10: Commit**

```
git add ui/src/ui/PasswordField.tsx ui/src/ui/Dropdown.tsx ui/src/ui/Pager.tsx ui/src/ui/FAB.tsx ui/src/ui/Accordion.tsx
git commit -m "refactor(ui): one place to change a glyph, not five"
```

- [ ] **Step 11: Run the whole suite, the type-checker and the linter**

Run: `cd ui && npx vitest run && npx tsc -b && npx eslint .`
Expected: all three exit 0. `tsc -b` is the one that proves the `.jpg` import resolves —
`src/vite-env.d.ts` already carries `/// <reference types="vite/client" />`, which is what
types it; if that line were missing this is where it would surface.

- [ ] **Step 12: Build, and check the logo actually shipped**

An `<img>` whose asset the bundler did not emit is invisible in exactly the way the
missing-class problem is invisible:

```bash
cd ui && npm run build && node -e '
const fs=require("fs");
const js=fs.readdirSync("dist/assets").filter(f=>/\.js$/.test(f))
  .map(f=>fs.readFileSync("dist/assets/"+f,"utf8")).join("\n");
const asset=fs.readdirSync("dist/assets").some(f=>/^inja-logo.*\.jpg$/.test(f));
const referenced=/inja-logo[-.\w]*\.jpg/.test(js);
console.log(asset&&referenced?"OK logo emitted and referenced":`MISSING asset=${asset} referenced=${referenced}`);
process.exit(asset&&referenced?0:1);'
```

Expected: `OK logo emitted and referenced`.

- [ ] **Step 13: Prove every class the icon layer writes emits**
  ```bash
  cd ui && npx vite build
  node scripts/harvest-classes.mjs src/ui/Icon.tsx src/ui/icons/index.tsx src/ui/IconTile.tsx src/ui/Logo.tsx src/lib/departments.ts \
    src/ui/PasswordField.tsx src/ui/Dropdown.tsx src/ui/Pager.tsx src/ui/FAB.tsx src/ui/Accordion.tsx
  ```
  Expected: the run ends `DEAD 0   EMPTY 0   NOVAR 0`, both controls hold
  (`control (negative): N/N invented names reported dead` and
  `control (escaping): … escaped variant classes unescaped`), and the last line
  is `PASS`. The script exits 1 on any failure, so it can be `&&`-chained.
  The class list is **harvested out of these files**, never hand-kept, so it
  cannot drift from what they write and `tailwind-probe.txt` cannot certify it
  on their behalf — see *The class-emission check* in Global Constraints for the
  measurement that retired the old grep.

  The five files on the second line are the ones Step 10 re-pointed at the icon
  set; they are named here because this task rewrote their markup and a class
  string is easy to lose in that edit.

  `src/lib/departments.ts` is the interesting one. It holds
  `deptMeta().numeralClass` — `text-dept-numeral-violet` / `text-dept-numeral-coral`
  — in a plain module with no JSX in sight, and the scanner still judges it. The
  old note here claimed those two tints were *"the likely misses — tokens the
  theme never named"*. **That was already untrue when it was written:**
  `--dept-numeral-violet` `#EDE4FA` and `--dept-numeral-coral` `#FBE4E1` are
  declared in the frozen `_ds` `colors.css` and both sit on `colors` in
  `tailwind.config.js`. `Departments.tsx` hard-coding the hexes is what **Task 14**
  fixes by consuming `numeralClass`; nothing about it was ever a gap in the theme.

  **A failure.** `DEAD` — the class compiled to no rule at all; that is a **typo
  in the component**, so fix the class string, rebuild, re-run. `EMPTY` — the
  selector emitted with an empty body, so the theme key resolves to nothing.
  `NOVAR` — the rule reads a `var(--…)` nothing declares. The last two are theme
  regressions: **stop and report them.** Do **not** add the name to
  `ui/tailwind.config.js`, `src/styles/tokens.css`, `src/styles/roles.css` or
  `tailwind-probe.txt`. All four are frozen for the duration of this plan and
  were unfrozen exactly once, by the single minting pass in
  `.superpowers/sdd/mint-spec.md`; minting one here to make a misspelling compile
  recreates the unreachable-token problem the whole rebuild exists to fix. A
  value that genuinely has no name goes into `mint-spec.md`, not into the config
  and not into this task's commit.

  **What this step cannot prove:** that these files write a class and that the
  class compiles to a rule with declarations, yes. That the class reaches the
  right element, that the element renders, that it is visible, or that its value
  is the one the design asks for — no. That stays with the Playwright checks.


- [ ] **Step 14: Nothing to commit**

  This step changes no file, and there is no expected miss to chase.

  **Do not add a missing utility to `ui/tailwind.config.js`,
  `ui/src/styles/tokens.css`, `ui/src/styles/roles.css` or
  `ui/tailwind-probe.txt`.** All four are frozen for the duration of this plan and
  were unfrozen exactly once, by the single minting pass specified in
  `.superpowers/sdd/mint-spec.md`. A `DEAD` here is a **typo in a component's
  class string**, and the fix is in the component: minting a name to make a
  misspelling compile recreates the problem this rebuild exists to undo. If a
  genuinely unnamed value turns up, stop and add it to `mint-spec.md` rather than
  to the config.

---

### Task 12: `PanelShell` — chrome, logo, breadcrumb, both breakpoints, Persian digits

The shell is where the drift is most visible and most consequential. Today it renders a
**solid violet bar with text links**; the design renders a **white bar with a cream
hairline**, a logo, a brand lockup, a pill nav tray and — on every screen but the home
screen — a breadcrumb strip instead of the bar. Four of the audit's HIGH findings live in
this one file:

- **S1** — seven header controls at **1.04:1 hover contrast**: `text-card` (`#FFFFFF`) on
  `hover:bg-tile-v2` (`#F4EFFB`). Hovering «نمایه», «نمایش محتوا», «کاربران», the inbox
  button or the logout button paints a near-white block over the dark bar and the label
  inside it vanishes. The design's fix is not a new hover colour: the bar is **white**, so
  its controls are `--violet` and `#F4EFFB` is the correct hover under them.
- **S2** — `ui/src/assets/inja-logo.jpg` is imported by no file in `src/`.
- **S3** — `PanelShell.tsx:22` documents "Compact density, **breadcrumb trail**,
  administration surfaces" and there is no breadcrumb anywhere in `src/`. Standing on
  `/processes/dining-003/flow` there is nothing in the chrome that names the process or
  its department and nothing that returns to either.
- **S4** — `{openCount}` and `{session.pendingApprovals}` are the only latin digits in the
  product.

Plus **S5** (a 44×44 coral square holding one digit) and **S6** (the two shells pad their
headers 24px and 16px, and `--pad-topbar: 22px` exists).

**Two scoping notes.**

1. §6.0 replaces the crumb strip with the flowchart's **own tool bar** on `/processes/:pid/flow`.
   `src/flow/**` is frozen (F16) and has no bar, so the panel keeps the crumb strip there:
   without it that screen would have no chrome and no way back at all. The design's flow
   bar is out of this plan's scope, deliberately.
2. §6.0's `adminDefs` lists «گزارش فعالیت کاربران» and the top bar lists «صندوق کامنت‌ها».
   Neither screen exists in this app. **R5** — an entry whose target the caller cannot
   reach is absent, not disabled — so neither is drawn. The nav tray carries what exists.

**One addition the design does not have.** There is no sign-out affordance anywhere in
either deliverable. The app has one and must keep it; it is drawn as a `34×34` ghost icon
button in the right cluster, on the metrics §5.2 gives icon buttons. **Flagged to the owner.**

**Files:**
- Create: `ui/src/shell/crumbs.ts`, `ui/src/shell/crumbs.test.ts`, `ui/e2e/panel-shell.spec.ts`
- Modify: `ui/src/shell/PanelShell.tsx`, `ui/src/shell/shells.test.tsx`, `ui/src/shell/PanelShell.visibility.test.tsx`, `ui/src/test/guards.test.ts` (`PanelShell.tsx` joins the `dir=` island list)

**Interfaces:**

- Consumes:
  - `SurfaceProvider` (props `{ value: 'panel' | 'reader'; children: ReactNode }`) from `ui/src/ui/surface.tsx` (Task 5).
  - `Sheet` from `ui/src/ui/Overlay.tsx` — props `{ open, onClose, title, children }` (Task 6 adds more; these four are the ones used here).
  - `Icon` (Task 11), `Logo` (Task 11).
  - `useDepartments`, `usePending`, `useLogout` from `ui/src/api/hooks.ts`; `can` from `ui/src/auth/session.ts`; `administrationRefusal` from `ui/src/auth/can.ts`; `toFa` from `ui/src/lib/format.ts`; `DEPT_CODES` from `ui/src/lib/departments.ts` — all existing.
  - `expectDesign(page, screen)` and `shot(page, name)` from `ui/e2e/_harness.ts` (Task 4); the three widths are `playwright.config.ts`'s three projects, so one spec runs at 1440, 1080 and 760.
  - Task 2's utilities: `text-fs-body` `text-fs-menu` `text-fs-sm2` `text-fs-xs` `text-fs-micro` · `rounded-card` `rounded-button` `rounded-input` `rounded-control` `rounded-tool` `rounded-round` · `bg-card` `bg-tile-v2` `bg-violet` `bg-coral` `bg-ink` · `border-warm` `#EFE7DC` · `border-line` `#E3D8F5` · `border-border-card` · `bg-border-current` `#EDE5F5` · `text-ink` `text-violet` `text-muted` `text-faint` `text-card` · `shadow-pop` · `max1080:` and `max760:` (Task 2's two max-width screens).
- Produces:
  - `ui/src/shell/crumbs.ts` — `interface Crumb { label: string; to?: string; mono?: boolean }`; `function panelCrumbs(pathname: string, deptName: (code: string) => string): Crumb[]`
  - `ui/src/shell/PanelShell.tsx` — unchanged export `function PanelShell({ session }: { session: SessionDescriptor }): JSX.Element`, now wrapping its subtree in `<SurfaceProvider surface="panel">`.

- [ ] **Step 1: Write the failing test for the trail**

Create `ui/src/shell/crumbs.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { panelCrumbs } from './crumbs'

const name = (code: string) => ({ dining: 'سالن', cooking: 'پخت' }[code] ?? code)

describe('panelCrumbs', () => {
  it('gives the home screen a trail of one, going nowhere', () => {
    expect(panelCrumbs('/departments', name)).toEqual([{ label: 'دپارتمان‌ها' }])
  })

  it('names the department, and keeps home clickable', () => {
    expect(panelCrumbs('/departments/dining', name)).toEqual([
      { label: 'دپارتمان‌ها', to: '/departments' },
      { label: 'دپارتمان سالن' },
    ])
  })

  it('goes three deep for the department summary', () => {
    expect(panelCrumbs('/departments/dining/overview', name)).toEqual([
      { label: 'دپارتمان‌ها', to: '/departments' },
      { label: 'دپارتمان سالن', to: '/departments/dining' },
      { label: 'خلاصهٔ سالن' },
    ])
  })

  it('recovers the department from a process id, and sets the id LTR mono', () => {
    // The only thing assumed about a process id is what allocate-id guarantees:
    // `{dept}-{nnn}`. §8 — an id is a latin island.
    expect(panelCrumbs('/processes/dining-003', name)).toEqual([
      { label: 'دپارتمان‌ها', to: '/departments' },
      { label: 'دپارتمان سالن', to: '/departments/dining' },
      { label: 'dining-003', mono: true },
    ])
  })

  it('adds the flow leaf under the process', () => {
    expect(panelCrumbs('/processes/dining-003/flow', name)).toEqual([
      { label: 'دپارتمان‌ها', to: '/departments' },
      { label: 'دپارتمان سالن', to: '/departments/dining' },
      { label: 'dining-003', to: '/processes/dining-003', mono: true },
      { label: 'فلوچارت' },
    ])
  })

  it('gives a shorter trail rather than a wrong one for an id it cannot place', () => {
    // `/processes/abc` is one typed URL away and `:pid` matches any string.
    expect(panelCrumbs('/processes/abc', name)).toEqual([
      { label: 'دپارتمان‌ها', to: '/departments' },
      { label: 'abc', mono: true },
    ])
  })

  it('knows the administration screens', () => {
    expect(panelCrumbs('/users', name)).toEqual([{ label: 'کاربران' }])
    expect(panelCrumbs('/users/09120000000', name)).toEqual([
      { label: 'کاربران', to: '/users' },
      { label: 'دسترسی' },
    ])
    expect(panelCrumbs('/visibility', name)).toEqual([{ label: 'سیاست نمایش محتوا' }])
    expect(panelCrumbs('/profile', name)).toEqual([{ label: 'پروفایل و گذرواژه' }])
  })

  it('falls back to home rather than to an empty bar', () => {
    expect(panelCrumbs('/nowhere', name)).toEqual([{ label: 'دپارتمان‌ها' }])
  })
})
```

- [ ] **Step 2: Run it and watch it fail**

Run: `cd ui && npx vitest run src/shell/crumbs.test.ts`
Expected: FAIL — `Failed to resolve import "./crumbs" from "src/shell/crumbs.test.ts"`.

- [ ] **Step 3: Write the trail**

Create `ui/src/shell/crumbs.ts`:

```ts
import { DEPT_CODES } from '../lib/departments'

export interface Crumb {
  label: string
  /** Absent on the last crumb — that is where you already are. */
  to?: string
  /** A latin id: mono and `dir="ltr"` (§8). */
  mono?: boolean
}

const HOME = 'دپارتمان‌ها'

const FLAT: Record<string, string> = {
  users: 'کاربران',
  visibility: 'سیاست نمایش محتوا',
  profile: 'پروفایل و گذرواژه',
}

/**
 * The trail the design's crumb strip carries (§6.0), derived from the URL.
 *
 * Deriving rather than publishing — a context each screen pushes its own crumbs
 * into — because every panel route names its subject in the path, and the one
 * label that is not in the path, a department's Persian name, is already in the
 * `['departments']` query the shell holds. `deptName` is a parameter rather than
 * a hook call so this stays a pure function with a test of its own.
 *
 * `/processes/{pid}` has no department segment. The department is recovered from
 * the id, but only via the one thing `allocate-id` guarantees — a process id is
 * `{dept}-{nnn}` — and the prefix is checked against DEPT_CODES before it is
 * trusted. A hand-typed id therefore gets a **shorter** trail, never a wrong one.
 */
export function panelCrumbs(pathname: string, deptName: (code: string) => string): Crumb[] {
  const parts = pathname.split('/').filter(Boolean)

  if (parts[0] === 'departments') {
    if (parts.length === 1) return [{ label: HOME }]
    const code = parts[1]
    const home: Crumb = { label: HOME, to: '/departments' }
    if (parts[2] === 'overview') {
      return [home, { label: `دپارتمان ${deptName(code)}`, to: `/departments/${code}` }, { label: `خلاصهٔ ${deptName(code)}` }]
    }
    return [home, { label: `دپارتمان ${deptName(code)}` }]
  }

  if (parts[0] === 'processes' && parts[1] !== undefined) {
    const pid = parts[1]
    const code = pid.slice(0, pid.lastIndexOf('-'))
    const trail: Crumb[] = [{ label: HOME, to: '/departments' }]
    if (DEPT_CODES.includes(code)) {
      trail.push({ label: `دپارتمان ${deptName(code)}`, to: `/departments/${code}` })
    }
    if (parts[2] === 'flow') {
      trail.push({ label: pid, to: `/processes/${pid}`, mono: true }, { label: 'فلوچارت' })
    } else {
      trail.push({ label: pid, mono: true })
    }
    return trail
  }

  if (parts[0] === 'users' && parts[1] !== undefined) {
    return [{ label: 'کاربران', to: '/users' }, { label: 'دسترسی' }]
  }

  const flat = FLAT[parts[0] ?? '']
  return flat === undefined ? [{ label: HOME }] : [{ label: flat }]
}
```

- [ ] **Step 4: Run it and watch it pass, then commit**

Run: `cd ui && npx vitest run src/shell/crumbs.test.ts`
Expected: PASS — 8 tests.

```
git add ui/src/shell/crumbs.ts ui/src/shell/crumbs.test.ts
git commit -m "feat(ui): the trail PanelShell has documented since it was written"
```

- [ ] **Step 5: Write the failing test for the chrome**

Create the describe blocks in `ui/src/shell/shells.test.tsx` — append to the existing
file, which already has `renderShell` and its fetch stub:

```tsx
import { PanelShell } from './PanelShell'

function renderPanel(caps: Capability[], entry: string) {
  vi.spyOn(globalThis, 'fetch').mockImplementation(() =>
    Promise.resolve(new Response(JSON.stringify([{ code: 'dining', name: 'سالن', count: 3, subs: 0 }]), {
      status: 200, headers: { 'Content-Type': 'application/json' },
    })),
  )
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter initialEntries={[entry]}>
        <Routes>
          <Route element={<PanelShell session={session(caps)} />}>
            <Route path="/departments" element={<p>محتوا</p>} />
            <Route path="/departments/:code" element={<p>محتوا</p>} />
          </Route>
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  )
}

describe('PanelShell chrome', () => {
  it('draws the top bar on the home screen and the crumb strip everywhere else', () => {
    // §6.0 — `showTopBar: screen === 'depts'`, `showCrumbBar: screen !== 'depts'`.
    const { container, unmount } = renderPanel(['view', 'edit'], '/departments')
    expect(container.querySelector('[data-r-topbar]')).toBeInTheDocument()
    expect(container.querySelector('[data-r-crumbbar]')).toBeNull()
    unmount()
    const inner = renderPanel(['view', 'edit'], '/departments/dining')
    expect(inner.container.querySelector('[data-r-topbar]')).toBeNull()
    expect(inner.container.querySelector('[data-r-crumbbar]')).toBeInTheDocument()
  })

  it('draws the logo that has been in the repo since July', () => {
    // Audit S2 — `assets/inja-logo.jpg` existed and no file in src/ imported it.
    const { container } = renderPanel(['view', 'edit'], '/departments')
    expect(container.querySelector('[data-r-topbar] img')).toHaveAttribute('src', expect.stringMatching(/inja-logo/))
  })

  it('is a white bar on a cream hairline, not a violet block', () => {
    const { container } = renderPanel(['view', 'edit'], '/departments')
    expect(container.querySelector('[data-r-topbar]')).toHaveClass('bg-card', 'border-warm')
  })

  it('leaves no control that would vanish on hover', () => {
    // Audit S1 — `text-card` over `hover:bg-tile-v2` is 1.04:1. The design's fix
    // is the white bar: its controls are --violet and #F4EFFB is their hover.
    const { container } = renderPanel(['view', 'edit', 'set_visibility'], '/departments')
    const controls = container.querySelectorAll('[data-r-topbar] a, [data-r-topbar] button')
    expect(controls.length).toBeGreaterThan(2)
    controls.forEach((c) => {
      const cls = c.className
      expect(/\btext-card\b/.test(cls) && /hover:bg-tile-v2/.test(cls)).toBe(false)
    })
  })

  it('counts the inbox in Persian, in the badge and in the name', () => {
    // Audit S4 — the two shells were the only surfaces in the app rendering a
    // latin digit, so a reader saw «۳ فرآیند» on the page and `3` in the header.
    vi.spyOn(globalThis, 'fetch').mockImplementation((input) => {
      const url = String(input)
      const body = url.includes('/api/pending') ? '[{"process":"dining-001"},{"process":"dining-002"}]' : '[]'
      return Promise.resolve(new Response(body, { status: 200, headers: { 'Content-Type': 'application/json' } }))
    })
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    render(
      <QueryClientProvider client={qc}>
        <MemoryRouter initialEntries={['/departments']}>
          <Routes><Route element={<PanelShell session={session(['view', 'edit'])} />}><Route path="/departments" element={<p>م</p>} /></Route></Routes>
        </MemoryRouter>
      </QueryClientProvider>,
    )
    return screen.findByRole('button', { name: 'صندوق بازبینی تعارض‌ها، ۲ مورد در انتظار' })
      .then((btn) => {
        expect(btn.textContent).toContain('۲')
        expect(btn.textContent).not.toMatch(/[0-9]/)
      })
  })

  it('draws the crumb trail, with the last crumb as the current page', () => {
    renderPanel(['view', 'edit'], '/departments/dining')
    expect(screen.getByRole('link', { name: 'دپارتمان‌ها' })).toHaveAttribute('href', '/departments')
    expect(screen.getByText('دپارتمان سالن')).toHaveAttribute('aria-current', 'page')
    expect(screen.getByRole('link', { name: 'بازگشت' })).toHaveAttribute('href', '/departments')
  })

  it('leaves out the administration entries this caller cannot reach', () => {
    // R5 — absent, not disabled. `administrationRefusal` is the same twin the
    // screen gates itself on, so header and screen cannot come to disagree.
    renderPanel(['view', 'edit'], '/departments')
    return userEvent.click(screen.getByRole('button', { name: /مدیریت/ })).then(() => {
      expect(screen.queryByRole('menuitem', { name: /کاربران/ })).toBeNull()
      expect(screen.queryByRole('menuitem', { name: /سیاست نمایش محتوا/ })).toBeNull()
      expect(screen.getByRole('menuitem', { name: /پروفایل و گذرواژه/ })).toBeInTheDocument()
    })
  })

  it('hides the nav tray at 1080 and the crumbs at 760, and shows the hamburger', () => {
    // R7 — the shell holds zero responsive utilities today, and both breakpoints
    // are largely shell behaviour.
    const { container, unmount } = renderPanel(['view', 'edit'], '/departments')
    expect(container.querySelector('[data-r-nav]')?.className).toMatch(/\bmax1080:hidden\b/)
    expect(container.querySelector('[data-r-menu]')?.className).toMatch(/\bhidden\b.*\bmax1080:inline-flex\b/)
    unmount()
    const inner = renderPanel(['view', 'edit'], '/departments/dining')
    expect(inner.container.querySelector('[data-r-crumbs]')?.className).toMatch(/\bmax760:hidden\b/)
  })

  it('gives the outlet a growing, unpadded flex column ancestor on both chromes', () => {
    // C1 — unchanged from before: FlowScreen's canvas resolves its height
    // against this chain, and padding here renders it at zero height.
    for (const entry of ['/departments', '/departments/dining']) {
      const { unmount } = renderPanel(['view', 'edit'], entry)
      const main = screen.getByText('محتوا').parentElement as HTMLElement
      expect(main.tagName).toBe('MAIN')
      expect(main.className).toMatch(/\bflex-1\b/)
      expect(main.className).toMatch(/\bmin-h-0\b/)
      expect(main.className).not.toMatch(/(^|\s)p[xytrbl]?-/)
      unmount()
    }
  })
})
```

- [ ] **Step 6: Run it and watch it fail**

Run: `cd ui && npx vitest run src/shell/shells.test.tsx`
Expected: FAIL — nine new failures, the first being
`Unable to find an element by: [data-r-topbar]` (the header today has no such attribute).

**The eight values in this shell that no token holds — deliberate, not an oversight.**

Every other length, gap, radius and rung below comes from the theme. These eight do not,
because the design draws them once each in the chrome and the single minting pass
(`.superpowers/sdd/mint-spec.md`) minted from the *screens*, not from the two shells — none
of its 23 tokens is a shell value. **Do not mint them here.** `ui/tailwind.config.js`,
`ui/src/styles/tokens.css` and `ui/src/styles/roles.css` are frozen; adding a name to one of
them from inside a screen task is the unreachable-token failure this whole rebuild exists to
end. Leave them written out, and take them to the owner as one list.

| Written out | Role | Design line | Why no token |
|---|---|---|---|
| `min-w-[265px]` | «مدیریت» menu popover min-width | `Inja Panel.dc.html:140` — `min-width:265px` | 1 use. `minWidth.menu` is a raw `220px` literal in the config for something else, and matches no value in either deliverable |
| `mt-[3px]` | the menu row's hint offset | `Inja Panel.dc.html:145` — `margin-top:3px` | 1 use. 3px is off the `--space-*` ladder (2 → 4); `--gap-tab-flow` is 3px for the flow nav group's gap, a different role |
| `leading-[1.25]` | the brand lockup's two lines | `Inja Panel.dc.html:120` — `line-height:1.25` | 1 use in each shell. `--lh-tight` is **1.2**, itself a single use; L-17 decides the three *prose* line-heights and says nothing about the display end of the scale |
| `min-w-[19px] h-[19px]` | the count badge on the chrome | `Inja Panel.dc.html:156` — `min-width:19px;height:19px` | `--size-count` is the **FAB's** badge at 21px and `--size-tick` is L-10's 19px tick box — two owners, neither this role |
| `px-[13px]` | the inbox button's inline padding | `Inja Panel.dc.html:152` — `padding:8px 13px` | five tokens hold 13px (`--pad-search-y`, `--pad-compose`, `--pad-tick-row-y`, `--pad-dropdown-x-filter`, `--pad-table-row-y`) and every one is another component's |
| `gap-s4` | the inbox button's icon/label gap | `Inja Panel.dc.html:152` says **`gap:8px`** | ✅ **Resolved to the design's 8px** (`gap-s4`). R1: the deliverable beats the plan. Note this is a DIFFERENT element from Task 10's stat gap, which is genuinely 7px (`Inja Panel.dc.html:221`) and has its own token `--gap-stat-dot`. Two `gap-[7px]` sites, two different roles, two different right answers — which is why mapping by pixel value rather than by role keeps producing the wrong token. |
| `py-[9px]` | the crumb strip / reader back bar | `Inja Panel.dc.html:174` — `padding:9px 22px` | 9px is off the ladder (8 → 10); its five tokens are the audit tab, the option gap, the menu search field, the filter chip and the timeline note |
| `py-[7px]` | the «بازگشت» button | `Inja Panel.dc.html:176` — `padding:7px 12px` | 7px is off the ladder (6 → 8); `--pad-popover` and `--space-stat-label` hold it for other roles |

`before:content-[""]` in `HIT` is **not** on this list and is not a design value: it is the
one declaration that makes a `::before` render at all, it is the idiom `PasswordField.tsx`
already ships, and `src/ui/table.test.tsx` has a test asserting `before:content-none` is
*not* a substitute for it. Task 25 Step 4 must exempt it by name.

- [ ] **Step 7: Rewrite `PanelShell`**

Replace `ui/src/shell/PanelShell.tsx` with:

```tsx
import { useState } from 'react'
import { Link, Outlet, useLocation } from 'react-router-dom'
import { can, type SessionDescriptor } from '../auth/session'
import { administrationRefusal } from '../auth/can'
import { usePending, useLogout, useDepartments } from '../api/hooks'
import { InboxModal } from '../write/InboxModal'
import { Sheet } from '../ui/Overlay'
import { SurfaceProvider } from '../ui/surface'
import { Icon } from '../ui/Icon'
import { Logo } from '../ui/Logo'
import { toFa } from '../lib/format'
import { panelCrumbs } from './crumbs'

// §6.0 — the nav tray's shell. These entries *navigate*, so they are links in a
// `<nav>` rather than a NavTabTray: the tray is a `tablist` and these are not
// tabs, and borrowing the role because the paint matches would announce a set of
// views where there is a set of destinations.
const TRAY = 'inline-flex items-center gap-s1 p-s1 rounded-button bg-tile-v2'
const TRAY_ITEM = 'px-s7 py-s4 rounded-tool border-0 no-underline cursor-pointer text-fs-sm2 font-bold'

// §5.2 — icon buttons are `#fff` / `--violet` / `1.5px --line`.
const GHOST = 'inline-flex items-center justify-center bg-card text-violet border-hairline border-line cursor-pointer no-underline hover:bg-tile-v2'

// F11's 44px floor against the design's 34–36px boxes: the painted box stays the
// design's, and an invisible `::before` grows the target. Nothing about it shows.
//
// The 5px is DERIVED, not drawn — `(44 - 34) / 2` against the smallest box this
// shell paints, `w-tool` — and it happens to land exactly on `--space-2`, so it
// is written `-inset-s2` rather than as a number. It clears the floor on all
// three: 34 + 10 = 44, 36 + 10 = 46, 40 + 10 = 50. `before:content-[""]` is the
// declaration that makes the pseudo-element exist at all; `before:content-none`
// is not a substitute and `src/ui/table.test.tsx` has a test that says so.
const HIT = 'relative before:absolute before:content-[""] before:-inset-s2'

/** Compact density, breadcrumb trail, administration surfaces. */
export function PanelShell({ session }: { session: SessionDescriptor }) {
  const [inboxOpen, setInboxOpen] = useState(false)
  const [adminOpen, setAdminOpen] = useState(false)
  const [menuOpen, setMenuOpen] = useState(false)
  const { pathname } = useLocation()
  const canEdit = can(session, 'edit')
  // C2 — the conflict inbox is an edit-only surface; a panel user without `edit`
  // never needs the query fired at all.
  const { data: pending = [] } = usePending({ enabled: canEdit })
  const { data: departments = [] } = useDepartments()
  const logout = useLogout()
  const openCount = pending.length

  const crumbs = panelCrumbs(pathname, (code) => departments.find((d) => d.code === code)?.name ?? code)
  const back = crumbs.length > 1 ? crumbs[crumbs.length - 2] : undefined
  const home = pathname === '/departments'

  // R5 — an entry whose target this caller cannot reach is absent, not disabled.
  // `administrationRefusal` is the twin `access.requires` uses, including its
  // order, so the header and the screen it leads to cannot come to disagree; a
  // holder of `manage_users` scoped to one department is answered 404 on every
  // endpoint behind «کاربران», which is a wall the app itself pointed them at.
  // §6.0's «گزارش فعالیت کاربران» is absent for the same rule: no such screen.
  const adminItems = [
    ...(administrationRefusal(session) === undefined
      ? [{ to: '/users', label: 'کاربران', hint: 'نقش، دپارتمان، سرپرست و غیرفعال‌سازی' }] : []),
    ...(can(session, 'set_visibility')
      ? [{ to: '/visibility', label: 'سیاست نمایش محتوا', hint: 'یک تصمیم برای همهٔ غیرادیتورها' }] : []),
    { to: '/profile', label: 'پروفایل و گذرواژه', hint: 'نشست‌های باز و تغییر گذرواژه' },
  ]

  function AdminMenu() {
    return (
      <div className="relative">
        <button
          type="button" aria-haspopup="menu" aria-expanded={adminOpen}
          onClick={() => setAdminOpen((v) => !v)}
          className={`${TRAY_ITEM} inline-flex items-center gap-s3 bg-transparent text-violet`}
        >
          مدیریت
          <Icon name="chevronDown" px={13} stroke={2.4} />
        </button>
        {adminOpen && (
          <>
            <div aria-hidden onClick={() => setAdminOpen(false)} className="fixed inset-0 z-dropdown" />
            <div role="menu" className="absolute top-full mt-s3 start-0 z-dropdown min-w-[265px] p-s4 bg-card border border-border-card rounded-card shadow-pop">
              {adminItems.map((i) => (
                <Link
                  key={i.to} role="menuitem" to={i.to} onClick={() => setAdminOpen(false)}
                  className={`block px-s6 py-option-y rounded-input no-underline text-start hover:bg-tile-v2 ${pathname === i.to ? 'bg-tile-v2' : 'bg-transparent'}`}
                >
                  <span className="block text-fs-menu font-bold text-ink">{i.label}</span>
                  <span className="block mt-[3px] text-fs-xs text-faint">{i.hint}</span>
                </Link>
              ))}
            </div>
          </>
        )}
      </div>
    )
  }

  function TopBar() {
    return (
      <header
        data-r-topbar
        className="flex items-center gap-s7 px-topbar py-s6 bg-card border-b border-warm flex-none z-chrome max760:px-s7 max760:py-s5 max760:gap-s5"
      >
        <Link to="/departments" className="flex items-center gap-s5 no-underline">
          <Logo px={38} />
          <span className="block leading-[1.25]">
            <span className="block text-fs-body font-bold text-ink">اینجا فست‌فود</span>
            <span className="block text-fs-micro text-muted">سامانهٔ فرآیندها</span>
          </span>
        </Link>
        <span aria-hidden className="w-px h-s11 mx-s1 bg-border-current max1080:hidden" />
        <nav data-r-nav aria-label="بخش‌های اصلی" className={`${TRAY} max1080:hidden`}>
          <Link to="/departments" className={`${TRAY_ITEM} bg-violet text-card`}>دپارتمان‌ها</Link>
          <AdminMenu />
        </nav>
        <div className="ms-auto flex items-center gap-s5">
          {canEdit && (
            <button
              type="button" onClick={() => setInboxOpen(true)}
              aria-label={openCount > 0 ? `صندوق بازبینی تعارض‌ها، ${toFa(openCount)} مورد در انتظار` : 'صندوق بازبینی تعارض‌ها'}
              className={`${GHOST} relative gap-s4 px-[13px] py-s4 rounded-button text-fs-sm2 font-bold max760:hidden`}
            >
              <Icon name="inbox" px={16} />
              صندوق تعارض‌ها
              {openCount > 0 && (
                // §8 — `top:-6px; left:-6px` is one of the physical pins the
                // design keeps. Round, 19px: audit S5 found this inheriting the
                // 44px touch floor as a `<span aria-hidden>` that is not
                // interactive, so it rendered as a coral square beside the button.
                //
                // `border-card` here is the WHITE `--card`, not the hairline:
                // the ring cuts the badge out of whatever it overlaps. The
                // hairline is `border-border-card` (`--border-card`), which at
                // 7% alpha would be invisible here — and would still build.
                <span
                  aria-hidden
                  className="absolute -top-s3 -left-s3 min-w-[19px] h-[19px] px-s1 inline-flex items-center justify-center rounded-round bg-coral text-card text-fs-micro font-bold border-2 border-card"
                >
                  {toFa(openCount)}
                </span>
              )}
            </button>
          )}
          {/* Neither deliverable has a sign-out affordance anywhere. The app
              needs one, drawn on §5.2's icon-button metrics. Owner question. */}
          <button
            type="button" onClick={() => logout.mutate()} aria-label="خروج"
            className={`${GHOST} ${HIT} w-tool h-tool rounded-control`}
          >
            <Icon name="logout" px={17} stroke={2.2} />
          </button>
          <button
            data-r-menu type="button" onClick={() => setMenuOpen(true)} aria-label="فهرست"
            className="hidden max1080:inline-flex items-center justify-center w-iconbtn h-iconbtn rounded-input bg-tile-v2 text-violet border-hairline border-line cursor-pointer"
          >
            <Icon name="menu" px={19} stroke={2.2} />
          </button>
        </div>
      </header>
    )
  }

  function CrumbStrip() {
    return (
      <nav
        data-r-crumbbar aria-label="مسیر"
        className="flex items-center gap-s5 px-topbar py-[9px] bg-tile-v2 border-b border-line flex-none max760:px-s7 max760:py-s5 max760:gap-s5"
      >
        {back?.to !== undefined && (
          <Link to={back.to} className={`${GHOST} gap-s3 px-s6 py-[7px] rounded-input text-fs-sm2 font-bold`}>
            <Icon name="chevronEnd" px={15} stroke={2.4} />
            بازگشت
          </Link>
        )}
        <ol data-r-crumbs className="flex flex-wrap items-center gap-s3 list-none m-0 p-0 text-fs-sm2 max760:hidden">
          {crumbs.map((c, i) => (
            <li key={`${c.label}-${i}`} className="flex items-center gap-s3">
              {i > 0 && <span aria-hidden className="text-faint">/</span>}
              {c.to !== undefined && i < crumbs.length - 1 ? (
                <Link to={c.to} dir={c.mono ? 'ltr' : undefined} className={`no-underline text-muted ${c.mono ? 'font-mono' : ''}`}>
                  {c.label}
                </Link>
              ) : (
                <span aria-current="page" dir={c.mono ? 'ltr' : undefined} className={`font-semibold text-ink ${c.mono ? 'font-mono' : ''}`}>
                  {c.label}
                </span>
              )}
            </li>
          ))}
        </ol>
        <Link to="/departments" aria-label="خانه" className={`${GHOST} ${HIT} ms-auto w-menu-more h-menu-more rounded-input`}>
          <Icon name="home" px={16} />
        </Link>
      </nav>
    )
  }

  return (
    // R3 — the scale layer. Every surface-aware primitive below reads this, and
    // nothing passes a density prop down (F4/F8).
    <SurfaceProvider surface="panel">
      {/* §6.0 — the whole application sits on `#2A1D5E`, and the root's own text
          colour is `#2A1D5E` too: screens do not paint their own ground, they
          are cards floating on the violet field, and everything legible on the
          field sets its colour explicitly. */}
      <div data-shell="panel" className="h-screen flex flex-col overflow-hidden bg-ink text-ink">
        {home ? <TopBar /> : <CrumbStrip />}
        {/* C1 — screens depend on this being a direct flex child of a flex-column
            ancestor with min-h-0: FlowScreen's own root is `flex-1 flex flex-col
            min-h-0`, and its canvas resolves `h-full` against this chain. Adding
            padding here re-breaks the flow canvas — screens own their padding. */}
        <main className="flex-1 min-h-0 flex flex-col">
          <Outlet />
        </main>
        {inboxOpen && <InboxModal onClose={() => setInboxOpen(false)} />}
        <Sheet open={menuOpen} onClose={() => setMenuOpen(false)} title="فهرست">
          <div className="flex flex-col gap-s5">
            <div>
              <p className="m-0 text-fs-body font-bold text-ink">{session.displayName}</p>
              <p className="m-0 mt-half text-fs-xs text-muted">{session.role}</p>
            </div>
            <Link to="/departments" onClick={() => setMenuOpen(false)} className={`${GHOST} px-s7 py-s7 rounded-tile text-fs-menu font-bold justify-start`}>
              دپارتمان‌ها
            </Link>
            {adminItems.map((i) => (
              <Link key={i.to} to={i.to} onClick={() => setMenuOpen(false)} className={`${GHOST} px-s7 py-s7 rounded-tile text-fs-menu font-bold justify-start`}>
                {i.label}
              </Link>
            ))}
            {canEdit && (
              <button type="button" onClick={() => { setMenuOpen(false); setInboxOpen(true) }} className={`${GHOST} px-s7 py-s7 rounded-tile text-fs-menu font-bold justify-start`}>
                صندوق تعارض‌ها {openCount > 0 && toFa(openCount)}
              </button>
            )}
            <button type="button" onClick={() => logout.mutate()} className={`${GHOST} px-s7 py-s7 rounded-tile text-fs-menu font-bold justify-start`}>
              خروج
            </button>
          </div>
        </Sheet>
      </div>
    </SurfaceProvider>
  )
}
```

- [ ] **Step 8: Move the visibility entry's test to where the entry now lives**

The policy entry is no longer a bare link in the header; §6.0 puts it in the «مدیریت»
menu as «سیاست نمایش محتوا». The five assertions in `ui/src/shell/PanelShell.visibility.test.tsx`
are all still worth keeping — including the deliberately non-vacuous editor fixture — so
change only what moved. In `mount`, add the fetch stub the shell now needs:

```tsx
function mount(session: SessionDescriptor) {
  vi.spyOn(globalThis, 'fetch').mockImplementation(() =>
    Promise.resolve(new Response('[]', { status: 200, headers: { 'Content-Type': 'application/json' } })),
  )
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter initialEntries={['/departments']}><PanelShell session={session} /></MemoryRouter>
    </QueryClientProvider>,
  )
}

async function openAdmin() {
  await userEvent.click(screen.getByRole('button', { name: /مدیریت/ }))
}
```

and change each assertion from `getByRole('link', { name: 'نمایش محتوا' })` to
`getByRole('menuitem', { name: /سیاست نمایش محتوا/ })` after `await openAdmin()`. The
`href` assertion stays exactly as it is — `/visibility` is still the one thing about this
entry that is not visible on screen.

- [ ] **Step 9: Declare the new `dir=` island**

In `ui/src/test/guards.test.ts`, add to `ISLANDS`:

```ts
      // The crumb strip sets a process id LTR mono — §8's rule for every latin
      // island in an RTL app, and the only `dir=` in either shell.
      'src/shell/PanelShell.tsx',
```

- [ ] **Step 10: Run it and watch it pass**

Run: `cd ui && npx vitest run src/shell src/test/guards.test.ts`
Expected: PASS — `shells.test.tsx` (6 existing + 9 new), `crumbs.test.ts` (8),
`PanelShell.visibility.test.tsx` (5), `guards.test.ts` (6).

- [ ] **Step 11: Commit**

```
git add ui/src/shell/PanelShell.tsx ui/src/shell/shells.test.tsx ui/src/shell/PanelShell.visibility.test.tsx ui/src/test/guards.test.ts
git commit -m "feat(ui): a white bar with a logo, a trail, and no control that vanishes when you point at it"
```

- [ ] **Step 12: Run the whole suite, the type-checker, the linter and the build**

Run: `cd ui && npx vitest run && npx tsc -b && npx eslint . && npm run build`
Expected: all four exit 0. Then prove every class `PanelShell` writes emits:
```bash
cd ui && npx vite build
node scripts/harvest-classes.mjs src/shell/PanelShell.tsx src/shell/crumbs.ts
```
Expected: the run ends `DEAD 0   EMPTY 0   NOVAR 0`, both controls hold
(`control (negative): N/N invented names reported dead` and
`control (escaping): … escaped variant classes unescaped`), and the last line
is `PASS`. The script exits 1 on any failure, so it can be `&&`-chained.
The class list is **harvested out of these files**, never hand-kept, so it
cannot drift from what they write and `tailwind-probe.txt` cannot certify it
on their behalf — see *The class-emission check* in Global Constraints for the
measurement that retired the old grep.

The old form of this step grepped a hand-kept list of 41 and said so honestly:
*"the twenty-eight above them are colours and type steps that ship today and have
shipped for weeks; a grep that certifies only those certifies nothing about this
task."* That is the right instinct and the wrong tool — all 41 are named in
`tailwind-probe.txt`, so all 41 emitted whether or not `PanelShell.tsx` was ever
written. The thirteen that step existed for are exactly the ones a harvest cannot
miss, because they are read off the component: `px-topbar` is `--pad-topbar` 22px
and not `px-s10`, `w-tool` is `--size-tool` 34px and not `w-pager`, `w-menu-more`
is 36px, `py-option-y` is `--pad-option-y` 11px, and `z-chrome` / `z-dropdown` are
the L-42…L-47 rungs that replace the deliverable's `z-index:20` and `29`/`30` —
Tailwind ships its own `z-20` and `z-30`, which emit, look right in every test and
are the wrong layer.

**A failure.** `DEAD` — the class compiled to no rule at all; that is a **typo
in the component**, so fix the class string, rebuild, re-run. `EMPTY` — the
selector emitted with an empty body, so the theme key resolves to nothing.
`NOVAR` — the rule reads a `var(--…)` nothing declares. The last two are theme
regressions: **stop and report them.** Do **not** add the name to
`ui/tailwind.config.js`, `src/styles/tokens.css`, `src/styles/roles.css` or
`tailwind-probe.txt`. All four are frozen for the duration of this plan and
were unfrozen exactly once, by the single minting pass in
`.superpowers/sdd/mint-spec.md`; minting one here to make a misspelling compile
recreates the unreachable-token problem the whole rebuild exists to fix. A
value that genuinely has no name goes into `mint-spec.md`, not into the config
and not into this task's commit.

**What this step cannot prove:** that these files write a class and that the
class compiles to a rule with declarations, yes. That the class reaches the
right element, that the element renders, that it is visible, or that its value
is the one the design asks for — no. That stays with the Playwright checks.

Then prove both breakpoints compiled:

```bash
cd ui && node -e '
const fs=require("node:fs");
const css=fs.readdirSync("dist/assets").filter(f=>/\.css$/.test(f))
  .map(f=>fs.readFileSync("dist/assets/"+f,"utf8")).join("\n");
const a=/@media\s*\(max-width:\s*1080px\)/.test(css)&&/max1080\\:hidden/.test(css);
const b=/@media\s*\(max-width:\s*760px\)/.test(css)&&/max760\\:hidden/.test(css);
console.log(a&&b?"OK both breakpoints compiled":`MISSING r1080=${a} r760=${b}`);
process.exit(a&&b?0:1);'
```

Expected: `OK both breakpoints compiled`.

- [ ] **Step 13: Write the real-browser check at all three widths**

Create `ui/e2e/panel-shell.spec.ts`:

```ts
import { test, expect } from '@playwright/test'
import { expectDesign, shot } from './_harness'

// One spec, three projects: playwright.config.ts runs it at 1440, 1080 and 760.
// vitest renders on jsdom, which does no layout and computes no colour — which
// is exactly why nine screens shipped with every individual value legal and the
// page still wrong (R6).

test('the top bar matches the design at this width', async ({ page }) => {
  await page.goto('/departments')
  const bar = page.locator('[data-r-topbar]')
  await expect(bar).toBeVisible()
  await expect(bar).toHaveCSS('background-color', 'rgb(255, 255, 255)')
  // §6.0 — `border-bottom:1px solid #EFE7DC`.
  await expect(bar).toHaveCSS('border-bottom-color', 'rgb(239, 231, 220)')
  await expect(bar).toHaveCSS('border-bottom-width', '1px')
  // The app's field, behind everything (§6.0, §9.1).
  await expect(page.locator('[data-shell="panel"]')).toHaveCSS('background-color', 'rgb(42, 29, 94)')
  await expectDesign(page, 'panel-shell')
  await shot(page, 'panel-shell')
})

test('the top bar pads 22px above 760 and 14px below it', async ({ page }) => {
  await page.goto('/departments')
  const width = page.viewportSize()!.width
  // §3.2 `--pad-topbar: 22px`; §6.16 `[data-r-topbar]{padding:10px 14px}` at ≤760.
  await expect(page.locator('[data-r-topbar]')).toHaveCSS(
    'padding-left', width <= 760 ? '14px' : '22px',
  )
})

test('the nav tray goes at 1080 and the hamburger arrives', async ({ page }) => {
  await page.goto('/departments')
  const width = page.viewportSize()!.width
  const nav = page.locator('[data-r-nav]')
  const burger = page.locator('[data-r-menu]')
  if (width <= 1080) {
    await expect(nav).toBeHidden()
    await expect(burger).toBeVisible()
  } else {
    await expect(nav).toBeVisible()
    await expect(burger).toBeHidden()
  }
})

test('the crumbs go at 760 and the back button stays', async ({ page }) => {
  await page.goto('/departments/dining')
  const width = page.viewportSize()!.width
  await expect(page.locator('[data-r-crumbbar]')).toBeVisible()
  await expect(page.getByRole('link', { name: 'بازگشت' })).toBeVisible()
  if (width <= 760) await expect(page.locator('[data-r-crumbs]')).toBeHidden()
  else await expect(page.locator('[data-r-crumbs]')).toBeVisible()
  await shot(page, 'panel-crumbstrip')
})

test('no header control disappears when you point at it', async ({ page }) => {
  // Audit S1, measured rather than asserted from a class name: white-on-#F4EFFB
  // is about 1.04:1, and jsdom could never have caught it.
  await page.goto('/departments')
  const controls = page.locator('[data-r-topbar] a, [data-r-topbar] button')
  const n = await controls.count()
  expect(n).toBeGreaterThan(2)
  for (let i = 0; i < n; i++) {
    const c = controls.nth(i)
    if (!(await c.isVisible())) continue
    await c.hover()
    const [colour, background] = await c.evaluate((el) => {
      const s = getComputedStyle(el)
      return [s.color, s.backgroundColor]
    })
    expect(colour, `control ${i} paints its label the colour of its own fill`).not.toBe(background)
    expect(colour).not.toBe('rgb(255, 255, 255)')
  }
})
```

- [ ] **Step 14: Run it at all three widths and watch it pass**

Run: `cd ui && npx playwright test e2e/panel-shell.spec.ts`
Expected: PASS — 15 tests (5 × three projects), and three screenshots per named shot
under the harness's output directory. Compare each against `ui/design/Inja Panel.dc.html`
opened at the same width before ticking this step.

- [ ] **Step 15: Commit**

```
git add ui/e2e/panel-shell.spec.ts
git commit -m "test(ui): the panel chrome is measured in a browser, at three widths"
```

---

### Task 13: `ReaderShell` — back bar, flow chrome, reader scale, single-department landing (R4)

Four things, one of which is a product rule the design does not carry.

1. **The back bar off home.** The reader's non-home chrome is a back bar on `#fff`, not
   the panel's breadcrumb strip on `#F4EFFB` (§9.12).
2. **No chrome at all on the flow screen.** R3's table is explicit: "a back bar — and
   **neither on the flow screen**". This is a reader rule; the panel keeps its crumb strip
   there (Task 12).
3. **The reader scale.** 720px content column, `30px 24px 60px` padding, 14.5–15px body,
   `42×42` icon buttons, 54×54 department tiles — supplied to every primitive below by
   `<SurfaceProvider surface="reader">`, not by a prop anybody passes.
4. **R4 — the single-department landing.** A reader whose reachable departments number
   **exactly one** lands on that department's process list, never on a list holding one
   tile. **Decided by scope alone, never by content**: a department with nothing confirmed
   still redirects, and the reader sees the process list's empty state. The same person
   therefore always lands in the same place rather than moving as content is confirmed.
   That list is then their root and carries **no back bar**. **Reader-only** — an admin or
   editor scoped to one department still sees the department list, because for them it is
   a real navigation level and their chrome is the breadcrumb strip.
   `GET /api/departments` already returns only reachable departments, so the count is
   available client-side and **no backend change is needed**.

**One correction to the audit.** Finding S7 says "the reader surface is inverted against
the design" because `ReaderShell` renders `bg-ink`. It is not. §9.1 establishes that the
readme's "every other panel screen is cream" is superseded, and **both** deliverables set
`background:#2A1D5E` on the root of all their screens. `bg-ink` is right and stays. What
is wrong is `text-card` beside it: §6.0's root sets `color:#2A1D5E`, so an element that
forgets to colour itself is invisible rather than accidentally white — which is the
honest failure mode, and the one the e2e sweep can see.

**Files:**
- Create: `ui/e2e/reader-shell.spec.ts`
- Modify: `ui/src/shell/ReaderShell.tsx`, `ui/src/shell/crumbs.ts` (add `readerBack`), `ui/src/shell/crumbs.test.ts`, `ui/src/shell/shells.test.tsx`

**Interfaces:**

- Consumes:
  - `SurfaceProvider` from `ui/src/ui/surface.tsx` (Task 5).
  - `Icon` (Task 11), `Logo` (Task 11).
  - `useDepartments`, `useLogout` from `ui/src/api/hooks.ts`; `toFa` from `ui/src/lib/format.ts`; `DEPT_CODES` from `ui/src/lib/departments.ts`.
  - `Navigate`, `useLocation` from `react-router-dom`.
  - `expectDesign`, `shot` from `ui/e2e/_harness.ts` (Task 4).
  - The same utility vocabulary Task 12 lists, plus `rounded-button` and `text-fs-sm`.
- Produces:
  - `ui/src/shell/crumbs.ts` — `function readerBack(pathname: string, root: string): string | undefined` — where the reader's back bar goes, and `undefined` when they are already at their root.
  - `ui/src/shell/ReaderShell.tsx` — unchanged export `function ReaderShell({ session }: { session: SessionDescriptor }): JSX.Element`.

- [ ] **Step 1: Write the failing test for the back target**

Append to `ui/src/shell/crumbs.test.ts`:

```ts
import { readerBack } from './crumbs'

describe('readerBack', () => {
  it('gives a reader at their root nothing to go back to', () => {
    // R4 — the landing list is their root, so it carries no back bar. Both
    // shapes of root: the many-department list and the one-department list.
    expect(readerBack('/departments', '/departments')).toBeUndefined()
    expect(readerBack('/departments/dining', '/departments/dining')).toBeUndefined()
  })

  it('sends a many-department reader back up the list', () => {
    expect(readerBack('/departments/dining', '/departments')).toBe('/departments')
  })

  it('sends the department summary back to its process list', () => {
    expect(readerBack('/departments/dining/overview', '/departments/dining')).toBe('/departments/dining')
    expect(readerBack('/departments/dining/overview', '/departments')).toBe('/departments/dining')
  })

  it('sends a process back to its department, recovered from the id', () => {
    expect(readerBack('/processes/dining-003', '/departments')).toBe('/departments/dining')
    expect(readerBack('/processes/dining-003', '/departments/dining')).toBe('/departments/dining')
  })

  it('sends the flowchart back to its own process', () => {
    expect(readerBack('/processes/dining-003/flow', '/departments')).toBe('/processes/dining-003')
  })

  it('falls back to the root rather than nowhere for an id it cannot place', () => {
    expect(readerBack('/processes/abc', '/departments/dining')).toBe('/departments/dining')
    expect(readerBack('/profile', '/departments/dining')).toBe('/departments/dining')
  })
})
```

- [ ] **Step 2: Run it and watch it fail**

Run: `cd ui && npx vitest run src/shell/crumbs.test.ts`
Expected: FAIL — `The requested module './crumbs' does not provide an export named 'readerBack'`.

- [ ] **Step 3: Write `readerBack`**

Append to `ui/src/shell/crumbs.ts`:

```ts
/**
 * Where the reader's back bar goes, and `undefined` when they are at their root.
 *
 * The reader's chrome off home is a back bar, not the panel's trail (§9.12), so
 * this answers one path rather than a list. `root` is passed in because R4 makes
 * it a property of the person: a reader who can reach exactly one department has
 * that department's process list as their root, and a bar offering to take them
 * "back" to a list they may never see would be a control leading nowhere.
 */
export function readerBack(pathname: string, root: string): string | undefined {
  if (pathname === root) return undefined
  const parts = pathname.split('/').filter(Boolean)

  if (parts[0] === 'departments' && parts[1] !== undefined) {
    if (parts[2] === 'overview') return `/departments/${parts[1]}`
    return '/departments'
  }

  if (parts[0] === 'processes' && parts[1] !== undefined) {
    const pid = parts[1]
    if (parts[2] === 'flow') return `/processes/${pid}`
    const code = pid.slice(0, pid.lastIndexOf('-'))
    return DEPT_CODES.includes(code) ? `/departments/${code}` : root
  }

  return root
}
```

- [ ] **Step 4: Run it, watch it pass, and commit**

Run: `cd ui && npx vitest run src/shell/crumbs.test.ts`
Expected: PASS — 14 tests.

```
git add ui/src/shell/crumbs.ts ui/src/shell/crumbs.test.ts
git commit -m "feat(ui): where back goes for a reader whose root is a department"
```

- [ ] **Step 5: Write the failing test for R4 and the reader chrome**

Append to `ui/src/shell/shells.test.tsx`:

```tsx
import { ReaderShell } from './ReaderShell'
import type { Department } from '../api/types'

const ONE: Department[] = [{ code: 'dining', name: 'سالن', count: 3, subs: 0 }]
const ONE_EMPTY: Department[] = [{ code: 'dining', name: 'سالن', count: 0, subs: 0 }]
const THREE: Department[] = [
  { code: 'dining', name: 'سالن', count: 3, subs: 0 },
  { code: 'cooking', name: 'پخت', count: 2, subs: 1 },
  { code: 'warehouse', name: 'انبار', count: 0, subs: 0 },
]

function renderReader(depts: Department[], entry: string) {
  vi.spyOn(globalThis, 'fetch').mockImplementation(() =>
    Promise.resolve(new Response(JSON.stringify(depts), {
      status: 200, headers: { 'Content-Type': 'application/json' },
    })),
  )
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter initialEntries={[entry]}>
        <Routes>
          <Route element={<ReaderShell session={session(['view', 'comment', 'export_pdf'])} />}>
            <Route path="/departments" element={<p>فهرست دپارتمان‌ها</p>} />
            <Route path="/departments/:code" element={<p>فهرست فرآیندها</p>} />
            <Route path="/processes/:pid/flow" element={<p>فلوچارت</p>} />
          </Route>
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  )
}

describe('R4 — a reader with one department never sees the department list', () => {
  it('lands on that department’s process list', async () => {
    renderReader(ONE, '/departments')
    expect(await screen.findByText('فهرست فرآیندها')).toBeInTheDocument()
    expect(screen.queryByText('فهرست دپارتمان‌ها')).toBeNull()
  })

  it('redirects on scope alone — a department with nothing in it still redirects', async () => {
    // The owner's ruling, stated as a rule about scope and not about content:
    // the same person always lands in the same place, rather than moving as
    // content gets confirmed. The list then shows its own empty state.
    renderReader(ONE_EMPTY, '/departments')
    expect(await screen.findByText('فهرست فرآیندها')).toBeInTheDocument()
  })

  it('makes that list their root, so it carries no back bar', async () => {
    const { container } = renderReader(ONE, '/departments')
    await screen.findByText('فهرست فرآیندها')
    expect(container.querySelector('[data-r-backbar]')).toBeNull()
    expect(container.querySelector('[data-r-topbar]')).toBeInTheDocument()
  })

  it('leaves a reader with more than one department on the list', async () => {
    renderReader(THREE, '/departments')
    expect(await screen.findByText('فهرست دپارتمان‌ها')).toBeInTheDocument()
  })

  it('gives a many-department reader a back bar one level down', async () => {
    const { container } = renderReader(THREE, '/departments/dining')
    await screen.findByText('فهرست فرآیندها')
    expect(container.querySelector('[data-r-backbar]')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'بازگشت' })).toHaveAttribute('href', '/departments')
  })

  it('never flashes the one-tile list while the departments are still loading', async () => {
    // A redirect that waits for the answer is a redirect; one that renders the
    // list first and then leaves is a flicker the reader can see and click.
    const { container } = renderReader(ONE, '/departments')
    expect(screen.queryByText('فهرست دپارتمان‌ها')).toBeNull()
    await screen.findByText('فهرست فرآیندها')
    expect(container.querySelector('[data-shell="reader"]')).toBeInTheDocument()
  })

  it('is reader-only: an admin scoped to one department still sees the list', async () => {
    // R4's own clause. For them the list is a real navigation level and their
    // chrome is the breadcrumb strip, so the ruling does not apply.
    vi.spyOn(globalThis, 'fetch').mockImplementation(() =>
      Promise.resolve(new Response(JSON.stringify(ONE), { status: 200, headers: { 'Content-Type': 'application/json' } })),
    )
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    render(
      <QueryClientProvider client={qc}>
        <MemoryRouter initialEntries={['/departments']}>
          <Routes>
            <Route element={<PanelShell session={session(['view', 'edit'])} />}>
              <Route path="/departments" element={<p>فهرست دپارتمان‌ها</p>} />
              <Route path="/departments/:code" element={<p>فهرست فرآیندها</p>} />
            </Route>
          </Routes>
        </MemoryRouter>
      </QueryClientProvider>,
    )
    expect(await screen.findByText('فهرست دپارتمان‌ها')).toBeInTheDocument()
  })
})

describe('ReaderShell chrome', () => {
  it('draws no chrome at all on the flowchart', async () => {
    // R3 — "a back bar — and neither on the flow screen".
    const { container } = renderReader(THREE, '/processes/dining-003/flow')
    await screen.findByText('فلوچارت')
    expect(container.querySelector('[data-r-topbar]')).toBeNull()
    expect(container.querySelector('[data-r-backbar]')).toBeNull()
  })

  it('is a white bar on the violet field, with the logo', async () => {
    const { container } = renderReader(THREE, '/departments')
    await screen.findByText('فهرست دپارتمان‌ها')
    expect(container.querySelector('[data-r-topbar]')).toHaveClass('bg-card', 'border-warm')
    expect(container.querySelector('[data-r-topbar] img')).toHaveAttribute('src', expect.stringMatching(/inja-logo/))
    expect(container.querySelector('[data-shell="reader"]')).toHaveClass('bg-ink', 'text-ink')
  })

  it('asks for the icon-button ROLE, which is what makes it 42 here and 34 on the panel', async () => {
    // R3's table: the reader's icon buttons are 42×42 at radius 12.
    //
    // The class is `w-iconbtn`, not a number, and it is the SAME string the panel
    // writes — `--role-iconbtn` is `--size-iconbtn` 40px on `:root` and
    // `--size-iconbtn-reader` 42px under `[data-surface='reader']`, so the
    // difference is carried by the role layer that R3 exists to be. jsdom
    // computes no CSS, so this assertion can only pin that the shell asked for
    // the role; the two values themselves are pinned by `--role-iconbtn`'s row in
    // `SCALE` in `src/ui/surface.test.tsx`, and the painted box by the Playwright
    // check in Step 11. A `w-[42px]` here would pass this test and this test
    // alone, and would stop being the design the day R3 moved.
    renderReader(THREE, '/departments')
    await screen.findByText('فهرست دپارتمان‌ها')
    expect(screen.getByRole('link', { name: 'نمایه' })).toHaveClass('w-iconbtn', 'h-iconbtn', 'rounded-button')
  })

  it('counts the approvals waiting for you in Persian, and drops the badge at zero', async () => {
    // Audit S4 and S5 together: a latin digit in a 44×44 coral square.
    const { unmount } = renderReader(THREE, '/departments')
    await screen.findByText('فهرست دپارتمان‌ها')
    expect(screen.queryByRole('status')).toBeNull()
    unmount()
    vi.spyOn(globalThis, 'fetch').mockImplementation(() =>
      Promise.resolve(new Response(JSON.stringify(THREE), { status: 200, headers: { 'Content-Type': 'application/json' } })),
    )
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    render(
      <QueryClientProvider client={qc}>
        <MemoryRouter initialEntries={['/departments']}>
          <Routes>
            <Route element={<ReaderShell session={{ ...session(['view']), pendingApprovals: 4 }} />}>
              <Route path="/departments" element={<p>فهرست دپارتمان‌ها</p>} />
            </Route>
          </Routes>
        </MemoryRouter>
      </QueryClientProvider>,
    )
    const badge = await screen.findByRole('status')
    expect(badge).toHaveTextContent('۴')
    expect(badge.textContent).not.toMatch(/[0-9]/)
    expect(badge).toHaveClass('rounded-round')
  })
})
```

- [ ] **Step 6: Run it and watch it fail**

Run: `cd ui && npx vitest run src/shell/shells.test.tsx`
Expected: FAIL — 11 new failures, the first being
`Unable to find an element with the text: فهرست فرآیندها` (today's `ReaderShell` does not
redirect at all).

- [ ] **Step 7: Rewrite `ReaderShell`**

**The four values below that no token holds** — `leading-[1.25]`, `min-w-[19px] h-[19px]`,
`py-[9px]` and `py-[7px]` — are the same four this shell shares with `PanelShell`, and they
are on Task 12's table with the design line each is read from. **Do not mint them**: the
config, `tokens.css` and `roles.css` are frozen, and a screen task that unfreezes one of them
recreates the unreachable-token problem the rebuild exists to fix. `before:content-[""]` is
structural, not a value — see the same note.

Everything else here is the theme. Two worth pointing at, because both look like numbers and
are not: `px-reader-x` is `--pad-reader-x` 24px, the reader's own gutter rather than a
coincidence with `--pad-modal`; and `w-iconbtn h-iconbtn` is `--role-iconbtn`, which is 42px
**because this subtree is inside `SurfaceProvider surface="reader"`** and 40px in the panel
from the identical class string. That is R3 working, and it is why neither shell writes a
pixel for its icon buttons.

Replace `ui/src/shell/ReaderShell.tsx` with:

```tsx
import { Link, Navigate, Outlet, useLocation } from 'react-router-dom'
import type { SessionDescriptor } from '../auth/session'
import { useDepartments, useLogout } from '../api/hooks'
import { SurfaceProvider } from '../ui/surface'
import { Icon } from '../ui/Icon'
import { Logo } from '../ui/Logo'
import { toFa } from '../lib/format'
import { readerBack } from './crumbs'

const GHOST = 'inline-flex items-center justify-center bg-card text-violet border-hairline border-line cursor-pointer no-underline hover:bg-tile-v2'
// F11's 44px floor. Same expander as `PanelShell`: the 5px is `(44 - 34) / 2`
// against the smallest box either shell paints and lands on `--space-2`, so it
// is `-inset-s2` and not a number. Here it clears the floor with room —
// 36 + 10 = 46 on the home square, 42 + 10 = 52 on the reader's icon buttons.
const HIT = 'relative before:absolute before:content-[""] before:-inset-s2'

/**
 * Roomier density, one screen at a time.
 *
 * The reader's chrome is a top bar on their root and a back bar below it — never
 * the panel's breadcrumb strip (§9.12) — and **nothing at all on the flowchart**
 * (R3). The badge for comments awaiting you lives here because this is where
 * every session starts, and with in-app notification as the only channel that
 * placement is the whole signal (F15).
 */
export function ReaderShell({ session }: { session: SessionDescriptor }) {
  const logout = useLogout()
  const { pathname } = useLocation()
  const { data: departments, isPending } = useDepartments()

  // R4 — decided by scope and never by content. `GET /api/departments` already
  // returns only what the caller can reach, so "exactly one" *is* the scope
  // test, and nothing below looks at how much is in it: a department with
  // nothing confirmed still redirects, and the process list shows its own empty
  // state. The same person therefore always lands in the same place rather than
  // moving as content gets confirmed. Reader-only — PanelShell does none of this.
  const only = departments?.length === 1 ? departments[0].code : undefined
  const root = only === undefined ? '/departments' : `/departments/${only}`
  const back = readerBack(pathname, root)
  const onFlow = /^\/processes\/[^/]+\/flow$/.test(pathname)
  const atRoot = pathname === root

  // The redirect has to wait for the answer. Rendering the list first and
  // leaving afterwards is a flicker the reader can see — and click.
  if (pathname === '/departments' && isPending) {
    return <div data-shell="reader" className="h-screen bg-ink" />
  }
  if (pathname === '/departments' && only !== undefined) {
    return <Navigate to={root} replace />
  }

  return (
    <SurfaceProvider surface="reader">
      {/* §6.0 — the app sits on `#2A1D5E`, and the root's own colour is `#2A1D5E`
          too. Audit S7 read this shell as "inverted against the design"; §9.1
          settles it the other way — the readme's cream page is superseded and
          both deliverables put every screen on the violet field. */}
      <div data-shell="reader" className="h-screen flex flex-col overflow-hidden bg-ink text-ink">
        {onFlow ? null : atRoot ? (
          <header
            data-r-topbar
            className="flex items-center gap-s7 px-reader-x py-s6 bg-card border-b border-warm flex-none z-chrome max760:px-s7 max760:py-s5 max760:gap-s5"
          >
            <Link to={root} className="flex items-center gap-s5 no-underline">
              <Logo px={38} />
              <span className="block leading-[1.25]">
                <span className="block text-fs-body font-bold text-ink">اینجا فست‌فود</span>
                <span className="block text-fs-micro text-muted">سامانهٔ فرآیندها</span>
              </span>
            </Link>
            <div className="ms-auto flex items-center gap-s5">
              {session.pendingApprovals > 0 && (
                <span
                  role="status"
                  aria-label={`${toFa(session.pendingApprovals)} کامنت در انتظار تأیید شما`}
                  className="min-w-[19px] h-[19px] px-s1 inline-flex items-center justify-center rounded-round bg-coral text-card text-fs-micro font-bold"
                >
                  {toFa(session.pendingApprovals)}
                </span>
              )}
              {/* R3 — the reader's icon buttons are 42×42 at radius 12, against
                  the panel's 34×34 at radius 10. */}
              <Link to="/profile" aria-label="نمایه" className={`${GHOST} ${HIT} w-iconbtn h-iconbtn rounded-button`}>
                <Icon name="user" px={18} />
              </Link>
              <button
                type="button" onClick={() => logout.mutate()} aria-label="خروج"
                className={`${GHOST} ${HIT} w-iconbtn h-iconbtn rounded-button`}
              >
                <Icon name="logout" px={18} stroke={2.2} />
              </button>
            </div>
          </header>
        ) : (
          <nav
            data-r-backbar aria-label="بازگشت"
            className="flex items-center gap-s5 px-reader-x py-[9px] bg-card border-b border-warm flex-none z-chrome max760:px-s7 max760:gap-s5"
          >
            {back !== undefined && (
              <Link to={back} className={`${GHOST} gap-s3 px-s6 py-[7px] rounded-input text-fs-sm font-bold`}>
                <Icon name="chevronEnd" px={15} stroke={2.4} />
                بازگشت
              </Link>
            )}
            <Link to={root} aria-label="خانه" className={`${GHOST} ${HIT} ms-auto w-menu-more h-menu-more rounded-input`}>
              <Icon name="home" px={16} />
            </Link>
          </nav>
        )}
        {/* C1 — screens depend on this being a direct flex child of a flex-column
            ancestor with min-h-0: FlowScreen's own root is `flex-1 flex flex-col
            min-h-0`, and its canvas resolves `h-full` against this chain. Adding
            padding here re-breaks the flow canvas — screens own their padding. */}
        <main className="flex-1 min-h-0 flex flex-col">
          <Outlet />
        </main>
      </div>
    </SurfaceProvider>
  )
}
```

- [ ] **Step 8: Run it and watch it pass**

Run: `cd ui && npx vitest run src/shell`
Expected: PASS — `shells.test.tsx` (6 existing + 9 panel + 11 reader),
`crumbs.test.ts` (14), `PanelShell.visibility.test.tsx` (5).

- [ ] **Step 9: Commit**

```
git add ui/src/shell/ReaderShell.tsx ui/src/shell/shells.test.tsx
git commit -m "feat(ui): one department is not a list, and the flowchart wears no chrome"
```

- [ ] **Step 10: Run the whole suite, the type-checker, the linter and the build**

Run: `cd ui && npx vitest run && npx tsc -b && npx eslint . && npm run build`
Expected: all four exit 0. Then prove every class `ReaderShell` writes emits:
```bash
cd ui && npx vite build
node scripts/harvest-classes.mjs src/shell/ReaderShell.tsx src/shell/crumbs.ts
```
Expected: the run ends `DEAD 0   EMPTY 0   NOVAR 0`, both controls hold
(`control (negative): N/N invented names reported dead` and
`control (escaping): … escaped variant classes unescaped`), and the last line
is `PASS`. The script exits 1 on any failure, so it can be `&&`-chained.
The class list is **harvested out of these files**, never hand-kept, so it
cannot drift from what they write and `tailwind-probe.txt` cannot certify it
on their behalf — see *The class-emission check* in Global Constraints for the
measurement that retired the old grep.

Sixteen of the 22 names the old hand-kept list carried were Task 12's list over
again — what the two shells share. The harvest makes that distinction free: it
reports what **these** files write, so the reader-only names (`px-reader-x` and
the reader's own geometry) are in the run because `ReaderShell.tsx` writes them,
not because someone remembered to type them into a list.

**A failure.** `DEAD` — the class compiled to no rule at all; that is a **typo
in the component**, so fix the class string, rebuild, re-run. `EMPTY` — the
selector emitted with an empty body, so the theme key resolves to nothing.
`NOVAR` — the rule reads a `var(--…)` nothing declares. The last two are theme
regressions: **stop and report them.** Do **not** add the name to
`ui/tailwind.config.js`, `src/styles/tokens.css`, `src/styles/roles.css` or
`tailwind-probe.txt`. All four are frozen for the duration of this plan and
were unfrozen exactly once, by the single minting pass in
`.superpowers/sdd/mint-spec.md`; minting one here to make a misspelling compile
recreates the unreachable-token problem the whole rebuild exists to fix. A
value that genuinely has no name goes into `mint-spec.md`, not into the config
and not into this task's commit.

**What this step cannot prove:** that these files write a class and that the
class compiles to a rule with declarations, yes. That the class reaches the
right element, that the element renders, that it is visible, or that its value
is the one the design asks for — no. That stays with the Playwright checks.

- [ ] **Step 11: Write the real-browser check at all three widths**

Create `ui/e2e/reader-shell.spec.ts`:

```ts
import { test, expect } from '@playwright/test'
import { expectDesign, shot } from './_harness'

// One spec, three projects: 1440, 1080 and 760. The reader's own numbers come
// from §6.17 / R3 and differ from the panel's on purpose — this is where a
// component that quietly took the panel's scale would show up.

test('the reader top bar matches the design at this width', async ({ page }) => {
  await page.goto('/departments')
  const bar = page.locator('[data-r-topbar]')
  await expect(bar).toBeVisible()
  await expect(bar).toHaveCSS('background-color', 'rgb(255, 255, 255)')
  await expect(bar).toHaveCSS('border-bottom-color', 'rgb(239, 231, 220)')
  await expect(page.locator('[data-shell="reader"]')).toHaveCSS('background-color', 'rgb(42, 29, 94)')
  await expectDesign(page, 'reader-shell')
  await shot(page, 'reader-shell')
})

test('the reader scale actually resolves on this surface', async ({ page }) => {
  // R3 — the scale layer, measured rather than assumed. jsdom resolves no custom
  // property, so this assertion is only meaningful in a browser.
  await page.goto('/departments')
  const body = await page.locator('[data-shell="reader"]').evaluate((el) =>
    getComputedStyle(el).getPropertyValue('--fs-role-body').trim(),
  )
  expect(body).toBe('15px')
})

test('the reader’s icon buttons are 42px, not the panel’s 34', async ({ page }) => {
  await page.goto('/departments')
  const box = await page.getByRole('link', { name: 'نمایه' }).boundingBox()
  expect(box?.width).toBe(42)
  expect(box?.height).toBe(42)
})

test('a back bar below the root, and no chrome at all on the flowchart', async ({ page }) => {
  await page.goto('/departments/dining')
  await expect(page.locator('[data-r-backbar]')).toBeVisible()
  await expect(page.locator('[data-r-topbar]')).toHaveCount(0)
  await shot(page, 'reader-backbar')

  await page.goto('/processes/dining-003/flow')
  await expect(page.locator('[data-r-backbar]')).toHaveCount(0)
  await expect(page.locator('[data-r-topbar]')).toHaveCount(0)
  await shot(page, 'reader-flow-nochrome')
})

test('the back bar tightens at 760 and the field behind it does not move', async ({ page }) => {
  await page.goto('/departments/dining')
  const width = page.viewportSize()!.width
  await expect(page.locator('[data-r-backbar]')).toHaveCSS(
    'padding-left', width <= 760 ? '14px' : '24px',
  )
  await expect(page.locator('[data-shell="reader"]')).toHaveCSS('background-color', 'rgb(42, 29, 94)')
})
```

- [ ] **Step 12: Run it at all three widths and watch it pass**

Run: `cd ui && npx playwright test e2e/reader-shell.spec.ts`
Expected: PASS — 15 tests (5 × three projects). Compare each shot against
`ui/design/Inja Reader.dc.html` opened at the same width before ticking this step.

**If the harness's fixture signs in as a many-department reader**, R4's redirect is not
exercised here and the vitest suite is the whole of its coverage — which is deliberate:
the rule is a routing decision on a query result, and jsdom answers it exactly. The e2e's
job is the chrome, the scale and the two breakpoints, which jsdom cannot answer at all.

- [ ] **Step 13: Run the full e2e sweep for both shells**

Run: `cd ui && npx playwright test`
Expected: PASS — the panel and reader specs together, thirty tests, at 1440, 1080 and 760.

- [ ] **Step 14: Commit**

```
git add ui/e2e/reader-shell.spec.ts
git commit -m "test(ui): the reader chrome and its scale are measured in a browser, at three widths"
```
### Task 14: `Departments` — both surfaces, the arbitrary→token sweep, and the two-column drop

The visual audit's control case: *"`/departments` — built earlier — is near pixel-faithful
to the design"* (`ui-audit-visual.md:40`). So this task is **not** a redesign. It is the
33 guard-measurable violations in `ui-audit-existing.md:470` turned into tokens, the R3
surface split the screen has never had, and the two breakpoints it has never had. Every
value below is already on screen at 1440px; the job is to make it survive a token audit,
a reader, and a 760px viewport without changing what a person sees at desktop.

**Files**
- Modify: `ui/src/lib/departments.ts`
- Modify: `ui/src/ui/IconTile.tsx`
- Modify: `ui/src/screens/Departments.tsx`
- Modify: `ui/src/screens/Departments.test.tsx`
- Modify: `ui/e2e/departments.spec.ts` — **it exists**; Task 4 wrote the panel half of it
- Create: `ui/src/lib/departments.test.ts`

**Files this task must not write** — each is frozen, and each for a different reason:

| Path | Why | What to do instead |
|---|---|---|
| `ui/tailwind.config.js`, `ui/src/styles/tokens.css`, `ui/src/styles/roles.css`, `ui/tailwind-probe.txt` | Frozen between deliberate minting passes, so that many tasks can run in one tree without clobbering each other's theme edits. Unfrozen exactly once, by the single consolidated mint (`.superpowers/sdd/mint-spec.md`). | A value with no token is **not** minted here. Stop, and report the value and the role it plays. |
| `ui/e2e/_harness.ts` | Pre-populated and frozen. Its `DESIGN` table is the expected-value record every screen is graded against, written up front (commit `3dda9ef`, `.superpowers/sdd/ui-harness-preflight-report.md`) precisely because eleven tasks appending to one file in one tree means the later write silently clobbers the earlier one, with a green build. | **`departments` and `departmentsReader` are already there.** Read them. If either is missing, or a number in it disagrees with what you build, stop and report. |
| `docs/superpowers/ui-normalisation-ledger.md` | The reviewer maintains it at review time, for the same one-file-many-writers reason. | Report the row you would have added, verbatim, in your task report. |

**Interfaces**

*Consumes*
- `useSurface(): 'panel' | 'reader'` — `ui/src/ui/surface.tsx` (Task 5)
- `Card` with `hoverLift?: boolean`, `radius?: string`, `onDark?: boolean` (Task 6)
- `StatTile({ value: string; label: string; tone: 'violet' | 'ink' | 'conflict' | 'ok'; dot?: boolean })` (Task 10)
- `IconTile({ accent: 'violet' | 'coral'; glyph: string })` — Task 11; **surface-aware**, no `size` prop (the F4/F8 guard forbids one)
- `Icon({ name: string; strokeWidth?: number; px?: number })` (Task 11)
- `expectDesign(page, screen)`, `shot(page, name)`, `visit(page, url, screen?)`, `signedIn(page, over?)`,
  `serve(page, table)` — `ui/e2e/_harness.ts` (Task 4). **Read, never written.** `signedIn` answers
  `GET /api/auth/me` from a fixture and `serve` answers the rest by pathname; between them they are
  the sign-in this task needs, and `expectEveryEndpointStubbed` (which `expectDesign` and `shot`
  both call) fails a spec that registered neither.
- `toFa` (`ui/src/lib/format.ts`), `useDepartments` (`ui/src/api/hooks.ts`)

*Produces*
- `Departments` — unchanged export, unchanged route
- `deptMeta(code): { icon: string; accent: 'violet' | 'coral'; tileClass: string; numeralClass: string; accentText: string; ctaDiscClass: string }`
- `IconTile` — surface-aware: panel `48×48` radius `14` glyph `24` @1.9 · reader `54×54` radius `16` glyph `26` @1.9
- the reader half of `ui/e2e/departments.spec.ts` (the panel half is Task 4's, and stays)

---

- [ ] **Step 1: Confirm the utility names Tasks 2–3 exposed. Add nothing.**
  Every later step in Tasks 14–18 is written against the names below. Run the check and
  read the result; this step **does not touch `ui/tailwind.config.js`**.

  ```bash
  cd ui && for u in \
    max1080 max760 \
    --fs-display --fs-h1 --fs-h2 --fs-h3 --fs-h4 --fs-h5 --fs-lg --fs-body --fs-sm --fs-sm2 --fs-xs --fs-xxs --fs-micro --fs-h1-reader-home --fs-h1-reader-list \
    --radius-bar --radius-sm --radius-input --radius-lg --radius-tile --radius-card-lg --radius-pill --radius-round \
    --role-title-on-field --role-subtitle-on-field \
    --text-on-dark --violet-on-dark --violet-on-dark-body --violet-on-violet --text-current --text-dialog-ghost \
    --tile-v3 --tile-v4 --tile-c2 --surface-sub --border-card --border-current --hair --line-dashed --border-danger \
    --shadow-feature --shadow-pop \
    --pad-screen-x --pad-screen-y --pad-departments-top --pad-departments-bottom --pad-reader-x --pad-reader-bottom --width-reader \
    --size-tile-reader --size-logo-login --size-logo-bar --duration-chev --duration-row \
  ; do grep -q -- "$u" tailwind.config.js || echo "MISSING: $u"; done
  ```

  Expected output: **nothing at all.** This step once expected three lines —
  `--radius-bar`, `--shadow-feature` and `--duration-row`, the only values in the table
  below that no token held — and the single minting pass
  (`.superpowers/sdd/mint-spec.md` §1.2 #9–11) has minted all three. Verified by running
  the loop above against the shipped config: zero output.

  So a `MISSING:` line now means the theme has **regressed** — something dropped a token
  that was there. **Stop and find out what dropped it. Do not add it back here, and do not
  add a second, differently-named entry beside it.** `ui/tailwind.config.js`,
  `ui/src/styles/tokens.css` and `ui/src/styles/roles.css` are frozen after the single
  minting pass; a screen task minting into one of them is the unreachable-token failure
  this rebuild exists to end, which is exactly why the mint was consolidated into one pass
  in the first place. Report it and wait.

  The loop greps for the **token** each utility resolves to, not for the class name;
  a token whose own name begins with `--border-` is keyed `border-<x>` on the colours scale and written
  `border-border-<x>`. Add no second, shorter name for one of them — `border-card` is
  already taken, by the white `--card`. The mapping, token by token:

  | utility | token | value |
  |---|---|---|
  | `max1080:` / `max760:` | — | **Already shipped by Task 2, named `max1080:` / `max760:`.** Do not add these: read them as `max1080:` / `max760:` — the plan once wrote four other spellings for these two variants and every one of them compiled to nothing. Never put them in `theme.screens` — see Step 8 of Task 2: one max-width object there deletes Tailwind's whole `min-*`/`max-*` family and the 30 shipped `max-[560px]:` utilities with it, silently. |
  | `text-fs-display … text-fs-micro` | `--fs-display … --fs-micro` | 34/23/22/19/17/16/15/14/13/12.5/11.5/11/10.5px |
  | `text-fs-h1-reader-home` | `--fs-h1-reader-home` | `26px` (reader home) |
  | `text-fs-h1-reader-list` | `--fs-h1-reader-list` | `30px` (reader process list) |
  | `leading-tight/snug/normal/relaxed/loose/looser` | `--lh-*` | 1.2 / 1.6 / 1.7 / 1.75 / 1.9 / 2.1 |
  | `rounded-bar` | `--radius-bar` | `2px` (the coral eyebrow bar) |
  | `rounded-tool` `rounded-input` `rounded-search` `rounded-tile` `rounded-feature` `rounded-pill` `rounded-round` | `--radius-sm/input/lg/tile/card-lg/pill/round` | 9 / 11 / 13 / 14 / 20 / 20 / 50% |
  | `text-role-title-on-field` | `--role-title-on-field` → `--card` | `#FFFFFF` — ledger **L-01**, THE screen title on the violet field. Tasks 15–23 all write it |
  | `text-role-subtitle-on-field` | `--role-subtitle-on-field` → `--violet-on-violet` | `#C9BEEE` — ledger **L-28**, THE subtitle under it |
  | `text-on-dark` | `--text-on-dark` | `#FBF7F1` — the flow canvas's ground, and **not a title colour**: L-01 retired it there. The two role classes above are what a screen title and its subtitle take. Its one remaining title use in this plan is the `departments` **panel** `<h1>` (Step 12), whose row is `ON_FIELD` |
  | `text-violet-on-dark` | `--violet-on-dark` | `#B79FE6` — the coral-bar eyebrow line, not a subtitle |
  | `text-violet-on-dark-body` | `--violet-on-dark-body` | `#C9BEEE` — Task 3 re-cut it from `#B7A6E0` (`tokens.css:106`), so this table once read `#B7A6E0` and was wrong. Right value now, wrong word still: L-28's role is written `text-role-subtitle-on-field` |
  | `text-violet-on-violet` | `--violet-on-violet` | `#C9BEEE` — its own declared role is the **mono id** inside a violet box (`A-0 · <id>`, a username); a *subtitle* takes the role class above |
  | `text-ink-current` | `--text-current` | `#5a5175` |
  | `text-dialog-ghost` | `--text-dialog-ghost` | `#6B5CA5` |
  | `bg-tile-v3` `bg-tile-v4` `bg-tile-c2` | `--tile-v3/v4/c2` | `#F5F1FB` / `#F8F4FE` / `#FFF3F2` |
  | `bg-surface-sub` | `--surface-sub` | `#FBF9FE` (S1 ×24, S3 has no token) |
  | `border-border-card` | `--border-card` | `rgba(42,29,94,.07)` (S1 ×46 — the default card border) |
  | `border-border-current` | `--border-current` | `#EDE5F5` |
  | `border-hair` | `--hair` | `#F2ECE3` |
  | `border-line-dashed` | `--line-dashed` | `#C9B8EC` |
  | `border-border-danger` | `--border-danger` | `#FDD9D6` |
  | `shadow-feature` | `--shadow-feature` | `0 2px 4px rgba(16,10,40,.18), 0 22px 46px -20px rgba(16,10,40,.65)` |
  | `shadow-pop` | `--shadow-pop` | `0 20px 45px -20px rgba(74,37,169,.45)` |
  | `px-screen-x` `py-screen-y` | `--pad-screen-x/y` | 40 / 30 |
  | `pt-departments-top` `pb-departments-bottom` | `--pad-departments-top/bottom` | 38 / 48 |
  | `px-reader-x` `pb-reader-bottom` | `--pad-reader-x/bottom` | 24 / 60 |
  | `max-w-reader` | `--width-reader` | `720px` |
  | `w-tile-reader h-tile-reader` | `--size-tile-reader` | `54px` |
  | `w-logo-login h-logo-login` / `w-logo-bar h-logo-bar` | `--size-logo-login` / `--size-logo-bar` | 76 / 38 |
  | `transition` (and every `transition-*`) | `--duration` | `.16s` — Task 2 registers it as `transitionDuration.DEFAULT`, which Tailwind's `filterDefault` keeps out of the `duration-*` scale, so a bare `transition` already carries it and no `duration-*` class for it can exist |
  | `duration-chev` `duration-row` | `--duration-chev` — | `.18s` `.14s` |
  | `ease-css` | — | the CSS keyword `ease` (S1's two transitions both say `ease`). No class carries it yet: Tailwind's own `transitionTimingFunction.DEFAULT` is `cubic-bezier(.4,0,.2,1)` and `filterDefault` keeps DEFAULT out of the `ease-*` scale, so this needs a named `transitionTimingFunction` key before it can be written |

  **Snapping rule, applied once for all of Tasks 14–18.** Five values in these screens
  fall between two steps of the frozen 14-step spacing scale (4·5·6·8·10·12·14·16·18·22·26·30·38·40).
  They are snapped to the nearer step and each snap gets a ledger row in Step 2:
  `20→22` (department ghost-index inset; `StatTile` inline padding) · `9→10`
  (sub-process chip inline padding, so it stops being 1px narrower than the count chip
  beside it — an R8 self-inconsistency) · `15→14` (process row padding at ≤760) ·
  `24→22` (login header gap) · `32→30` (login card padding). The screen gutters `48px`
  and `60px` are **not** snapped: they are gutters, not interior spacing, and get their
  own tokens above.

- [ ] **Step 2: Report the normalisations this part of the plan makes. Do not write them.**
  The theme itself is **not** committed here — it was committed by the single minting pass
  and is frozen. Neither is the ledger: `docs/superpowers/ui-normalisation-ledger.md` is
  maintained by the reviewer at review time, for the same reason the harness table is —
  several tasks running in one working tree would each append to one file, and the later
  write wins silently. **Copy the block below into your task report as "the ledger rows this
  task would add"; do not open the ledger, do not commit it.** If a row below is already in
  the ledger under a different number, say so in the report rather than restating it.

  The rows (owner-vetoable, per R8):

  ```markdown
  ## Part 3 — screens 14–18

  | # | What the design shows | Counted | Chosen | Why |
  |---|---|---|---|---|
  | P3-1 | Department-info column `900px`; every sibling screen `920px` | 900 ×1, 920 ×4 | **920** (`--width-list`) | R8 rule 2 — dominant usage; 900 is a one-off |
  | P3-2 | Summary's KPI section heading `15px/700 #2A1D5E`, on the `#2A1D5E` field | 1 | **`#fff`** | R8 rule 1 — §6.0 states headings on the field are `#fff`; ink on ink is invisible |
  | P3-3 | Summary header: only «ویرایش اطلاعات» violet primary; the app also needs a route to the flowchart | — | «مشاهدهٔ فلوچارت» **violet primary**, «ویرایش اطلاعات» **ghost** | matches the process row's own pairing (فلوچارت violet, گام‌به‌گام ghost); two violet primaries side by side is not a design the deliverable shows anywhere |
  | P3-4 | Count chip padding `4px 10px`, sub chip `4px 9px` | 1 each | **`4px 10px`** both | R8 — a 1px difference between two chips on one card is a defect |
  | P3-5 | Spacing snaps 20→22, 9→10, 15→14, 24→22, 32→30 | — | nearest step | the 14-step scale is frozen (`spacing.css`) |
  | P3-6 | Refusal wrapper `30/40px · 560px` vs `LoadFailedScreen` `30/30px · 920px` | 1 each | **`30/40px · 920px`** both | P10 — a failed read and a refused read stand in the same slot |
  | P3-7 | F11's 44px touch floor vs the design's 30–40px icon buttons | — | **the design's ladder**, rows ≥44px tall | see Task 16 Step 12 — flagged for owner veto |
  ```

  ```bash
  cd ui && npm run build 2>&1 | tail -3
  grep -rn 'max1080:\|max760:' src/ | wc -l   # the responsive utilities consumed in source
  ```
  Nothing is staged or committed by this step: the ledger is not yours to write, and the
  theme it would have recorded was committed by the mint.

  The count is a source-side count on purpose. The step used to read
  `grep -c "to1080\|to760" dist/assets/*.css` with the note *"0 is expected
  here"*, and it could never have been anything else: the utilities are named
  `max1080:` and `max760:`, so the pattern matched nothing whatever the code did.
  Nor can the built CSS answer the question at all — `tailwind-probe.txt` names
  `max1080:hidden` and `max760:hidden`, so both variants emit whether or not a
  component writes one. Expect a non-zero number: Tasks 6, 9 and 10 already carry
  responsive utilities in the primitives, and this task adds the screen's own.

- [ ] **Step 3: Read the sign-in the harness already gives you. Add nothing to it.**
  This step used to say *"append a `signIn(page, who)` to `ui/e2e/_harness.ts`"* that posted
  real credentials to `/api/auth/login`. **`ui/e2e/_harness.ts` is frozen, and it already
  solves this — differently and better.** Run:

  ```bash
  cd ui && grep -n "export async function \(signedIn\|serve\|visit\|expectDesign\|shot\)" e2e/_harness.ts
  ```

  Expected: five lines. What they are, and why this is not the same thing under another name:

  - `signedIn(page, over: Partial<Session> = {})` — answers `GET /api/auth/me` from a fixture.
    No live login, no credentials in the environment, no database. Pass `over` to change the
    session: a reader is `signedIn(page, { … })` with the reader's capabilities and scopes.
  - `serve(page, table)` — answers every other read by **pathname**, one fixture per path.
  - `visit(page, url, screen?)` — goes there, waits for `[data-screen]`, and pins the page so a
    later navigation is reported as a navigation instead of as a defect in the screen.
  - `expectEveryEndpointStubbed`, which `expectDesign` and `shot` both call, **fails a spec
    that registered no stubs at all** — with nothing intercepted, `/api/` requests leave the
    browser, are proxied to the FastAPI container on `:8000`, and are answered by it. A posted
    login would have made that the normal case: the check would grade a live database.

  So there is no sign-in to write, and nothing to commit here. **If any of the five is
  missing, stop and report it** — do not add it back, and do not add a second, differently
  named one beside it. The table in that file is the expected-value record all eleven screen
  tasks are graded against; a task that edits it is grading itself, and two tasks that edit
  it in one working tree lose one of the two edits with a green build.

- [ ] **Step 4: Write the failing test for the department accent map.**
  `Departments.tsx:59` hard-codes `text-[#FBE4E1]` / `text-[#EDE4FA]` — exactly
  `--dept-numeral-coral` / `--dept-numeral-violet` — and `:74` hard-codes the two CTA
  discs. `lib/departments.ts` is where the accent already lives (`ui-audit-existing.md:657`).
  Create `ui/src/lib/departments.test.ts`:

  ```ts
  import { describe, it, expect } from 'vitest'
  import { deptMeta, DEPT_CODES } from './departments'

  describe('deptMeta', () => {
    it('carries every class the accent decides, so no screen re-derives one', () => {
      const coral = deptMeta('cooking')     // t:'c' in the prototype's DEPTS
      expect(coral.accent).toBe('coral')
      expect(coral.tileClass).toBe('bg-tile-c text-conflict')
      expect(coral.numeralClass).toBe('text-dept-numeral-coral')
      expect(coral.accentText).toBe('text-conflict')
      expect(coral.ctaDiscClass).toBe('bg-disc-coral')

      const violet = deptMeta('cashier')    // t:'v'
      expect(violet.accent).toBe('violet')
      expect(violet.tileClass).toBe('bg-tile-v text-violet')
      expect(violet.numeralClass).toBe('text-dept-numeral-violet')
      expect(violet.accentText).toBe('text-violet')
      expect(violet.ctaDiscClass).toBe('bg-disc-violet')
    })

    it('answers for a code it has never heard of', () => {
      // The route is `/departments/:code`; anything can be typed into it, and a
      // thrown TypeError here is a white screen rather than the 404 the API sends.
      const m = deptMeta('not-a-department')
      expect(m.accent).toBe('violet')
      expect(m.icon).toBe('')
      expect(m.ctaDiscClass).toBe('bg-disc-violet')
    })

    it('covers all nine departments', () => {
      expect(DEPT_CODES).toHaveLength(9)
    })
  })
  ```

- [ ] **Step 5: Run it and watch it fail.**
  ```bash
  cd ui && npx vitest run src/lib/departments.test.ts
  ```
  Expected: `AssertionError: expected undefined to be 'text-dept-numeral-coral'` —
  `deptMeta` returns three keys, not six.

- [ ] **Step 6: Implement the accent map.**
  Replace the `TILE` constant and `deptMeta` in `ui/src/lib/departments.ts`:

  ```ts
  interface AccentClasses { tileClass: string; numeralClass: string; accentText: string; ctaDiscClass: string }

  /** Everything the violet/coral choice decides, in one place.
   *
   *  The ghosted index numeral and the footer CTA disc used to be written out at
   *  `Departments.tsx:59` and `:74` as four hex literals, three of which were
   *  byte-identical to a token the theme did not expose. They are accent
   *  decisions, so they belong beside the accent — not in the one screen that
   *  happens to draw them. */
  const ACCENT: Record<'violet' | 'coral', AccentClasses> = {
    violet: {
      tileClass: 'bg-tile-v text-violet',
      numeralClass: 'text-dept-numeral-violet',
      accentText: 'text-violet',
      ctaDiscClass: 'bg-disc-violet',
    },
    coral: {
      tileClass: 'bg-tile-c text-conflict',
      numeralClass: 'text-dept-numeral-coral',
      accentText: 'text-conflict',
      ctaDiscClass: 'bg-disc-coral',
    },
  }

  export function deptMeta(code: string): Meta & AccentClasses {
    const m = META[code] ?? { accent: 'violet' as const, icon: '' }
    return { ...m, ...ACCENT[m.accent] }
  }
  ```

  **The two disc tints are already minted. Add nothing.** This step used to say "add
  `--cta-violet: #F3EDFC` / `--cta-coral: #FFF0EE` to `roles.css` / `tailwind.config.js`
  (no `_ds` token exists for either; ledger row P3-8)". Both values ship today, under the
  names the map above already writes:

  ```
  src/styles/tokens.css:98   --disc-coral: #FFF0EE;    /* new */
  src/styles/tokens.css:99   --disc-violet: #F3EDFC;   /* new */
  tailwind.config.js:129     'disc-coral': 'var(--disc-coral)',
  tailwind.config.js:130     'disc-violet': 'var(--disc-violet)',
  ```

  Minting `--cta-violet` / `--cta-coral` beside them would put **the same two colours in
  the theme twice under two names** — the exact failure the single minting pass exists to
  prevent — in a file that is frozen after that pass. Step 17's grep list already checks
  `bg-disc-violet` and `bg-disc-coral`, so the instruction contradicted this task's own
  verification. `bg-disc-violet` and `bg-disc-coral` compile today; verified.

- [ ] **Step 7: Run it, watch it pass, commit.**
  ```bash
  cd ui && npx vitest run src/lib/departments.test.ts && npx tsc -b
  git add src/lib/departments.ts src/lib/departments.test.ts
  git commit -m "refactor(ui): the accent decides its own four classes, not the screen that draws them"
  ```
  `src/styles/roles.css` and `tailwind.config.js` are **not** staged: this task no longer
  writes to either.

- [ ] **Step 8: Write the failing test for a surface-aware `IconTile`.**
  R3's scale layer, applied to the one element the two surfaces most obviously disagree
  about: panel `48×48` radius `14`, reader `54×54` radius `16` with a `26px` glyph. Append
  to `ui/src/ui/primitives.test.tsx`:

  ```tsx
  import { SurfaceProvider } from './surface'
  import { IconTile } from './IconTile'

  describe('IconTile takes its scale from the surface, never from a prop', () => {
    it('is the panel tile inside a panel', () => {
      const { container } = render(
        <SurfaceProvider surface="panel"><IconTile accent="coral" glyph="cooking" /></SurfaceProvider>)
      const tile = container.firstElementChild!
      expect(tile.className).toContain('w-tile')
      expect(tile.className).toContain('rounded-tile')
      expect(tile.querySelector('svg')).toHaveAttribute('width', '24')
    })

    it('is the reader tile inside a reader', () => {
      const { container } = render(
        <SurfaceProvider surface="reader"><IconTile accent="coral" glyph="cooking" /></SurfaceProvider>)
      const tile = container.firstElementChild!
      expect(tile.className).toContain('w-tile-reader')
      expect(tile.className).toContain('rounded-card')      // 16px
      expect(tile.querySelector('svg')).toHaveAttribute('width', '26')
    })

    it('draws the glyph at the design’s department stroke weight', () => {
      // 1.9 is the department glyph's weight and nothing else's (§5.2 iconography).
      const { container } = render(
        <SurfaceProvider surface="panel"><IconTile accent="violet" glyph="cashier" /></SurfaceProvider>)
      expect(container.querySelector('svg')).toHaveAttribute('stroke-width', '1.9')
    })
  })
  ```

- [ ] **Step 9: Run it and watch it fail.**
  ```bash
  cd ui && npx vitest run src/ui/primitives.test.tsx
  ```
  Expected: `expected '…' to contain 'w-tile-reader'` — `IconTile` renders one size.

- [ ] **Step 10: Make `IconTile` read the surface.**
  `ui/src/ui/IconTile.tsx`:

  ```tsx
  import { deptMeta } from '../lib/departments'
  import { useSurface } from './surface'

  /** The department glyph tile.
   *
   *  **No `size` prop, deliberately** — F4/F8 puts density on the shell, and R3
   *  says the two surfaces differ in scale rather than in kind. A caller that
   *  could pass 48 could pass 50, and the reader's 54px tile would then be a
   *  number each of three screens remembered separately. */
  export function IconTile({ accent, glyph }: { accent: 'violet' | 'coral'; glyph: string }) {
    const reader = useSurface() === 'reader'
    const { icon } = deptMeta(glyph)
    const box = reader ? 'w-tile-reader h-tile-reader rounded-card' : 'w-tile h-tile rounded-tile'
    const tint = accent === 'coral' ? 'bg-tile-c text-conflict' : 'bg-tile-v text-violet'
    const px = reader ? 26 : 24
    return (
      <div className={`${box} ${tint} flex items-center justify-center shrink-0`}>
        <svg width={px} height={px} viewBox="0 0 24 24" fill="none" stroke="currentColor"
          strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden focusable="false">
          <path d={icon} />
        </svg>
      </div>
    )
  }
  ```

- [ ] **Step 11: Run it, watch it pass, commit.**
  ```bash
  cd ui && npx vitest run src/ui/primitives.test.tsx && npx tsc -b
  git add src/ui/IconTile.tsx src/ui/primitives.test.tsx
  git commit -m "feat(ui): the department tile knows which surface it is standing on"
  ```

- [ ] **Step 12: Write the failing tests for the screen itself.**
  Four claims jsdom *can* hold: the responsive hook exists, the reader is one column,
  the title's colour **branches with the surface** — the reader's white, the panel's cream —
  and nothing on the screen carries a hex literal any more. Append to
  `ui/src/screens/Departments.test.tsx`:

  ```tsx
  import { readFileSync } from 'node:fs'
  import { SurfaceProvider } from '../ui/surface'

  const DEPTS = [
    { code: 'cooking', name: 'پخت', count: 12, subs: 2, conflicts: 1 },
    { code: 'cashier', name: 'صندوق', count: 3, subs: 0, conflicts: 0 },
  ]
  function serve(rows = DEPTS) {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(
      JSON.stringify(rows), { status: 200, headers: { 'Content-Type': 'application/json' } }))
  }

  describe('the two surfaces', () => {
    it('is a three-column grid in the panel, and names the hook the breakpoints target', async () => {
      serve()
      renderAt('/departments', <SurfaceProvider surface="panel"><Departments /></SurfaceProvider>, '/departments')
      await screen.findByText('دپارتمان پخت')
      const grid = document.querySelector('[data-r-deptgrid]')!
      expect(grid).toBeInTheDocument()
      expect(grid.className).toContain('grid-cols-3')
      expect(grid.className).toContain('max1080:grid-cols-2')
      expect(grid.className).toContain('max760:grid-cols-1')
      expect(grid.className).toContain('gap-s9')          // 18px
    })

    it('is a single-column list in the reader, at the reader’s gap', async () => {
      serve()
      renderAt('/departments', <SurfaceProvider surface="reader"><Departments /></SurfaceProvider>, '/departments')
      await screen.findByText('دپارتمان پخت')
      const grid = document.querySelector('[data-r-deptgrid]')!
      expect(grid.className).toContain('grid-cols-1')
      expect(grid.className).toContain('gap-s7')          // 14px
      expect(grid.className).not.toContain('grid-cols-3')
    })

    it('gives the H1 the hook that shrinks it to 25px at ≤760', async () => {
      serve()
      renderAt('/departments', <SurfaceProvider surface="panel"><Departments /></SurfaceProvider>, '/departments')
      const h1 = await screen.findByRole('heading', { level: 1 })
      expect(h1).toHaveAttribute('data-r-title')
      expect(h1.className).toContain('text-fs-display')
      // The colour branches with the size, and this is the arm that keeps the
      // retired cream: `departments.h1.color` is `ON_FIELD` `#FBF7F1`, the one
      // screen L-01 did not move to white. Collapsing the two arms into one
      // class is what put `#FBF7F1` on every other screen's title.
      expect(h1.className).toContain('text-on-dark')
      expect(h1.className).not.toContain('text-role-title-on-field')
    })

    it('writes the reader’s H1 in the white L-01 decided, not the cream it retired', async () => {
      serve()
      renderAt('/departments', <SurfaceProvider surface="reader"><Departments /></SurfaceProvider>, '/departments')
      const h1 = await screen.findByRole('heading', { level: 1 })
      expect(h1.className).toContain('text-fs-h1-reader-home')
      expect(h1.className).toContain('text-role-title-on-field')  // --card, #FFFFFF
      expect(h1.className).not.toContain('text-on-dark')          // --text-on-dark, #FBF7F1
    })
  })

  describe('the token sweep', () => {
    it('leaves no literal value in the file', () => {
      // The guard exempts src/screens/ until Task 25 deletes that line. This is
      // the same scan, aimed at one file, so the sweep is pinned the moment it
      // happens rather than three tasks later.
      const src = readFileSync(new URL('./Departments.tsx', import.meta.url), 'utf8')
      expect(src).not.toMatch(/#[0-9a-fA-F]{3,8}\b/)
      expect(src).not.toMatch(/(text|rounded|shadow)-\[/)
      expect(src).not.toMatch(/\brounded-(sm|md|lg|xl|2xl|3xl|full)\b/)
      expect(src).not.toMatch(/\btext-(xs|sm|base|lg|xl|[2-9]xl)\b/)
      expect(src).not.toMatch(/\b(left|right)-\d/)
    })
  })
  ```

- [ ] **Step 13: Run them and watch them fail.**
  ```bash
  cd ui && npx vitest run src/screens/Departments.test.tsx
  ```
  Expected: four failures — `Unable to find an element by [data-r-deptgrid]`, and
  `expected '…#FBE4E1…' not to match /#[0-9a-fA-F]{3,8}\b/`.

- [ ] **Step 14: Rebuild `Departments.tsx` on tokens, both surfaces, both breakpoints.**
  Replace the whole file:

  ```tsx
  import { useNavigate } from 'react-router-dom'
  import { useDepartments } from '../api/hooks'
  import { useSurface } from '../ui/surface'
  import { deptMeta } from '../lib/departments'
  import { toFa } from '../lib/format'
  import { Card } from '../ui/Card'
  import { IconTile } from '../ui/IconTile'
  import { StatTile } from '../ui/StatTile'
  import { Icon } from '../ui/Icon'

  export function Departments() {
    const nav = useNavigate()
    const reader = useSurface() === 'reader'
    const { data = [] } = useDepartments()

    const totalProc = data.reduce((a, d) => a + (d.count ?? 0), 0)
    // The open-conflict count is served only for a department the viewer may edit,
    // and is absent — not zero — for the rest. So the tile is drawn only when at
    // least one department carried the key, and sums only those: a reader who was
    // told nothing is shown nothing, rather than a green ۰ asserting "no open
    // conflicts" on their behalf. Absence of a claim, not a claim of absence.
    const totalConflicts = data.reduce((a, d) => a + (d.conflicts ?? 0), 0)
    const knowsConflicts = data.some((d) => d.conflicts !== undefined)
    const hasConflicts = totalConflicts > 0

    // §6.0 — screens do not paint their own ground. The whole application sits on
    // #2A1D5E and the shell owns it; a `bg-ink` here would be a second opinion
    // about the field, and the browser check asserts the shell's, not this file's.
    const pad = reader
      ? 'pt-screen-y px-reader-x pb-reader-bottom'          // 30 / 24 / 60
      : 'pt-departments-top px-screen-x pb-departments-bottom max760:px-s7 max760:py-s9'   // 38 / 40 / 48 → 14 / 18

    return (
      <div data-r-pad className={`flex-1 overflow-auto ${pad}`}>
        <div className={`${reader ? 'max-w-reader' : 'max-w-departments'} mx-auto`}>

          <div className="flex items-end justify-between gap-s11 flex-wrap mb-s12" data-r-stack>
            <div>
              <div className="flex items-center gap-s4 mb-s2">
                <span className="w-s10 h-0.5 bg-coral rounded-bar" />
                <span className="text-fs-xs font-bold tracking-eyebrow text-violet-on-dark">INJA FOOD · مستندسازی فرآیند</span>
              </div>
              <h1 data-r-title className={`font-extrabold ${reader ? 'text-fs-h1-reader-home text-role-title-on-field' : 'text-fs-display text-on-dark'} tracking-display m-0`}>دپارتمان‌ها</h1>
              <p className="text-fs-body text-role-subtitle-on-field mt-s4 max-w-subtitle leading-normal m-0">
                نقشهٔ فرآیندهای مجموعه به تفکیک واحد. یک دپارتمان را برای مرور فرآیندهای مستندشده، کارت خلاصه و فلوچارت انتخاب کنید.
              </p>
            </div>
            {/* The stat row is panel chrome: the reader deliverable's home screen
                carries no counters, only the list. R3 — a difference in
                composition, not a difference in theme. */}
            {!reader && (
              <div className="flex gap-s6 flex-none max760:hidden">
                <StatTile value={toFa(totalProc)} label="فرآیند مستند" tone="violet" />
                <StatTile value={toFa(data.length)} label="دپارتمان" tone="ink" />
                {knowsConflicts && (
                  <StatTile value={toFa(totalConflicts)} label="تعارض باز"
                    tone={hasConflicts ? 'conflict' : 'ok'} dot={hasConflicts} />
                )}
              </div>
            )}
          </div>

          <div data-r-deptgrid
            className={reader
              ? 'grid grid-cols-1 gap-s7'
              : 'grid grid-cols-3 gap-s9 max1080:grid-cols-2 max760:grid-cols-1 max760:gap-s6'}>
            {data.map((d, i) => {
              const m = deptMeta(d.code)
              return (
                <Card key={d.code} hoverLift radius="feature"
                  onClick={() => nav(`/departments/${d.code}`)}
                  className="relative overflow-hidden p-s10 cursor-pointer border-border-card shadow-feature hover:shadow-card-hover hover:border-line-dashed transition-[transform,box-shadow,border-color] ease-css">
                  <span className={`absolute top-0 inset-x-0 h-1 ${m.accent === 'coral' ? 'bg-conflict' : 'bg-violet'}`} />
                  {/* `end-s10`, not `left-5`: in RTL the ghosted numeral sits on the
                      inline end. The physical spelling was one of the four mirror
                      bugs O5 lists, and it is invisible until an LTR locale exists. */}
                  <span aria-hidden className={`absolute top-s7 end-s10 text-fs-numeral font-extrabold leading-none pointer-events-none ${m.numeralClass}`}>
                    {toFa(String(i + 1).padStart(2, '0'))}
                  </span>
                  <IconTile accent={m.accent} glyph={d.code} />
                  <div className="font-extrabold text-fs-h4 text-ink mt-s8">دپارتمان {d.name}</div>
                  <div className="flex items-center gap-s3 flex-wrap mt-s2 min-h-chiprow">
                    <span className="inline-flex items-center gap-s2 text-fs-xs font-semibold text-dialog-ghost bg-tile-v3 px-s5 py-s1 rounded-pill">
                      <Icon name="file" px={12} strokeWidth={2} />
                      {toFa(d.count)} فرآیند
                    </span>
                    {(d.subs ?? 0) > 0 && (
                      <span className="text-fs-xxs font-semibold text-warn bg-tile-warn px-s5 py-s1 rounded-pill">{toFa(d.subs)} زیرفرآیند</span>
                    )}
                    {d.conflicts !== undefined && d.conflicts > 0 && (
                      <span className="inline-flex items-center gap-s1 text-fs-xxs font-semibold text-conflict bg-tile-c px-s5 py-s1 rounded-pill">
                        <span className="w-1.5 h-1.5 rounded-round bg-coral" />{toFa(d.conflicts)} تعارض
                      </span>
                    )}
                  </div>
                  <div className="flex items-center justify-between gap-s5 mt-s8 pt-s8 border-t border-hair">
                    <span className={`text-fs-sm2 font-bold ${m.accentText}`}>مشاهدهٔ فرآیندها</span>
                    <span className={`w-tool h-tool rounded-round flex-none flex items-center justify-center ${m.accentText} ${m.ctaDiscClass}`}>
                      <Icon name="chevron-start" px={16} strokeWidth={2.4} />
                    </span>
                  </div>
                </Card>
              )
            })}
          </div>
        </div>
      </div>
    )
  }
  ```

  Two theme entries this markup needs and Step 1's list does not carry, because they are
  this screen's alone: `--width-subtitle: 440px` (`max-w-subtitle`) and
  `--size-chiprow: 24px` (`min-h-chiprow`). The ghosted index numeral needs neither: 46px
  already ships as `--fs-numeral` (Task 3) and is written `text-fs-numeral`. Add both now.

- [ ] **Step 15: Run the screen suite, watch it pass.**
  ```bash
  cd ui && npx vitest run src/screens/Departments.test.tsx src/lib/departments.test.ts
  ```
  Expected: `Test Files 2 passed`, including the three pre-existing conflict-count tests
  — the `knowsConflicts` / `hasConflicts` logic is carried over unchanged and must stay
  green without being touched.

- [ ] **Step 16: Typecheck and lint.**
  ```bash
  cd ui && npx tsc -b && npx eslint .
  ```
  Expected: both silent.

- [ ] **Step 17: Build, and prove every class this screen writes emits.**
  ```bash
  cd ui && npx vite build
  node scripts/harvest-classes.mjs src/screens/Departments.tsx src/ui/IconTile.tsx src/lib/departments.ts
  ```
  Expected: the run ends `DEAD 0   EMPTY 0   NOVAR 0`, both controls hold
  (`control (negative): N/N invented names reported dead` and
  `control (escaping): … escaped variant classes unescaped`), and the last line
  is `PASS`. The script exits 1 on any failure, so it can be `&&`-chained.
  The class list is **harvested out of these files**, never hand-kept, so it
  cannot drift from what they write and `tailwind-probe.txt` cannot certify it
  on their behalf — see *The class-emission check* in Global Constraints for the
  measurement that retired the old grep.

  `src/lib/departments.ts` is named because this is the task that makes
  `deptMeta().numeralClass` load-bearing: the two numeral tints move out of
  hard-coded hexes in the screen and into the module, and the harvest is what
  proves they are real class names on the way through.

  **A failure.** `DEAD` — the class compiled to no rule at all; that is a **typo
  in the component**, so fix the class string, rebuild, re-run. `EMPTY` — the
  selector emitted with an empty body, so the theme key resolves to nothing.
  `NOVAR` — the rule reads a `var(--…)` nothing declares. The last two are theme
  regressions: **stop and report them.** Do **not** add the name to
  `ui/tailwind.config.js`, `src/styles/tokens.css`, `src/styles/roles.css` or
  `tailwind-probe.txt`. All four are frozen for the duration of this plan and
  were unfrozen exactly once, by the single minting pass in
  `.superpowers/sdd/mint-spec.md`; minting one here to make a misspelling compile
  recreates the unreachable-token problem the whole rebuild exists to fix. A
  value that genuinely has no name goes into `mint-spec.md`, not into the config
  and not into this task's commit.

  **What this step cannot prove:** that these files write a class and that the
  class compiles to a rule with declarations, yes. That the class reaches the
  right element, that the element renders, that it is visible, or that its value
  is the one the design asks for — no. That stays with the Playwright checks.

- [ ] **Step 18: Commit the screen.**
  ```bash
  cd ui && git add src/screens/Departments.tsx src/screens/Departments.test.tsx src/ui/IconTile.tsx
  git commit -m "feat(ui): the departments board keeps its face and gains a reader, two breakpoints and no literals"
  ```

- [ ] **Step 19: Read the two departments rows the harness already holds. Write neither.**
  This step used to say *"add to the `DESIGN` table"*, with a row in field names Task 4 never
  shipped. **Both rows exist.** They were written before any screen was, by the pre-flight
  (commit `3dda9ef`; the reasoning is in `.superpowers/sdd/ui-harness-preflight-report.md`),
  because eleven screen tasks each appending a row to one file in one working tree means the
  later write silently clobbers the earlier one and the build still goes green.

  ```bash
  cd ui && node -e "const s=require('fs').readFileSync('e2e/_harness.ts','utf8');for(const k of ['departments:','departmentsReader:'])console.log(k, s.includes('  '+k)?'present':'MISSING')"
  ```

  Read them — `departments` (panel) and `departmentsReader` — and build **to** them:
  the reader's `720px` column, its `30px 24px 60px` → `18px 14px` padding, its `26px/800`
  white title (`--fs-h1-reader-home`, ledger L-34 keeps it smaller than the list's 30px),
  its `13px` `#C9BEEE` lead (R12 drops the deliverable's 14.5px), its one-column
  `[data-r-deptgrid]` at `14px`, and the white `18px` card with `CARD_BORDER` and
  `CARD_SHADOW`.

  **The two rows disagree about the title colour, on purpose, and one class string cannot
  satisfy both.** `departments.h1.color` is `ON_FIELD` `#FBF7F1` — what this screen paints
  today, and the one screen ledger **L-01** did *not* move to white. `departmentsReader.h1`
  is `TITLE_ON_FIELD`, `#FFFFFF`. So Step 12's `<h1>` **branches the colour on `useSurface()`
  the way the size beside it already branches**: the reader takes `text-role-title-on-field`
  (`--role-title-on-field` → `--card`, `#FFFFFF`; `roles.css:71`) and the panel keeps
  `text-on-dark` (`--text-on-dark`, `#FBF7F1`), so both rows go green. **Write it exactly as
  Step 12 has it and do not collapse the two branches back into one class** — one string here
  is what put `#FBF7F1` on all nine screen titles in the first place.
  `text-role-title-on-field` is the class every *other* screen's title takes (Tasks 15–23 all
  write it); departments is the single exception, on the panel surface only. If you conclude
  the panel should move to white as well, that is a decision about L-01's one exception:
  **stop and report it** rather than repainting the row.

  **The `body` row disagrees the same way, and this one cannot be branched.**
  `departments.body` is `ON_FIELD_MUTED` `#B7A6E0`; `departmentsReader.body` is
  `SUBTITLE_ON_FIELD` `#C9BEEE`. `#B7A6E0` is reachable from **no utility this theme has**:
  Task 3 re-cut `--violet-on-dark-body` from `#B7A6E0` to `#C9BEEE` (ledger **L-28**, 13 uses
  against 1) and `--violet-on-dark` is `#B79FE6`, a different colour. So Step 12's `<p>` takes
  `text-role-subtitle-on-field` (`--role-subtitle-on-field` → `--violet-on-violet`, `#C9BEEE`)
  on both surfaces — never `text-violet-on-dark-body`, whose name still reads like the answer
  and whose value L-28 moved. The reader's row goes green on it, and the panel's `body` line
  is a **fourth** line in this row that states what the screen paints *today*: it goes red when
  your screen is built, and `SUBTITLE_ON_FIELD` is its replacement. **Report it with the three
  below; do not edit it.**

  **Three lines in the `departments` row deliberately state what the screen does *today*,
  not what you are about to build**, so that the mutation tests covering them keep dying
  while this task is in flight: `padding` (one value, no per-width record), `grid.columns`
  (`3 / 3 / 3`), and `card` (cream `#FBF7F1`, no `border`, no `shadow`). Each carries a
  comment saying so. **You do not edit them.** When your screen is built, the row goes red on
  exactly those three — that red is expected, and it is the handover: **stop, and report the
  three replacements in your task report**, quoting them so the reviewer can apply them in
  one edit:

  ```ts
  padding: { 1440: '38px 40px 48px', 1080: '38px 40px 48px', 760: '18px 14px' },
  grid: { columns: { 1440: 3, 1080: 2, 760: 1 }, gap: '18px' },
  card: { radius: '20px', shadow: CARD_SHADOW, border: CARD_BORDER, background: SURFACE },
  ```

  Any *other* disagreement between a row and what §6.16 / the deliverables say is a defect in
  one of the two, not a licence to edit the row: **stop and report that too.**

- [ ] **Step 20: Extend the browser check that already exists.**
  **`ui/e2e/departments.spec.ts` is not yours to create** — Task 4 wrote it, as the one
  screen the visual audit calls near pixel-faithful, and it is what proved the harness
  works. Open it, keep its `DEPARTMENTS` fixture (it is typed as `Department[]`, so a
  change to the endpoint's type is a `tsc` error here rather than a screen rendering
  `undefined` in a check that still passes), and add this task's two halves to it.

  The sign-in is `signedIn` + `serve`, not a posted login — see Step 3.

  ```ts
  import { test, expect } from '@playwright/test'
  import type { Department } from '../src/api/types'
  import { expectDesign, serve, shot, signedIn, visit } from './_harness'

  const cols = (t: string) => t.split(' ').filter(Boolean).length

  // …the existing DEPARTMENTS fixture and the existing panel test stay…

  test('departments — panel, at this width', async ({ page }) => {
    await signedIn(page)
    await serve(page, { '/api/departments': DEPARTMENTS, '/api/pending': [] })
    await visit(page, '/departments', 'departments')
    const w = page.viewportSize()!.width

    await expectDesign(page, 'departments')

    const grid = page.locator('[data-r-deptgrid]')
    expect(cols(await grid.evaluate((el) => getComputedStyle(el).gridTemplateColumns)))
      .toBe(w > 1080 ? 3 : w > 760 ? 2 : 1)
    expect(await grid.evaluate((el) => getComputedStyle(el).gap))
      .toBe(w > 760 ? '18px' : '12px')

    const h1 = page.getByRole('heading', { level: 1 })
    expect(await h1.evaluate((el) => getComputedStyle(el).fontSize)).toBe(w > 760 ? '34px' : '25px')

    const pad = page.locator('[data-r-pad]')
    expect(await pad.evaluate((el) => getComputedStyle(el).paddingLeft)).toBe(w > 760 ? '40px' : '14px')

    // R7 — the stat row is one of the two things the ≤760 pass removes.
    if (w <= 760) await expect(page.getByText('فرآیند مستند')).toBeHidden()

    await shot(page, `departments-panel-${w}`)
  })

  test('departments — reader', async ({ page }) => {
    // R4: this screen exists for a reader only when they reach two or more
    // departments. The session fixture must therefore carry at least two scopes,
    // or `ReaderShell` lands them on a process list and this spec asserts the
    // wrong page. That is a property of the fixture, not of the environment —
    // `signedIn` overrides the session, so no E2E_READER_USER is involved.
    await signedIn(page, {
      username: 'reader', displayName: 'خواننده', role: 'reader',
      capabilities: ['view'], scopes: ['cooking', 'warehouse'],
    })
    await serve(page, { '/api/departments': DEPARTMENTS, '/api/pending': [] })
    await visit(page, '/departments', 'departmentsReader')
    const w = page.viewportSize()!.width

    await expectDesign(page, 'departmentsReader')

    const grid = page.locator('[data-r-deptgrid]')
    expect(cols(await grid.evaluate((el) => getComputedStyle(el).gridTemplateColumns))).toBe(1)
    expect(await grid.evaluate((el) => getComputedStyle(el).gap)).toBe('14px')

    const tile = page.locator('[data-r-deptgrid] svg').first().locator('..')
    const box = await tile.boundingBox()
    expect(Math.round(box!.width)).toBe(54)
    expect(await tile.evaluate((el) => getComputedStyle(el).borderRadius)).toBe('16px')

    await shot(page, `departments-reader-${w}`)
  })
  ```

  The reader's `720px` column is not re-asserted here: `departmentsReader.columnWidth` in
  the frozen table already grades it at all three widths, and a second copy of a number is
  a second place for it to go stale.

- [ ] **Step 21: Run the browser check and watch it fail where it should.**
  ```bash
  cd ui && npx playwright test e2e/departments.spec.ts
  ```
  Expected on a first run: six results (two specs × three width projects). Any failure
  here is a real one — jsdom rendered nothing, so this is the first time the screen has
  been measured. Fix the screen, not the assertion, unless the number is wrong against
  §6.1/§6.17.

- [ ] **Step 22: Run it green at all three widths.**
  ```bash
  cd ui && npx playwright test e2e/departments.spec.ts --reporter=list
  ```
  Expected: `6 passed`, and six PNGs under the harness's screenshot directory named
  `departments-panel-1440/1080/760` and `departments-reader-1440/1080/760`.

- [ ] **Step 23: Commit the check.**
  ```bash
  cd ui && git commit e2e/departments.spec.ts \
    -m "test(ui): the departments board is measured in a browser at three widths"
  ```
  `e2e/_harness.ts` is **not** staged — it is frozen and this task did not touch it. Commit
  by pathspec rather than `git add` + `git commit`: `git commit` with no pathspec commits the
  *index*, and another agent's staged change was swallowed into an unrelated commit that way.

---

### Task 15: `ProcessList` — the LTR box, the 44px title line, and the ⋯ that replaces the action bar

Three defects that are not about colour. `ProcessList.tsx:78` pins `dir="ltr"` on the
scrolling region and re-pins `dir="rtl"` on **one** child, so every dialog that mounts
inside it (`:151-153`) is left LTR and has to re-pin itself — five files carrying a
workaround for a cosmetic decision in a sixth (`ui-audit-existing.md:479`). `ConfirmMark`
puts a `min-h-touch` `Button` inside the title line, so a row whose type is 15px is 44px
tall. And the screen has no ≤760 behaviour at all, where the design replaces the whole
action bar with a `36×36` `⋯`.

**Files**
- Modify: `ui/src/screens/ProcessList.tsx`
- Modify: `ui/src/screens/ProcessList.test.tsx`
- Modify: `ui/src/styles/base.css`
- Modify: `ui/src/test/guards.test.ts`
- Create: `ui/e2e/process-list.spec.ts`

**Files this task must not write**

| Path | Why | What to do instead |
|---|---|---|
| `ui/tailwind.config.js`, `ui/src/styles/tokens.css`, `ui/src/styles/roles.css`, `ui/tailwind-probe.txt` | Frozen between deliberate minting passes, so many tasks can run in one tree without clobbering each other. Unfrozen exactly once, by the single consolidated mint (`.superpowers/sdd/mint-spec.md`). | A value with no token is not minted here. Stop, and report the value and its role. |
| `ui/e2e/_harness.ts` | Pre-populated and frozen — the `DESIGN` table is the expected-value record every screen is graded against, written up front (`3dda9ef`) because eleven tasks appending to one file in one tree lose all but the last write, with a green build. | **`processList` and `processListReader` are already there.** Read them; if either is missing or wrong, stop and report. |
| `docs/superpowers/ui-normalisation-ledger.md` | Maintained by the reviewer at review time. | Report the row you would add, in your task report. |

**Interfaces**

*Consumes* — everything Task 14 Step 1 verified, plus:
- `SearchField` (Task 6) at its large skin — `13px 44px`, radius `13`, `13px`, coral focus
- `StatusPill({ tone: 'ok' | 'warn' | 'dead'; label: string })` (Task 6)
- `IdBadge` (Task 6), `Button` with `variant: 'ghost' | 'violet' | 'coral' | 'danger'` (Task 6)
- `Menu` (`ui/src/ui/Menu.tsx`) for the `⋯` overflow
- `IconTile`, `Icon` (Tasks 11, 14)
- `ExportMenu` (`ui/src/write/ExportMenu.tsx`) — untouched here; Task 24 rebuilds it

*Produces*
- `ProcessList` — unchanged export and route; **no `dir=` attribute anywhere in the file**
- `[data-r-pad]` / `[data-r-pad] > *` direction rule in `ui/src/styles/base.css`
- `[data-r-plistactions]`, `[data-r-plistmore]`, `[data-r-prow]` hooks

---

- [ ] **Step 1: Write the failing test for the scroll-direction rule.**
  §8 wants the scrollbar on the right: `[data-r-pad]{direction:ltr}` with **every**
  immediate child flipped back. That is a two-line CSS rule, not a pair of attributes on
  two hand-picked elements. Append to `ui/src/screens/ProcessList.test.tsx`:

  ```tsx
  import { readFileSync } from 'node:fs'

  describe('the scroll container', () => {
    it('pins no direction with an attribute', () => {
      // O1 — `dir="ltr"` on the region plus `dir="rtl"` on one child left every
      // dialog mounted here LTR, and five files in src/write/ carry a re-pin with
      // a comment explaining this screen. The design expresses the same intent as
      // a stylesheet rule that catches all children, so the workaround has nothing
      // left to work around.
      const src = readFileSync(new URL('./ProcessList.tsx', import.meta.url), 'utf8')
      expect(src).not.toMatch(/\bdir=/)
    })

    it('carries the hook the rule targets', async () => {
      mock()
      renderAt('/departments/:code', <ProcessList />, '/departments/cooking', EDITOR)
      await screen.findByText('خرید و پرداخت')
      expect(document.querySelector('[data-r-pad]')).toBeInTheDocument()
    })
  })
  ```

- [ ] **Step 2: Run it and watch it fail.**
  ```bash
  cd ui && npx vitest run src/screens/ProcessList.test.tsx -t "scroll container"
  ```
  Expected: `expected '…<div dir="ltr" ref={scrollRef}…' not to match /\bdir=/`.

- [ ] **Step 3: Move the rule into the stylesheet.**
  Add to `ui/src/styles/base.css`, inside `@layer base`:

  ```css
  /* §8 — the scroll-direction workaround, verbatim from S1's <style> block.
     Every scrolling container is flipped to `ltr` so its scrollbar sits on the
     right, and its immediate children are flipped straight back to `rtl`. This
     is deliberate: the design wants RTL text with a right-hand scrollbar.

     A stylesheet rule and not two `dir=` attributes, because the attribute form
     only flipped back the one child somebody remembered — every dialog that
     mounted in the same container stayed LTR and had to re-pin itself, which is
     the workaround `write/CreateProcessModal`, `DeleteProcessConfirm`,
     `ReorderModal`, `ExportModal` and `ExportMenu` each carry a comment about. */
  [data-r-pad] { direction: ltr; }
  [data-r-pad] > * { direction: rtl; }
  ```

- [ ] **Step 4: Run it, watch it pass, commit.**
  ```bash
  cd ui && npx vitest run src/screens/ProcessList.test.tsx -t "scroll container"
  git add src/styles/base.css src/screens/ProcessList.test.tsx
  git commit -m "fix(ui): the right-hand scrollbar stops making every dialog re-pin its direction"
  ```

- [ ] **Step 5: Write the failing test for the row's title line.**
  Append to `ui/src/screens/ProcessList.test.tsx`:

  ```tsx
  const CONFIRMER: SessionDescriptor = { ...EDITOR, capabilities: [...EDITOR.capabilities, 'confirm'] }

  describe('the confirmation on a row', () => {
    it('states the mark and offers no act', async () => {
      // §6.2 gives the row a confirmation *chip* in the meta line and no button.
      // The act lives where the design puts it — the summary header (§6.3) and
      // the flow bar's confirmed toggle (§6.5). Keeping a `min-h-touch` Button in
      // a 15px title line is what made every row 44px tall.
      vi.spyOn(globalThis, 'fetch').mockImplementation((input: RequestInfo | URL) => {
        const url = String(input)
        const body = url.startsWith('/api/confirmations')
          ? [{ target: 'cooking-001', kind: 'process', fingerprint: 'a'.repeat(64),
               confirmed: true, confirmed_by: '09120000001', confirmed_at: 1770000000 }]
          : url.includes('/processes') ? PROCS
          : [{ code: 'cooking', name: 'پخت', count: 2 }]
        return Promise.resolve(new Response(JSON.stringify(body),
          { status: 200, headers: { 'Content-Type': 'application/json' } }))
      })
      renderAt('/departments/:code', <ProcessList />, '/departments/cooking', CONFIRMER)
      expect(await screen.findByText('تأیید شده')).toBeInTheDocument()
      expect(screen.queryByRole('button', { name: 'تأیید محتوا' })).not.toBeInTheDocument()
      expect(screen.queryByRole('button', { name: 'لغو تأیید' })).not.toBeInTheDocument()
    })
  })
  ```

- [ ] **Step 6: Run it and watch it fail.**
  ```bash
  cd ui && npx vitest run src/screens/ProcessList.test.tsx -t "confirmation on a row"
  ```
  Expected: `expected null not to be null` on the «لغو تأیید» query — `ConfirmMark`
  renders the revoke button for a confirmed row.

- [ ] **Step 7: Write the failing tests for the rest of the row and the ≤760 behaviour.**
  Append to `ui/src/screens/ProcessList.test.tsx`:

  ```tsx
  describe('the row, the empty state and the mobile overflow', () => {
    it('says the right nothing for an empty department and for a fruitless search', async () => {
      // The reader deliverable's own defect #3 (§6.17), reproduced in this app:
      // an empty department shows the search-miss copy. Two states, two sentences.
      vi.spyOn(globalThis, 'fetch').mockImplementation((input: RequestInfo | URL) =>
        Promise.resolve(new Response(JSON.stringify(String(input).includes('/processes') ? [] : []),
          { status: 200, headers: { 'Content-Type': 'application/json' } })))
      renderAt('/departments/:code', <ProcessList />, '/departments/cooking', EDITOR)
      expect(await screen.findByText('فرآیندی برای این دپارتمان ثبت نشده است.')).toBeInTheDocument()
    })

    it('keeps the search-miss sentence for a search that misses', async () => {
      mock()
      renderAt('/departments/:code', <ProcessList />, '/departments/cooking', EDITOR)
      await screen.findByText('خرید و پرداخت')
      fireEvent.change(screen.getByPlaceholderText('جست‌وجو براساس نام یا شناسهٔ فرآیند…'),
        { target: { value: 'زززز' } })
      expect(screen.getByText('فرآیندی با این نام پیدا نشد')).toBeInTheDocument()
    })

    it('draws the action bar and the ⋯ that replaces it, each with its own hook', async () => {
      mock()
      renderAt('/departments/:code', <ProcessList />, '/departments/cooking', EDITOR)
      await screen.findByText('خرید و پرداخت')
      const bar = document.querySelector('[data-r-plistactions]')!
      const more = document.querySelector('[data-r-plistmore]')!
      expect(bar.className).toContain('max760:hidden')
      expect(more.className).toContain('hidden')
      expect(more.className).toContain('max760:inline-flex')
    })

    it('puts nothing in the ⋯ that the caller may not do', async () => {
      // R5 — the overflow is the action bar, not a superset of it. A reader's ⋯
      // holds «اطلاعات دپارتمان» and nothing else.
      mock()
      renderAt('/departments/:code', <ProcessList />, '/departments/cooking', READER)
      fireEvent.click(await screen.findByRole('button', { name: 'کارهای بیشتر' }))
      expect(screen.getByRole('menuitem', { name: 'اطلاعات دپارتمان' })).toBeInTheDocument()
      expect(screen.queryByRole('menuitem', { name: 'فرآیند جدید' })).not.toBeInTheDocument()
      expect(screen.queryByRole('menuitem', { name: 'ترتیب فرآیندها' })).not.toBeInTheDocument()
    })

    it('links an heir only when it is one this reader can open', async () => {
      // R5 — a list never renders a row it would then refuse to open. An heir in
      // this department is reachable by anyone who was served the tombstone; an
      // heir named in another department is a 404 waiting to be clicked, so it is
      // drawn as the design draws it — mono text, not an anchor.
      vi.spyOn(globalThis, 'fetch').mockImplementation((input: RequestInfo | URL) => {
        const body = String(input).includes('/processes')
          ? [{ ...PROCS[2], superseded_by: ['cooking-050', 'cashier-007'] }]
          : [{ code: 'cooking', name: 'پخت', count: 1 }]
        return Promise.resolve(new Response(JSON.stringify(body),
          { status: 200, headers: { 'Content-Type': 'application/json' } }))
      })
      renderAt('/departments/:code', <ProcessList />, '/departments/cooking', EDITOR)
      expect(await screen.findByRole('link', { name: /cooking-050/ }))
        .toHaveAttribute('href', '/processes/cooking-050')
      expect(screen.queryByRole('link', { name: /cashier-007/ })).not.toBeInTheDocument()
      expect(screen.getByText(/cashier-007/)).toBeInTheDocument()
    })

    it('leaves no literal value in the file', () => {
      const src = readFileSync(new URL('./ProcessList.tsx', import.meta.url), 'utf8')
      expect(src).not.toMatch(/#[0-9a-fA-F]{3,8}\b/)
      expect(src).not.toMatch(/(text|rounded|shadow)-\[/)
      expect(src).not.toMatch(/\brounded-(sm|md|lg|xl|2xl|3xl|full)\b/)
      expect(src).not.toMatch(/\btext-(xs|sm|base|lg|xl|[2-9]xl)\b/)
    })
  })
  ```

- [ ] **Step 8: Run them and watch them fail.**
  ```bash
  cd ui && npx vitest run src/screens/ProcessList.test.tsx
  ```
  Expected: six failures, among them `Unable to find an element with the text:
  فرآیندی برای این دپارتمان ثبت نشده است.` and `Unable to find role="button" name="کارهای بیشتر"`.

- [ ] **Step 9: Rebuild the header and the action bar.**
  In `ui/src/screens/ProcessList.tsx`, replace the root element and the header block
  (`:78-101`). `TAG_CLS` goes with them — the tag is `StatusPill`'s job now.

  ```tsx
  const TAG_TONE: Record<string, 'warn' | 'conflict' | 'violet' | 'dead'> = {
    sub: 'warn', conflict: 'conflict', kpi: 'violet', plain: 'violet', tombstone: 'dead',
  }

  // …inside the component, after the refusal early return:
  const actions = [
    ...(mayEdit ? [{ key: 'order', label: 'ترتیب فرآیندها', run: () => setReordering(true) }] : []),
    { key: 'overview', label: 'اطلاعات دپارتمان', run: () => nav(`/departments/${code}/overview`) },
    ...(mayEdit ? [{ key: 'new', label: 'فرآیند جدید', run: () => setCreating(true) }] : []),
  ]

  return (
    <div data-r-pad ref={scrollRef}
      onScroll={(e) => sessionStorage.setItem(scrollKey, String(e.currentTarget.scrollTop))}
      className="flex-1 overflow-auto py-screen-y px-screen-x max760:px-s7 max760:py-s9">
      <div className={`${reader ? 'max-w-reader' : 'max-w-list'} mx-auto`}>
        <div className="flex items-end justify-between gap-s8 mb-s10" data-r-stack>
          <div>
            <div className="flex items-center gap-s6">
              <IconTile accent={m.accent} glyph={code} />
              <h1 className={`font-extrabold ${reader ? 'text-fs-h1-reader-list' : 'text-fs-h2'} text-role-title-on-field m-0`}>
                دپارتمان {dept?.name ?? ''}
              </h1>
              {/* §6.2 puts the mobile ⋯ in the title row, not in the bar it
                  replaces — the bar is gone at that width. `⋯` (U+22EF) is the
                  third sanctioned non-SVG glyph (§5.2 iconography). */}
              <Menu label="کارهای بیشتر" data-r-plistmore
                className="hidden max760:inline-flex w-menu-more h-menu-more rounded-input border-hairline border-line bg-card text-violet text-fs-h5 font-bold"
                items={actions.map((a) => ({ key: a.key, label: a.label, onSelect: a.run }))}>
                ⋯
              </Menu>
            </div>
            <p className="text-fs-sm text-violet-on-violet mt-s4 leading-normal m-0">
              {toFa(dept?.count ?? procs.length)} فرآیند مستندشده · برای مشاهدهٔ کارت خلاصه و فلوچارت روی هر فرآیند بزنید.
            </p>
          </div>
          <div data-r-plistactions className="flex items-center gap-s5 shrink-0 max760:hidden">
            {mayEdit && <Button variant="ghost" onClick={() => setReordering(true)} className="px-s8 py-s6 text-fs-sm">ترتیب فرآیندها</Button>}
            <Button variant="ghost" onClick={() => nav(`/departments/${code}/overview`)} className="px-s8 py-s6 text-fs-sm">اطلاعات دپارتمان</Button>
            {mayEdit && <Button variant="coral" onClick={() => setCreating(true)} className="px-s8 py-s6 text-fs-sm">فرآیند جدید</Button>}
            <ExportMenu department={code} />
          </div>
        </div>

        <div className="mb-s8">
          <SearchField label="جست‌وجوی فرآیند" value={q} onChange={setQ}
            placeholder="جست‌وجو براساس نام یا شناسهٔ فرآیند…" />
        </div>
  ```

  **`w-menu-more h-menu-more` already exists. Add nothing.** This step used to say *"add
  `--size-menu-more: 36px` to `roles.css` and expose it as `w-menu-more h-menu-more`"*; the
  single minting pass has since minted it — `src/styles/tokens.css:413`
  (`--size-menu-more: 36px; /* the … / home square button, 3 uses */`) and
  `tailwind.config.js` keys it on both `width` and `height`. Verify and move on:

  ```bash
  cd ui && grep -n -- '--size-menu-more' src/styles/tokens.css src/styles/roles.css
  grep -n "menu-more" tailwind.config.js
  ```

  Expected: the token on one line and two config keys. **If it is gone, the theme has
  regressed — stop and report it. Do not mint it here, and do not add a second,
  differently-named entry beside it.** `ui/tailwind.config.js`, `src/styles/tokens.css`,
  `src/styles/roles.css` and `tailwind-probe.txt` are frozen between deliberate minting
  passes, and they are frozen so that many tasks can run in one working tree at once: a
  screen task minting into one of them is the unreachable-token failure this whole rebuild
  exists to end, which is why the mint was consolidated into a single pass in the first
  place. (§6.2 — the `⋯` that replaces the action bar is `36×36`.)

- [ ] **Step 10: Rebuild the row.**
  Replace the list block (`:103-149`) of `ui/src/screens/ProcessList.tsx`:

  ```tsx
        <div className="flex flex-col gap-s6">
          {list.length === 0 && (
            // Two states, two sentences (§6.2). The reader deliverable collapses
            // them into one and this app copied it: an empty department was told
            // its search had missed.
            <div className="text-center py-s16 px-s5 text-faint text-fs-sm bg-card border border-border-card rounded-card">
              {query ? 'فرآیندی با این نام پیدا نشد' : 'فرآیندی برای این دپارتمان ثبت نشده است.'}
            </div>
          )}
          {list.map((p) => {
            const tag = deriveTag(p)
            const tombstoned = !!p.tombstoned
            const mark = markOf.get(p.id)
            return (
              <div key={p.id} data-r-prow
                className={`bg-card border border-border-card rounded-card px-s9 py-s9 flex items-center gap-s8 shadow-card
                  hover:-translate-y-0.5 hover:shadow-card-hover hover:border-line-dashed
                  transition-[transform,box-shadow,border-color] ease-css
                  max760:flex-col max760:items-stretch max760:p-s7 max760:gap-s6
                  ${tombstoned ? 'opacity-60' : ''}`}>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-s5">
                    {orderPos.has(p.id) && (
                      <span data-testid={`pos-${p.id}`} className="font-extrabold text-fs-body text-violet min-w-s9 text-center shrink-0 max760:hidden">
                        {toFa(orderPos.get(p.id)!)}
                      </span>
                    )}
                    <span className="font-bold text-fs-h4 text-ink truncate">{p.name}</span>
                  </div>
                  <div className="flex items-center gap-s4 flex-wrap mt-s4 ps-s11 max760:hidden">
                    <IdBadge>{p.id}</IdBadge>
                    <StatusPill tone={TAG_TONE[tag.kind]} label={tag.label} />
                    {mark && <StatusPill tone={mark.confirmed ? 'ok' : 'warn'}
                      label={mark.confirmed ? 'تأیید شده' : 'تأیید نشده'} />}
                    <span className="inline-flex items-center gap-s2 text-fs-xs font-semibold text-dialog-ghost bg-tile-v3 px-s5 py-s1 rounded-pill">
                      <Icon name="activity" px={12} strokeWidth={2} />
                      <span data-testid={`activity-count-${p.id}`}>{toFa(activityCount(p))}</span> فعالیت
                    </span>
                    {tombstoned && (p.superseded_by ?? []).map((h) => (
                      <span key={h} className="text-fs-xs text-muted">
                        جانشین:{' '}
                        {/* R5 — an heir outside this department answers 404 for
                            anyone scoped here, so it is stated, not offered. */}
                        {h.replace(/-[^-]*$/, '') === code
                          ? <Link to={`/processes/${h}`} className="font-mono text-violet underline decoration-dotted">{h}</Link>
                          : <span className="font-mono text-violet">{h}</span>}
                      </span>
                    ))}
                  </div>
                </div>
                <div data-r-actions className="flex gap-s4 shrink-0 max760:w-full">
                  <Button variant="ghost" onClick={() => nav(`/processes/${p.id}`)}
                    className="px-s7 py-s4 text-fs-sm2 max760:flex-1 max760:py-s6">اطلاعات کلی</Button>
                  <Button variant="violet" onClick={() => nav(`/processes/${p.id}/flow`)}
                    className="px-s7 py-s4 text-fs-sm2 max760:flex-1 max760:py-s6">فلوچارت</Button>
                  {mayEdit && (
                    <Button variant="danger" onClick={() => setDelTarget({ pid: p.id, name: p.name })}
                      title={tombstoned ? 'حذف دائمی فرآیند' : 'حذف فرآیند'}
                      className="w-tool h-tool p-0 shrink-0">
                      <Icon name="trash" px={16} strokeWidth={2} />
                    </Button>
                  )}
                </div>
              </div>
            )
          })}
        </div>
  ```

  Notes for whoever runs this: `ConfirmMark` and `TAG_CLS` are no longer imported —
  delete both import lines. §6.2's position column is `min-width:18px`, which is
  **`--space-9`** — the `_ds` ladder's own 18px rung, which is what a role-neutral ladder
  is for — so the class is `min-w-s9` and there is no `--size-pos` to mint. (Tailwind 3.4
  derives `minWidth` from `spacing`; `.min-w-s9{min-width:var(--space-9)}` compiles today,
  verified. The step once wrote `min-w-pos`, which compiles to nothing.) The summary line under the title is gone: §6.2's row is title + meta +
  actions, and the summary is what the screen behind «اطلاعات کلی» is for. The activity
  count survives as a **count chip** in the meta row rather than as a third column — the
  design has no such column, and dropping the number outright would remove information
  no other screen carries at a glance.

- [ ] **Step 11: Run the whole suite for this screen, watch it pass.**
  ```bash
  cd ui && npx vitest run src/screens/ProcessList.test.tsx src/screens/confirm-mark.placement.test.tsx src/screens/errors.test.tsx
  ```
  Expected: `Test Files 3 passed`. `confirm-mark.placement.test.tsx` is in the list on
  purpose — it asserts «تأیید شده» is on the process list and that no confirmations
  request is made without `confirm`, and both must survive the chip replacing the button.

- [ ] **Step 12: Close the two `dir=` islands this screen used to own.**
  `guards.test.ts:627-629` lists `screens/ProcessList.tsx:78` and `:79` among the ten
  undeclared `dir=` sites Task 25 would otherwise have to add. They are gone, so nothing
  is added — but the comment above `ISLANDS` claims the list is complete. Extend it:

  ```ts
      // `src/screens/ProcessList.tsx` is deliberately NOT here: Task 15 moved its
      // two `dir=` pins into `[data-r-pad]{direction:ltr}` in base.css, where the
      // rule catches every child instead of the one somebody remembered.
  ```

  ```bash
  cd ui && npx vitest run src/test/guards.test.ts && npx tsc -b && npx eslint .
  git add src/screens/ProcessList.tsx src/screens/ProcessList.test.tsx src/test/guards.test.ts
  git commit -m "feat(ui): the process list loses its LTR box, its 44px title line and its desktop-only action bar"
  ```

- [ ] **Step 13: Build, and prove every class this screen writes emits.**
  ```bash
  cd ui && npx vite build
  node scripts/harvest-classes.mjs src/screens/ProcessList.tsx
  ```
  Expected: the run ends `DEAD 0   EMPTY 0   NOVAR 0`, both controls hold
  (`control (negative): N/N invented names reported dead` and
  `control (escaping): … escaped variant classes unescaped`), and the last line
  is `PASS`. The script exits 1 on any failure, so it can be `&&`-chained.
  The class list is **harvested out of these files**, never hand-kept, so it
  cannot drift from what they write and `tailwind-probe.txt` cannot certify it
  on their behalf — see *The class-emission check* in Global Constraints for the
  measurement that retired the old grep.

  **A failure.** `DEAD` — the class compiled to no rule at all; that is a **typo
  in the component**, so fix the class string, rebuild, re-run. `EMPTY` — the
  selector emitted with an empty body, so the theme key resolves to nothing.
  `NOVAR` — the rule reads a `var(--…)` nothing declares. The last two are theme
  regressions: **stop and report them.** Do **not** add the name to
  `ui/tailwind.config.js`, `src/styles/tokens.css`, `src/styles/roles.css` or
  `tailwind-probe.txt`. All four are frozen for the duration of this plan and
  were unfrozen exactly once, by the single minting pass in
  `.superpowers/sdd/mint-spec.md`; minting one here to make a misspelling compile
  recreates the unreachable-token problem the whole rebuild exists to fix. A
  value that genuinely has no name goes into `mint-spec.md`, not into the config
  and not into this task's commit.

  **What this step cannot prove:** that these files write a class and that the
  class compiles to a rule with declarations, yes. That the class reaches the
  right element, that the element renders, that it is visible, or that its value
  is the one the design asks for — no. That stays with the Playwright checks.

- [ ] **Step 14: Read the two process-list rows the harness already holds. Write neither.**
  This step used to say *"add to `DESIGN` in `ui/e2e/_harness.ts`"*. **`ui/e2e/_harness.ts` is
  frozen and both rows are already in it** — `processList` and `processListReader` — written
  before any screen was, by the pre-flight (`3dda9ef`;
  `.superpowers/sdd/ui-harness-preflight-report.md`). The reason is mechanical: eleven screen
  tasks each appending a row to one file in one working tree means the later write silently
  clobbers the earlier one, and the build still exits 0.

  ```bash
  cd ui && node -e "const s=require('fs').readFileSync('e2e/_harness.ts','utf8');for(const k of ['processList:','processListReader:'])console.log(k, s.includes('  '+k)?'present':'MISSING')"
  ```

  Build to them. Both are worth reading before you write a class:

  - the panel's `920px` column and `30px 40px` → `18px 14px` padding; the reader's `720px`,
    its **centred** `30px/800` title (`--fs-h1-reader-list`) and centred lead;
  - `h1.color` is `TITLE_ON_FIELD` — **`rgb(255,255,255)`, ledger L-01** — on *both* rows,
    and the JSX in the steps above writes it: `text-role-title-on-field`
    (`--role-title-on-field` → `--card`). **Do not reach for `text-on-dark`** — it reads like
    the answer and it is `--text-on-dark` `#FBF7F1`, the value L-01 retired. If a title on the
    violet field ever disagrees with this row, it is **not** fixed by editing the row.
  - `body` is `13px` `#C9BEEE` on both — R12 drops the reader deliverable's 14.5px.

  **If a row is missing, or a number in it disagrees with §6.2 or the deliverables, stop and
  report it.** Do not add a row, do not edit one: the table is the expected-value record all
  eleven screen tasks are graded against, so a task that edits it is grading itself.

- [ ] **Step 15: Write the browser check.**
  Create `ui/e2e/process-list.spec.ts`. The sign-in is the harness's own `signedIn` + `serve`
  — fixtures, not a posted login (Task 14 Step 3 says why, and `expectEveryEndpointStubbed`
  fails a spec that stubs nothing). Stub the three reads this screen makes:
  `/api/departments`, `/api/departments/<code>/processes` and `/api/confirmations`.

  ```ts
  import { test, expect } from '@playwright/test'
  import { expectDesign, serve, shot, signedIn, visit } from './_harness'

  const CODE = 'cooking'

  test('process list', async ({ page }) => {
    await signedIn(page)
    await serve(page, {
      '/api/departments': DEPARTMENTS,
      [`/api/departments/${CODE}/processes`]: PROCESSES,
      [`/api/confirmations?department=${CODE}`]: [],
      '/api/pending': [],
    })
    await visit(page, `/departments/${CODE}`, 'processList')
    await page.locator('[data-r-prow]').first().waitFor()
    const w = page.viewportSize()!.width

    await expectDesign(page, 'processList')

    // R7 — the one rule this screen owns at ≤760.
    const bar = page.locator('[data-r-plistactions]')
    const more = page.locator('[data-r-plistmore]')
    if (w <= 760) { await expect(bar).toBeHidden(); await expect(more).toBeVisible() }
    else { await expect(bar).toBeVisible(); await expect(more).toBeHidden() }

    // The row is a row, not a 44px-tall title line pretending to be one.
    const row = page.locator('[data-r-prow]').first()
    const title = row.locator('h1, [class*="text-fs-h4"]').first()
    expect((await title.boundingBox())!.height).toBeLessThan(30)
    expect(await row.evaluate((el) => getComputedStyle(el).flexDirection))
      .toBe(w <= 760 ? 'column' : 'row')

    // §8 — RTL text, right-hand scrollbar.
    const pad = page.locator('[data-r-pad]')
    expect(await pad.evaluate((el) => getComputedStyle(el).direction)).toBe('ltr')
    expect(await pad.evaluate((el) => getComputedStyle(el.firstElementChild!).direction)).toBe('rtl')

    // Focus is border-colour and nothing else (15/15 in the design).
    const input = page.getByPlaceholder('جست‌وجو براساس نام یا شناسهٔ فرآیند…')
    await input.focus()
    expect(await input.evaluate((el) => getComputedStyle(el).borderTopColor)).toBe('rgb(250, 90, 82)')

    await shot(page, `process-list-${w}`)
  })
  ```

  **Add a second test for the reader half.** `processListReader` is a row in the frozen table
  and a row nothing measures grades nothing: sign in with a reader session
  (`signedIn(page, { role: 'reader', capabilities: ['view'], scopes: [CODE, 'warehouse'] })`),
  `visit(page, …, 'processListReader')`, `expectDesign(page, 'processListReader')`, `shot`.
  The centred `30px` title and the `720px` column are the row's, not the spec's — do not
  restate them here.

- [ ] **Step 16: Run it, and run it green.**
  ```bash
  cd ui && npx playwright test e2e/process-list.spec.ts --reporter=list
  ```
  Expected first run: failures at 760 if the `max760:` variants did not compile (Step 13
  would have caught that) or if `[data-r-plistmore]` is still `display:none` at every
  width — the reader deliverable's defect #2, which is exactly the trap to avoid.
  Expected final: `3 passed`, three screenshots.

- [ ] **Step 17: Commit the check.**
  ```bash
  cd ui && git commit e2e/process-list.spec.ts \
    -m "test(ui): the process list is measured at three widths, ⋯ included"
  ```
  `e2e/_harness.ts` is **not** staged: it is frozen and this task did not touch it. Commit by
  pathspec, not `git add` + bare `git commit` — the latter commits the *index*, and another
  agent's staged change has already been swallowed into an unrelated commit that way.

---

### Task 16: `Summary` — the violet field, the A-0 card, and what a non-editor is actually told

48 guard-measurable violations (`ui-audit-existing.md:468`), the worst count in the app.
The screen also renders on cream with ink type where the design puts it on `#2A1D5E`
with white type, uses `×` characters as icons in six places, and — the one that matters
beyond cosmetics — draws «شاخصی برای این فرآیند ثبت نشده است» to a reader whose policy
blanked the field, which is a claim of absence standing in for an absence of a claim.

**Files**
- Modify: `ui/src/screens/Summary.tsx`
- Modify: `ui/src/screens/Summary.test.tsx`
- Modify: `ui/src/screens/Summary.edit.test.tsx`
- Modify: `ui/src/test/guards.test.ts`
- Create: `ui/e2e/summary.spec.ts`

**Files this task must not write**

| Path | Why | What to do instead |
|---|---|---|
| `ui/tailwind.config.js`, `ui/src/styles/tokens.css`, `ui/src/styles/roles.css`, `ui/tailwind-probe.txt` | Frozen between deliberate minting passes, so many tasks can run in one tree without clobbering each other. Unfrozen exactly once, by the single consolidated mint. | A value with no token is not minted here. Stop, and report the value and its role. |
| `ui/e2e/_harness.ts` | Pre-populated and frozen — the `DESIGN` table is the record every screen is graded against, written up front (`3dda9ef`) because eleven tasks appending to one file in one tree lose all but the last write, with a green build. | **`summary` is already there.** Read it; if it is missing or wrong, stop and report. |
| `docs/superpowers/ui-normalisation-ledger.md` | Maintained by the reviewer at review time. | Report the row you would add, in your task report. |

**Interfaces**

*Consumes* — Task 14 Step 1's utilities, plus:
- `SectionCard({ skin: 'tinted' | 'white'; eyebrow?: string })` (Task 10)
- `TextField`, `Textarea` (Task 7); `Button` with `variant="danger"` (Task 6)
- `Chip({ kind: 'input' | 'control' | 'output' | 'mech' })` (existing), `IdBadge`, `StatusPill`
- `Icon` (Task 11) for `trash` and `plus`

*Produces*
- `Summary` — unchanged export and route
- `[data-r-idef0]`, `[data-r-2col]` hooks
- `hasPublishedDetail(proc)` — the predicate that decides between the content and the
  stated limit

---

- [ ] **Step 1: Write the failing test for the stated limit.**
  §6.3: *"Non-editor sees a stated limit, not a blank."* In this app the producible case
  is precise — `visibility.filtered` **blanks** `summary`, `idef0` and `kpis` (present,
  emptied) when the department's policy switch is off, while dropping `source` and the
  timestamps outright (`api/types.ts`, `ReadableProcess`). Append to
  `ui/src/screens/Summary.test.tsx`:

  ```tsx
  const BLANKED = {
    id: 'cooking-001', department: 'cooking', name: 'خرید و پرداخت',
    summary: '', parent: null,
    idef0: { inputs: [], controls: [], outputs: [], mechanisms: [] },
    kpis: [], nodes: [], edges: [], pending: [],
  }

  describe('a reader whose policy blanked the detail', () => {
    it('is told the fields are not shown, and is not told they are empty', async () => {
      // «شاخصی ثبت نشده است» asserts that nobody recorded one. When the policy
      // blanked the field the app cannot tell that from "withheld", so it says
      // neither — it states the only thing it knows, which is that they are not
      // being shown. Same rule as the departments conflict tile.
      serve(BLANKED)
      renderAt('/processes/:pid', <Summary />, '/processes/cooking-001', READER)
      expect(await screen.findByText('خلاصه، نمای IDEF0 و شاخص‌ها نمایش داده نمی‌شوند')).toBeInTheDocument()
      expect(screen.queryByText(/شاخصی برای این فرآیند ثبت نشده است/)).not.toBeInTheDocument()
      expect(screen.queryByText('نمای IDEF0 سطح فرآیند (A-0)')).not.toBeInTheDocument()
    })

    it('draws the detail the moment any of it arrives', async () => {
      serve({ ...BLANKED, summary: 'خلاصهٔ واقعی' })
      renderAt('/processes/:pid', <Summary />, '/processes/cooking-001', READER)
      expect(await screen.findByText('خلاصهٔ واقعی')).toBeInTheDocument()
      expect(screen.queryByText('خلاصه، نمای IDEF0 و شاخص‌ها نمایش داده نمی‌شوند')).not.toBeInTheDocument()
    })

    it('keeps «ثبت نشده است» for an editor looking at a genuinely empty KPI list', async () => {
      // The editor is served everything, so an empty list here really is empty.
      serve({ ...BLANKED, summary: 'خلاصه', idef0: { inputs: ['ورودی'], controls: [], outputs: [], mechanisms: [] } })
      renderAt('/processes/:pid', <Summary />, '/processes/cooking-001', EDITOR)
      expect(await screen.findByText(/شاخصی برای این فرآیند ثبت نشده است/)).toBeInTheDocument()
    })
  })
  ```

- [ ] **Step 2: Run it and watch it fail.**
  ```bash
  cd ui && npx vitest run src/screens/Summary.test.tsx -t "policy blanked"
  ```
  Expected: `Unable to find an element with the text: خلاصه، نمای IDEF0 و شاخص‌ها نمایش داده نمی‌شوند`.

- [ ] **Step 3: Write the failing tests for the field, the hooks and the sweep.**
  Append to `ui/src/screens/Summary.test.tsx`:

  ```tsx
  import { readFileSync } from 'node:fs'

  describe('the screen’s own shape', () => {
    it('names the two hooks the ≤760 pass targets', async () => {
      serve(FULL)
      renderAt('/processes/:pid', <Summary />, '/processes/cooking-001', EDITOR)
      await screen.findByText('نمای IDEF0 سطح فرآیند (A-0)')
      const idef0 = document.querySelector('[data-r-idef0]')!
      expect(idef0.className).toContain('max760:flex')
      expect(idef0.className).toContain('max760:flex-col')
      expect(idef0.className).toContain('max760:gap-s6')
      const twoCol = document.querySelector('[data-r-2col]')!
      expect(twoCol.className).toContain('grid-cols-2')
      expect(twoCol.className).toContain('max760:grid-cols-1')
    })

    it('puts the title and the section heading on the dark field, in white', async () => {
      serve(FULL)
      renderAt('/processes/:pid', <Summary />, '/processes/cooking-001', EDITOR)
      const h1 = await screen.findByRole('heading', { level: 1 })
      expect(h1.className).toContain('text-role-title-on-field')
      // Ledger P3-2: §6.3 says this heading is #2A1D5E, which is the field it
      // sits on. §6.0 settles it — headings on the field are #fff.
      expect(screen.getByText('شاخص‌های کلیدی عملکرد (KPI)').className).toContain('text-role-title-on-field')
    })

    it('uses no character as an icon', () => {
      const src = readFileSync(new URL('./Summary.tsx', import.meta.url), 'utf8')
      expect(src).not.toMatch(/>×</)
      expect(src).not.toMatch(/#[0-9a-fA-F]{3,8}\b/)
      expect(src).not.toMatch(/(text|rounded|shadow)-\[/)
      expect(src).not.toMatch(/\brounded-(sm|md|lg|xl|2xl|3xl|full)\b/)
      expect(src).not.toMatch(/\btext-(xs|sm|base|lg|xl|[2-9]xl)\b/)
    })
  })
  ```

- [ ] **Step 4: Run them and watch them fail.**
  ```bash
  cd ui && npx vitest run src/screens/Summary.test.tsx
  ```
  Expected: three failures, including `Unable to find an element by [data-r-idef0]` and
  `expected '…<button …>×</button>…' not to match />×</`.

- [ ] **Step 5: Add the predicate and the stated-limit card.**
  In `ui/src/screens/Summary.tsx`, above the component:

  ```tsx
  /** Whether the response carried any of the three switchable fields.
   *
   *  `visibility.filtered` blanks `summary`, `idef0` and `kpis` rather than
   *  dropping them (unlike `source` and the timestamps, which it removes), so
   *  "withheld" and "never recorded" arrive as the same bytes and no guard can
   *  separate them. Saying «ثبت نشده است» would pick one and be wrong half the
   *  time; the design's own card says only what is observable — that they are
   *  not shown. Same principle as the departments conflict tile: absence of a
   *  claim, not a claim of absence. */
  function hasPublishedDetail(p: Process): boolean {
    const icom = p.idef0
    return p.summary.trim() !== ''
      || p.kpis.length > 0
      || icom.inputs.length + icom.controls.length + icom.outputs.length + icom.mechanisms.length > 0
  }
  ```

  and, in the read branch, before the IDEF0 card:

  ```tsx
  {!hasPublishedDetail(proc) ? (
    <div className="bg-card border border-border-card rounded-doc px-s11 py-s10 shadow-card">
      <div className="font-bold text-fs-body text-ink">خلاصه، نمای IDEF0 و شاخص‌ها نمایش داده نمی‌شوند</div>
      <p className="text-fs-sm text-muted leading-loose mt-s4 m-0">
        سیاست نمایش محتوای این دپارتمان تعیین می‌کند چه بخش‌هایی از یک فرآیند منتشر شود. فلوچارت و گام‌به‌گام این فرآیند در دسترس شماست.
      </p>
    </div>
  ) : (
    <>{/* the IDEF0 card and the KPI section, unchanged from Step 6 */}</>
  )}
  ```

- [ ] **Step 6: Rebuild the header, the A-0 card and the KPI section.**
  Replace `:79-181` of `ui/src/screens/Summary.tsx` (the read branch):

  ```tsx
    <div data-r-pad className="flex-1 overflow-auto py-screen-y px-screen-x max760:px-s7 max760:py-s9">
      <div className="max-w-summary mx-auto">
        <div className="flex items-start justify-between gap-s8 mb-s10" data-r-stack>
          <div>
            <div className="flex items-center gap-s5 mb-s4">
              <IdBadge tone="violet">{proc.id}</IdBadge>
              {proc.parent && <span className="text-fs-xxs font-semibold text-violet bg-tile-v px-s5 py-s1 rounded-badge">زیرفرآیند</span>}
              {mark && <StatusPill tone={mark.confirmed ? 'ok' : 'warn'} label={mark.confirmed ? 'تأیید شده' : 'تأیید نشده'} />}
              <ConfirmMark row={mark} department={dept} />
            </div>
            {tombstoned && (
              <div className="mb-s6 rounded-button border border-border-dead bg-tile-dead px-s8 py-s6 text-fs-sm text-muted">
                <div className="font-bold text-ink mb-s1">این فرآیند باطل شده است.</div>
                {(proc.superseded_by ?? []).length > 0 && (
                  <div className="flex flex-wrap gap-s4 items-center">
                    <span>جانشین:</span>
                    {(proc.superseded_by ?? []).map((h) => (
                      <Link key={h} to={`/processes/${h}`} className="font-mono text-violet underline decoration-dotted">{h}</Link>
                    ))}
                  </div>
                )}
              </div>
            )}
            <h1 className="font-extrabold text-fs-h1 text-role-title-on-field m-0">{proc.name}</h1>
            {proc.summary.trim() !== '' && (
              <p className="text-fs-lg text-violet-on-violet mt-s4 max-w-prose leading-relaxed m-0">{proc.summary}</p>
            )}
          </div>
          <div data-r-actions className="flex gap-s5 shrink-0 max760:flex-wrap">
            {mayEdit && !tombstoned && (
              <Button variant="ghost" onClick={enter} className="px-s8 py-s6 text-fs-sm">ویرایش اطلاعات</Button>
            )}
            {/* Ledger P3-3 — violet primary, matching the row's own pairing. */}
            <Button variant="violet" onClick={() => nav(`/processes/${proc.id}/flow`)}
              className="px-s8 py-s6 text-fs-sm">مشاهدهٔ فلوچارت</Button>
          </div>
        </div>

        <div className="bg-card border border-border-card rounded-doc p-s11 mb-s9 shadow-card">
          <div className="font-bold text-fs-body text-violet mb-s9 flex items-center gap-s4">
            <span className="w-s4 h-s4 bg-coral rounded-round" />نمای IDEF0 سطح فرآیند (A-0)
          </div>
          <div data-r-idef0 className="grid grid-cols-[1fr_1.4fr_1fr] gap-s7 items-center max760:flex max760:flex-col max760:gap-s6">
            <div className="col-start-2 row-start-1 text-center min-w-0">
              <div className="text-fs-xxs text-muted mb-s2">کنترل‌ها ↓</div>
              <div className="flex flex-wrap gap-s2 justify-center">{proc.idef0.controls.map((t, i) => <Chip key={i} kind="control">{t}</Chip>)}</div>
            </div>
            <div className="col-start-3 row-start-2 text-center min-w-0">
              <div className="text-fs-xxs text-muted mb-s2">ورودی‌ها →</div>
              <div className="flex flex-col gap-s2 items-center">{proc.idef0.inputs.map((t, i) => <Chip key={i} kind="input">{t}</Chip>)}</div>
            </div>
            <div className="col-start-2 row-start-2 bg-violet rounded-tile px-s8 py-s10 text-center text-card shadow-violet">
              <div className="font-bold text-fs-lg">{proc.name}</div>
              <div dir="ltr" className="font-mono text-fs-xxs text-violet-on-violet mt-s2">A-0 · {proc.id}</div>
            </div>
            <div className="col-start-1 row-start-2 text-center min-w-0">
              <div className="text-fs-xxs text-muted mb-s2">← خروجی‌ها</div>
              <div className="flex flex-col gap-s2 items-center">{proc.idef0.outputs.map((t, i) => <Chip key={i} kind="output">{t}</Chip>)}</div>
            </div>
            <div className="col-start-2 row-start-3 text-center min-w-0">
              <div className="flex flex-wrap gap-s2 justify-center">{proc.idef0.mechanisms.map((t, i) => <Chip key={i} kind="mech">{t}</Chip>)}</div>
              <div className="text-fs-xxs text-muted mt-s2">↑ مکانیزم‌ها</div>
            </div>
          </div>
        </div>

        <h2 className="font-bold text-fs-lg text-role-title-on-field mb-s6 m-0">شاخص‌های کلیدی عملکرد (KPI)</h2>
        {proc.kpis.length > 0 ? (
          <div data-r-2col className="grid grid-cols-2 gap-s7 max760:grid-cols-1">
            {proc.kpis.map((k, i) => (
              <div key={i} className="bg-card border border-border-card rounded-tile px-s9 py-s8">
                <div className="flex items-center justify-between gap-s4">
                  <div className="font-bold text-fs-body text-ink">{k.name}</div>
                  {k.target && <div className="text-fs-sm2 font-bold text-conflict bg-tile-c px-s5 py-s1 rounded-badge">{k.target}</div>}
                </div>
                <p className="text-fs-sm2 text-muted mt-s4 leading-relaxed m-0">{k.definition}</p>
              </div>
            ))}
          </div>
        ) : (
          <div className="bg-card border border-dashed border-line rounded-tile p-s9 text-center text-faint text-fs-sm2 leading-loose">
            شاخصی برای این فرآیند ثبت نشده است. (سامانه اطلاعات را نمی‌سازد؛ فقط از محتوای واقعی جلسه پر می‌شود.)
          </div>
        )}
  ```

  `max-w-prose` is `--width-prose: 640px` (§3.3's summary sub-cap). The `dir="ltr"` on
  the mono `A-0 · {id}` run is a sanctioned island (§8) — Step 8 declares it.

- [ ] **Step 7: Rebuild the edit branch on real fields.**
  Replace the `ListEditor` helper (`:15-31`) and the edit branch (`:182-204`) of
  `ui/src/screens/Summary.tsx`. The six hand-rolled inputs become `TextField`s, the
  six `×` buttons become `Button variant="danger"` with the trash `Icon`, and the two
  dashed add-buttons become one shared `AddButton`:

  ```tsx
  function AddButton({ onClick, children }: { onClick: () => void; children: ReactNode }) {
    return (
      <button type="button" onClick={onClick}
        className="self-start inline-flex items-center gap-s2 text-fs-sm2 font-semibold text-violet border-hairline border-dashed border-line-dashed bg-tile-v4 rounded-input px-s6 py-s3">
        <Icon name="plus" px={13} strokeWidth={2.4} />{children}
      </button>
    )
  }

  function ListEditor({ label, items, onChange }: { label: string; items: string[]; onChange: (v: string[]) => void }) {
    return (
      <div>
        <div className="text-fs-sm2 font-semibold text-violet mb-s4">{label}</div>
        <div className="flex flex-col gap-s2">
          {items.map((it, i) => (
            <div key={i} className="flex gap-s2 items-center">
              <TextField value={it} onChange={(v) => onChange(items.map((x, k) => (k === i ? v : x)))} className="flex-1" />
              <Button variant="danger" title="حذف" onClick={() => onChange(items.filter((_, k) => k !== i))}
                className="w-tool h-tool p-0 shrink-0"><Icon name="trash" px={15} strokeWidth={2} /></Button>
            </div>
          ))}
          <AddButton onClick={() => onChange([...items, ''])}>افزودن</AddButton>
        </div>
      </div>
    )
  }
  ```

  The edit branch's outer container becomes a `SectionCard` per the design's sub-panel
  skin (`#FBF9FE / #EDE5F5 / radius 16 / padding 18`), and its two-column ICOM grid takes
  the `data-r-2col` hook so ≤760 collapses it:

  ```tsx
  <SectionCard skin="tinted" eyebrow="نمای IDEF0" className="mb-s9">
    <div data-r-2col className="grid grid-cols-2 gap-s9 max760:grid-cols-1">
      <ListEditor label="ورودی‌ها" items={draft!.idef0.inputs} onChange={(v) => setIcom('inputs', v)} />
      <ListEditor label="کنترل‌ها" items={draft!.idef0.controls} onChange={(v) => setIcom('controls', v)} />
      <ListEditor label="خروجی‌ها" items={draft!.idef0.outputs} onChange={(v) => setIcom('outputs', v)} />
      <ListEditor label="مکانیزم‌ها" items={draft!.idef0.mechanisms} onChange={(v) => setIcom('mechanisms', v)} />
    </div>
  </SectionCard>
  ```

- [ ] **Step 8: Declare the one `dir=` island this screen keeps.**
  Add `'src/screens/Summary.tsx'` to `ISLANDS` in `ui/src/test/guards.test.ts:135`, with
  the reason beside the others:

  ```ts
      // Summary pins `ltr` on one thing: the mono `A-0 · {id}` line inside the
      // IDEF0 centre box (§8 — every mono id run is an LTR island).
      'src/screens/Summary.tsx',
  ```

- [ ] **Step 9: Run every suite that touches this screen, watch it pass.**
  ```bash
  cd ui && npx vitest run src/screens/Summary.test.tsx src/screens/Summary.edit.test.tsx \
    src/screens/confirm-mark.placement.test.tsx src/screens/errors.test.tsx src/test/guards.test.ts
  ```
  Expected: `Test Files 5 passed`. `errors.test.tsx` pins the 404 copy whole against this
  screen and must not move; `confirm-mark.placement.test.tsx` requires «لغو تأیید» to
  still be a button **here** — the summary is where the act lives now that the row
  carries only the chip.

- [ ] **Step 10: Typecheck, lint, build, then prove every class this screen writes emits.**
  ```bash
  cd ui && npx tsc -b && npx eslint .
  ```
  Expected: both silent. Then:
  ```bash
  cd ui && npx vite build
  node scripts/harvest-classes.mjs src/screens/Summary.tsx
  ```
  Expected: the run ends `DEAD 0   EMPTY 0   NOVAR 0`, both controls hold
  (`control (negative): N/N invented names reported dead` and
  `control (escaping): … escaped variant classes unescaped`), and the last line
  is `PASS`. The script exits 1 on any failure, so it can be `&&`-chained.
  The class list is **harvested out of these files**, never hand-kept, so it
  cannot drift from what they write and `tailwind-probe.txt` cannot certify it
  on their behalf — see *The class-emission check* in Global Constraints for the
  measurement that retired the old grep.

  `grid-cols-[1fr_1.4fr_1fr]` is the case that used to break this step, and it is
  the reason the check parses the CSS instead of grepping it. Tailwind escapes
  every CSS-special character in an arbitrary class name, the `.` in `1.4fr`
  included, so the emitted selector is `.grid-cols-\[1fr_1\.4fr_1fr\]`. The
  string this step once grepped for was the unescaped form under `grep -F`, so it
  printed `NOT IN CSS:` on a build where the class was present and correct. The
  scanner unescapes the selector when it indexes it, and an escaping control fails
  the run if that unescaping ever stops working.

  `grid-cols-[1fr_1.4fr_1fr]` stays an arbitrary **grid template**: no guard
  forbids it and no token holds it. Not because a token *could not* —
  `gridTemplateColumns` already carries `users`, `audit` and `activity` for exactly
  this shape — but because none was minted for the A-0 grid, and
  `ui/tailwind.config.js` is frozen after the single minting pass. **Do not mint
  one here.** It is on the list of values Task 25 Step 4 must exempt by name or
  send to the owner.

  **A failure.** `DEAD` — the class compiled to no rule at all; that is a **typo
  in the component**, so fix the class string, rebuild, re-run. `EMPTY` — the
  selector emitted with an empty body, so the theme key resolves to nothing.
  `NOVAR` — the rule reads a `var(--…)` nothing declares. The last two are theme
  regressions: **stop and report them.** Do **not** add the name to
  `ui/tailwind.config.js`, `src/styles/tokens.css`, `src/styles/roles.css` or
  `tailwind-probe.txt`. All four are frozen for the duration of this plan and
  were unfrozen exactly once, by the single minting pass in
  `.superpowers/sdd/mint-spec.md`; minting one here to make a misspelling compile
  recreates the unreachable-token problem the whole rebuild exists to fix. A
  value that genuinely has no name goes into `mint-spec.md`, not into the config
  and not into this task's commit.

  **What this step cannot prove:** that these files write a class and that the
  class compiles to a rule with declarations, yes. That the class reaches the
  right element, that the element renders, that it is visible, or that its value
  is the one the design asks for — no. That stays with the Playwright checks.

- [ ] **Step 11: Commit the screen.**
  ```bash
  cd ui && git add src/screens/Summary.tsx src/screens/Summary.test.tsx src/screens/Summary.edit.test.tsx src/test/guards.test.ts
  git commit -m "feat(ui): the summary moves onto the violet field and stops telling a reader a blank is an emptiness"
  ```

- [ ] **Step 12: Report the touch-target decision for owner veto. Do not write it.**
  `docs/superpowers/ui-normalisation-ledger.md` is maintained by the reviewer at review time,
  for the same one-file-many-writers reason the harness table is frozen. **Put the block below
  in your task report, under "the ledger row this task would add"; do not open the ledger.**
  It belongs beside P3-7: 

  ```markdown
  **P3-7, in full.** `--size-touch: 44px` (F11) is an app rule, not a design one: the
  design's icon buttons are 30 (users chevron), 32 (drawer/dialog close), 34 (icon
  button, CTA circle, pager, delete), 36 (crumb home, mobile ⋯) and 40 (hamburger,
  process-list ⋯). Enforcing 44 on all of them makes every card row 44px tall and is
  what produced the process list's 44px title line. **Chosen:** the design's ladder for
  icon buttons that sit *inside* a row or card, with the row itself ≥44px tall so the
  pointer target is never smaller than a fingertip in the axis that matters; the 44px
  floor is kept for every standalone control (`Button` with a label, shell chrome,
  dialog footers). Owner may veto; the alternative is a visibly taller product than the
  deliverable at every list screen.
  ```

  Nothing is staged or committed by this step.

- [ ] **Step 13: Read the summary row the harness already holds. Do not write one.**
  This step used to say *"add to `DESIGN` in `ui/e2e/_harness.ts`"*. **The file is frozen and
  the row is already in it**, written before any screen was, by the pre-flight (`3dda9ef`;
  `.superpowers/sdd/ui-harness-preflight-report.md`) — eleven screen tasks each appending to
  one file in one working tree means the later write silently clobbers the earlier one, and
  the build still exits 0.

  ```bash
  cd ui && node -e "const s=require('fs').readFileSync('e2e/_harness.ts','utf8');console.log('summary:', s.includes('  summary:')?'present':'MISSING')"
  ```

  Two things in it supersede the numbers written elsewhere in this task, and **neither is a
  reason to edit the row**:

  - **`h1.size` is `22px`, not the 23px this task's own step quotes.** Ledger **L-02** counts
    22 on seven screens against summary's 23 and profile's 21 and decides 22 for all nine;
    `--fs-h1`'s 23px stays the audit stat numeral. Build 22.
  - **`h1.color` is `TITLE_ON_FIELD` — `rgb(255,255,255)`, ledger L-01**, and the JSX above
    writes it: `text-role-title-on-field`. The `<h2>` beside it takes the same class for the
    same reason. **Not `text-on-dark`** — that is `#FBF7F1`, the value L-01 retired.

  There is deliberately **no `grid`** in this row: `[data-r-idef0]` is a `1fr 1.4fr 1fr` grid
  above 760 and a flex column at ≤760, which `trackCount` cannot grade — your own spec asserts
  the `display` swap directly, which is the right place for it. And `summary.body` is behind
  `isEditor`, so **the spec must sign in as an editor** or `[data-body]` matches nothing.

  **If the row is missing, or a number in it disagrees with the deliverable, stop and report
  it** — do not add a row and do not edit one.

- [ ] **Step 14: Write the browser check.**
  Create `ui/e2e/summary.spec.ts`:

  ```ts
  import { test, expect } from '@playwright/test'
  import { expectDesign, serve, shot, signedIn, visit } from './_harness'

  const PID = 'cooking-001'

  test('process summary', async ({ page }) => {
    // An editor, and not for convenience: `[data-body]` is behind `isEditor`, so a
    // reader session leaves `summary.body` with nothing to grade.
    await signedIn(page)
    await serve(page, {
      '/api/departments': DEPARTMENTS,
      [`/api/processes/${PID}`]: PROCESS,
      '/api/pending': [],
    })
    await visit(page, `/processes/${PID}`, 'summary')
    await page.locator('[data-r-idef0]').waitFor()
    const w = page.viewportSize()!.width

    await expectDesign(page, 'summary')

    // R7 — the two rules this screen owns.
    const idef0 = page.locator('[data-r-idef0]')
    expect(await idef0.evaluate((el) => getComputedStyle(el).display)).toBe(w <= 760 ? 'flex' : 'grid')
    if (w <= 760) expect(await idef0.evaluate((el) => getComputedStyle(el).flexDirection)).toBe('column')

    const twoCol = page.locator('[data-r-2col]').first()
    if (await twoCol.count()) {
      const tracks = (await twoCol.evaluate((el) => getComputedStyle(el).gridTemplateColumns)).split(' ').length
      expect(tracks).toBe(w <= 760 ? 1 : 2)
    }

    // The A-0 box is violet with white type and the violet button glow.
    const box = page.getByText('A-0 ·').locator('..')
    expect(await box.evaluate((el) => getComputedStyle(el).backgroundColor)).toBe('rgb(74, 37, 169)')
    expect(await box.evaluate((el) => getComputedStyle(el).direction)).toBe('rtl')
    expect(await page.getByText('A-0 ·').evaluate((el) => getComputedStyle(el).direction)).toBe('ltr')

    // No unicode glyph is doing an icon's job anywhere on the screen.
    expect(await page.locator('body').innerText()).not.toContain('×')

    await shot(page, `summary-${w}`)
  })
  ```

- [ ] **Step 15: Run it, and run it green.**
  ```bash
  cd ui && npx playwright test e2e/summary.spec.ts --reporter=list
  ```
  Expected: `3 passed`, three screenshots. A failure on `backgroundColor` at 760 means
  the `max760:flex` variant reordered the grid children out of their explicit
  `col-start`/`row-start` placement — that is correct behaviour (flex ignores them) and
  the assertion targets the box by its text, not its position, for exactly that reason.

- [ ] **Step 16: Commit the check.**
  ```bash
  cd ui && git commit e2e/summary.spec.ts \
    -m "test(ui): the A-0 card is measured at three widths and collapses where the design says"
  ```
  `e2e/_harness.ts` is **not** staged: it is frozen and this task did not touch it. Commit by
  pathspec, not `git add` + bare `git commit` — the latter commits the *index*, and another
  agent's staged change has already been swallowed into an unrelated commit that way.

---

### Task 17: `Overview` — the accordion question, settled

`Overview.tsx:155-177` hand-rolls a disclosure — a button, `aria-expanded`, a rotating
chevron, and a second «بستن» button at `:175` — while `ui/Accordion.tsx` sits with zero
consumers and `ui/Tabs.tsx` and `ui/Menu.tsx` sit beside it in the same state
(`ui-audit-existing.md:396`). The design system's readme says the product has *"no
Avatar, Tabs, Tooltip, Accordion or Select"*.

**The resolution, stated rather than assumed.** R1 makes the deliverables the authority
over the readme and records that this particular readme claim is **false of them**:
*"five tab trays, ~15 custom selects, two accordions."* §6.4 is one of the two — the
department's «نقش‌ها و شرح وظایف» section is an accordion with a specified anatomy down
to the chevron's stroke weight. So: **the readme is superseded, `Accordion` stays, it is
rebuilt to §6.4, and `Overview` becomes its first consumer.** The dead-code finding is
closed by giving the primitive its consumer, not by deleting it. `Tabs` and `Menu` are
untouched here — `NavTabTray` (Task 10) supersedes `Tabs`, and `Menu` gains its first
consumer in Task 15.

**Files**
- Modify: `ui/src/ui/Accordion.tsx`
- Modify: `ui/src/ui/controls.test.tsx`
- Modify: `ui/src/screens/Overview.tsx`
- Modify: `ui/src/screens/Overview.test.tsx`
- Modify: `ui/src/screens/Overview.edit.test.tsx`
- Create: `ui/e2e/overview.spec.ts`

**Files this task must not write**

| Path | Why | What to do instead |
|---|---|---|
| `ui/tailwind.config.js`, `ui/src/styles/tokens.css`, `ui/src/styles/roles.css`, `ui/tailwind-probe.txt` | Frozen between deliberate minting passes, so many tasks can run in one tree without clobbering each other. Unfrozen exactly once, by the single consolidated mint. | A value with no token is not minted here. Stop, and report the value and its role. |
| `ui/e2e/_harness.ts` | Pre-populated and frozen — the `DESIGN` table is the record every screen is graded against, written up front (`3dda9ef`) because eleven tasks appending to one file in one tree lose all but the last write, with a green build. | **`overview` is already there.** Read it; if it is missing or wrong, stop and report. |
| `docs/superpowers/ui-normalisation-ledger.md` | Maintained by the reviewer at review time. | Report the rows you would add, in your task report. |

**Interfaces**

*Consumes* — Task 14 Step 1's utilities, plus `SectionCard`, `TextField`, `Textarea`,
`Button` (`variant="danger"`), `Icon`, `IconTile`, `useSurface`.

*Produces*
- `Accordion({ items: { key: string; title: ReactNode; badge?: ReactNode; body: ReactNode }[] })`
  — §6.4's anatomy; an SVG chevron at stroke `2.4` rotating over `--duration-chev`
- `Overview` — unchanged export and route
- `[data-r-2col]` on the sub-units grid

---

- [ ] **Step 1: Write the failing test for the rebuilt `Accordion`.**
  Append to `ui/src/ui/controls.test.tsx`:

  ```tsx
  import { Accordion } from './Accordion'

  describe('Accordion', () => {
    const items = [
      { key: 'a', title: 'سرآشپز', badge: '۳ وظیفه', body: <p>بدنه</p> },
      { key: 'b', title: 'کمک‌آشپز', badge: '۱ وظیفه', body: <p>بدنهٔ دو</p> },
    ]

    it('opens and closes from the header, and says so to a screen reader', async () => {
      render(<Accordion items={items} />)
      const head = screen.getByRole('button', { name: /سرآشپز/ })
      expect(head).toHaveAttribute('aria-expanded', 'false')
      expect(screen.queryByText('بدنه')).not.toBeInTheDocument()
      await userEvent.click(head)
      expect(head).toHaveAttribute('aria-expanded', 'true')
      expect(screen.getByText('بدنه')).toBeInTheDocument()
      await userEvent.click(head)
      expect(screen.queryByText('بدنه')).not.toBeInTheDocument()
    })

    it('opens more than one at a time', async () => {
      // §6.4 does not make them exclusive, and a person comparing two roles has
      // to be able to see both.
      render(<Accordion items={items} />)
      await userEvent.click(screen.getByRole('button', { name: /سرآشپز/ }))
      await userEvent.click(screen.getByRole('button', { name: /کمک‌آشپز/ }))
      expect(screen.getByText('بدنه')).toBeInTheDocument()
      expect(screen.getByText('بدنهٔ دو')).toBeInTheDocument()
    })

    it('draws its chevron, not a character', () => {
      const { container } = render(<Accordion items={items} />)
      expect(container.textContent).not.toMatch(/[−+]/)
      const chev = container.querySelector('svg')!
      expect(chev).toHaveAttribute('stroke-width', '2.4')
      expect(chev).toHaveAttribute('width', '17')
      expect(chev.parentElement!.className).toContain('duration-chev')
    })

    it('has exactly one control per item — the header', async () => {
      // The screen's hand-rolled version grew a second «بستن» button inside the
      // open body, so an item had two ways to close and a screen reader met a
      // control with no relationship to the region it closed.
      render(<Accordion items={items} />)
      await userEvent.click(screen.getByRole('button', { name: /سرآشپز/ }))
      expect(screen.getAllByRole('button')).toHaveLength(2)
    })
  })
  ```

- [ ] **Step 2: Run it and watch it fail.**
  ```bash
  cd ui && npx vitest run src/ui/controls.test.tsx -t Accordion
  ```
  Expected: `expected '…−…' not to match /[−+]/` and a type error on `items` — the
  current `Accordion` takes different props.

- [ ] **Step 3: Rebuild `Accordion` to §6.4.**
  Replace `ui/src/ui/Accordion.tsx`:

  ```tsx
  import { useState, type ReactNode } from 'react'

  export interface AccordionItem { key: string; title: ReactNode; badge?: ReactNode; body: ReactNode }

  /** The disclosure §6.4 specifies for «نقش‌ها و شرح وظایف».
   *
   *  The design system's readme says the product has no Accordion. R1 records
   *  that claim as false of the deliverables — they carry two, and this is one of
   *  them — so the primitive stays and this is its shape. It had no consumer
   *  because `screens/Overview.tsx` hand-rolled the same control instead of
   *  importing it; that copy is deleted in the same change.
   *
   *  Not exclusive: a person comparing two roles needs both open. */
  export function Accordion({ items }: { items: AccordionItem[] }) {
    const [open, setOpen] = useState<Set<string>>(new Set())
    const toggle = (k: string) => setOpen((s) => {
      const next = new Set(s)
      if (!next.delete(k)) next.add(k)
      return next
    })

    return (
      <div className="flex flex-col gap-s6">
        {items.map((it) => {
          const isOpen = open.has(it.key)
          return (
            <div key={it.key} className="border border-border-current rounded-tile overflow-hidden">
              <button type="button" onClick={() => toggle(it.key)} aria-expanded={isOpen}
                className="w-full flex items-center gap-s6 text-start px-s8 py-s7 bg-surface-sub border-0 cursor-pointer">
                <span className="font-bold text-fs-body text-ink flex-1 min-w-0">{it.title}</span>
                {it.badge !== undefined && (
                  <span className="text-fs-xxs font-semibold text-violet bg-tile-v px-s5 py-s3 rounded-pill shrink-0">{it.badge}</span>
                )}
                <span className={`shrink-0 text-muted transition-transform duration-chev ease-css ${isOpen ? 'rotate-180' : ''}`}>
                  <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor"
                    strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden focusable="false">
                    <path d="M6 9l6 6 6-6" />
                  </svg>
                </span>
              </button>
              {isOpen && <div className="p-s8 bg-card">{it.body}</div>}
            </div>
          )
        })}
      </div>
    )
  }
  ```

- [ ] **Step 4: Run it, watch it pass, commit.**
  ```bash
  cd ui && npx vitest run src/ui/controls.test.tsx -t Accordion && npx tsc -b
  git add src/ui/Accordion.tsx src/ui/controls.test.tsx
  git commit -m "feat(ui): the accordion the readme says does not exist gets the shape §6.4 gives it"
  ```

- [ ] **Step 5: Report the resolution. Do not write it into the ledger.**
  `docs/superpowers/ui-normalisation-ledger.md` is maintained by the reviewer at review time,
  for the same one-file-many-writers reason the harness table is frozen. **Put the two rows
  below in your task report, under "the ledger rows this task would add"; do not open the
  ledger.**

  ```markdown
  | P3-9 | Readme: *"there is no … Accordion here, because the product has none."* Deliverables: two accordions, one fully specified at §6.4 | 1 claim vs 2 instances | **Keep `Accordion`**, rebuilt to §6.4; `Overview` is its first consumer | R1 — the deliverable outranks the readme, and R1 already records this claim as false of it |
  | P3-10 | Department-info roles: KPI block shows a padlock line when policy hides KPIs (§6.4) | 1 | **Not built** | `visibility.public_overview` returns the overview unchanged for both stances (D55) and `overview.schema.json` marks `kpi` required — this backend cannot produce the case, and the line would be dead code standing in for it (the same argument already applied to `updated_at` in `Overview.tsx:78`) |
  ```

  Nothing is staged or committed by this step.

- [ ] **Step 6: Write the failing tests for the screen.**
  Append to `ui/src/screens/Overview.test.tsx`:

  ```tsx
  import { readFileSync } from 'node:fs'

  describe('the rebuilt department page', () => {
    it('uses the shared accordion and has no second close button', async () => {
      serve(OV_WITH_PERSONNEL)
      renderAt('/departments/:code/overview', <Overview />, '/departments/cooking/overview', READER)
      const head = await screen.findByRole('button', { name: /سرآشپز/ })
      expect(head).toHaveAttribute('aria-expanded', 'false')
      fireEvent.click(head)
      expect(screen.queryByRole('button', { name: 'بستن' })).not.toBeInTheDocument()
    })

    it('numbers the duties the way §6.4 numbers them', async () => {
      serve(OV_WITH_PERSONNEL)
      renderAt('/departments/:code/overview', <Overview />, '/departments/cooking/overview', READER)
      fireEvent.click(await screen.findByRole('button', { name: /سرآشپز/ }))
      // Persian numerals in a 20×20 tile beside the text, not a chip per duty.
      expect(screen.getByText('۱')).toBeInTheDocument()
      expect(screen.getByText('۲')).toBeInTheDocument()
    })

    it('caps its column where every sibling screen caps theirs', async () => {
      serve(OV_WITH_PERSONNEL)
      renderAt('/departments/:code/overview', <Overview />, '/departments/cooking/overview', READER)
      await screen.findByText('دپارتمان پخت')
      // Ledger P3-1: §6.4 says 900px, four sibling screens say 920px.
      expect(document.querySelector('[data-r-pad] > div')!.className).toContain('max-w-list')
    })

    it('collapses the sub-unit grid at ≤760', async () => {
      serve(OV_WITH_PERSONNEL)
      renderAt('/departments/:code/overview', <Overview />, '/departments/cooking/overview', READER)
      await screen.findByText('دپارتمان پخت')
      const grid = document.querySelector('[data-r-2col]')!
      expect(grid.className).toContain('grid-cols-2')
      expect(grid.className).toContain('max760:grid-cols-1')
    })

    it('leaves no literal value, no physical direction and no near-miss border', () => {
      const src = readFileSync(new URL('./Overview.tsx', import.meta.url), 'utf8')
      expect(src).not.toMatch(/#[0-9a-fA-F]{3,8}\b/)      // #FADAD8 ×4 was --border-danger missed by 3 bytes
      expect(src).not.toMatch(/(text|rounded|shadow)-\[/)
      expect(src).not.toMatch(/\btext-(right|left)\b/)
      expect(src).not.toMatch(/\brounded-(sm|md|lg|xl|2xl|3xl|full)\b/)
      expect(src).not.toMatch(/\btext-(xs|sm|base|lg|xl|[2-9]xl)\b/)
    })
  })
  ```

- [ ] **Step 7: Run them and watch them fail.**
  ```bash
  cd ui && npx vitest run src/screens/Overview.test.tsx
  ```
  Expected: five failures, including `Unable to find an element by [data-r-2col]` and
  `expected '…border-[#FADAD8]…' not to match /#[0-9a-fA-F]{3,8}\b/`.

- [ ] **Step 8: Rebuild the read view.**
  Replace `:62-144` of `ui/src/screens/Overview.tsx` (header, description card, sub-units)
  and `:146-183` (the personnel section) with §6.4's three stacked cards. The header:

  ```tsx
    <div data-r-pad className="flex-1 overflow-auto py-screen-y px-screen-x max760:px-s7 max760:py-s9">
      <div className="max-w-list mx-auto">
        <div className="flex items-start justify-between gap-s8 mb-s9" data-r-stack>
          <div className="flex items-center gap-s6">
            <IconTile accent={m.accent} glyph={code} />
            <div>
              <div className="flex items-center gap-s5">
                <h1 className="font-extrabold text-fs-h2 text-role-title-on-field m-0">خلاصهٔ {data.name}</h1>
                {/* `mark`, not `m`: `m` is the department's tile metadata three
                    lines up, and two different `m`s in one JSX block is a rename
                    waiting to go to the wrong one. */}
                <ConfirmMark row={marks.find((mark) => mark.target === code)} department={code} />
              </div>
              {/* `updated_at` is unguarded on purpose — `visibility.public_overview`
                  returns the department page unchanged for both stances (D55). */}
              <p className="text-fs-sm text-violet-on-violet mt-s2 leading-normal m-0">آخرین به‌روزرسانی: {jalali(data.updated_at)}</p>
            </div>
          </div>
          {/* …the edit / cancel / save cluster, unchanged apart from its classes… */}
        </div>
  ```

  The three cards, each `bg-card border-border-card rounded-doc p-s10 mb-s7 shadow-card` opened
  by an `text-fs-xxs font-bold text-muted mb-s6` eyebrow:

  ```tsx
        <section className="bg-card border border-border-card rounded-doc p-s10 mb-s7 shadow-card">
          <div className="text-fs-xxs font-bold text-muted mb-s6">شرح دپارتمان</div>
          {data.description.trim()
            ? <p className="text-fs-body text-ink leading-loose text-justify [text-wrap:pretty] m-0 whitespace-pre-line">{data.description}</p>
            : <p className="text-fs-sm2 text-faint m-0">شرحی ثبت نشده است.</p>}
        </section>

        <section className="bg-card border border-border-card rounded-doc p-s10 mb-s7 shadow-card">
          <div className="text-fs-xxs font-bold text-muted mb-s6">زیربخش‌ها ({toFa(data.sub_units.length)})</div>
          {data.sub_units.length === 0
            ? <p className="text-fs-sm2 text-faint m-0">واحدی ثبت نشده است.</p>
            : (
              <div data-r-2col className="grid grid-cols-2 gap-s6 max760:grid-cols-1">
                {data.sub_units.map((s, i) => (
                  <div key={i} className="bg-surface-sub border border-border-current rounded-tile px-s7 py-s7 self-start">
                    <div className="font-bold text-fs-sm2 text-ink">{s.name}</div>
                    <p className="text-fs-sm2 text-ink-current mt-s2 leading-loose text-justify m-0">{s.description}</p>
                  </div>
                ))}
              </div>
            )}
        </section>

        <section className="bg-card border border-border-card rounded-doc p-s10 mb-s7 shadow-card">
          <div className="text-fs-xxs font-bold text-muted mb-s7">نقش‌ها و شرح وظایف</div>
          {data.personnel.length === 0
            ? <p className="text-fs-sm2 text-faint m-0">پرسنلی ثبت نشده است.</p>
            : (
              <Accordion items={data.personnel.map((pr, i) => ({
                key: String(i),
                title: pr.role,
                badge: `${toFa(pr.duties.length)} وظیفه`,
                body: (
                  <>
                    <div className="text-fs-xxs font-bold text-faint mb-s6">شرح وظایف</div>
                    <ol className="flex flex-col gap-s3 p-0 m-0 list-none">
                      {pr.duties.map((d, j) => (
                        <li key={j} className="flex gap-s5 items-start">
                          <span className="w-s10 h-s10 shrink-0 rounded-badge bg-tile-v text-violet text-fs-micro font-bold flex items-center justify-center">{toFa(j + 1)}</span>
                          <span className="text-fs-sm2 text-ink-current leading-loose text-justify">{d}</span>
                        </li>
                      ))}
                    </ol>
                    {pr.kpi.length > 0 && (
                      <div className="mt-s9 pt-s7 border-t border-hair flex flex-col gap-s4">
                        {pr.kpi.map((k, j) => (
                          <div key={j} className="flex gap-s4 items-start text-fs-sm text-ink-current leading-loose">
                            <Icon name="check" px={14} strokeWidth={2.6} className="text-green shrink-0 mt-s1" />{k}
                          </div>
                        ))}
                      </div>
                    )}
                    {/* Ledger P3-10 — §6.4's padlock line is NOT drawn: D55 returns
                        the overview unchanged for both stances and the schema marks
                        `kpi` required, so a withheld-KPI case cannot arrive here.
                        An empty list really is empty. */}
                    {pr.kpi.length === 0 && (
                      <p className="mt-s9 pt-s7 border-t border-hair text-fs-sm2 text-faint m-0">شاخصی ثبت نشده است.</p>
                    )}
                  </>
                ),
              }))} />
            )}
        </section>
  ```

  **This markup needs no theme entry at all: all three prose lines are `leading-loose`.**

  The step used to ask for "three theme entries" and then list two — `leading-justify`
  (`--lh-justify: 2.05`) and `leading-sub` (`--lh-sub: 1.95`) — "off the six-step
  line-height scale … add them as their own tokens rather than snapping". Four things were
  wrong with that: it said three and listed two, `--lh-sub` is **1.8** and not 1.95,
  `leading-sub` already ships, and `leading-justify` compiles to nothing and must not be
  minted. Ledger **L-17** decides prose leading by dominance and says outright that
  *"`1.75`, `1.85`, `1.95`, `2` and `2.05` normalise"*; `tokens.css`'s own comment on
  `--lh-sub` says where to: *"1.95 and 2.05 normalise to `--lh-loose` 1.9 for long-form
  prose."*

  All three sites are long-form justified prose, which is precisely the role L-17 gives
  `1.9`: the department description (`Inja Panel.dc.html:487` / `Inja Reader.dc.html:248`,
  `2.05`, the product's only one), and the sub-unit description and duty text
  (`Inja Panel.dc.html:497` and `:520`, the product's only two `1.95`s). None of them is
  the "explanatory sub-copy under a control" role that `--lh-sub` 1.8 exists for, so
  `leading-sub` keeps its own 17 sites elsewhere and is not written here.

  `[text-wrap:pretty]` is an arbitrary *property*, which no guard forbids and no token can
  express.

- [ ] **Step 9: Rebuild the edit view's controls.**
  In the edit branches of `ui/src/screens/Overview.tsx`, replace the twelve hand-rolled
  `<input>`/`<textarea>` elements with `TextField` / `Textarea`, the four
  `border-[#FADAD8]` delete buttons with `Button variant="danger"` + the trash `Icon`,
  the two `×` duty/KPI removers with the same, and the four dashed add-buttons with the
  `AddButton` Task 16 added to `Summary.tsx` — moved to `ui/src/ui/AddButton.tsx` and
  imported by both, since it is now the third copy (`ui-audit-existing.md:672`).
  `Overview.tsx:155`'s `text-right` becomes `text-start` (it is inside the `Accordion`
  header now, which already sets it).

- [ ] **Step 10: Run every suite for this screen, watch it pass.**
  ```bash
  cd ui && npx vitest run src/screens/Overview.test.tsx src/screens/Overview.edit.test.tsx \
    src/screens/confirm-mark.placement.test.tsx src/screens/errors.test.tsx src/ui/controls.test.tsx
  ```
  Expected: `Test Files 5 passed`. `confirm-mark.placement.test.tsx` asserts «تأیید محتوا»
  is a button on this screen and that saving re-asks the confirmations listing — both
  survive untouched, because the mark and the save path are not what this task changed.

- [ ] **Step 11: Typecheck, lint, build, then prove every class this screen writes emits.**
  ```bash
  cd ui && npx tsc -b && npx eslint .
  ```
  Expected: both silent. Then:
  ```bash
  cd ui && npx vite build
  node scripts/harvest-classes.mjs src/screens/Overview.tsx src/ui/Accordion.tsx src/ui/AddButton.tsx src/screens/Summary.tsx
  ```
  Expected: the run ends `DEAD 0   EMPTY 0   NOVAR 0`, both controls hold
  (`control (negative): N/N invented names reported dead` and
  `control (escaping): … escaped variant classes unescaped`), and the last line
  is `PASS`. The script exits 1 on any failure, so it can be `&&`-chained.
  The class list is **harvested out of these files**, never hand-kept, so it
  cannot drift from what they write and `tailwind-probe.txt` cannot certify it
  on their behalf — see *The class-emission check* in Global Constraints for the
  measurement that retired the old grep.

  `Summary.tsx` is in the list because this task edits it too (Step 12 stages it);
  a screen that is touched by two tasks is scanned by both, which is cheap and is
  how a class dropped in the second edit gets caught.

  **A failure.** `DEAD` — the class compiled to no rule at all; that is a **typo
  in the component**, so fix the class string, rebuild, re-run. `EMPTY` — the
  selector emitted with an empty body, so the theme key resolves to nothing.
  `NOVAR` — the rule reads a `var(--…)` nothing declares. The last two are theme
  regressions: **stop and report them.** Do **not** add the name to
  `ui/tailwind.config.js`, `src/styles/tokens.css`, `src/styles/roles.css` or
  `tailwind-probe.txt`. All four are frozen for the duration of this plan and
  were unfrozen exactly once, by the single minting pass in
  `.superpowers/sdd/mint-spec.md`; minting one here to make a misspelling compile
  recreates the unreachable-token problem the whole rebuild exists to fix. A
  value that genuinely has no name goes into `mint-spec.md`, not into the config
  and not into this task's commit.

  **What this step cannot prove:** that these files write a class and that the
  class compiles to a rule with declarations, yes. That the class reaches the
  right element, that the element renders, that it is visible, or that its value
  is the one the design asks for — no. That stays with the Playwright checks.

- [ ] **Step 12: Commit the screen.**
  ```bash
  cd ui && git add src/screens/Overview.tsx src/screens/Overview.test.tsx src/screens/Overview.edit.test.tsx src/ui/AddButton.tsx src/screens/Summary.tsx
  git commit -m "feat(ui): the department page stops re-inventing the accordion sitting next to it"
  ```

- [ ] **Step 13: Read the overview row the harness already holds. Do not write one.**
  This step used to say *"add to `DESIGN` in `ui/e2e/_harness.ts`"*. **The file is frozen and
  the row is already in it**, written before any screen was, by the pre-flight (`3dda9ef`;
  `.superpowers/sdd/ui-harness-preflight-report.md`) — eleven screen tasks each appending to
  one file in one working tree means the later write silently clobbers the earlier one, and
  the build still exits 0.

  ```bash
  cd ui && node -e "const s=require('fs').readFileSync('e2e/_harness.ts','utf8');console.log('overview:', s.includes('  overview:')?'present':'MISSING')"
  ```

  Panel only — `Overview.tsx` writes `max-w-list` and `text-fs-h2` unconditionally, so there
  is no reader row and none is wanted. Three things to build **to**:

  - `column` is `920px` — ledger **L-07**, not §6.4's `900`: 900 has no token, no role and no
    second use, and `--role-column` resolves to `--width-list`, so the theme cannot express it.
  - `h1.color` is `TITLE_ON_FIELD`, `rgb(255,255,255)` (L-01), and the JSX above writes it:
    `text-role-title-on-field`. **Not `text-on-dark`** — that is `#FBF7F1`, the value L-01
    retired.
  - `grid` is `[data-r-2col]` at `2 / 2 / 1` with a `12px` gutter, and **the fixture must
    serve at least two sub-units**: the section is not drawn for an empty list, and a
    one-item grid proves no gutter — the harness's own vacuity guard fires on it.

  **If the row is missing, or a number in it disagrees with §6.4, stop and report it** — do
  not add a row and do not edit one.

- [ ] **Step 14: Write the browser check.**
  Create `ui/e2e/overview.spec.ts`:

  ```ts
  import { test, expect } from '@playwright/test'
  import { expectDesign, serve, shot, signedIn, visit } from './_harness'

  const CODE = 'cooking'

  test('department overview', async ({ page }) => {
    await signedIn(page)
    // OVERVIEW must carry **two or more sub-units**: `[data-r-2col]` is not drawn for
    // an empty list, and a one-item grid proves no gutter — the row's own vacuity
    // guard fires on it.
    await serve(page, {
      '/api/departments': DEPARTMENTS,
      [`/api/departments/${CODE}/overview`]: OVERVIEW,
      '/api/pending': [],
    })
    await visit(page, `/departments/${CODE}/overview`, 'overview')
    await page.getByText('نقش‌ها و شرح وظایف').waitFor()
    const w = page.viewportSize()!.width

    await expectDesign(page, 'overview')

    const grid = page.locator('[data-r-2col]').first()
    if (await grid.count()) {
      const tracks = (await grid.evaluate((el) => getComputedStyle(el).gridTemplateColumns)).split(' ').length
      expect(tracks).toBe(w <= 760 ? 1 : 2)
    }

    // The accordion: closed body, one control, a chevron that turns.
    const head = page.locator('[aria-expanded]').first()
    await expect(head).toHaveAttribute('aria-expanded', 'false')
    const chev = head.locator('svg')
    const before = await chev.evaluate((el) => getComputedStyle(el.parentElement!).transform)
    await head.click()
    await expect(head).toHaveAttribute('aria-expanded', 'true')
    await page.waitForTimeout(250)   // --duration-chev is .18s
    expect(await chev.evaluate((el) => getComputedStyle(el.parentElement!).transform)).not.toBe(before)

    // Nothing scales or bounces on press (§4.6): the header is not a lifting surface.
    expect(await head.evaluate((el) => getComputedStyle(el).transform)).toBe('none')

    await shot(page, `overview-${w}`)
  })
  ```

- [ ] **Step 15: Run it, and run it green.**
  ```bash
  cd ui && npx playwright test e2e/overview.spec.ts --reporter=list
  ```
  Expected: `3 passed`, three screenshots.

- [ ] **Step 16: Commit the check.**
  ```bash
  cd ui && git commit e2e/overview.spec.ts \
    -m "test(ui): the department page and its accordion are measured at three widths"
  ```
  `e2e/_harness.ts` is **not** staged: it is frozen and this task did not touch it. Commit by
  pathspec, not `git add` + bare `git commit` — the latter commits the *index*, and another
  agent's staged change has already been swallowed into an unrelated commit that way.

---

### Task 18: `SignIn` and `Refusal` — the most-specified surface, and the one nothing may lead to

Two screens that already pass every guard (`ui-audit-existing.md:472`) and are both
wrong anyway. `SignIn` is *"the most-specified surface and matches least"* (O10): a
920px-wide login card holding two inputs, no logo, no orbs, no brand line, and the app's
only unused exposed token (`login-orb`). `Refusal` is load-bearing for R5 — it must stay
reachable by a typed URL, must keep 404 and 403 distinct, and **nothing inside the app
may navigate to it**.

The design's authority for login is not S1 — the panel deliverable starts at the
departments screen (§9.13). It is `ui_kits/panel/Login.jsx` inside
`ui/design/_ds/…/_ds_bundle.js`, quoted below value for value.

**Files**
- Modify: `ui/src/screens/SignIn.tsx`
- Modify: `ui/src/screens/SignIn.test.tsx`
- Modify: `ui/src/screens/Refusal.tsx`
- Modify: `ui/src/ui/states/index.tsx`
- Modify: `ui/src/styles/base.css`
- Create: `ui/src/screens/Refusal.test.tsx`
- Create: `ui/e2e/sign-in.spec.ts`
- Create: `ui/e2e/refusal.spec.ts`

**Files this task must not write**

| Path | Why | What to do instead |
|---|---|---|
| `ui/tailwind.config.js`, `ui/src/styles/tokens.css`, `ui/src/styles/roles.css`, `ui/tailwind-probe.txt` | Frozen between deliberate minting passes, so many tasks can run in one tree without clobbering each other. Unfrozen exactly once, by the single consolidated mint. | A value with no token is not minted here. Stop, and report the value and its role. |
| `ui/e2e/_harness.ts` | Pre-populated and frozen — eleven tasks appending to one file in one tree lose all but the last write, with a green build. | **Neither of this task's two screens has a `DESIGN` row, and neither is getting one** — the reasons are in Step 13. Both specs assert their own numbers. Do not add a row. |
| `docs/superpowers/ui-normalisation-ledger.md` | Maintained by the reviewer at review time. | Report the row you would add, in your task report. |

**Interfaces**

*Consumes* — Task 14 Step 1's utilities, plus `TextField`, `PasswordField` (Task 7),
`Button` with `block` (Task 6), `DeniedState` / `NotFoundState` (`ui/src/ui/states`),
`refusalStatus` (`ui/src/api/client.ts`), `appRoutes` (`ui/src/routes.tsx`).

*Produces*
- `SignIn` — unchanged export and route; unchanged submit contract
- `RefusalScreen({ status: 403 | 404 })` — unchanged export; wrapper aligned with `LoadFailedScreen`
- `.login-field`, `.login-orb-a`, `.login-orb-b` in `ui/src/styles/base.css`

---

- [ ] **Step 1: Write the failing test for the login card.**
  Append to `ui/src/screens/SignIn.test.tsx`:

  ```tsx
  describe('the brand lockup the design specifies and the app has never drawn', () => {
    it('draws the one raster the product ships', () => {
      const Wrapper = createWrapper()
      render(<Wrapper><SignIn /></Wrapper>)
      const logo = screen.getByRole('img', { name: 'اینجا فست‌فود' })
      expect(logo).toHaveAttribute('src')
      expect(logo.className).toContain('w-logo-login')     // --size-logo-login: 76px
      expect(logo.className).toContain('rounded-feature')  // 20px
      expect(logo.className).toContain('object-cover')
    })

    it('carries the two-line brand beneath it', () => {
      const Wrapper = createWrapper()
      render(<Wrapper><SignIn /></Wrapper>)
      expect(screen.getByText('اینجا فست‌فود')).toBeInTheDocument()
      expect(screen.getByText('سامانهٔ مستندسازی فرآیندها')).toBeInTheDocument()
    })

    it('is a dialog-scale panel, not a 920px list', () => {
      // O10 — `max-w-list` is --width-list, 920px: a login card almost a metre
      // wide on a desktop monitor, holding two inputs.
      const { container } = render(<>{createWrapper()({ children: <SignIn /> })}</>)
      const card = container.querySelector('form')!
      expect(card.className).toContain('w-login')          // 380px
      expect(card.className).toContain('rounded-panel')    // 24px
      expect(card.className).not.toContain('max-w-list')
    })

    it('gives its field labels the brand violet', () => {
      // The visual audit's finding 6: every label in the app collapsed into the
      // muted 11px/700 section-caption register, so nothing led the eye down a
      // form. The DS Login's Label is 12.5px/600 --violet.
      const Wrapper = createWrapper()
      render(<Wrapper><SignIn /></Wrapper>)
      const label = screen.getByText('شمارهٔ موبایل')
      expect(label.className).toContain('text-violet')
      expect(label.className).toContain('font-semibold')
      expect(label.className).toContain('text-fs-sm2')
    })
  })
  ```

- [ ] **Step 2: Run it and watch it fail.**
  ```bash
  cd ui && npx vitest run src/screens/SignIn.test.tsx -t "brand lockup"
  ```
  Expected: `Unable to find role="img" name="اینجا فست‌فود"` — `grep -rn "<img" ui/src
  --include=*.tsx` still returns zero matches.

- [ ] **Step 3: Fix the one test the password reveal will break.**
  `SignIn.test.tsx:183` reads `screen.getByRole('button')` with no name, which throws
  the moment the form holds two buttons. Narrow it before adding the second:

  ```tsx
      // Named, because the password field now carries its own reveal toggle and a
      // bare getByRole('button') would find two.
      expect(screen.getByRole('button', { name: 'ورود' })).toBeDisabled()
  ```

  ```bash
  cd ui && npx vitest run src/screens/SignIn.test.tsx -t "disables the button"
  ```
  Expected: still green — one button, matched by name.

- [ ] **Step 4: Put the login field's geometry in the stylesheet.**
  The two orbs are decorative circles positioned with negative physical offsets; there is
  no token that could express `top:-140px; left:-110px` and no reason to invent one.
  `base.css` is where the product's non-utility CSS already lives. Add to
  `ui/src/styles/base.css`, inside `@layer base`:

  ```css
  /* The login field. `--login-orb` has been defined, exposed and unused since the
     theme was written: the DS's Login.jsx paints two solid circles at 50–55%
     opacity on flat --login-bg, and the readme is explicit that the depth comes
     from those, "not a gradient" (there are no gradients anywhere in this
     product). Written here rather than as utilities because the geometry is four
     negative physical offsets on two decorative circles — a circle mirrors to
     itself, so nothing here is an RTL bug waiting to happen. */
  .login-orb-a,
  .login-orb-b { position: absolute; border-radius: 50%; background: var(--login-orb); pointer-events: none; }
  .login-orb-a { width: 420px; height: 420px; opacity: .55; top: -140px; left: -110px; }
  .login-orb-b { width: 300px; height: 300px; opacity: .5;  bottom: -120px; right: -90px; }
  ```

- [ ] **Step 5: Rebuild `SignIn.tsx`.**
  Replace `:54-108` (the render). Everything above it — `MIN_PASSWORD`,
  `CANONICAL_NUMBER`, `onSubmit` and all four of its comments — is unchanged; this task
  changes what the screen looks like and nothing about what it refuses.

  ```tsx
    return (
      <div className="min-h-screen relative flex items-center justify-center overflow-hidden bg-login-bg p-s10">
        <span aria-hidden className="login-orb-a" />
        <span aria-hidden className="login-orb-b" />

        <form onSubmit={onSubmit} className="relative w-login max-w-full bg-bg rounded-panel p-s12 shadow-modal">
          <div className="flex flex-col items-center gap-s7 mb-s10">
            <img src={injaLogo} alt="اینجا فست‌فود"
              className="w-logo-login h-logo-login rounded-feature object-cover" />
            <div className="text-center">
              <div className="font-extrabold text-fs-h3 text-ink">اینجا فست‌فود</div>
              <div className="text-fs-sm2 text-muted mt-s1">سامانهٔ مستندسازی فرآیندها</div>
            </div>
          </div>

          <TextField
            id={numberId}
            label="شمارهٔ موبایل"
            type="tel"
            inputMode="numeric"
            autoComplete="username"
            dir="ltr"
            placeholder="۰۹۱۲۳۴۵۶۷۸۹"
            // No maxLength. normalisePhone accepts nine spellings — five of them,
            // including '+98 0912 345 6789' and '(0912) 3456789', are longer than
            // a canonical number. Truncating one does not reject it, it silently
            // makes a DIFFERENT number, and D56's identical 401 then tells the
            // person only that something was wrong while they look at a
            // correctly-typed phone. USERNAME_RE is what says no, after
            // normalisation, where the answer can be honest.
            value={number}
            onChange={setNumber}
          />

          <PasswordField
            id={passwordId}
            label="گذرواژه"
            autoComplete="current-password"
            placeholder="گذرواژه را بنویسید"
            value={password}
            onChange={setPassword}
          />

          {error && <p role="alert" className="text-fs-sm2 text-conflict mt-s4 mb-s4">{error}</p>}

          <Button type="submit" variant="coral" block
            loading={login.isPending} loadingLabel="در حال ورود…"
            className="mt-s4 py-s7 px-s9 text-fs-body">
            ورود
          </Button>
        </form>
      </div>
    )
  ```

  with `import injaLogo from '../assets/inja-logo.jpg'` at the top. Theme entries:
  `w-login` (`--width-login: 380px`). `p-s12` and `mb-s10` are the two snapped values
  from Task 14 Step 1 (32→30, 24→22); both are recorded as ledger P3-5.

  Two departures from the DS Login, each deliberate:
  - **The footer note is dropped.** Its copy is «دسترسی تک‌کاربره · محافظت‌شده با
    نام‌کاربری و گذرواژه» — a statement that is false of this product, which is
    multi-user and signs in by phone number. A false sentence is worse than a missing one.
  - **The label is «شمارهٔ موبایل», not «نام کاربری»,** and the field is `type="tel"`
    with `dir="ltr"`. The DS mock signs in as `analyst`; this product does not.

  The submit is **coral**, matching both the DS Login (`variant="coral"`) and R8's row
  for coral — *"new, primary-forward"*. It also closes the visual audit's finding 4, the
  violet-where-the-design-says-coral drift, at the first screen a person ever sees.

- [ ] **Step 6: Run the whole `SignIn` suite, watch it pass.**
  ```bash
  cd ui && npx vitest run src/screens/SignIn.test.tsx
  ```
  Expected: `16 passed`. Every one of the twelve behavioural tests — canonical-number
  normalisation, the D56 single message, the 500-is-not-a-refusal branch, the maxLength
  pin, the hand-off to `/departments` — must pass untouched. If any of them fails, the
  rebuild changed behaviour and not appearance.

- [ ] **Step 7: Typecheck, lint, commit.**
  ```bash
  cd ui && npx tsc -b && npx eslint .
  git add src/screens/SignIn.tsx src/screens/SignIn.test.tsx src/styles/base.css
  git commit -m "feat(ui): the login screen finally draws the brand it has been shipping since the first commit"
  ```

- [ ] **Step 8: Write the failing tests for R5's two halves.**
  Create `ui/src/screens/Refusal.test.tsx`:

  ```tsx
  import { describe, it, expect } from 'vitest'
  import { render, screen } from '@testing-library/react'
  import { readFileSync, readdirSync, statSync } from 'node:fs'
  import { join } from 'node:path'
  import { RefusalScreen } from './Refusal'
  import { appRoutes } from '../routes'

  /** R5 — «Never draw what you would refuse.»
   *
   *  The rule has two halves and they pull in opposite directions, which is why
   *  both are pinned here rather than assumed:
   *
   *  1. The refusal surfaces **stay**. A person can type a URL, and `access.requires`
   *     answers 404 out of scope and 403 for a refused action on a visible resource.
   *     Those two must stay distinct — collapsing them would either leak the
   *     existence of something out of scope, or hide that a visible thing was
   *     refused.
   *  2. **Nothing inside the app may navigate to one.** A refusal reached by a
   *     typed URL is correct; a refusal reached by clicking is a bug in the screen
   *     that drew the control.
   *
   *  Half 2 cannot be proved by rendering, because it is a claim about every
   *  control on every screen. What *can* be proved, and is what actually goes
   *  wrong, is that the refusal is never a **destination**: no route resolves to
   *  it, and no component renders it from anything but a server answer.
   */

  describe('the two refusals stay distinct', () => {
    it('404 says nothing about what might exist', () => {
      render(<RefusalScreen status={404} />)
      expect(screen.getByText('چیزی اینجا نیست')).toBeInTheDocument()
      expect(screen.queryByText('اجازهٔ این کار را ندارید')).not.toBeInTheDocument()
    })

    it('403 names the act, not the resource', () => {
      render(<RefusalScreen status={403} />)
      expect(screen.getByText('اجازهٔ این کار را ندارید')).toBeInTheDocument()
      expect(screen.queryByText('چیزی اینجا نیست')).not.toBeInTheDocument()
    })

    it('stands in the same slot as a failed read, at the same width and gutters', () => {
      // P10 — `LoadFailedScreen` documents itself as "laid out like RefusalScreen"
      // and then used a different width and a different gutter. A failed read and
      // a refused read land in the same place; they may not land at two sizes.
      const { container } = render(<RefusalScreen status={404} />)
      const wrap = container.firstElementChild!
      expect(wrap.className).toContain('py-screen-y')
      expect(wrap.className).toContain('px-screen-x')
      expect(wrap.firstElementChild!.className).toContain('max-w-list')
    })
  })

  describe('nothing in the app leads here', () => {
    it('is not a destination: no route resolves to it', () => {
      const flat = (rs: typeof appRoutes): string[] =>
        rs.flatMap((r) => [String(r.path ?? ''), ...flat(r.children ?? [])])
      const paths = flat(appRoutes)
      expect(paths).not.toContain('/403')
      expect(paths).not.toContain('/404')
      expect(paths).not.toContain('/denied')
      expect(paths).not.toContain('/forbidden')
      const src = readFileSync(new URL('../routes.tsx', import.meta.url), 'utf8')
      expect(src).not.toMatch(/RefusalScreen/)
    })

    it('is rendered only from an answer the server gave, never from a click', () => {
      // Every consumer must reach it through `refusalStatus(error)` — the one
      // place the status→surface mapping lives — with one declared exception.
      const SRC = join(process.cwd(), 'src')
      const walk = (d: string, out: string[] = []): string[] => {
        for (const n of readdirSync(d)) {
          const p = join(d, n)
          if (statSync(p).isDirectory()) walk(p, out)
          else if (/\.tsx?$/.test(n) && !/\.test\.tsx?$/.test(n)) out.push(p)
        }
        return out
      }
      /** `Visibility.tsx` renders 403 from `administrationRefusal(session)` rather
       *  than from a response, and that is correct: `/visibility` is drawn in the
       *  chrome only for a holder of `set_visibility`, so the only way to arrive
       *  without it is to type the URL — which is precisely the case R5 keeps the
       *  surface for. The screen states the refusal locally instead of firing a
       *  request it knows will be refused. */
      const DECLARED = ['screens/Refusal.tsx', 'screens/Visibility.tsx']
      const offenders = walk(SRC)
        .filter((p) => !DECLARED.some((d) => p.endsWith(d)))
        .filter((p) => {
          const s = readFileSync(p, 'utf8')
          return s.includes('<RefusalScreen') && !s.includes('refusalStatus(')
        })
      expect(offenders).toEqual([])
    })

    it('offers no way out of itself', () => {
      // A «برگرد به خانه» button here would be a control on a refusal surface, and
      // the 404's copy is pinned whole in errors.test.tsx for the harder reason:
      // any sentence added to it has to be argued for.
      const { container } = render(<RefusalScreen status={404} />)
      expect(container.querySelectorAll('button, a')).toHaveLength(0)
      expect(container.textContent).toBe('چیزی اینجا نیستنشانی را بررسی کنید یا به خانه برگردید.')
    })
  })
  ```

- [ ] **Step 9: Run them and watch them fail.**
  ```bash
  cd ui && npx vitest run src/screens/Refusal.test.tsx
  ```
  Expected: one failure — `expected 'flex-1 overflow-auto py-[30px] px-10' to contain
  'py-screen-y'`. The other five pass today, and that is the point: they are the pins that
  stop the next change from breaking what is currently right by accident.

- [ ] **Step 10: Align the two wrappers.**
  `ui/src/screens/Refusal.tsx`:

  ```tsx
  import { DeniedState, NotFoundState } from '../ui/states'

  /**
   * The full-screen form of the two refusal states, laid out like the screen it
   * replaces. Which one to show is decided by `refusalStatus` in `api/client`, so
   * the mapping from status to surface lives in exactly one place.
   *
   * **Reachable only by typing a URL** (R5). No route resolves here and no control
   * in the app navigates here; every caller renders it from a status the server
   * gave. It carries no control of its own for the same reason — an affordance on
   * a refusal surface is a second chance to be refused.
   */
  export function RefusalScreen({ status }: { status: 403 | 404 }) {
    return (
      <div className="flex-1 overflow-auto py-screen-y px-screen-x max760:px-s7 max760:py-s9">
        <div className="max-w-list mx-auto">
          {status === 404 ? <NotFoundState /> : <DeniedState />}
        </div>
      </div>
    )
  }
  ```

  and, in `ui/src/ui/states/index.tsx`, give `LoadFailedScreen` the gutters its own
  docstring already claims:

  ```tsx
    return (
      <div className="flex-1 overflow-auto py-screen-y px-screen-x max760:px-s7 max760:py-s9">
        <div className="max-w-list mx-auto">
  ```

- [ ] **Step 11: Run them, watch them pass, commit.**
  ```bash
  cd ui && npx vitest run src/screens/Refusal.test.tsx src/screens/errors.test.tsx src/ui/states/states.test.tsx
  ```
  Expected: `Test Files 3 passed`. `errors.test.tsx` pins the 404 copy byte for byte
  through three different screens — it is the reason this task changes the wrapper and
  not one word inside it.

  ```bash
  cd ui && npx tsc -b && npx eslint .
  git add src/screens/Refusal.tsx src/screens/Refusal.test.tsx src/ui/states/index.tsx
  git commit -m "fix(ui): a refused read and a failed read stand in the same slot, and neither offers a way onward"
  ```

- [ ] **Step 12: Build, and prove every class these two screens write emits.**
  ```bash
  cd ui && npx vite build
  node scripts/harvest-classes.mjs src/screens/SignIn.tsx src/screens/Refusal.tsx src/ui/states/index.tsx
  ```
  Expected: the run ends `DEAD 0   EMPTY 0   NOVAR 0`, both controls hold
  (`control (negative): N/N invented names reported dead` and
  `control (escaping): … escaped variant classes unescaped`), and the last line
  is `PASS`. The script exits 1 on any failure, so it can be `&&`-chained.
  The class list is **harvested out of these files**, never hand-kept, so it
  cannot drift from what they write and `tailwind-probe.txt` cannot certify it
  on their behalf — see *The class-emission check* in Global Constraints for the
  measurement that retired the old grep.

  **A failure.** `DEAD` — the class compiled to no rule at all; that is a **typo
  in the component**, so fix the class string, rebuild, re-run. `EMPTY` — the
  selector emitted with an empty body, so the theme key resolves to nothing.
  `NOVAR` — the rule reads a `var(--…)` nothing declares. The last two are theme
  regressions: **stop and report them.** Do **not** add the name to
  `ui/tailwind.config.js`, `src/styles/tokens.css`, `src/styles/roles.css` or
  `tailwind-probe.txt`. All four are frozen for the duration of this plan and
  were unfrozen exactly once, by the single minting pass in
  `.superpowers/sdd/mint-spec.md`; minting one here to make a misspelling compile
  recreates the unreachable-token problem the whole rebuild exists to fix. A
  value that genuinely has no name goes into `mint-spec.md`, not into the config
  and not into this task's commit.

  **What this step cannot prove:** that these files write a class and that the
  class compiles to a rule with declarations, yes. That the class reaches the
  right element, that the element renders, that it is visible, or that its value
  is the one the design asks for — no. That stays with the Playwright checks.

  Then the two checks the harvest cannot make, because neither is a utility class:

  ```bash
  cd ui && CSS=$(ls dist/assets/*.css | head -1)
  grep -q "login-orb-a" "$CSS" || echo "NOT IN CSS: .login-orb-a"
  grep -q -- "--login-orb" "$CSS" || echo "NOT IN CSS: --login-orb"
  ```
  Expected: no output. These matter more than they look: `--login-orb` has been
  defined, exposed in the theme and referenced by nothing since the theme was
  written, and this is the first build in which it reaches a rendered pixel. Note
  that a `bg-login-orb` utility reading a `var(--login-orb)` that nothing declared
  would be caught by the harvest as `NOVAR`, not as present — that is the bucket
  this pair of greps used to stand in for.

- [ ] **Step 13: Neither of these screens gets a `DESIGN` row. Assert their numbers in their own specs.**
  This step used to say *"add `signIn` and `refusal` to `DESIGN` in `ui/e2e/_harness.ts`"*.
  **`ui/e2e/_harness.ts` is frozen and both rows were deliberately left out** by the pre-flight
  that filled the table in ahead of the screens (`3dda9ef`, written up in
  `.superpowers/sdd/ui-harness-preflight-report.md`). The freeze itself is mechanical — eleven
  tasks appending to one file in one working tree lose all but the last write, with a green
  build — but these two absences are decisions, and each has its own reason:

  - **`signIn` is out because a row for it would turn the suite red the day it was added.**
    The harness asserts that *every `DESIGN` row carries a width-dependent expectation*, and
    this screen has none: a `380px` fixed-width card centred on `--login-bg`, no content
    column, no screen padding, no `[data-r-pad]`. Even this task's own spec expects
    `Math.min(380, w - 60)` at ≤760, which is 380 at 760 too. Nothing about it differs between
    1440, 1080 and 760 (F1).
  - **`refusal` is out because its type is not settled.** `ScreenDesign` requires `h1` and
    `body`, and this screen has neither: its content is `NotFoundState` / `DeniedState`, a
    `<p>` inside a white `Card` with no heading at all. There is no `[data-h1]` to hook, and
    inventing one is designing the screen rather than measuring it (F4).

  **Do not add either row, and do not make `h1`/`body` optional to fit one** — that is
  weakening the gate twenty-one checks depend on, to fit one screen. If you believe a row is
  needed, stop and report it.

  What *is* settled is recorded, so nothing is lost. Assert it directly in the two specs below:

  | | value |
  |---|---|
  | login field | `rgb(46, 22, 104)` (`--login-bg`) |
  | login card | `380px`, radius `24px` (`--radius-panel`), background `rgb(251, 247, 241)` (`--bg`), padding **30** (32 in `ui_kits/panel/Login.jsx`, snapped by ledger P3-5), `--shadow-modal` |
  | orbs | 420px and 300px circles, `--login-orb` `#3A1D85`, opacity `.55` / `.5` |
  | logo / brand | 76×76 radius 20; brand line 19px/800 `--ink`; sub-brand 12.5px `--text-muted` |
  | login field control | label 12.5px/600 `--violet`; input `12px 14px`, `1.5px solid --line`, radius 12px, 14px, `#fff`, coral border on focus |
  | refusal | field `FIELD`; column **920px** — ledger **P3-6**, *"a failed read and a refused read stand in the same slot"*, so `Refusal` moves off its `max-w-[560px]` onto `LoadFailedScreen`'s 920; padding `30px 40px`, and `18px 14px` at ≤760 |

- [ ] **Step 14: Write the login browser check.**
  Create `ui/e2e/sign-in.spec.ts`:

  ```ts
  import { test, expect } from '@playwright/test'
  import { shot, signedIn } from './_harness'

  test('sign in', async ({ page }) => {
    // The one spec that must NOT be signed in — and it still installs the stub
    // layer, because `shot` calls `expectEveryEndpointStubbed` and a spec that
    // intercepts nothing is grading whatever the FastAPI container on :8000
    // happens to hold. `signedIn` installs the layer; the route registered after
    // it wins (Playwright tries handlers in reverse registration order) and
    // answers the session endpoint the way an anonymous caller is answered.
    await signedIn(page)
    await page.route((url) => url.pathname === '/api/auth/me', (route) =>
      route.fulfill({ status: 401, contentType: 'application/json',
                      body: JSON.stringify({ detail: 'authentication required' }) }))

    await page.goto('/login')
    await page.getByLabel('شمارهٔ موبایل').waitFor()
    const w = page.viewportSize()!.width

    // There is no `expectDesign(page, 'signIn')`: this screen has no `DESIGN`
    // row and is not getting one — it is identical at 1440, 1080 and 760, and a
    // row with no width-dependent expectation fails the harness's own guard on
    // the day it is added (Step 13, finding F1). Its numbers are asserted here.
    const screen = page.locator('[data-screen]')
    expect(await screen.evaluate((el) => getComputedStyle(el).backgroundColor))
      .toBe('rgb(46, 22, 104)')                    // --login-bg

    const card = page.locator('form')
    const box = (await card.boundingBox())!
    expect(Math.round(box.width)).toBe(w > 760 ? 380 : Math.min(380, w - 60))
    expect(await card.evaluate((el) => getComputedStyle(el).borderRadius)).toBe('24px')
    expect(await card.evaluate((el) => getComputedStyle(el).backgroundImage)).toBe('none')  // no gradients, anywhere

    const logo = page.getByRole('img', { name: 'اینجا فست‌فود' })
    expect(Math.round((await logo.boundingBox())!.width)).toBe(76)

    // The depth is two solid circles, and they are on the page.
    await expect(page.locator('.login-orb-a')).toBeVisible()
    await expect(page.locator('.login-orb-b')).toBeVisible()
    expect(await page.locator('.login-orb-a').evaluate((el) => getComputedStyle(el).backgroundColor))
      .toBe('rgb(58, 29, 133)')

    // Focus is border-colour and nothing else — no ring, no glow, no outline.
    const field = page.getByLabel('شمارهٔ موبایل')
    await field.focus()
    expect(await field.evaluate((el) => getComputedStyle(el).borderTopColor)).toBe('rgb(250, 90, 82)')

    await shot(page, `sign-in-${w}`)
  })
  ```

- [ ] **Step 15: Write the refusal browser check.**
  Create `ui/e2e/refusal.spec.ts`:

  ```ts
  import { test, expect } from '@playwright/test'
  import { FIELD, expandPadding, serve, shot, signedIn } from './_harness'

  const OUT_OF_SCOPE = 'logistics'

  test('refusal — reachable by typing, and only by typing', async ({ page }) => {
    // A reader, from a fixture — `signedIn` overrides the session, so no
    // E2E_READER_USER and no live login is involved (Task 14 Step 3).
    await signedIn(page, {
      username: 'reader', displayName: 'خواننده', role: 'reader',
      capabilities: ['view'], scopes: ['cooking', 'warehouse'],
    })
    await serve(page, { '/api/departments': DEPARTMENTS, '/api/pending': [] })
    const w = page.viewportSize()!.width

    // Half 1: a typed URL for something out of scope answers 404, and says so
    // without confirming that anything is there.
    await page.goto(`/departments/${OUT_OF_SCOPE}`)
    await expect(page.getByText('چیزی اینجا نیست')).toBeVisible()
    await expect(page.getByText('اجازهٔ این کار را ندارید')).toHaveCount(0)

    // There is no `expectDesign(page, 'refusal')`: this screen has no `DESIGN`
    // row and is not getting one — `ScreenDesign` requires `h1` and `body`, and
    // the refusal has neither (its content is a `<p>` inside a `Card`, with no
    // heading at all). Step 13, finding F4. What *is* settled is asserted here.
    const screen = page.locator('[data-screen]')
    expect(await screen.evaluate((el) => getComputedStyle(el).backgroundColor)).toBe(FIELD)
    const col = page.locator('[data-col]')
    expect(await col.evaluate((el) => getComputedStyle(el).maxWidth)).toBe('920px')  // ledger P3-6
    const pad = expandPadding(await screen.evaluate((el) => getComputedStyle(el).padding))
    expect([pad.top, pad.left]).toEqual(w > 760 ? ['30px', '40px'] : ['18px', '14px'])

    // Half 1, the other status: a refused act on a screen the reader can see.
    await page.goto('/visibility')
    await expect(page.getByText('اجازهٔ این کار را ندارید')).toBeVisible()
    await expect(page.getByText('چیزی اینجا نیست')).toHaveCount(0)

    // Half 2: nothing in the chrome offers the screen that refused them.
    await page.goto('/departments')
    await expect(page.getByRole('link', { name: 'نمایش محتوا' })).toHaveCount(0)
    await expect(page.getByRole('link', { name: 'کاربران' })).toHaveCount(0)

    // …and the refusal itself offers nothing onward.
    await page.goto(`/departments/${OUT_OF_SCOPE}`)
    const main = page.locator('main')
    await expect(main.locator('a, button')).toHaveCount(0)

    await shot(page, `refusal-${w}`)
  })
  ```

- [ ] **Step 16: Run both browser checks and watch the R5 half fail if it is going to.**
  ```bash
  cd ui && npx playwright test e2e/sign-in.spec.ts e2e/refusal.spec.ts --reporter=list
  ```
  Expected first run: `sign-in` green; `refusal` fails on the chrome assertions if
  `PanelShell`/`ReaderShell` (Tasks 12–13) still draw «نمایش محتوا» or «کاربران» for a
  session that cannot use them. That is an R5 defect in the shell, not in this spec —
  fix the shell, because a nav entry whose target the caller cannot reach is exactly the
  case R5 names first.

- [ ] **Step 17: Run them green at all three widths.**
  ```bash
  cd ui && npx playwright test e2e/sign-in.spec.ts e2e/refusal.spec.ts --reporter=list
  ```
  Expected: `6 passed`, six screenshots (`sign-in-1440/1080/760`,
  `refusal-1440/1080/760`).

- [ ] **Step 18: Run the whole frontend suite before handing on.**
  Tasks 14–18 have touched three primitives, two stylesheets, the theme, the guards and
  six screens; the screens that follow (19–24) build on all of them.

  ```bash
  cd ui && npx vitest run && npx tsc -b && npx eslint . && npm run build && npx playwright test --reporter=list
  ```
  Expected: vitest green, tsc and eslint silent, the build exits 0, and every e2e spec
  written so far passes at 1440, 1080 and 760.

- [ ] **Step 19: Commit the checks.**
  ```bash
  cd ui && git commit e2e/sign-in.spec.ts e2e/refusal.spec.ts \
    -m "test(ui): the login card and both refusals are measured, and R5's second half gets a browser to prove it"
  ```
  `e2e/_harness.ts` is **not** staged: it is frozen and this task did not touch it. Commit by
  pathspec, not `git add` + bare `git commit` — the latter commits the *index*, and another
  agent's staged change has already been swallowed into an unrelated commit that way.
### Task 19: `Users` — the 6-column table

The design's centrepiece on this screen is a table. The app has none: two free-floating
920×90 cards, no columns, no filter bar, no status dot, no chevron, violet where the
design is coral (`ui-audit-visual.md` §"`/users`"). Rebuilt to §6.7.

**Files**

| Action | Path |
|---|---|
| Modify | `ui/src/screens/Users.tsx` |
| Create | `ui/src/screens/usersFilter.ts` |
| Create | `ui/src/screens/usersFilter.test.ts` |
| Create | `ui/src/screens/UsersFilters.tsx` |
| Modify | `ui/src/lib/roles.ts` |
| Modify | `ui/src/screens/users.test.tsx` |
| Create | `ui/e2e/users.spec.ts` |

**Files this task must not write**

| Path | Why | What to do instead |
|---|---|---|
| `ui/tailwind.config.js`, `ui/src/styles/tokens.css`, `ui/src/styles/roles.css`, `ui/tailwind-probe.txt` | Frozen between deliberate minting passes, so many tasks can run in one tree without clobbering each other. Unfrozen exactly once, by the single consolidated mint. | A value with no token is not minted here. Stop, and report the value and its role. |
| `ui/e2e/_harness.ts` | Pre-populated and frozen — eleven tasks appending to one file in one tree lose all but the last write, with a green build. | **`users` has no `DESIGN` row and is not getting one** — Step 20 says why. The spec asserts its own numbers. |
| `docs/superpowers/ui-normalisation-ledger.md` | Maintained by the reviewer at review time. | Report the row you would add, in your task report. |

**Interfaces**

*Consumes* — from Tasks 2/3 (Tailwind names for the newly-exposed tokens):
`px-screen-x` (`--pad-screen-x:40px`) · `py-screen-y` (`--pad-screen-y:30px`) ·
`max-w-list` (920px) · `rounded-doc` (18px) · `rounded-tile` (14px) ·
`rounded-input` (11px) · `bg-surface-sub` (`--surface-sub:#FBF9FE`) ·
`border-line-row` (`--line-row:#F4F0FA`) · `border-line-filter` (`--line-filter:#E9E0F7`) ·
`bg-tile-v2` (#F4EFFB) · `bg-tile-v4` (#F8F4FE) · `border-border-current` (#EDE5F5) ·
`text-ink-current` (`--text-current`, #5a5175) · `text-violet-mid` (#7A52D0) · `w-dot h-dot` (9px) ·
`w-chev h-chev` (30px) · `shadow-card` (S1's two-layer value) ·
`-translate-y-lift` · the breakpoint variants `max1080:` and `max760:`, registered by Task 2 via `addVariant` in `plugins` — **never** as `theme.screens` objects, which delete Tailwind's whole `min-*`/`max-*` family and the 30 shipped `max-[560px]:` utilities with it, silently and with a green build.

From Tasks 6–11:
```ts
// ui/src/ui/DataTable.tsx  (Task 9)
export interface Column<T> {
  key: string
  head: string                     // '' for the dot and chevron columns
  cell: (row: T) => ReactNode
  narrowHidden?: boolean           // dropped at ≤760px
}
export function DataTable<T>(props: {
  columns: Column<T>[]; rows: T[]; template: string; rowKey: (row: T) => string
  onOpen?: (row: T) => void; empty: ReactNode; headFill?: boolean; filterBar?: ReactNode
  caption: string
}): JSX.Element
// ui/src/ui/Dropdown.tsx (Task 8)
export function Dropdown<T extends string>(props: {
  label: string; value: T | null; onChange: (v: T | null) => void
  options: { value: T; label: string }[]; placeholder: string
  searchable?: boolean; searchPlaceholder?: string; noHit?: string
}): JSX.Element
// ui/src/ui/SearchField.tsx (Task 6) — now `pitch: 'large' | 'medium' | 'small' | 'menu'`
// ui/src/ui/Icon.tsx (Task 11) — <Icon name="funnel" className="w-s7 h-s7" strokeWidth={2.2} />
// ui/e2e/_harness.ts (Task 4) — expectDesign(page, screen), shot(page, name)
```

*Produces*
```ts
// ui/src/screens/usersFilter.ts
export interface UserFilters { role: string | null; supervisor: string | null
                               status: 'active' | 'disabled' | null; dept: string | null }
export const NO_FILTERS: UserFilters
export function anyActive(f: UserFilters): boolean
export function matches(u: AdminUser, q: string, f: UserFilters, deptCodes: (u: AdminUser) => string[]): boolean
export function filterOptions(users: AdminUser[], names: Record<string, string>): {
  roles: { value: string; label: string }[]
  supervisors: { value: string; label: string }[]
  depts: { value: string; label: string }[] }
// ui/src/screens/UsersFilters.tsx
export function UsersFilters(props: { q: string; onQ: (v: string) => void
  filters: UserFilters; onFilters: (f: UserFilters) => void
  users: AdminUser[]; names: Record<string, string>; count: number; total: number }): JSX.Element
// ui/src/lib/roles.ts
export const ROLE_TONE: Record<string, string>   // token-backed utility pairs
```

---

- [ ] **Step 1: Confirm the utility names Tasks 2/3 actually shipped.**
  Every value below is read from a Tailwind class; a name that differs by one
  character compiles to nothing and the build still exits 0. Run:
  ```
  cd ui && node --input-type=module -e "import c from './tailwind.config.js';const t=c.theme.extend;const need={maxWidth:['access','profile'],borderRadius:['doc','tile','input','tool','feature'],colors:['surface-sub','line-row','line-filter','border-pick','tile-v3','tile-v4','tile-c2','border-current','hair','line-soft','line-dashed','border-danger','ink-current','violet-mid','violet-on-violet'],width:['dot','glyph','chev','tool'],spacing:['screen-x','screen-y']};for(const[k,v]of Object.entries(need))for(const n of v)if(!(n in (t[k]||{})))console.log('MISSING',k,n);const v=[];for(const pl of (c.plugins||[]))pl({addVariant:(n)=>v.push(n)});console.log('variants',JSON.stringify(v))"
  ```
  Expected — run, not predicted:
  ```
  variants ["max1080","max760"]
  ```
  No `MISSING` lines, and the two variants come from `addVariant` in `plugins`, not from
  `theme.screens`. Any `MISSING` line is a Task 2/3 naming difference — fix the name **in
  this task's steps**, not in the config, and note it at the top of the commit body.
  `ui/tailwind.config.js` is frozen after the single minting pass.

  **This invocation was `node -e "const c=require('./tailwind.config.js').default; …"` and
  could not run at all.** `ui/package.json` is `"type": "module"` and the config is ESM, so
  `require()` threw `ERR_REQUIRE_ESM` before checking anything — the one step meant to
  catch naming drift in this task exited non-zero on every tree it was ever run against,
  including a correct one. The fix is `node --input-type=module -e` plus `import c from
  './tailwind.config.js';`. Everything after that is unchanged: the `v` in the
  `for (const [k, v] of …)` head is scoped to that loop, so the later top-level `const v`
  is a separate binding and is legal in an ES module. Both forms verified by running them.

- [ ] **Step 2: A failing test for the role tone map.**
  The role is the primary thing an administrator scans this list for and it is
  the least distinct thing on the row today (F52). §1.2 fixes the three pairs.
  Append to `ui/src/screens/users.test.tsx`:
  ```tsx
  describe('the role is a coloured pill, one pair per role (§1.2)', () => {
    it('maps every seeded role and falls back for an unknown one', async () => {
      const { ROLE_TONE, roleTone } = await import('../lib/roles')
      expect(ROLE_TONE.editor).toBe('bg-tile-c text-conflict')
      expect(ROLE_TONE.admin).toBe('bg-tile-v text-violet')
      expect(ROLE_TONE.reader).toBe('bg-tile-v2 text-violet')
      expect(ROLE_TONE.reader_no_download).toBe('bg-tile-v2 text-violet')
      expect(roleTone('something_seeded_later')).toBe('bg-tile-v2 text-violet')
      expect(roleTone(null)).toBe('bg-tile-v2 text-violet')
    })
  })
  ```

- [ ] **Step 3: Run it and watch it fail.**
  `cd ui && npx vitest run src/screens/users.test.tsx -t 'one pair per role'`
  Expected: `FAIL … expected undefined to be 'bg-tile-c text-conflict'`.

- [ ] **Step 4: Add the tone map.**
  Append to `ui/src/lib/roles.ts`:
  ```ts
  /**
   * The three fg/bg pairs S1's script declares for the users table (§1.2,
   * script 991–992): `editor` → `#FFE9E7`/`#E23D35`, `admin` → `#F0E9FB`/`#4A25A9`,
   * `reader` → `#F4EFFB`/`#4A25A9`. Written as token-backed utility pairs, the
   * way `lib/departments.ts`'s `TILE` already is, so no hex reaches a screen.
   *
   * A role seeded ahead of this build gets the reader pair rather than nothing:
   * an unstyled word in a column of pills reads as a rendering fault, and the
   * label beside it (`roleLabel`) already carries the unknown identifier.
   */
  export const ROLE_TONE: Record<string, string> = {
    editor: 'bg-tile-c text-conflict',
    admin: 'bg-tile-v text-violet',
    reader: 'bg-tile-v2 text-violet',
    reader_no_download: 'bg-tile-v2 text-violet',
  }
  export function roleTone(role: string | null | undefined): string {
    return (role && ROLE_TONE[role]) || 'bg-tile-v2 text-violet'
  }
  ```

- [ ] **Step 5: Run it and watch it pass.**
  `cd ui && npx vitest run src/screens/users.test.tsx -t 'one pair per role'` → `1 passed`.
  Commit:
  ```
  git add ui/src/lib/roles.ts ui/src/screens/users.test.tsx
  git commit -m "feat(ui): a role wears its own colour, and one it keeps everywhere"
  ```

- [ ] **Step 6: A failing test for the filter predicate.**
  The predicate is pure and jsdom can see all of it, which is the half of this
  screen a browser check should not have to carry. Create
  `ui/src/screens/usersFilter.test.ts`:
  ```ts
  import { describe, it, expect } from 'vitest'
  import { NO_FILTERS, anyActive, matches, filterOptions } from './usersFilter'
  import type { AdminUser } from '../api/users'

  const base: AdminUser = {
    id: 1, username: '09120000001', displayName: 'سحر بیات', roleId: 3, role: 'admin',
    capabilities: [], scopes: ['dept:dining'], supervisor: null, canSupervise: false,
    disabled: false, createdAt: 1700000000,
  }
  const codes = (u: AdminUser) => u.scopes
  const names = { dining: 'سالن', cashier: 'صندوق' }

  describe('usersFilter', () => {
    it('searches the name and the number and nothing else', () => {
      expect(matches(base, 'سحر', NO_FILTERS, codes)).toBe(true)
      // Persian keyboards emit ۰۹…; the stored number is ASCII (D57).
      expect(matches(base, '۰۹۱۲۰۰۰۰۰۰۱', NO_FILTERS, codes)).toBe(true)
      // The role moved to its own dropdown; typing it must no longer match.
      expect(matches(base, 'مدیر', NO_FILTERS, codes)).toBe(false)
    })

    it('ANDs the four dropdowns with the query', () => {
      const f = { ...NO_FILTERS, role: 'admin', status: 'disabled' as const }
      expect(matches(base, '', { ...NO_FILTERS, role: 'admin' }, codes)).toBe(true)
      expect(matches(base, '', { ...NO_FILTERS, role: 'editor' }, codes)).toBe(false)
      expect(matches(base, '', f, codes)).toBe(false)
      expect(matches({ ...base, disabled: true }, '', f, codes)).toBe(true)
    })

    it('filters on a department the account actually reaches, `*` included', () => {
      expect(matches(base, '', { ...NO_FILTERS, dept: 'dining' }, codes)).toBe(true)
      expect(matches(base, '', { ...NO_FILTERS, dept: 'cashier' }, codes)).toBe(false)
      const every = { ...base, scopes: ['*'] }
      // `*` is every department, including any added tomorrow — so it matches
      // whichever one is asked for rather than none of them.
      expect(matches(every, '', { ...NO_FILTERS, dept: 'cashier' }, codes)).toBe(true)
    })

    it('offers only options the listing actually contains, each once', () => {
      const other = { ...base, id: 2, role: 'editor', scopes: ['dept:cashier'],
        supervisor: { id: 9, username: '09129', displayName: 'مریم', disabled: false } }
      const o = filterOptions([base, other, { ...base, id: 3 }], names)
      expect(o.roles.map((r) => r.value)).toEqual(['admin', 'editor'])
      expect(o.roles[0].label).toBe('مدیر')
      expect(o.supervisors).toEqual([{ value: '9', label: 'مریم' }])
      expect(o.depts).toEqual([{ value: 'cashier', label: 'صندوق' },
                               { value: 'dining', label: 'سالن' }])
    })

    it('knows when the clear-filters link belongs on screen', () => {
      expect(anyActive(NO_FILTERS)).toBe(false)
      expect(anyActive({ ...NO_FILTERS, dept: 'dining' })).toBe(true)
    })
  })
  ```

- [ ] **Step 7: Run it and watch it fail.**
  `cd ui && npx vitest run src/screens/usersFilter.test.ts`
  Expected: `FAIL … Failed to resolve import "./usersFilter"`.

- [ ] **Step 8: Write the predicate.**
  Create `ui/src/screens/usersFilter.ts`:
  ```ts
  import { toLatinDigits } from '../lib/digits'
  import { roleLabel } from '../lib/roles'
  import { parseScope } from '../lib/scopes'
  import type { AdminUser } from '../api/users'

  /**
   * What the four dropdowns above the table hold, and the one predicate that
   * reads them (§6.7).
   *
   * Pure, and in its own module deliberately: jsdom renders nothing, so the
   * screen's Playwright check is what proves the table *looks* right — and a
   * predicate tested only through a rendered row is a predicate nobody can put
   * a case to. Everything decidable without a browser is decided here.
   *
   * **The search is over the name and the number only.** It used to be over the
   * role as well, which was right while the role was the one thing on the row
   * you could not otherwise narrow by; it now has a dropdown of its own, and a
   * query that silently matches a column with its own control is a filter that
   * disagrees with the filter beside it.
   */
  export interface UserFilters {
    role: string | null
    supervisor: string | null
    status: 'active' | 'disabled' | null
    dept: string | null
  }

  export const NO_FILTERS: UserFilters =
    { role: null, supervisor: null, status: null, dept: null }

  export function anyActive(f: UserFilters): boolean {
    return f.role !== null || f.supervisor !== null || f.status !== null || f.dept !== null
  }

  /** Every department code an account reaches, `*` answered as "all of them". */
  export function reachedCodes(u: AdminUser): string[] {
    return u.scopes.flatMap((s) => {
      const p = parseScope(s)
      return p.shape === 'department' || p.shape === 'report' ? [p.code] : []
    })
  }

  export function matches(
    u: AdminUser, q: string, f: UserFilters,
    deptCodes: (u: AdminUser) => string[] = reachedCodes,
  ): boolean {
    const query = q.trim()
    const digits = toLatinDigits(query)
    if (query !== '' && !u.displayName.includes(query) && !u.username.includes(digits)) {
      return false
    }
    if (f.role !== null && u.role !== f.role) return false
    if (f.supervisor !== null && String(u.supervisor?.id ?? '') !== f.supervisor) return false
    if (f.status !== null && (f.status === 'disabled') !== !!u.disabled) return false
    if (f.dept !== null) {
      // `*` is not "the nine departments there are today" — it is everything,
      // including whatever is added tomorrow — so it satisfies any department
      // asked for rather than dropping the account out of the list.
      if (u.scopes.includes('*')) return true
      if (!deptCodes(u).includes(f.dept)) return false
    }
    return true
  }

  /**
   * The options each dropdown offers — **derived from the listing, never from a
   * registry**. A role nobody holds, or a department nobody reaches, is a filter
   * that can only ever produce «کاربری با این نام پیدا نشد»: R5's rule about
   * controls, applied to the contents of a menu.
   */
  export function filterOptions(users: AdminUser[], names: Record<string, string>) {
    const roles = [...new Set(users.map((u) => u.role).filter((r): r is string => !!r))]
      .sort().map((value) => ({ value, label: roleLabel(value) }))
    const sup = new Map<string, string>()
    for (const u of users) if (u.supervisor) sup.set(String(u.supervisor.id), u.supervisor.displayName)
    const supervisors = [...sup].sort((a, b) => a[1].localeCompare(b[1], 'fa'))
      .map(([value, label]) => ({ value, label }))
    const depts = [...new Set(users.flatMap(reachedCodes))].sort()
      .map((value) => ({ value, label: names[value] ?? value }))
    return { roles, supervisors, depts }
  }
  ```

- [ ] **Step 9: Run it and watch it pass.**
  `cd ui && npx vitest run src/screens/usersFilter.test.ts` → `5 passed`.
  ```
  git add ui/src/screens/usersFilter.ts ui/src/screens/usersFilter.test.ts
  git commit -m "feat(ui): four filters that only ever offer what the list contains"
  ```

- [ ] **Step 10: A failing test for the filter bar's structure.**
  Append to `ui/src/screens/users.test.tsx` (inside the existing list `describe`,
  after the fetch stub that serves `SAHAR` and its sibling):
  ```tsx
  it('draws the design\'s filter card: legend, search, four dropdowns, clear link', async () => {
    renderUsers(EDITOR)
    const bar = await screen.findByRole('group', { name: 'فیلتر کاربران' })
    expect(within(bar).getByPlaceholderText('جست‌وجوی نام یا نام کاربری…')).toBeInTheDocument()
    for (const label of ['نقش', 'سرپرست', 'وضعیت', 'دپارتمان']) {
      expect(within(bar).getByRole('button', { name: new RegExp(label) })).toBeInTheDocument()
    }
    // R5 — the link is absent until there is something for it to clear.
    expect(within(bar).queryByRole('button', { name: 'پاک کردن فیلترها' })).toBeNull()
    await userEvent.click(within(bar).getByRole('button', { name: /وضعیت/ }))
    await userEvent.click(await screen.findByRole('option', { name: 'غیرفعال' }))
    expect(within(bar).getByRole('button', { name: 'پاک کردن فیلترها' })).toBeInTheDocument()
  })
  ```

- [ ] **Step 11: Run it and watch it fail.**
  `cd ui && npx vitest run src/screens/users.test.tsx -t "design's filter card"`
  Expected: `FAIL … Unable to find role="group" and name "فیلتر کاربران"`.

- [ ] **Step 12: Build the filter bar.**
  Create `ui/src/screens/UsersFilters.tsx`:
  ```tsx
  import { Dropdown } from '../ui/Dropdown'
  import { Icon } from '../ui/Icon'
  import { SearchField } from '../ui/SearchField'
  import { toFa } from '../lib/format'
  import { NO_FILTERS, anyActive, filterOptions, type UserFilters } from './usersFilter'
  import type { AdminUser } from '../api/users'

  /**
   * §6.7's filter card: a four-column grid on `--tile-v2` inside a
   * `1px #E9E0F7` border at radius 14, whose legend and search each span the
   * whole row. Its own component because the screen below it is a table and
   * nothing else, and because the clear-filters link's rule («drawn only when
   * something is set») is the sort of thing that rots when it lives inside a
   * 200-line screen.
   *
   * At ≤760px the design drops it to two columns at `padding:10px`, each filter
   * full-width — which is the *only* change; nothing is hidden, because a filter
   * you cannot reach is a row you cannot find.
   */
  export function UsersFilters({ q, onQ, filters, onFilters, users, names, count, total }: {
    q: string; onQ: (v: string) => void
    filters: UserFilters; onFilters: (f: UserFilters) => void
    users: AdminUser[]; names: Record<string, string>; count: number; total: number
  }) {
    const o = filterOptions(users, names)
    const set = <K extends keyof UserFilters>(k: K, v: UserFilters[K]) =>
      onFilters({ ...filters, [k]: v })

    return (
      <div role="group" aria-label="فیلتر کاربران"
        className="grid grid-cols-4 items-center gap-s4 mb-s8 border border-line-filter
                   rounded-tile px-s6 py-s5 bg-tile-v2 max760:grid-cols-2 max760:p-s5">
        <div className="col-span-full flex items-center gap-s4">
          <span className="inline-flex items-center gap-s3 text-fs-xs font-bold text-violet">
            <Icon name="funnel" className="w-s7 h-s7" strokeWidth={2.2} />
            فیلتر کاربران
          </span>
          {/* The count the old screen carried as a free-floating line, in the
              shape §6.10 gives it: pushed to the inline end, gone at ≤760px
              where the bar is already two rows tall. */}
          <span className="ms-auto text-fs-sm font-semibold text-muted max760:hidden">
            {toFa(count)} از {toFa(total)}
          </span>
        </div>

        <div className="col-span-full">
          <SearchField label="جست‌وجوی کاربر" pitch="small" value={q} onChange={onQ}
            placeholder="جست‌وجوی نام یا نام کاربری…" />
        </div>

        <Dropdown label="نقش" value={filters.role} onChange={(v) => set('role', v)}
          options={o.roles} placeholder="نقش" />
        <Dropdown label="سرپرست" value={filters.supervisor}
          onChange={(v) => set('supervisor', v)} options={o.supervisors}
          placeholder="سرپرست" searchable searchPlaceholder="نام سرپرست"
          noHit="سرپرستی با این نام نیست" />
        <Dropdown label="وضعیت" value={filters.status}
          onChange={(v) => set('status', v)} placeholder="وضعیت"
          options={[{ value: 'active', label: 'فعال' }, { value: 'disabled', label: 'غیرفعال' }]} />
        <Dropdown label="دپارتمان" value={filters.dept} onChange={(v) => set('dept', v)}
          options={o.depts} placeholder="دپارتمان" />

        {/* R5 — absent, not disabled, until there is something to clear. */}
        {anyActive(filters) && (
          <button type="button" onClick={() => onFilters(NO_FILTERS)}
            className="col-span-full justify-self-start border-0 bg-transparent p-s1
                       text-fs-sm2 font-bold text-violet-mid underline underline-offset-4
                       cursor-pointer min-h-touch">
            پاک کردن فیلترها
          </button>
        )}
      </div>
    )
  }
  ```

- [ ] **Step 13: Run it and watch it pass.**
  `cd ui && npx vitest run src/screens/users.test.tsx -t "design's filter card"` → `1 passed`.
  ```
  git add ui/src/screens/UsersFilters.tsx ui/src/screens/users.test.tsx
  git commit -m "feat(ui): the user list gets the filter card the design opens it with"
  ```

- [ ] **Step 14: A failing test for the six columns.**
  Append to `ui/src/screens/users.test.tsx`:
  ```tsx
  it('renders one row per account across the design\'s six columns', async () => {
    renderUsers(EDITOR)
    const table = await screen.findByRole('table', { name: 'کاربران' })
    expect(within(table).getAllByRole('columnheader').map((h) => h.textContent))
      .toEqual(['', 'نام', 'نقش', 'سرپرست', 'دپارتمان', ''])
    const row = within(table).getByRole('row', { name: /سحر بیات/ })
    expect(within(row).getByTestId('state-dot')).toHaveAttribute('data-state', 'active')
    expect(within(row).getByText('مدیر')).toHaveClass('bg-tile-v', 'text-violet')
    expect(within(row).getByText('مریم رستمی')).toBeInTheDocument()
    // The department column reads scopes, and reads them in Persian.
    expect(within(row).getByText('پخت')).toBeInTheDocument()
    // R5 — every row on this screen opens, because `GET /api/users/{id}` is
    // gated by the same `manage_users` at `*` that let this list be read.
    await userEvent.click(row)
    expect(await screen.findByRole('heading', { name: 'سحر بیات' })).toBeInTheDocument()
  })

  it('says nothing was found rather than that nothing exists', async () => {
    renderUsers(EDITOR)
    await screen.findByRole('table', { name: 'کاربران' })
    await userEvent.type(screen.getByPlaceholderText('جست‌وجوی نام یا نام کاربری…'), 'zzz')
    expect(await screen.findByText('کاربری با این نام پیدا نشد')).toBeInTheDocument()
  })
  ```

- [ ] **Step 15: Run it and watch it fail.**
  `cd ui && npx vitest run src/screens/users.test.tsx -t 'six columns'`
  Expected: `FAIL … Unable to find role="table"`.

- [ ] **Step 16: Rebuild the screen body.**
  Replace everything from `return (` to the end of `ui/src/screens/Users.tsx`
  (the screen's JSX plus the whole `UserRow` function) with:
  ```tsx
    return (
      <div className="flex-1 overflow-auto py-screen-y px-screen-x max760:px-s7 max760:py-s9">
        <div className="max-w-list mx-auto">
          <div className="flex items-center justify-between gap-s6 flex-wrap">
            <h1 className="text-title font-extrabold text-role-title-on-field">کاربران</h1>
            {/* Coral, not violet. §5.2 gives coral to the new/primary-forward
                role and §6.7 names this button as one; the violet stays for the
                commit inside the dialog this opens (§6.14). One rule, applied
                from what the control *is* (R8). Below the gate, so a
                department-scoped caller is answered «چیزی اینجا نیست» above and
                never reaches a control the app put up a wall in front of. */}
            <Button variant="coral" className="px-s8 py-s5 text-fs-sm rounded-button"
              onClick={() => setCreating(true)}>
              کاربر جدید
            </Button>
          </div>

          {creating && <NewUserDialog open onClose={() => setCreating(false)} />}

          <UsersFilters q={q} onQ={setQ} filters={filters} onFilters={setFilters}
            users={users} names={names} count={list.length} total={users.length} />

          {isPending ? <LoadingState /> : (
            <DataTable
              caption="کاربران"
              template="16px 1.4fr 1fr 1.1fr 1fr 34px"
              rows={list}
              rowKey={(u) => String(u.id)}
              onOpen={(u) => navigate(`/users/${u.id}`)}
              empty="کاربری با این نام پیدا نشد"
              headFill={false}
              columns={COLUMNS(names)}
            />
          )}
        </div>
      </div>
    )
  }

  /**
   * The six columns of §6.7, in the order and at the sizes the design fixes
   * them: `16px 1.4fr 1fr 1.1fr 1fr 34px`.
   *
   * A function of the department registry rather than a constant, because the
   * department cell is the only one that needs anything the row does not carry —
   * `AdminUser` holds scopes, and «سالن» is a name the registry supplies.
   */
  const COLUMNS = (names: Record<string, string>): Column<AdminUser>[] => [
    {
      key: 'state', head: '',
      cell: (u) => (
        <span data-testid="state-dot" data-state={u.disabled ? 'disabled' : 'active'}
          aria-label={u.disabled ? 'غیرفعال' : 'فعال'}
          className={`block w-dot h-dot rounded-round ${u.disabled ? 'bg-conflict' : 'bg-green'}`} />
      ),
    },
    {
      key: 'name', head: 'نام',
      cell: (u) => (
        <span className="block truncate text-body font-bold text-ink">{u.displayName}</span>
      ),
    },
    {
      key: 'role', head: 'نقش',
      cell: (u) => (
        <span className={`inline-block truncate max-w-full px-s5 py-s1 rounded-control
                          text-fs-sm2 font-semibold ${roleTone(u.role)}
                          max760:max-w-[42%]`}>
          {roleLabel(u.role)}
        </span>
      ),
      narrowHidden: false,
    },
    {
      key: 'supervisor', head: 'سرپرست', narrowHidden: true,
      cell: (u) => (
        // D14 leaves a disabled supervisor in place rather than repointing the
        // people under them, so the colour is the whole warning: this person's
        // comment approvals route to an account that can no longer sign in.
        <span className={`block truncate text-fs-sm2
                          ${u.supervisor?.disabled ? 'text-conflict' : 'text-ink-current'}`}>
          {u.supervisor ? u.supervisor.displayName : '—'}
        </span>
      ),
    },
    {
      key: 'dept', head: 'دپارتمان', narrowHidden: true,
      cell: (u) => (
        <span className="block truncate text-fs-sm2 text-muted">
          {scopesLabel(u.scopes, names)}
        </span>
      ),
    },
    {
      key: 'open', head: '',
      cell: () => (
        <span aria-hidden className="flex items-center justify-center w-chev h-chev
                                     rounded-round bg-tile-v2 text-violet">
          <Icon name="chevron-open" className="w-s6 h-s6" strokeWidth={2.4} />
        </span>
      ),
    },
  ]
  ```
  And at the top of the component, replacing the `list` derivation:
  ```tsx
    const [filters, setFilters] = useState<UserFilters>(NO_FILTERS)
    const navigate = useNavigate()
    const { data: departments } = useDepartments()
    const names = Object.fromEntries((departments ?? []).map((d) => [d.code, d.name]))
    const list = users.filter((u) => matches(u, q, filters))
  ```
  with the imports: `useNavigate` from `react-router-dom`, `useDepartments` from
  `../api/hooks`, `DataTable`/`Column` from `../ui/DataTable`, `Icon` from
  `../ui/Icon`, `scopesLabel` from `../lib/scopes`, `roleTone` from `../lib/roles`,
  `UsersFilters` from `./UsersFilters`, `NO_FILTERS`/`matches`/`UserFilters` from
  `./usersFilter`. Drop the now-unused `Card`, `StatusPill`, `SearchField`,
  `EmptyState`, `toLatinDigits`, `toFa`, `Link` and `SUPERVISOR_GONE` re-export
  target — `SUPERVISOR_GONE` itself stays exported, `UserDetail` still uses it.

- [ ] **Step 17: Run it and watch it pass.**
  `cd ui && npx vitest run src/screens/users.test.tsx` → all green.
  Then `npx tsc -b && npx eslint .` → clean.

- [ ] **Step 18: Commit the table.**
  ```
  git add ui/src/screens/Users.tsx ui/src/screens/users.test.tsx
  git commit -m "feat(ui): the user list becomes a table, and its left half gets a job"
  ```

- [ ] **Step 19: Prove every class this task writes emits.**
  ```bash
  cd ui && npx vite build
  node scripts/harvest-classes.mjs src/screens/Users.tsx src/screens/UsersFilters.tsx src/screens/usersFilter.ts src/lib/roles.ts
  ```
  Expected: the run ends `DEAD 0   EMPTY 0   NOVAR 0`, both controls hold
  (`control (negative): N/N invented names reported dead` and
  `control (escaping): … escaped variant classes unescaped`), and the last line
  is `PASS`. The script exits 1 on any failure, so it can be `&&`-chained.
  The class list is **harvested out of these files**, never hand-kept, so it
  cannot drift from what they write and `tailwind-probe.txt` cannot certify it
  on their behalf — see *The class-emission check* in Global Constraints for the
  measurement that retired the old grep.

  `src/lib/roles.ts` is named for the same reason `fieldFrame.ts` is in Task 7:
  `ROLE_TONE` is a `Record<string, string>` of token-backed utility **pairs** in a
  module with no JSX, and a typo in one of them is invisible to every other check
  in this task. It is exactly the shape the scanner's corroboration rule exists to
  cover — a literal holding two-or-more tokens of which at least one emits.

  **A failure.** `DEAD` — the class compiled to no rule at all; that is a **typo
  in the component**, so fix the class string, rebuild, re-run. `EMPTY` — the
  selector emitted with an empty body, so the theme key resolves to nothing.
  `NOVAR` — the rule reads a `var(--…)` nothing declares. The last two are theme
  regressions: **stop and report them.** Do **not** add the name to
  `ui/tailwind.config.js`, `src/styles/tokens.css`, `src/styles/roles.css` or
  `tailwind-probe.txt`. All four are frozen for the duration of this plan and
  were unfrozen exactly once, by the single minting pass in
  `.superpowers/sdd/mint-spec.md`; minting one here to make a misspelling compile
  recreates the unreachable-token problem the whole rebuild exists to fix. A
  value that genuinely has no name goes into `mint-spec.md`, not into the config
  and not into this task's commit.

  **What this step cannot prove:** that these files write a class and that the
  class compiles to a rule with declarations, yes. That the class reaches the
  right element, that the element renders, that it is visible, or that its value
  is the one the design asks for — no. That stays with the Playwright checks.

- [ ] **Step 20: `users` has no `DESIGN` row. Do not add one — assert the numbers in the spec.**
  This step used to say *"add `users` to the design table in the harness"*, in field names
  (`maxWidth`, `padX`, `padY`) that `ScreenDesign` does not have. **`ui/e2e/_harness.ts` is
  frozen**: the table was filled in ahead of all eleven screen tasks (`3dda9ef`) because
  eleven tasks appending to one file in one working tree lose all but the last write with a
  green build, and the table is the expected-value record every screen is graded against.

  **`users` was left out on purpose, and the reason is not the freeze.** `ScreenDesign.body`
  is required — a legal colour on the wrong element is the defect the whole file exists to
  catch — and this screen draws no second line at all: `Inja Panel.dc.html:1187` is
  `<div style="font-weight:800;font-size:22px;color:#fff">کاربران</div>` followed by an empty
  `<div>`, and this task's own JSX is an `<h1>` with nothing under it. The nearest candidates
  are the filter bar's caption and the table's 13px cells, and picking one is designing the
  screen rather than measuring it (`.superpowers/sdd/ui-harness-preflight-report.md`, F2).

  **Do not add the row, and do not make `body` optional to fit it** — that weakens a gate
  twenty-one checks depend on, for one screen. If you think the screen should grow a subtitle,
  that is a design decision: stop and report it.

  Everything else about the screen **is** settled, and the spec below asserts it directly:

  | | value |
  |---|---|
  | field | `FIELD` — `rgb(42, 29, 94)` |
  | column | `920px` (`--width-list`), measured `920 / 920 / 732` |
  | padding | `30px 40px`, and `18px 14px` at ≤760 |
  | h1 | `22px` / `800` / `TITLE_ON_FIELD` `rgb(255,255,255)` — ledger **L-01**, written `text-role-title-on-field`. Not `text-on-dark`: that is `#FBF7F1`, the value L-01 retired |
  | card | radius `18px` (`--radius-doc`, the table shell), `CARD_BORDER`, `CARD_SHADOW`, `SURFACE` |

- [ ] **Step 21: Write the Playwright check — the gate that jsdom cannot be.**
  Create `ui/e2e/users.spec.ts`:
  ```ts
  import { test, expect } from '@playwright/test'
  import { CARD_BORDER, FIELD, SURFACE, TITLE_ON_FIELD, expandPadding, serve, shot, signedIn, visit } from './_harness'

  test('users — six columns on the violet field, at three widths', async ({ page }) => {
    // `signedIn` + `serve`, not a bare `goto`: with nothing intercepted every
    // /api/ request leaves the browser and is answered by the FastAPI container
    // on :8000, and `shot`'s own `expectEveryEndpointStubbed` fails the spec for
    // it. The session must be able to administer users, or this screen refuses.
    await signedIn(page)
    await serve(page, { '/api/users': USERS, '/api/departments': DEPARTMENTS, '/api/pending': [] })
    await visit(page, '/users')

    const width = page.viewportSize()!.width

    // There is no `expectDesign(page, 'users')`: this screen has no `DESIGN` row
    // and is not getting one — it draws no second line, so there is no
    // `[data-body]` to grade and `ScreenDesign.body` is required (Step 20).
    // Its settled numbers are asserted here instead, against the harness's own
    // constants so a re-cut token moves both at once.
    const screen = page.locator('[data-screen]')
    expect(await screen.evaluate((el) => getComputedStyle(el).backgroundColor)).toBe(FIELD)
    const pad = expandPadding(await screen.evaluate((el) => getComputedStyle(el).padding))
    expect([pad.top, pad.left]).toEqual(width > 760 ? ['30px', '40px'] : ['18px', '14px'])
    const col = page.locator('[data-col]')
    expect(await col.evaluate((el) => getComputedStyle(el).maxWidth)).toBe('920px')
    const h1 = page.locator('[data-h1]')
    await expect(h1).toHaveCSS('font-size', '22px')
    await expect(h1).toHaveCSS('font-weight', '800')
    await expect(h1).toHaveCSS('color', TITLE_ON_FIELD)
    const shell = page.locator('[data-card]').first()
    await expect(shell).toHaveCSS('border-radius', '18px')
    await expect(shell).toHaveCSS('border-color', CARD_BORDER)
    await expect(shell).toHaveCSS('background-color', SURFACE)
    const head = page.getByTestId('datatable-head')
    const row = page.getByRole('row').filter({ hasText: 'سحر بیات' })

    if (width > 760) {
      // §6.7 — the exact template, not "six of something".
      await expect(head).toHaveCSS('grid-template-columns', /^16px .+ 34px$/)
      await expect(head).toBeVisible()
      // The users head is the one table head with no fill (§5.2 DataTable).
      await expect(head).toHaveCSS('background-color', 'rgba(0, 0, 0, 0)')
      await expect(head.getByText('دپارتمان')).toHaveCSS('font-size', '11.5px')
      await expect(head.getByText('دپارتمان')).toHaveCSS('color', 'rgb(138, 125, 176)')
    } else {
      // ≤760px: the head goes and the row becomes a flex line at 14px padding,
      // dropping the department and supervisor columns.
      await expect(head).toBeHidden()
      await expect(row).toHaveCSS('display', 'flex')
      await expect(row).toHaveCSS('padding', '14px')
      await expect(row.getByText('صندوق')).toHaveCount(0)
    }

    await expect(page.getByRole('button', { name: 'کاربر جدید' }))
      .toHaveCSS('background-color', 'rgb(250, 90, 82)')
    await expect(page.getByTestId('state-dot').first()).toHaveCSS('width', '9px')
    await expect(page.getByRole('group', { name: 'فیلتر کاربران' }))
      .toHaveCSS('background-color', 'rgb(244, 239, 251)')

    // The row lifts nothing and tints instead (§4.6: `background:#FBF9FE`, .14s).
    await row.hover()
    await expect(row).toHaveCSS('background-color', 'rgb(251, 249, 254)')

    await shot(page, 'users')
  })
  ```

- [ ] **Step 22: Run it at all three widths and watch it fail, then pass.**
  `cd ui && npx playwright test e2e/users.spec.ts`
  Expected first: `3 failed` — typically on `grid-template-columns` or on the
  coral fill if Step 16's `variant="coral"` was missed. Fix, re-run until
  `3 passed (1440, 1080, 760)`. Compare `e2e/__shots__/users-1440.png` against
  `.superpowers/sdd/ui-audit-shots/design-users.png` by eye before committing.
  ```
  git commit ui/e2e/users.spec.ts ui/e2e/__shots__ \
    -m "test(ui): the user table is checked in a browser, at all three widths"
  ```
  `ui/e2e/_harness.ts` is **not** staged: it is frozen and this task did not touch it. Commit
  by pathspec, not `git add` + bare `git commit` — the latter commits the *index*, and another
  agent's staged change has already been swallowed into an unrelated commit that way.

---

### Task 20: `UserDetail` — the Access screen

Four panels at `max-width:820px` (§6.8), not five cards at 920. The back link
points the wrong way and is drawn with a banned unicode glyph (F13); the scope
chip prints the storage key `dept:dining` where the design prints «سالن»; and the
"this account holds more than you do" paragraph is a refusal drawn on screen,
which R5 forbids outright.

**Files**

| Action | Path |
|---|---|
| Modify | `ui/src/screens/UserDetail.tsx` |
| Modify | `ui/src/screens/users.test.tsx` |
| Create | `ui/e2e/user-detail.spec.ts` |

**Files this task must not write**

| Path | Why | What to do instead |
|---|---|---|
| `ui/tailwind.config.js`, `ui/src/styles/tokens.css`, `ui/src/styles/roles.css`, `ui/tailwind-probe.txt` | Frozen between deliberate minting passes, so many tasks can run in one tree without clobbering each other. Unfrozen exactly once, by the single consolidated mint. | A value with no token is not minted here. Stop, and report the value and its role. |
| `ui/e2e/_harness.ts` | Pre-populated and frozen — eleven tasks appending to one file in one tree lose all but the last write, with a green build. | **`access` is already there.** Read it; if it is missing or wrong, stop and report. |
| `docs/superpowers/ui-normalisation-ledger.md` | Maintained by the reviewer at review time. | Report the rows you would add, in your task report. |

**Interfaces**

*Consumes* — `max-w-access` (820px) · `px-screen-x` · `py-screen-y` ·
`rounded-card` (16px) · `rounded-control` (10px) · `rounded-input` (11px) ·
`border-border-current` (#EDE5F5) · `border-border-danger` (#FDD9D6) · `bg-tile-c2` (#FFF3F2) ·
`bg-tile-v2` (#F4EFFB) · `text-violet-on-violet` (#C9BEEE) · `border-hairline` (1.5px) ·
`border-warm` (#EFE7DC) · `shadow-card` · the `max760:` variant (the ≤760 mobile pass — there is no `narrow` screen or utility; both breakpoints are `addVariant`'d as `max1080:`/`max760:`).

```ts
// ui/src/ui/SectionCard.tsx (Task 10)
export function SectionCard(props: { eyebrow: string; tone?: 'tinted' | 'white'
  actions?: ReactNode; children: ReactNode; className?: string }): JSX.Element
// ui/src/ui/Button.tsx (Task 6) — variant now 'coral'|'violet'|'green'|'ghost'|'danger'|'affirm'
// ui/src/ui/Icon.tsx (Task 11) — names used here: 'chevron-back'
// ui/src/ui/Chip.tsx (Task 6) — <Chip kind="scope">, the §5.2 scope-chip skin
```

*Produces* — no new exports. `UserDetail` keeps its default export shape.

---

- [ ] **Step 1: A failing test for the back link's direction and medium.**
  Append to `ui/src/screens/users.test.tsx`:
  ```tsx
  describe('the record screen (§6.8)', () => {
    it('goes back with a drawn chevron, not a unicode arrow pointing away', async () => {
      renderDetail(EDITOR, SAHAR)
      const back = await screen.findByRole('link', { name: 'فهرست کاربران' })
      // §5.2 iconography bans unicode-glyph icons outright; the two sanctioned
      // exceptions are `⣿` and the ICOM arrows, and a back arrow is neither.
      expect(back.textContent).not.toMatch(/[←→]/)
      const svg = back.querySelector('svg')
      expect(svg).not.toBeNull()
      // §8 — "back" is `M9 18l6-6-6-6`: toward the start of the reading
      // direction, which in RTL is rightward. `←` was drawn pointing away from
      // where the link goes.
      expect(svg!.querySelector('path')!.getAttribute('d')).toBe('M9 18l6-6-6-6')
      expect(svg!.getAttribute('stroke-width')).toBe('2.4')
      // F14 — it was a 17px-tall hit target with no hover.
      expect(back).toHaveClass('min-h-touch')
    })
  })
  ```

- [ ] **Step 2: Run it and watch it fail.**
  `cd ui && npx vitest run src/screens/users.test.tsx -t 'drawn chevron'`
  Expected: `FAIL … expected '← فهرست کاربران' not to match /[←→]/`.

- [ ] **Step 3: Draw the back link.**
  In `ui/src/screens/UserDetail.tsx` replace the `<Link to="/users">` block:
  ```tsx
          <Link to="/users"
            className="inline-flex items-center gap-s3 min-h-touch px-s6 rounded-control
                       text-fs-sm2 text-violet no-underline hover:bg-tile-v2
                       transition-colors">
            {/* §8 — chevrons are chosen by hand per direction rather than
                transformed, and "back" is `M9 18l6-6-6-6`. The `←` this replaces
                was two violations in seven characters: a unicode glyph where the
                design specifies inline line SVG, drawn pointing away from the
                screen it returns to. */}
            <Icon name="chevron-back" className="w-s8 h-s8" strokeWidth={2.4} />
            فهرست کاربران
          </Link>
  ```
  Import `Icon` from `../ui/Icon`.

- [ ] **Step 4: Run it and watch it pass, then commit.**
  `cd ui && npx vitest run src/screens/users.test.tsx -t 'drawn chevron'` → `1 passed`.
  ```
  git add ui/src/screens/UserDetail.tsx ui/src/screens/users.test.tsx
  git commit -m "fix(ui): the way back off a record is drawn, and points where it goes"
  ```

- [ ] **Step 5: A failing test for the department's name.**
  Append inside the same `describe`:
  ```tsx
  it('names the department the account reaches, not the key it is stored under', async () => {
    renderDetail(EDITOR, { ...SAHAR, scopes: ['dept:dining', 'dept:cashier/report:steps'] })
    const panel = await screen.findByRole('group', { name: 'نقش و دپارتمان' })
    expect(within(panel).getByText('سالن')).toBeInTheDocument()
    expect(within(panel).getByText('صندوق (فقط راهنمای گام‌به‌گام)')).toBeInTheDocument()
    expect(within(panel).queryByText(/dept:/)).toBeNull()
    // A scope the grammar refuses is quoted rather than prettified away — an
    // account covered by nothing must not read as an account covered by a
    // department (`lib/scopes.ts`, `ParsedScope.refused`).
    renderDetail(EDITOR, { ...SAHAR, scopes: ['nonsense'] })
    expect(await screen.findByText('nonsense')).toBeInTheDocument()
  })
  ```

- [ ] **Step 6: Run it and watch it fail.**
  `cd ui && npx vitest run src/screens/users.test.tsx -t 'names the department'`
  Expected: `FAIL … Unable to find role="group" and name "نقش و دپارتمان"`.

- [ ] **Step 7: Build panel 1 — «نقش و دپارتمان».**
  In `UserDetail.tsx`, replace the single `<Card>` holding the five `Row`s (and
  delete the local `Row` component at the bottom of the file) with:
  ```tsx
          {/* §6.8 panel 1. Read mode is a role chip, a `1px #EFE7DC` vertical
              rule that goes at ≤760px, and the scope chips — every one of them
              at the §5.2 scope-chip skin. The rule is the only thing on the
              panel that says "these are two different kinds of fact", so it is
              drawn rather than left to spacing. */}
          <SectionCard eyebrow="نقش و دپارتمان" aria-label="نقش و دپارتمان">
            <div className="flex items-center gap-s6 flex-wrap">
              <Chip kind="scope">{roleLabel(user.role)}</Chip>
              <span aria-hidden
                className="self-stretch w-px bg-warm max760:hidden" />
              {user.scopes.length === 0
                ? <span className="text-fs-sm2 text-muted">{NO_DEPARTMENT}</span>
                : user.scopes.map((scope) => (
                  <Chip key={scope} kind="scope">{scopeLabel(scope, names)}</Chip>
                ))}
            </div>
          </SectionCard>
  ```
  Add at the top of the component:
  ```tsx
    const { data: departments } = useDepartments()
    const names = Object.fromEntries((departments ?? []).map((d) => [d.code, d.name]))
  ```
  Imports: `useDepartments` from `../api/hooks`, `SectionCard` from
  `../ui/SectionCard`, `Chip` from `../ui/Chip`, `scopeLabel`/`NO_DEPARTMENT`
  from `../lib/scopes`.

- [ ] **Step 8: Run it and watch it pass, then commit.**
  `cd ui && npx vitest run src/screens/users.test.tsx -t 'names the department'` → `1 passed`.
  ```
  git add ui/src/screens/UserDetail.tsx ui/src/screens/users.test.tsx
  git commit -m "fix(ui): a person's departments are named, not spelled in storage keys"
  ```

- [ ] **Step 9: A failing test for R5 — the explanation goes, and so does the control.**
  Append inside the same `describe`:
  ```tsx
  it('draws nothing at all where a viewer may not act, and explains nothing (R5)', async () => {
    // ADMIN holds manage_users without manage_peers, so the subset rule refuses
    // them on an account that holds more — `mayManage` is false.
    renderDetail(ADMIN, { ...SAHAR, capabilities: [...ADMIN.capabilities, 'edit'] })
    expect(await screen.findByRole('heading', { name: 'سحر بیات' })).toBeInTheDocument()
    // The three manage panels are absent — not disabled, not explained.
    expect(screen.queryByRole('button', { name: 'ویرایش' })).toBeNull()
    expect(screen.queryByRole('group', { name: 'گذرواژه' })).toBeNull()
    expect(screen.queryByRole('group', { name: /غیرفعال‌سازی/ })).toBeNull()
    // R5 — "where a control's availability depends on the target rather than the
    // caller, it is still absent rather than explained."
    expect(screen.queryByText(/دسترسی این حساب از دسترسی شما بیشتر است/)).toBeNull()
    // What stays is what everybody may read.
    expect(screen.getByRole('group', { name: 'نقش و دپارتمان' })).toBeInTheDocument()
    expect(screen.getByRole('group', { name: 'سرپرست' })).toBeInTheDocument()
  })

  it('says nothing on your own record either — the profile is in the nav (R5)', async () => {
    renderDetail(EDITOR, { ...SAHAR, username: EDITOR.username })
    await screen.findByRole('heading', { name: 'سحر بیات' })
    expect(screen.queryByText(/حساب خودتان را از این صفحه/)).toBeNull()
    expect(screen.queryByRole('button', { name: 'ویرایش' })).toBeNull()
  })
  ```

- [ ] **Step 10: Run it and watch it fail.**
  `cd ui && npx vitest run src/screens/users.test.tsx -t 'explains nothing'`
  Expected: `FAIL … expected null not to be null` on the
  «دسترسی این حساب از دسترسی شما بیشتر است» query.

- [ ] **Step 11: Delete the refusal prose and the branch that held it.**
  In `UserDetail.tsx` replace `{manageable ? ( … ) : ( <p …>{mine ? … : …}</p> )}`
  with `{manageable && ( … )}` and delete the `<p>` entirely, together with the
  now-unused `mine` binding. Above the change, record why:
  ```tsx
        {/* R5 — never draw what you would refuse. The two sentences that stood
            here explained, to somebody who could do nothing about either, why
            three panels were missing: "this account holds more than you do" and
            "you cannot edit yourself". The design's Access screen states the
            same rule structurally — "Actions (only when the viewer may manage
            this user)" — and shows nothing where they are absent. The one that
            was useful, "change your own password on the profile", is a
            destination and not a refusal, and `PanelShell` carries «نمایه» in
            the nav on every screen; a sentence here was a second, worse route to
            a link that is already on the page. */}
  ```

- [ ] **Step 12: Run it and watch it pass, then commit.**
  `cd ui && npx vitest run src/screens/users.test.tsx` → all green.
  ```
  git add ui/src/screens/UserDetail.tsx ui/src/screens/users.test.tsx
  git commit -m "fix(ui): a control you may not use is gone, not explained"
  ```

- [ ] **Step 13: A failing test for panels 2–4.**
  Append inside the same `describe`:
  ```tsx
  it('stacks the design\'s four panels, in order, with the danger card last', async () => {
    renderDetail(EDITOR, {
      ...SAHAR,
      supervisor: { id: 21, username: '09123333333', displayName: 'مریم رستمی', disabled: true },
    })
    const groups = await screen.findAllByRole('group')
    expect(groups.map((g) => g.getAttribute('aria-label')))
      .toEqual(['نقش و دپارتمان', 'سرپرست', 'گذرواژه', 'غیرفعال‌سازی کاربر'])
    const sup = screen.getByRole('group', { name: 'سرپرست' })
    expect(within(sup).getByText('مریم رستمی')).toBeInTheDocument()
    expect(within(sup).getByText(
      'این سرپرست غیرفعال است — کامنت‌های این کاربر یک پله بالاتر می‌روند.')).toBeInTheDocument()
    expect(within(sup).getByRole('button', { name: 'تغییر سرپرست' })).toBeInTheDocument()
    expect(within(screen.getByRole('group', { name: 'گذرواژه' }))
      .getByRole('heading', { name: 'بازنشانی گذرواژهٔ سحر بیات' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'غیرفعال‌سازی کاربر' }))
      .toHaveClass('bg-tile-c2', 'text-conflict')
  })
  ```

- [ ] **Step 14: Run it and watch it fail.**
  `cd ui && npx vitest run src/screens/users.test.tsx -t "four panels"`
  Expected: `FAIL … expected [ 'نقش و دپارتمان' ] to deeply equal [ … 4 items ]`.

- [ ] **Step 15: Build panel 2 — «سرپرست».**
  ```tsx
            <SectionCard eyebrow="سرپرست" aria-label="سرپرست"
              actions={
                // §6.8 gives this the row-action size: 10px 15px / 12.5px /
                // radius 11. It opens the one editing surface this app has —
                // §6.9's dedicated change-supervisor modal has no counterpart
                // here, and `EditUserDialog` owns the edge, the scopes and the
                // re-validation that binds them (see the ledger).
                <Button variant="ghost" className="px-s6 py-s5 text-fs-sm2 rounded-input"
                  onClick={() => setEditing(true)}>
                  تغییر سرپرست
                </Button>
              }>
              <p className="text-fs-menu font-bold text-ink m-0">
                {user.supervisor ? user.supervisor.displayName : 'سرپرستی ندارد'}
              </p>
              {user.supervisor?.disabled && (
                <p className="text-fs-xs font-semibold text-conflict mt-s3 m-0">
                  این سرپرست غیرفعال است — کامنت‌های این کاربر یک پله بالاتر می‌روند.
                </p>
              )}
              {/* D51 — an org-chart fact and not a capability, said in the
                  design's own rule-statement register (11.5px, faint, lh 1.7)
                  rather than as another body paragraph. */}
              <p className="text-fs-xs text-faint leading-normal mt-s4 m-0">
                سرپرست جایگاهی در نمودار سازمانی است، تأیید نظرها را مسیر می‌دهد و هیچ
                دسترسی‌ای نمی‌دهد.
                {user.canSupervise
                  ? ' این کاربر خودش می‌تواند سرپرست دیگران باشد.'
                  : ' این کاربر سرپرست کسی نمی‌شود.'}
              </p>
            </SectionCard>
  ```

- [ ] **Step 16: Build panel 3 — «گذرواژه» — on what this app can actually do.**
  §6.8 specifies a white card and a violet primary «ساختن لینک بازنشانی», with
  body copy stating that no password is ever created or shown. **This product has
  no reset link** (D15: `POST /api/users/{id}/password` sets a value the
  administrator chooses and tells the person). The shell, the type sizes and the
  button role are the design's; the copy and the control are the app's, because
  R5 forbids drawing a button for a route that does not exist.
  ```tsx
            <SectionCard eyebrow="گذرواژه" tone="white" aria-label="گذرواژه">
              <h2 className="text-fs-menu font-extrabold text-ink m-0">
                بازنشانی گذرواژهٔ {user.displayName}
              </h2>
              <p className="text-fs-sm text-muted leading-loose max-w-prose mt-s3 m-0">
                گذرواژهٔ تازه را خودتان انتخاب می‌کنید و به این شخص می‌گویید؛ پیوند
                بازیابی‌ای در کار نیست. با ثبت آن، همهٔ نشست‌های باز این کاربر بسته
                می‌شود.
              </p>
              <div className="flex items-end gap-s5 flex-wrap mt-s8 max760:flex-col
                              max760:items-stretch">
                <PasswordField id={passwordId} label="گذرواژهٔ تازه" value={password}
                  onChange={setPasswordValue} autoComplete="new-password"
                  className="flex-1 min-w-0"
                  invalid={tooShort} hint={tooShort ? TOO_SHORT : undefined} />
                <Button variant="violet" className="px-s8 py-s5 text-fs-sm rounded-button"
                  loading={setPassword.isPending} loadingLabel="در حال ثبت…"
                  onClick={submitPassword}>
                  ثبت گذرواژه
                </Button>
              </div>
              {setPassword.error && (
                <p role="alert" className="text-fs-xs font-semibold text-conflict mt-s5 m-0">
                  {refusalText(setPassword.error)}
                </p>
              )}
              {setPassword.isSuccess && !tooShort && (
                <p role="status" className="text-fs-xs font-semibold text-green mt-s5 m-0">
                  گذرواژهٔ تازه ثبت شد؛ آن را به این شخص بگویید. همهٔ نشست‌های این کاربر
                  بسته شد.
                </p>
              )}
            </SectionCard>
  ```
  `passwordId` comes from `useId()`; `PasswordField` from `../ui/PasswordField`.
  The bare `<input>` and its wrapping label go — that was the fourth of four
  labelled-input implementations (F16/F35), and the only one with no `htmlFor`.

- [ ] **Step 17: Build panel 4 — the danger card.**
  ```tsx
            {/* §6.8 panel 4: white, `1px #FDD9D6`, radius 16, padding 18, with a
                destructive-ghost carrying the same label as the heading. The
                heading is the only `#E23D35` title in the app and it is what
                makes the card readable as a boundary rather than a fourth
                section. */}
            <div role="group" aria-label="غیرفعال‌سازی کاربر"
              className="bg-card border border-border-danger rounded-card p-s9 mb-s7">
              <h2 className="text-fs-menu font-extrabold text-conflict m-0">
                {user.disabled ? 'فعال‌سازی کاربر' : 'غیرفعال‌سازی کاربر'}
              </h2>
              <p className="text-fs-sm text-muted leading-loose max-w-prose mt-s3 m-0">
                غیرفعال کردن یک حساب همهٔ نشست‌های آن را می‌بندد. شمارهٔ کاربر نزد خودش
                می‌ماند و به کس دیگری داده نمی‌شود.
              </p>
              <div className="mt-s8">
                <Button variant={user.disabled ? 'affirm' : 'danger'}
                  className="px-s8 py-s5 text-fs-sm rounded-button"
                  loading={setDisabled.isPending} loadingLabel="در حال ثبت…"
                  onClick={() => setDisabled.mutate(!user.disabled)}>
                  {user.disabled ? 'فعال‌سازی کاربر' : 'غیرفعال‌سازی کاربر'}
                </Button>
              </div>
              {setDisabled.error && (
                <p role="alert" className="text-fs-xs font-semibold text-conflict mt-s5 m-0">
                  {refusalText(setDisabled.error)}
                </p>
              )}
            </div>
  ```

- [ ] **Step 18: Rewrite the header and the frame.**
  Replace the screen's outer wrapper and title block:
  ```tsx
      <div className="flex-1 overflow-auto py-screen-y px-screen-x max760:px-s7 max760:py-s9">
        <div className="max-w-access mx-auto">
          {/* back link — Step 3 */}
          <div className="flex items-start justify-between gap-s6 flex-wrap mt-s5">
            <div>
              <h1 className="text-title font-extrabold text-role-title-on-field m-0">{user.displayName}</h1>
              {/* §6.8 — the username is a latin run on a violet field: mono,
                  `#C9BEEE`, pinned `ltr`, aligned to the start. It was absent
                  from this screen entirely. */}
              <span dir="ltr" className="block text-fs-sm2 font-mono text-violet-on-violet
                                         text-start mt-s2">
                {user.username}
              </span>
            </div>
            {manageable && (
              <Button variant="violet" className="px-s8 py-s5 text-fs-sm rounded-button"
                onClick={() => setEditing(true)}>
                ویرایش
              </Button>
            )}
          </div>

          <div className="mt-s8">
            {/* panels 1–4 */}
          </div>
        </div>
      </div>
  ```
  Each `SectionCard` carries `className="mb-s7"` (§6.8: `margin-bottom:14px`).
  The `StatusPill` beside the name goes — §6.8 has no pill here, and the
  disabled state is the danger card's whole subject.

- [ ] **Step 19: Run the suite and watch it pass.**
  `cd ui && npx vitest run src/screens/users.test.tsx` → all green.
  `npx tsc -b && npx eslint .` → clean.
  ```
  git add ui/src/screens/UserDetail.tsx ui/src/screens/users.test.tsx
  git commit -m "feat(ui): a person's record becomes four panels, and says only what it can do"
  ```

- [ ] **Step 20: Report the three divergences. Do not write them into the ledger.**
  `docs/superpowers/ui-normalisation-ledger.md` is maintained by the reviewer at review time,
  for the same one-file-many-writers reason the harness table is frozen. **Put the block below
  in your task report, under "the ledger rows this task would add"; do not open the ledger.**
  ```md
  ## Access (§6.8) — three places the design describes a product we do not have

  | # | Design (S1 §6.8/§6.9) | Built | Why |
  |---|---|---|---|
  | A1 | Panel 3 is «ساختن لینک بازنشانی» and states that no password is ever created or shown | A password field + «ثبت گذرواژه», stating that the administrator chooses the value and tells the person | There is no reset-link route. `POST /api/users/{id}/password` sets a chosen value (D15). R5: a button for a route that does not exist is a control that answers 404. **Owner question.** |
  | A2 | Panel 1's edit mode is inline (role Dropdown + department tile grid) and §6.9 is a dedicated change-supervisor modal | Both open `EditUserDialog` | The edge and the scopes are re-validated together on the server (`supervisor_id != … or scopes != before_scopes`), so a modal that moves one without the other would be refused. One editing surface, one diff. **Owner question.** |
  | A3 | The self-account and over-scope cases are explained in prose | Absent, with nothing in their place | R5. The design shows actions "only when the viewer may manage this user" and says nothing otherwise; «نمایه» is in the shell nav on every screen. |
  ```
  Nothing is staged or committed by this step.

- [ ] **Step 21: Prove every class this screen writes emits.**
  ```bash
  cd ui && npx vite build
  node scripts/harvest-classes.mjs src/screens/UserDetail.tsx
  ```
  Expected: the run ends `DEAD 0   EMPTY 0   NOVAR 0`, both controls hold
  (`control (negative): N/N invented names reported dead` and
  `control (escaping): … escaped variant classes unescaped`), and the last line
  is `PASS`. The script exits 1 on any failure, so it can be `&&`-chained.
  The class list is **harvested out of these files**, never hand-kept, so it
  cannot drift from what they write and `tailwind-probe.txt` cannot certify it
  on their behalf — see *The class-emission check* in Global Constraints for the
  measurement that retired the old grep.

  **A failure.** `DEAD` — the class compiled to no rule at all; that is a **typo
  in the component**, so fix the class string, rebuild, re-run. `EMPTY` — the
  selector emitted with an empty body, so the theme key resolves to nothing.
  `NOVAR` — the rule reads a `var(--…)` nothing declares. The last two are theme
  regressions: **stop and report them.** Do **not** add the name to
  `ui/tailwind.config.js`, `src/styles/tokens.css`, `src/styles/roles.css` or
  `tailwind-probe.txt`. All four are frozen for the duration of this plan and
  were unfrozen exactly once, by the single minting pass in
  `.superpowers/sdd/mint-spec.md`; minting one here to make a misspelling compile
  recreates the unreachable-token problem the whole rebuild exists to fix. A
  value that genuinely has no name goes into `mint-spec.md`, not into the config
  and not into this task's commit.

  **What this step cannot prove:** that these files write a class and that the
  class compiles to a rule with declarations, yes. That the class reaches the
  right element, that the element renders, that it is visible, or that its value
  is the one the design asks for — no. That stays with the Playwright checks.

- [ ] **Step 22: Read the `access` row the harness already holds. Do not write one.**
  This step used to say *"add `access` to the harness table"*, in field names (`maxWidth`,
  `padX`, `padY`) that `ScreenDesign` does not have. **`ui/e2e/_harness.ts` is frozen and the
  row is already in it** — eleven screen tasks each appending to one file in one working tree
  means the later write silently clobbers the earlier one, with a green build, so the table
  was filled in ahead of the screens (`3dda9ef`).

  ```bash
  cd ui && node -e "const s=require('fs').readFileSync('e2e/_harness.ts','utf8');console.log('access:', s.includes('  access:')?'present':'MISSING')"
  ```

  Read it, and note the one thing about it that is easy to build wrong:

  ```ts
  body: { size: '12.5px', color: SUBTITLE_ON_FIELD, family: FONT_MONO, align: 'start' },
  direction: { body: 'ltr' },
  ```

  The screen's only second line is the mono username, `<span dir="ltr">` — an ordinary and
  correct latin island inside a Persian form. `direction` is stated **per hook** for exactly
  this: it says `ltr` about the one hook it is true of, while the column, the title and the
  card are still held to `rtl`, so a mirrored page cannot pass by claiming this exemption.
  `family` is ledger **L-21**'s token stack, measured through the app's own `font-mono` class
  — the deliverable's `'JetBrains Mono'` first choice is never loaded and falls through.
  `h1.color` is `TITLE_ON_FIELD`, white (L-01), which is what the JSX above writes —
  `text-role-title-on-field`, not `text-on-dark` (`#FBF7F1`, the value L-01 retired).

  **If the row is missing, or a number in it disagrees with §6.8, stop and report it** — do
  not add a row and do not edit one.

- [ ] **Step 23: Write the Playwright check.**
  Create `ui/e2e/user-detail.spec.ts`:
  ```ts
  import { test, expect } from '@playwright/test'
  import { expectDesign, serve, shot, signedIn, visit } from './_harness'

  test('access — four panels at 820, and no glyph arrows', async ({ page }) => {
    // `signedIn` + `serve`, not a bare `goto`: with nothing intercepted every
    // /api/ request leaves the browser and is answered by the FastAPI container
    // on :8000, and `expectDesign` fails the spec for it.
    await signedIn(page)
    await serve(page, { '/api/users': USERS, '/api/departments': DEPARTMENTS, '/api/pending': [] })
    await visit(page, '/users/2', 'access')
    await expectDesign(page, 'access')

    const back = page.getByRole('link', { name: 'فهرست کاربران' })
    const box = (await back.boundingBox())!
    expect(box.height).toBeGreaterThanOrEqual(44)
    await expect(back.locator('svg')).toBeVisible()

    await expect(page.getByRole('group')).toHaveCount(3)   // + the danger card below
    const scope = page.getByRole('group', { name: 'نقش و دپارتمان' }).getByText('سالن')
    await expect(scope).toHaveCSS('font-size', '12.5px')
    await expect(scope).toHaveCSS('font-weight', '600')
    await expect(scope).toHaveCSS('background-color', 'rgb(244, 239, 251)')
    await expect(scope).toHaveCSS('border-radius', '10px')

    const danger = page.getByRole('group', { name: 'غیرفعال‌سازی کاربر' })
    await expect(danger).toHaveCSS('border-color', 'rgb(253, 217, 214)')
    await expect(danger.getByRole('button')).toHaveCSS('color', 'rgb(226, 61, 53)')

    // §6.8 — the vertical rule between the role chip and the scope chips is the
    // one thing that goes at ≤760px.
    const rule = page.getByRole('group', { name: 'نقش و دپارتمان' }).locator('[aria-hidden]')
    if (page.viewportSize()!.width <= 760) await expect(rule).toBeHidden()
    else await expect(rule).toBeVisible()

    await shot(page, 'user-detail')
  })
  ```

- [ ] **Step 24: Run it at three widths, fix, commit.**
  `cd ui && npx playwright test e2e/user-detail.spec.ts` → `3 passed`.
  Compare `e2e/__shots__/user-detail-1440.png` against
  `.superpowers/sdd/ui-audit-shots/design-user-detail.png`.
  ```
  git commit ui/e2e/user-detail.spec.ts ui/e2e/__shots__ \
    -m "test(ui): the record screen is checked in a browser, at all three widths"
  ```
  `ui/e2e/_harness.ts` is **not** staged: it is frozen and this task did not touch it. Commit
  by pathspec, not `git add` + bare `git commit` — the latter commits the *index*, and another
  agent's staged change has already been swallowed into an unrelated commit that way.

---

### Task 21: the dialogs — `NewUserDialog`, `EditUserDialog`, `UserFields`, `SupervisorPicker`

The new-user dialog is **2207px of content in an 850px box** with «ساخت کاربر»
below the fold (F37/F42); the design's is ~520 × 520 (§6.14). The cause is one
control: a 29-checkbox scope tree that occupies ~80 % of the height where the
design has a nine-tile 2-column grid. On a failed read the dialog renders
`LoadFailedScreen` — a full-page component with `max-w-list` and a `Card p-8`
inside a box that already has `p-6`: 86px of padding before the first word, a
card inside a card, and it reads as a rendering fault (F34/F40).

**Files**

| Action | Path |
|---|---|
| Create | `ui/src/screens/UserDialogShell.tsx` |
| Create | `ui/src/screens/ScopePicker.tsx` |
| Create | `ui/src/screens/ScopePicker.test.tsx` |
| Modify | `ui/src/screens/UserFields.tsx` |
| Modify | `ui/src/screens/SupervisorPicker.tsx` |
| Modify | `ui/src/screens/NewUserDialog.tsx` |
| Modify | `ui/src/screens/EditUserDialog.tsx` |
| Modify | `ui/src/screens/NewUserDialog.test.tsx` |
| Modify | `ui/src/screens/EditUserDialog.test.tsx` |
| Modify | `ui/src/screens/SupervisorPicker.test.tsx` |
| Create | `ui/e2e/user-dialog.spec.ts` |

**Files this task must not write**

| Path | Why | What to do instead |
|---|---|---|
| `ui/tailwind.config.js`, `ui/src/styles/tokens.css`, `ui/src/styles/roles.css`, `ui/tailwind-probe.txt` | Frozen between deliberate minting passes, so many tasks can run in one tree without clobbering each other. Unfrozen exactly once, by the single consolidated mint. | A value with no token is not minted here. Stop, and report the value and its role. |
| `ui/e2e/_harness.ts` | Pre-populated and frozen — eleven tasks appending to one file in one tree lose all but the last write, with a green build. | **A dialog is not a `[data-screen]` region and gets no `DESIGN` row at all** — Step 23 says why. `user-dialog.spec.ts` asserts the dialog's numbers, which is where they already were. |
| `docs/superpowers/ui-normalisation-ledger.md` | Maintained by the reviewer at review time. | Report the rows you would add, in your task report. |

**Interfaces**

*Consumes* — `bg-surface-sub` (#FBF9FE) · `border-border-current` (#EDE5F5) ·
`border-line-dashed` (#C9B8EC) · `bg-tile-v4` (#F8F4FE) · `bg-tile-v` (#F0E9FB) ·
`border-warm` (#EFE7DC) · `rounded-panel` (24px) · `rounded-card` (16px) ·
`rounded-button` (12px) · `rounded-tile` (14px) · `w-glyph h-glyph` (15px) ·
`w-tool h-tool` (34px) · `shadow-modal` (S1's two-layer dialog shadow) ·
the `max760:` variant (the ≤760 mobile pass — there is no `narrow` screen or utility; both breakpoints are `addVariant`'d as `max1080:`/`max760:`).

```ts
// ui/src/ui/Overlay.tsx (Task 6) — Dialog gained width, subtitle, footer, and a
// three-part flex column: header flex:none, body flex:1 overflow-auto, footer flex:none.
export function Dialog(props: { open: boolean; onClose: () => void; title: string
  subtitle?: string; width?: 440 | 460 | 520 | 540 | 640; footer?: ReactNode
  children: ReactNode }): JSX.Element
// ui/src/ui/TextField.tsx, PasswordField.tsx (Task 7)
export function TextField(props: { id: string; label: string; value: string
  onChange: (v: string) => void; placeholder?: string; dir?: 'ltr'; mono?: boolean
  type?: string; inputMode?: string; autoComplete?: string; hint?: string
  invalid?: boolean; className?: string }): JSX.Element
// PasswordField = TextField + the §5.2 reveal button (32×32 at left:8px, 17×17 eye)
// ui/src/ui/Checkbox.tsx (Task 8)
export function Checkbox(props: { checked: boolean; onChange: (on: boolean) => void
  label: ReactNode; hint?: ReactNode; box?: 16 | 17 | 18 | 19
  tone?: 'violet' | 'green'; 'aria-label'?: string; disabled?: boolean }): JSX.Element
// ui/src/ui/Dropdown.tsx (Task 8) — as Task 19, plus `nested?: ReactNode` for the views popover
// ui/src/ui/states (Task 6) — ErrorState gained `inline`, the §5.2 inline EmptyState shape
export function ErrorState(props: { message: string; onRetry?: () => void; inline?: boolean }): JSX.Element
```

*Produces*
```ts
// ui/src/screens/UserDialogShell.tsx
export function UserDialogShell(props: {
  open: boolean; onClose: () => void; title: string; submitLabel: string
  submitting: boolean; alert?: string; failure?: { message: string; error: unknown }
  onRetry: () => void; onSubmit: (e: FormEvent) => void; children: ReactNode }): JSX.Element
// ui/src/screens/ScopePicker.tsx
export function ScopePicker(props: { scopes: string[]; onChange: (next: string[]) => void }): JSX.Element
export const EVERY_NOTE: string
export const SUPERVISE_NOTE: string
```

---

- [ ] **Step 1: A failing test for the dialog shell — the footer must not scroll away.**
  Append to `ui/src/screens/NewUserDialog.test.tsx`:
  ```tsx
  describe('the dialog shell (§5.2 Modal, §6.14)', () => {
    it('pins the header and the footer and scrolls only the body', async () => {
      openNewUserDialog()
      const dialog = await screen.findByRole('dialog', { name: 'کاربر جدید' })
      expect(dialog).toHaveClass('flex', 'flex-col')
      expect(within(dialog).getByTestId('dialog-body')).toHaveClass('flex-1', 'overflow-auto')
      const footer = within(dialog).getByTestId('dialog-footer')
      expect(footer).toHaveClass('flex-none')
      // §5.2 — "a footer of two equal-width buttons".
      const buttons = within(footer).getAllByRole('button')
      expect(buttons.map((b) => b.textContent)).toEqual(['ایجاد کاربر', 'انصراف'])
      buttons.forEach((b) => expect(b).toHaveClass('flex-1'))
    })

    it('reports a failed read inside the box, not as a page folded into it', async () => {
      openNewUserDialog({ rolesStatus: 500 })
      const dialog = await screen.findByRole('dialog', { name: 'کاربر جدید' })
      // F34 — `LoadFailedScreen` is `py-s12 px-s12` + `max-w-list` + `Card p-8`
      // inside a box that already has its own padding: 86px before the first
      // word, in a 512px-wide box, sharing the dialog's own shadow and border.
      expect(dialog.querySelector('.max-w-list')).toBeNull()
      expect(within(dialog).getByRole('alert')).toHaveTextContent(/بارگذاری نشد/)
      expect(within(dialog).getByRole('button', { name: 'تلاش دوباره' })).toBeInTheDocument()
      // The form is not drawn behind a failed read, and neither is the footer:
      // there is nothing to submit.
      expect(within(dialog).queryByTestId('dialog-footer')).toBeNull()
    })
  })
  ```

- [ ] **Step 2: Run it and watch it fail.**
  `cd ui && npx vitest run src/screens/NewUserDialog.test.tsx -t 'dialog shell'`
  Expected: `FAIL … expected element to have class "flex-col"`.

- [ ] **Step 3: Write the shared shell.**
  Create `ui/src/screens/UserDialogShell.tsx`:
  ```tsx
  import { type FormEvent, type ReactNode } from 'react'
  import { Button } from '../ui/Button'
  import { Dialog } from '../ui/Overlay'
  import { ErrorState } from '../ui/states'

  /**
   * The skeleton both user dialogs are, written once (F44).
   *
   * They were the same thirty lines twice — `Dialog` → `form.flex-col.gap-s8` →
   * `UserFields` → optional alert → action row — plus the same twelve-line
   * `readFailure` block twice. Any fix to the footer, the failure surface or the
   * shape had to be applied in both, which is how two dialogs come to disagree
   * about what a dialog is.
   *
   * **The failure surface is `ErrorState inline`, not `LoadFailedScreen`.** The
   * latter is a *page*: a 30px screen gutter, a 920px column that can never
   * reach its width inside 520, and a bordered, shadowed card inside a bordered,
   * shadowed dialog. §5.2's inline EmptyState — `text-align:center;
   * padding:44px 20px; 13px; #a99fc4` — is the shape a modal has for this.
   *
   * **The footer does not scroll.** §5.2's `Modal` is a flex column with a
   * `flex:none` header and footer and a scrolling body; `Overlay` used to scroll
   * everything, so on a real registry the title left the top of the box and the
   * submit button sat thousands of pixels down (F37).
   */
  export function UserDialogShell({
    open, onClose, title, submitLabel, submitting, alert, failure, onRetry,
    onSubmit, children,
  }: {
    open: boolean
    onClose: () => void
    title: string
    submitLabel: string
    submitting: boolean
    alert?: string
    /** A read that produced neither data nor a refusal. The form is not drawn
     *  over one: three lists that did not arrive make three false claims. */
    failure?: { message: string; error: unknown }
    onRetry: () => void
    onSubmit: (e: FormEvent) => void
    children: ReactNode
  }) {
    if (failure) {
      return (
        <Dialog open={open} onClose={onClose} title={title} width={520}>
          <ErrorState inline message={failure.message} onRetry={onRetry} />
        </Dialog>
      )
    }
    return (
      <Dialog open={open} onClose={onClose} title={title} width={520}
        footer={
          <div data-testid="dialog-footer" className="flex-none flex gap-s5 pt-s8">
            {/* §5.2 — two equal-width buttons at `padding:13px; radius 12px;
                13.5px/700`. §6.14 keeps the *commit* violet; coral is the
                new-affordance role and it is spent on «کاربر جدید», the control
                that opened this box (see the ledger). */}
            <Button type="submit" form="user-dialog-form" variant="violet"
              className="flex-1 py-s6 text-fs-menu rounded-button"
              loading={submitting} loadingLabel="در حال ثبت…">
              {submitLabel}
            </Button>
            <Button type="button" variant="ghost"
              className="flex-1 py-s6 text-fs-menu rounded-button" onClick={onClose}>
              انصراف
            </Button>
          </div>
        }>
        <form id="user-dialog-form" onSubmit={onSubmit}
          className="flex flex-col gap-s6">
          {children}
          {alert && (
            // §4.6 — "Errors are stated in copy: a `11.5px/600 #E23D35` line
            // under the offending control." role="alert" because this text
            // appears after the press that caused it.
            <p role="alert" className="text-fs-xs font-semibold text-conflict m-0">
              {alert}
            </p>
          )}
        </form>
      </Dialog>
    )
  }
  ```

- [ ] **Step 4: Run it and watch it pass.**
  Point both dialogs at it first (Step 20 finishes the wiring); for now change
  only `NewUserDialog.tsx`'s return to `<UserDialogShell …>` around the existing
  `<UserFields>` and password block, deleting its `readFailure` `<Dialog>` branch
  and its action row. Then:
  `cd ui && npx vitest run src/screens/NewUserDialog.test.tsx -t 'dialog shell'` → `2 passed`.
  ```
  git add ui/src/screens/UserDialogShell.tsx ui/src/screens/NewUserDialog.tsx \
          ui/src/screens/NewUserDialog.test.tsx
  git commit -m "fix(ui): the dialog keeps its footer on screen and its failure inside the box"
  ```

- [ ] **Step 5: A failing test for the scope picker's grammar.**
  The 29 checkboxes go; the grammar they expressed does not. Create
  `ui/src/screens/ScopePicker.test.tsx`:
  ```tsx
  import { describe, it, expect, vi } from 'vitest'
  import { render, screen, within } from '@testing-library/react'
  import userEvent from '@testing-library/user-event'
  import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
  import { ScopePicker } from './ScopePicker'

  const DEPTS = [{ code: 'dining', name: 'سالن' }, { code: 'cashier', name: 'صندوق' }]

  function draw(scopes: string[]) {
    const onChange = vi.fn()
    vi.stubGlobal('fetch', vi.fn(async () =>
      new Response(JSON.stringify(DEPTS), { headers: { 'Content-Type': 'application/json' } })))
    render(
      <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
        <ScopePicker scopes={scopes} onChange={onChange} />
      </QueryClientProvider>)
    return onChange
  }

  describe('ScopePicker', () => {
    it('draws one tile per department, not three checkboxes per department', async () => {
      draw([])
      const grid = await screen.findByRole('group', { name: 'دپارتمان' })
      expect(within(grid).getAllByRole('checkbox')).toHaveLength(2)
      expect(within(grid).getByRole('checkbox', { name: 'سالن' })).toBeInTheDocument()
    })

    it('widening removes `*` and every narrowing of the same department', async () => {
      const onChange = draw(['*', 'dept:dining/report:steps'])
      await userEvent.click(await screen.findByRole('checkbox', { name: 'سالن' }))
      expect(onChange).toHaveBeenCalledWith(['dept:dining'])
    })

    it('a report drops the whole-department grant and keeps its siblings', async () => {
      const onChange = draw(['dept:dining', 'dept:dining/report:flowchart'])
      await userEvent.click(await screen.findByRole('button', { name: /نماها/ }))
      await userEvent.click(await screen.findByRole('checkbox', { name: 'راهنمای گام‌به‌گام' }))
      expect(onChange).toHaveBeenCalledWith(
        ['dept:dining/report:flowchart', 'dept:dining/report:steps'])
    })

    it('«کل سامانه» clears the tiles and dims the grid rather than hiding it', async () => {
      const onChange = draw(['dept:dining'])
      await userEvent.click(await screen.findByRole('checkbox', { name: 'کل سامانه' }))
      expect(onChange).toHaveBeenCalledWith(['*'])
      // R5's neighbour: §6.8 dims the grid by opacity when "whole system" is on.
      // Hidden, an administrator cannot see what they are about to widen past.
      draw(['*'])
      expect(await screen.findByRole('group', { name: 'دپارتمان' }))
        .toHaveAttribute('data-dimmed', 'true')
    })

    it('keeps a scope it can draw no control for, and says so', async () => {
      draw(['dept:gone', 'nonsense'])
      expect(await screen.findByText(/این دامنه‌ها را این فرم نمی‌تواند نشان دهد/))
        .toBeInTheDocument()
    })
  })
  ```

- [ ] **Step 6: Run it and watch it fail.**
  `cd ui && npx vitest run src/screens/ScopePicker.test.tsx`
  Expected: `FAIL … Failed to resolve import "./ScopePicker"`.

- [ ] **Step 7: Write the scope picker.**
  Create `ui/src/screens/ScopePicker.tsx`:
  ```tsx
  import { useState } from 'react'
  import { useDepartments } from '../api/hooks'
  import { Checkbox } from '../ui/Checkbox'
  import { DeptGlyph } from '../ui/icons/dept'
  import { Icon } from '../ui/Icon'
  import {
    EVERY_DEPARTMENT, REPORT_KINDS, REPORT_KIND_LABELS, parseScope, reportLabel, scopeLabel,
  } from '../lib/scopes'
  import { UNDRAWABLE_SCOPES } from './UserFields'

  export const EVERY_NOTE = 'همهٔ دپارتمان‌ها، و هر دپارتمانی که بعداً ساخته شود.'

  /**
   * Which departments an account reaches, drawn as §6.8's tile grid.
   *
   * **This is the whole reason the dialog was 2207px tall.** The grammar has
   * three shapes — `*`, `dept:{code}`, `dept:{code}/report:{kind}` — and the old
   * form gave every one of them a stacked 44px checkbox row: 1 + 9 + 18 = 28
   * rows, ~1300px, roughly 80 % of the box. The design expresses the same three
   * shapes in a `repeat(2,1fr)` grid of nine 44px tiles (~250px) with the report
   * level behind a per-tile «نماها» popover — the nested view menu of §6.8,
   * z-index 39.
   *
   * Nothing about the grammar itself moved: widening still removes `*` and every
   * narrowing of the same department, a narrowing still drops the whole-department
   * grant, and a scope this form can draw no control for is still kept, sent back
   * unchanged, and named out loud.
   */
  export function ScopePicker({ scopes, onChange }: {
    scopes: string[]
    onChange: (next: string[]) => void
  }) {
    const departments = useDepartments()
    const [openViews, setOpenViews] = useState<string | null>(null)
    const every = scopes.includes('*')
    const list = departments.data ?? []
    const names = Object.fromEntries(list.map((d) => [d.code, d.name]))

    function toggleEverything(on: boolean) {
      // Turning it off leaves nothing behind rather than reviving whatever was
      // ticked before it: those boxes were cleared when it went on, and bringing
      // them back would grant departments nobody re-read.
      onChange(on ? ['*'] : [])
    }

    function toggleDepartment(code: string, on: boolean) {
      const whole = `dept:${code}`
      if (!on) { onChange(scopes.filter((s) => s !== whole)); return }
      const narrower = `${whole}/report:`
      onChange([...scopes.filter((s) =>
        s !== '*' && s !== whole && !s.startsWith(narrower)), whole].sort())
    }

    function toggleReport(code: string, kind: string, on: boolean) {
      const scope = `dept:${code}/report:${kind}`
      if (!on) { onChange(scopes.filter((s) => s !== scope)); return }
      const whole = `dept:${code}`
      onChange([...scopes.filter((s) =>
        s !== '*' && s !== whole && s !== scope), scope].sort())
    }

    // `isPending`, not `data === undefined`: in flight, every department scope is
    // "one this form draws no control for" and the notice would flash on a
    // perfectly ordinary account. A read that *failed* has the same undefined
    // data and the opposite meaning.
    const undrawable = departments.isPending ? [] : scopes.filter((s) => {
      const p = parseScope(s)
      if (p.shape === 'every') return false
      if (p.shape === 'refused') return true
      if (!(p.code in names)) return true
      return p.shape === 'report' && reportLabel(p.report) === undefined
    })

    return (
      <div className="flex flex-col gap-s5">
        <Checkbox box={18} tone="violet" checked={every} onChange={toggleEverything}
          label="کل سامانه" hint={EVERY_NOTE} />

        <div role="group" aria-label="دپارتمان" data-dimmed={every ? 'true' : 'false'}
          className={`grid grid-cols-2 gap-s4 max760:grid-cols-1
                      ${every ? 'opacity-40 pointer-events-none' : ''}`}>
          {list.map((d) => {
            const on = scopes.includes(`dept:${d.code}`)
            return (
              <div key={d.code} className="relative">
                {/* §6.8 tile: 11px 12px / radius 12 / 1.5px {on:#C9B8EC|off:#EFE7DC}
                    on {on:#F8F4FE|off:#fff}, a 17×17 tick, a 15×15 department
                    glyph in that department's own fixed accent, a 13px/600 label. */}
                <label className={`flex items-center gap-s5 min-h-touch px-s6 py-s5
                                   rounded-button border-hairline cursor-pointer
                                   transition-colors
                                   ${on ? 'border-line-dashed bg-tile-v4' : 'border-warm bg-card'}`}>
                  <Checkbox box={17} tone="violet" checked={on} aria-label={d.name}
                    onChange={(v) => toggleDepartment(d.code, v)} label={null} />
                  <DeptGlyph code={d.code} className="w-glyph h-glyph shrink-0" />
                  <span className="text-fs-sm font-semibold text-ink truncate">{d.name}</span>
                  {on && (
                    <button type="button" onClick={(e) => {
                      e.preventDefault()
                      setOpenViews(openViews === d.code ? null : d.code)
                    }}
                      className="ms-auto inline-flex items-center gap-s2 border-0 bg-transparent
                                 p-s2 text-fs-xs font-bold text-violet cursor-pointer">
                      نماها
                      <Icon name="chevron-down" className="w-s6 h-s6" strokeWidth={2.4} />
                    </button>
                  )}
                </label>
                {on && openViews === d.code && (
                  <div className="absolute z-dropdown top-full start-0 end-0 mt-s3 flex flex-col
                                  gap-s2 bg-card border border-warm rounded-card shadow-pop p-s4">
                    {REPORT_KINDS.map((kind) => (
                      <Checkbox key={kind} box={16} tone="violet"
                        checked={scopes.includes(`dept:${d.code}/report:${kind}`)}
                        onChange={(v) => toggleReport(d.code, kind, v)}
                        label={REPORT_KIND_LABELS[kind]} />
                    ))}
                  </div>
                )}
              </div>
            )
          })}
        </div>

        {undrawable.length > 0 && (
          <p className="text-fs-xs font-semibold text-warn m-0">
            {UNDRAWABLE_SCOPES} {undrawable.map((s) => scopeLabel(s, names)).join('، ')}
          </p>
        )}
        <span className="sr-only">{EVERY_DEPARTMENT}</span>
      </div>
    )
  }
  ```

- [ ] **Step 8: Run it and watch it pass.**
  `cd ui && npx vitest run src/screens/ScopePicker.test.tsx` → `5 passed`.
  ```
  git add ui/src/screens/ScopePicker.tsx ui/src/screens/ScopePicker.test.tsx
  git commit -m "feat(ui): nine tiles where twenty-eight checkboxes were, same grammar"
  ```

- [ ] **Step 9: A failing test for the supervisor control.**
  Rewrite the structural half of `ui/src/screens/SupervisorPicker.test.tsx`'s
  first block; keep every behavioural test (the `preferred` default, the
  off-list note, the search folding) untouched and add:
  ```tsx
  it('is a searchable dropdown, not an uncapped list of radios in a modal', async () => {
    drawPicker({ candidates: many(40) })
    // F29 — 40 candidates × 49px was ~1960px of radios below an already-1300px
    // scope fieldset, inside one scrolling dialog whose title scrolled away too.
    expect(screen.queryAllByRole('radio')).toHaveLength(0)
    const trigger = screen.getByRole('button', { name: /سرپرست/ })
    await userEvent.click(trigger)
    const menu = await screen.findByRole('listbox')
    // §5.2 Dropdown — `max-height:212–280px; overflow:auto` on the popover.
    expect(menu).toHaveClass('overflow-auto')
    expect(within(menu).getAllByRole('option').length).toBe(40)
  })

  it('states the empty case in the design\'s words', async () => {
    drawPicker({ candidates: [] })
    await userEvent.click(screen.getByRole('button', { name: /سرپرست/ }))
    expect(await screen.findByText('برای این نقش سرپرستی در دسترس نیست')).toBeInTheDocument()
  })

  it('says nobody matched, in the one place a search miss belongs', async () => {
    drawPicker({ candidates: many(3) })
    await userEvent.click(screen.getByRole('button', { name: /سرپرست/ }))
    await userEvent.type(screen.getByPlaceholderText('نام یا شماره'), 'zzz')
    expect(await screen.findByText('سرپرستی با این نام نیست')).toBeInTheDocument()
  })
  ```

- [ ] **Step 10: Run it and watch it fail.**
  `cd ui && npx vitest run src/screens/SupervisorPicker.test.tsx -t 'searchable dropdown'`
  Expected: `FAIL … expected length 40 to be 0` (the radios are still there).

- [ ] **Step 11: Rebuild `SupervisorPicker` as the design's dropdown.**
  Replace the whole `return (…)` in `ui/src/screens/SupervisorPicker.tsx`:
  ```tsx
    return (
      <div className="flex flex-col gap-s3">
        <Dropdown
          label="سرپرست"
          value={value === null ? null : String(value)}
          onChange={(id) => onChange(id === null ? null : Number(id))}
          placeholder={allowNone ? NO_SUPERVISOR : 'انتخاب کنید'}
          searchable searchPlaceholder="نام یا شماره"
          noHit="سرپرستی با این نام نیست"
          empty="برای این نقش سرپرستی در دسترس نیست"
          loading={pending}
          options={[
            // D51 — "no supervisor" is a state only a `*`-scoped account may be
            // in, so the option exists for exactly those.
            ...(allowNone ? [{ value: '', label: NO_SUPERVISOR }] : []),
            ...candidates.map((c) => ({
              value: String(c.id),
              // D52 — the scope goes beside the name because past thirty users
              // the reason somebody is on this list is otherwise invisible, and
              // picking blindly is how a chain ends up routed somewhere nobody
              // intended.
              label: `${c.displayName} — ${scopesLabel(c.scopes, names)}`,
              sub: c.username,
            })),
          ]}
        />
        {staysPut && value !== null && !candidates.some((c) => c.id === value) && (
          <p className="text-fs-xs font-semibold text-warn m-0">{SUPERVISOR_OFF_LIST}</p>
        )}
        {/* §6.14's closing rule statement, in its own register: 11.5px, faint,
            lh 1.8. It is the whole answer to "why is this list this short". */}
        <p className="text-fs-xs text-faint leading-loose m-0">
          سرپرست باید بالاتر از این کاربر باشد و دپارتمانش دپارتمان او را پوشش دهد.
          خوانندهٔ گزارش نمی‌تواند سرپرست کسی باشد، چون کامنتی را تأیید نمی‌کند.
        </p>
      </div>
    )
  ```
  Delete the `fieldset`/`legend` reset, the `SearchField`, the `<ul>` of radios,
  the `LoadingState` branch and the local `q`/`shown`/`group` state — the
  dropdown owns its own search now. Keep the `preferred` effect verbatim: it is
  applied once, only while nothing is chosen, and only if the server offered
  them, and none of that changes with the control.

- [ ] **Step 12: Run it and watch it pass.**
  `cd ui && npx vitest run src/screens/SupervisorPicker.test.tsx` → all green.
  ```
  git add ui/src/screens/SupervisorPicker.tsx ui/src/screens/SupervisorPicker.test.tsx
  git commit -m "feat(ui): the supervisor list stops being two thousand pixels of radios"
  ```

- [ ] **Step 13: A failing test for the two captioned fieldsets.**
  Append to `ui/src/screens/NewUserDialog.test.tsx`:
  ```tsx
  it('groups the fields into the design\'s two captioned sections', async () => {
    openNewUserDialog()
    const dialog = await screen.findByRole('dialog', { name: 'کاربر جدید' })
    const sections = within(dialog).getAllByRole('group', { name: /هویت|جایگاه/ })
    expect(sections.map((s) => s.getAttribute('aria-label')))
      .toEqual(['هویت و ورود', 'جایگاه در سازمان'])
    const identity = sections[0]
    // The 2-up grid: name and number on one row, password full-width beneath.
    expect(within(identity).getByTestId('two-up')).toHaveClass('grid', 'grid-cols-2')
    expect(within(identity).getByLabelText('نام و نام خانوادگی'))
      .toHaveAttribute('placeholder', 'مثلاً سحر بیات')
    const number = within(identity).getByLabelText('شمارهٔ موبایل')
    expect(number).toHaveAttribute('dir', 'ltr')
    expect(number).toHaveAttribute('placeholder', '09123456789')
    // §6.14 — the initial password carries the reveal-button pattern.
    const reveal = within(identity).getByRole('button', { name: 'نمایش گذرواژه' })
    expect(within(identity).getByLabelText('گذرواژهٔ اولیه')).toHaveAttribute('type', 'password')
    await userEvent.click(reveal)
    expect(within(identity).getByLabelText('گذرواژهٔ اولیه')).toHaveAttribute('type', 'text')
  })
  ```

- [ ] **Step 14: Run it and watch it fail.**
  `cd ui && npx vitest run src/screens/NewUserDialog.test.tsx -t 'two captioned sections'`
  Expected: `FAIL … Unable to find role="group" and name matching /هویت|جایگاه/`.

- [ ] **Step 15: Rebuild `UserFields` as the two sections.**
  Replace the whole `return (…)` in `ui/src/screens/UserFields.tsx`:
  ```tsx
    return (
      <>
        {/* §6.14 section 1. Two tinted SectionCards at `padding:16px` is the
            entire composition of this dialog; every field below sits in one of
            them, and the eyebrow is what tells an administrator which question
            they are answering. */}
        <SectionCard eyebrow="هویت و ورود" aria-label="هویت و ورود" className="p-s8">
          <div data-testid="two-up"
            className="grid grid-cols-2 gap-s6 max760:grid-cols-1">
            <TextField id={nameId} label="نام و نام خانوادگی" placeholder="مثلاً سحر بیات"
              value={draft.displayName}
              onChange={(v) => onChange({ ...draft, displayName: v })} />
            {/* The design's second identity field is an alias (`s.bayat`); ours
                is a mobile number (D57), so the label and the placeholder are
                this app's and the shape is the design's. `dir="ltr"` because it
                is a latin-digit run inside RTL prose, and no `maxLength`:
                `normalisePhone` accepts nine spellings, five of them longer than
                a canonical number, and truncating one makes a DIFFERENT valid
                number rather than rejecting it. */}
            <TextField id={numberId} label="شمارهٔ موبایل" placeholder="09123456789"
              dir="ltr" mono inputMode="numeric" autoComplete="username"
              value={draft.username}
              onChange={(v) => onChange({ ...draft, username: v })} />
          </div>
          {password !== undefined && (
            <div className="mt-s6">
              <PasswordField id={passwordId} label="گذرواژهٔ اولیه"
                value={password.value} onChange={password.onChange}
                autoComplete="new-password"
                hint="این گذرواژه را خودتان به این شخص می‌گویید؛ پیوند بازیابی‌ای در کار نیست." />
            </div>
          )}
        </SectionCard>

        {/* §6.14 section 2. */}
        <SectionCard eyebrow="جایگاه در سازمان" aria-label="جایگاه در سازمان" className="p-s8">
          <Dropdown label="نقش"
            value={draft.roleId === null ? null : String(draft.roleId)}
            onChange={(v) => onChange({ ...draft, roleId: v === null ? null : Number(v) })}
            placeholder="انتخاب کنید"
            // Exactly what the server returned, in the order it returned it —
            // the value is still the id, which is what the request carries.
            // `/api/roles` is already filtered by the rule that would refuse the
            // write (D56); re-deriving it here would be the copy that gets it wrong.
            options={roles.map((r) => ({ value: String(r.id), label: roleLabel(r.name) }))} />

          <div className="mt-s6 flex flex-col gap-s6">
            <ScopePicker scopes={draft.scopes} onChange={(next) =>
              onChange({ ...draft, scopes: next })} />
            <SupervisorPicker
              candidates={candidates} value={draft.supervisorId}
              onChange={(id) => onChange({ ...draft, supervisorId: id })}
              allowNone={draft.scopes.includes('*')}
              staysPut={supervisorStaysPut} preferred={preferred}
              pending={candidatesPending} />
            {/* D51 — an org-chart fact and not a capability, in §6.8's own
                checkbox-row shape: an 18px tick, a 13.5px/700 title and an
                11.5px explanation beneath. */}
            <Checkbox box={18} tone="violet" checked={draft.canSupervise}
              onChange={(v) => onChange({ ...draft, canSupervise: v })}
              label="سرپرست‌شدن"
              hint="این پرچم هیچ دسترسی نمی‌دهد؛ فقط او را در فهرست سرپرست‌های قابل انتخاب می‌آورد." />
          </div>
        </SectionCard>
      </>
    )
  ```
  Widen the props with `password?: { value: string; onChange: (v: string) => void }`
  and a `passwordId` from `useId()`; delete the scope `fieldset`, the three
  `toggle*` functions (they moved into `ScopePicker`), the `undrawable`
  derivation, the `useDepartments` call and the native `<select>`. Keep
  `SCOPE_HINT` exported — it is dead here, so delete its usage and its export in
  the same edit, and remove it from `NewUserDialog.test.tsx`'s imports.

- [ ] **Step 16: Run it and watch it pass.**
  `cd ui && npx vitest run src/screens/NewUserDialog.test.tsx -t 'two captioned sections'` → `1 passed`.
  ```
  git add ui/src/screens/UserFields.tsx ui/src/screens/NewUserDialog.test.tsx
  git commit -m "feat(ui): the user form asks two questions, each in its own box"
  ```

- [ ] **Step 17: A failing test for the height — the whole point of the task.**
  jsdom measures nothing, so this is asserted structurally here and in pixels in
  Step 23. Append to `ui/src/screens/EditUserDialog.test.tsx`:
  ```tsx
  it('draws a bounded number of controls on a nine-department registry', async () => {
    openEditDialog({ departments: nine() })
    const dialog = await screen.findByRole('dialog', { name: 'ویرایش کاربر' })
    // Was 1 + 9 + 18 = 28 checkboxes plus a native select and N radios — 2207px
    // of scrollHeight in an 850px box. Now: nine tiles + «کل سامانه» +
    // «سرپرست‌شدن», with the report level behind a per-tile popover.
    expect(within(dialog).getAllByRole('checkbox')).toHaveLength(11)
    expect(within(dialog).queryAllByRole('combobox')).toHaveLength(0)   // no native select
    expect(dialog.querySelectorAll('select')).toHaveLength(0)
  })
  ```

- [ ] **Step 18: Run it and watch it fail.**
  `cd ui && npx vitest run src/screens/EditUserDialog.test.tsx -t 'bounded number'`
  Expected: `FAIL … expected length 29 to be 11` (`EditUserDialog` still renders
  the old `UserFields` path because it has not been rewired).

- [ ] **Step 19: Rewire `EditUserDialog` onto the shell.**
  Replace its `readFailure` `<Dialog>` branch, its `return (…)` and its action
  row with:
  ```tsx
    return (
      <UserDialogShell
        open={open} onClose={onClose} title="ویرایش کاربر" submitLabel="ثبت تغییرات"
        submitting={modify.isPending} alert={alert}
        failure={failed} onRetry={() => {
          // All three, whichever one failed: a query in `error` refetches on
          // nothing but being asked, so retrying only the two that were already
          // fine would leave the same screen on the press.
          void roles.refetch(); void departments.refetch(); void candidates.refetch()
        }}
        onSubmit={submit}>
        <UserFields
          draft={draft} onChange={setDraft}
          roles={roles.data ?? []} candidates={candidates.data ?? []}
          candidatesPending={candidates.isPending}
          // Only a save that touches neither the edge nor the scopes leaves an
          // off-list supervisor where they are; anything else is re-judged, here
          // and on the server.
          supervisorStaysPut={!supervisorMoved} />
      </UserDialogShell>
    )
  ```
  `failed` stays exactly as it is (`readFailure(roles, departments, candidates)`).
  There is no password here: setting somebody else's is its own endpoint, its own
  event and its own revocation rule (D15), and it is on the record behind this
  dialog.

- [ ] **Step 20: Rewire `NewUserDialog` the same way.**
  ```tsx
    return (
      <UserDialogShell
        open={open} onClose={onClose} title="کاربر جدید" submitLabel="ایجاد کاربر"
        submitting={create.isPending} alert={alert}
        failure={failed} onRetry={() => {
          void roles.refetch(); void departments.refetch(); void candidates.refetch()
        }}
        onSubmit={submit}>
        <UserFields
          draft={draft} onChange={setDraft}
          roles={roles.data ?? []} candidates={candidates.data ?? []}
          candidatesPending={candidates.isPending}
          password={{ value: password, onChange: setPassword }}
          // There is no account yet, so there is no supervisor to stay put.
          supervisorStaysPut={false} preferred={session?.username} />
      </UserDialogShell>
    )
  ```
  The title moves from «کاربر تازه» to §6.7/§6.14's «کاربر جدید», matching the
  button on the users screen — one name for one thing.

- [ ] **Step 21: Run the three dialog suites and watch them pass.**
  ```
  cd ui && npx vitest run src/screens/NewUserDialog.test.tsx \
    src/screens/EditUserDialog.test.tsx src/screens/SupervisorPicker.test.tsx \
    src/screens/ScopePicker.test.tsx
  ```
  → all green. Then `npx tsc -b && npx eslint .` → clean. Fix any remaining
  `کاربر تازه` assertion in `users.test.tsx` in the same pass.
  ```
  git add ui/src/screens/NewUserDialog.tsx ui/src/screens/EditUserDialog.tsx \
          ui/src/screens/NewUserDialog.test.tsx ui/src/screens/EditUserDialog.test.tsx \
          ui/src/screens/users.test.tsx
  git commit -m "feat(ui): one dialog skeleton, two dialogs, and a form that fits the box"
  ```

- [ ] **Step 22: Report the four divergences. Do not write them into the ledger.**
  `docs/superpowers/ui-normalisation-ledger.md` is maintained by the reviewer at review time,
  for the same one-file-many-writers reason the harness table is frozen. **Put the block below
  in your task report, under "the ledger rows this task would add"; do not open the ledger.**
  ```md
  ## The user dialogs (§6.14) — four adaptations

  | # | Design | Built | Why |
  |---|---|---|---|
  | D1 | «نام کاربری», `dir="ltr"` mono, placeholder `s.bayat` | «شمارهٔ موبایل», `dir="ltr"` mono, placeholder `09123456789` | The username in this product **is** a mobile number (D57). The shape is the design's; the content is the truth. |
  | D2 | «دپارتمان» is a flat multi-select dropdown | §6.8's tile grid with a nested views popover | The design's dropdown has no report level, and the grammar has three shapes. §6.8's grid + views popover is the design's own expression of all three. |
  | D3 | Report kinds «راهنمای گام‌به‌گام» / «سند فلوچارت» | «راهنمای گام‌به‌گام» / «مستندات کامل» | `REPORT_KIND_LABELS` is pinned to `exports.EXPORT_KINDS`, which `test_exports.py` asserts verbatim. Renaming a kind on one screen would leave the export menu calling it something else. **Owner question.** |
  | D4 | The dialog's submit is violet (§6.14); the visual audit reads the readme's "coral for anything primary" and calls this a defect | Violet inside the dialog; **coral** on «کاربر جدید» (§6.7) | R8, role first: coral is the *new-affordance* role — the control that opens a creation flow — and violet is the commit. Both deliverables are internally consistent under that rule; the readme's blanket sentence is not. **Owner question.** |
  ```
  Nothing is staged or committed by this step.

- [ ] **Step 23: Prove every class the dialogs write emits.**
  ```bash
  cd ui && npx vite build
  node scripts/harvest-classes.mjs src/screens/UserDialogShell.tsx src/screens/NewUserDialog.tsx src/screens/EditUserDialog.tsx \
    src/screens/UserFields.tsx src/screens/ScopePicker.tsx src/screens/SupervisorPicker.tsx
  ```
  Expected: the run ends `DEAD 0   EMPTY 0   NOVAR 0`, both controls hold
  (`control (negative): N/N invented names reported dead` and
  `control (escaping): … escaped variant classes unescaped`), and the last line
  is `PASS`. The script exits 1 on any failure, so it can be `&&`-chained.
  The class list is **harvested out of these files**, never hand-kept, so it
  cannot drift from what they write and `tailwind-probe.txt` cannot certify it
  on their behalf — see *The class-emission check* in Global Constraints for the
  measurement that retired the old grep.

  **A failure.** `DEAD` — the class compiled to no rule at all; that is a **typo
  in the component**, so fix the class string, rebuild, re-run. `EMPTY` — the
  selector emitted with an empty body, so the theme key resolves to nothing.
  `NOVAR` — the rule reads a `var(--…)` nothing declares. The last two are theme
  regressions: **stop and report them.** Do **not** add the name to
  `ui/tailwind.config.js`, `src/styles/tokens.css`, `src/styles/roles.css` or
  `tailwind-probe.txt`. All four are frozen for the duration of this plan and
  were unfrozen exactly once, by the single minting pass in
  `.superpowers/sdd/mint-spec.md`; minting one here to make a misspelling compile
  recreates the unreachable-token problem the whole rebuild exists to fix. A
  value that genuinely has no name goes into `mint-spec.md`, not into the config
  and not into this task's commit.

  **What this step cannot prove:** that these files write a class and that the
  class compiles to a rule with declarations, yes. That the class reaches the
  right element, that the element renders, that it is visible, or that its value
  is the one the design asks for — no. That stays with the Playwright checks.

  **There is no `'new-user'` row to add, and `ui/e2e/_harness.ts` is frozen.** This step used
  to end *"then in `ui/e2e/_harness.ts`: `'new-user': { dialog: { … } }`"*, and that row never
  fitted: `expectDesign` needs a screen root that paints the field and carries the screen
  padding, a `[data-col]` with a `max-width`, a `[data-h1]` and a `[data-body]`. **A dialog
  has none of them** — it has a fixed `520px` width, a scrim rather than a field, and `26px`
  of its own padding. The shape written above (`{ dialog: { width, radius, padding, shadow } }`)
  is a different shape from every other row in the table, which is why it was left out of the
  pre-flight (`3dda9ef`; `.superpowers/sdd/ui-harness-preflight-report.md`, F5).

  So the dialog's numbers stay where Step 24 already asserts them — in
  `ui/e2e/user-dialog.spec.ts`:

  ```
  width 520px · radius 24px (20px 20px 0 0 as a bottom sheet at ≤760) · padding 26px
  shadow  0 4px 10px rgba(16,10,40,.28), 0 44px 90px -30px rgba(16,10,40,.8)
  ```

  **Do not add the row, and do not widen `ScreenDesign` to accept it.** The table is frozen
  for a mechanical reason as well as this one: eleven tasks appending to one file in one
  working tree lose all but the last write, with a green build. If you believe a dialog needs
  a table entry, stop and report it.

- [ ] **Step 24: Write the Playwright check — the one that measures the height.**
  Create `ui/e2e/user-dialog.spec.ts`:
  ```ts
  import { test, expect } from '@playwright/test'
  import { serve, shot, signedIn, visit } from './_harness'

  test('new user — 520 wide, and it fits', async ({ page }) => {
    await signedIn(page)
    await serve(page, { '/api/users': USERS, '/api/departments': DEPARTMENTS, '/api/pending': [] })
    await visit(page, '/users')
    await page.getByRole('button', { name: 'کاربر جدید' }).click()
    const box = page.getByRole('dialog', { name: 'کاربر جدید' })

    // No `expectDesign(page, 'new-user')`: a dialog is not a `[data-screen]`
    // region — no field, no screen padding, no `[data-col]`, no `[data-h1]` —
    // so it has no row in the table and is not getting one (Step 23). Its
    // numbers are asserted here, which is where they belong.
    const width = page.viewportSize()!.width
    if (width > 760) {
      await expect(box).toHaveCSS('width', '520px')
      await expect(box).toHaveCSS('border-radius', '24px')
      await expect(box).toHaveCSS('padding', '26px')
    } else {
      // §5.2 — at ≤760px every modal becomes a bottom sheet.
      await expect(box).toHaveCSS('border-radius', '20px 20px 0px 0px')
      await expect(box).toHaveCSS('width', `${width}px`)
    }

    // The finding this whole task exists for: 2207px of content in an 850px box.
    const body = box.getByTestId('dialog-body')
    const { scroll, client } = await body.evaluate((el) =>
      ({ scroll: el.scrollHeight, client: el.clientHeight }))
    expect(scroll).toBeLessThan(client * 2)

    // The footer is on screen without scrolling, at every width.
    const footer = box.getByTestId('dialog-footer')
    await expect(footer.getByRole('button', { name: 'ایجاد کاربر' })).toBeInViewport()
    const [create, cancel] = await Promise.all([
      footer.getByRole('button', { name: 'ایجاد کاربر' }).boundingBox(),
      footer.getByRole('button', { name: 'انصراف' }).boundingBox(),
    ])
    expect(Math.abs(create!.width - cancel!.width)).toBeLessThan(2)

    // F36 — the ghost cancel was white on white. §5.2's sheet keeps it white and
    // the section cards tint, so the contrast comes from the surface behind it.
    await expect(box.getByRole('group', { name: 'هویت و ورود' }))
      .toHaveCSS('background-color', 'rgb(251, 249, 254)')

    // §5.2 TextField — 1.5px #E3D8F5, focus turns it coral, no ring.
    const name = box.getByLabel('نام و نام خانوادگی')
    await expect(name).toHaveCSS('border-width', '1.5px')
    await name.focus()
    await expect(name).toHaveCSS('border-color', 'rgb(250, 90, 82)')

    await shot(page, 'new-user')
  })
  ```

- [ ] **Step 25: Run it at three widths, fix, commit.**
  `cd ui && npx playwright test e2e/user-dialog.spec.ts` → `3 passed`. Compare
  `e2e/__shots__/new-user-1440.png` with
  `.superpowers/sdd/ui-audit-shots/design-dialog-new-user.png`.
  ```
  git commit ui/e2e/user-dialog.spec.ts ui/e2e/__shots__ \
    -m "test(ui): the dialog's height is measured where jsdom cannot see it"
  ```
  `ui/e2e/_harness.ts` is **not** staged: it is frozen and this task did not touch it. Commit
  by pathspec, not `git add` + bare `git commit` — the latter commits the *index*, and another
  agent's staged change has already been swallowed into an unrelated commit that way.

---

### Task 22: `Profile`

Three password inputs stack in one 882px column where §6.13 pairs new+repeat side
by side; the page is titled «نمایه» — the *route* name — where the design's title
is the person's own name; and every field label is 12.5px/700 muted where the
design's is 12.5px/600 `#4A25A9`. §6.13's second card is **not** built here: the
owner has removed it from the product (Global Constraints), so the page ends with
the change-password card and the divergence is written into the ledger.

**Files**

| Action | Path |
|---|---|
| Modify | `ui/src/screens/Profile.tsx` |
| Modify | `ui/src/screens/Profile.test.tsx` |
| Create | `ui/e2e/profile.spec.ts` |

**Files this task must not write**

| Path | Why | What to do instead |
|---|---|---|
| `ui/tailwind.config.js`, `ui/src/styles/tokens.css`, `ui/src/styles/roles.css`, `ui/tailwind-probe.txt` | Frozen between deliberate minting passes, so many tasks can run in one tree without clobbering each other. Unfrozen exactly once, by the single consolidated mint. | A value with no token is not minted here. Stop, and report the value and its role. |
| `ui/e2e/_harness.ts` | Pre-populated and frozen — eleven tasks appending to one file in one tree lose all but the last write, with a green build. | **`profile` is already there.** Read it; if it is missing or wrong, stop and report. |
| `docs/superpowers/ui-normalisation-ledger.md` | Maintained by the reviewer at review time. | Report the rows you would add, in your task report. |

**Interfaces**

*Consumes* — `max-w-profile` (700px) · `px-screen-x` · `py-screen-y` ·
`bg-surface-sub` (#FBF9FE) · `border-border-current` (#EDE5F5) ·
`bg-tile-warn` (#FBEEDC) · `border-warn-edge` (`#F0DDBB`) · `text-warn-fg` (#8A5A00) ·
`text-violet-on-violet` (#C9BEEE) · `rounded-card` (16px) · `rounded-input` (11px) ·
`rounded-control` (10px) · the `max760:` variant (the ≤760 mobile pass — there is no `narrow` screen or utility; both breakpoints are `addVariant`'d as `max1080:`/`max760:`).
`SectionCard`, `PasswordField`, `Button`, `Icon` as in Tasks 21/6/7/10.

*Produces* — no new exports. `Profile` keeps its named export shape, and no new
API type, hook or route path is added.

---

- [ ] **Step 1: A failing test for the header.**
  Append to `ui/src/screens/Profile.test.tsx`:
  ```tsx
  describe('the profile header (§6.13)', () => {
    it('is titled with the person, not with the route', async () => {
      drawProfile(EDITOR)
      const h1 = await screen.findByRole('heading', { level: 1 })
      expect(h1).toHaveTextContent('ویدا مهرآیین')
      expect(screen.queryByRole('heading', { name: 'نمایه' })).toBeNull()
      const meta = screen.getByTestId('profile-meta')
      expect(meta).toHaveTextContent('تحلیل‌گر')
      // The number is a latin-digit run on a violet field: mono, pinned ltr.
      const number = within(meta).getByText(EDITOR.username)
      expect(number).toHaveAttribute('dir', 'ltr')
      expect(number).toHaveClass('font-mono')
    })
  })
  ```

- [ ] **Step 2: Run it and watch it fail.**
  `cd ui && npx vitest run src/screens/Profile.test.tsx -t 'titled with the person'`
  Expected: `FAIL … expected element to have text content 'ویدا مهرآیین'`.

- [ ] **Step 3: Rewrite the header and drop the identity card.**
  In `ui/src/screens/Profile.tsx` replace the outer wrapper and the first `Card`:
  ```tsx
      <div className="flex-1 overflow-auto py-screen-y px-screen-x max760:px-s7 max760:py-s9">
        <div className="max-w-profile mx-auto">
          {/* §6.13 — `21px/800 #fff` name, `12.5px #C9BEEE` role. The identity
              card this replaces was three lines of plain text plus a paragraph
              explaining why there is no edit control here; R5 puts that class of
              sentence out of the app, and the design's own profile has neither.
              The two facts worth keeping — who you are and what you are — are
              the header. */}
          <h1 className="text-fs-stat-sm font-extrabold text-role-title-on-field m-0">
            {session.displayName}
          </h1>
          <p data-testid="profile-meta"
            className="flex items-center gap-s4 flex-wrap text-fs-sm2
                       text-violet-on-violet mt-s2 m-0">
            <span>{roleLabel(session.role)}</span>
            <span aria-hidden>·</span>
            <span dir="ltr" className="font-mono">{session.username}</span>
          </p>
  ```
  `text-fs-stat-sm` is the 21px role Task 3 added for §2.4's two 21px uses.

- [ ] **Step 4: Run it and watch it pass, then commit.**
  `cd ui && npx vitest run src/screens/Profile.test.tsx -t 'titled with the person'` → `1 passed`.
  ```
  git add ui/src/screens/Profile.tsx ui/src/screens/Profile.test.tsx
  git commit -m "feat(ui): your profile is titled with your name, not with the route's"
  ```

- [ ] **Step 5: A failing test for the two-column password grid and the labels.**
  Append:
  ```tsx
  it('pairs the new password with its repeat, and leads with violet labels', async () => {
    drawProfile(EDITOR)
    const card = await screen.findByRole('group', { name: 'تغییر گذرواژه' })
    const pair = within(card).getByTestId('password-pair')
    expect(pair).toHaveClass('grid', 'grid-cols-2', 'max760:grid-cols-1')
    expect(within(pair).getByLabelText('گذرواژهٔ تازه')).toBeInTheDocument()
    expect(within(pair).getByLabelText('تکرار گذرواژهٔ تازه')).toBeInTheDocument()
    // The current password is full width, above the pair.
    expect(within(pair).queryByLabelText('گذرواژهٔ فعلی')).toBeNull()
    // §5.2 TextField — the field label is the design's second label register:
    // 12.5px/600 `#4A25A9`, not the 11px/700 muted section caption.
    const label = within(card).getByText('گذرواژهٔ فعلی')
    expect(label).toHaveClass('text-fs-sm2', 'font-semibold', 'text-violet')
    expect(label).not.toHaveClass('font-bold', 'text-muted')
    expect(within(card).getByRole('button', { name: 'ذخیرهٔ گذرواژه' })).toBeInTheDocument()
  })

  it('gives the sign-out warning a surface instead of a third grey paragraph', async () => {
    drawProfile(EDITOR)
    // F47 — three consecutive 12.5px paragraphs in grey, amber and lilac at 6px
    // separation, of which the amber one is the only consequential sentence and
    // visually the second weakest.
    const warn = await screen.findByRole('note', { name: 'هشدار' })
    expect(warn).toHaveClass('bg-tile-warn', 'border-warn-edge')
    expect(warn).toHaveTextContent(/همهٔ دستگاه‌های دیگری که با این حساب وارد شده‌اند/)
  })
  ```

- [ ] **Step 6: Run it and watch it fail.**
  `cd ui && npx vitest run src/screens/Profile.test.tsx -t 'pairs the new password'`
  Expected: `FAIL … Unable to find an element by: [data-testid="password-pair"]`.

- [ ] **Step 7: Rebuild the change-password card.**
  Replace the second `Card` and the local `Field` component (delete `Field`
  entirely — it was the right idea scoped to the wrong file, F45, and `TextField`
  is now the shared one):
  ```tsx
          {/* §6.13 — a tinted SectionCard eyebrowed «تغییر گذرواژه». */}
          <SectionCard eyebrow="تغییر گذرواژه" aria-label="تغییر گذرواژه" className="mt-s8">
            <form onSubmit={submit} className="flex flex-col gap-s6">
              <PasswordField id={currentId} label="گذرواژهٔ فعلی" placeholder="••••••••"
                autoComplete="current-password" value={current} onChange={setCurrent} />
              <div data-testid="password-pair"
                className="grid grid-cols-2 gap-s6 max760:grid-cols-1">
                <PasswordField id={nextId} label="گذرواژهٔ تازه" placeholder="••••••••"
                  autoComplete="new-password" value={next} onChange={setNext} />
                <PasswordField id={repeatId} label="تکرار گذرواژهٔ تازه" placeholder="••••••••"
                  autoComplete="new-password" value={repeat} onChange={setRepeat} />
              </div>

              {/* Said before the change and not after it. A security action whose
                  effects are invisible is one people avoid, and «your other
                  devices were signed out» in the confirmation is news rather
                  than a warning — about a tablet in the kitchen somebody else is
                  holding. §6.6's amber notice is the design's surface for
                  exactly this: `#FBEEDC` on `1px #F0DDBB` at radius 10,
                  `12px #8A5A00 lh 1.7`. */}
              <p role="note" aria-label="هشدار"
                className="bg-tile-warn border border-warn-edge rounded-control
                           px-s6 py-s5 text-fs-caption text-warn-fg leading-normal m-0">
                با عوض شدن گذرواژه، همهٔ دستگاه‌های دیگری که با این حساب وارد شده‌اند
                بیرون می‌آیند؛ همین دستگاه باز می‌ماند.
              </p>

              {/* §6.13's closing rule statement. The design's third clause is
                  about a reset link this product does not have (D15), so it
                  states what actually happens instead. */}
              <p className="text-fs-xs text-faint leading-loose m-0">
                گذرواژهٔ خود را فقط خودتان می‌توانید تغییر دهید؛ هیچ‌کس دیگری گذرواژهٔ
                شما را نمی‌بیند. اگر آن را فراموش کردید، مدیر سامانه گذرواژهٔ تازه‌ای
                می‌گذارد و به شما می‌گوید.
              </p>

              <div className="mt-s2">
                <Button type="submit" variant="violet"
                  className="px-s9 py-s6 text-fs-menu rounded-button"
                  loading={change.isPending} loadingLabel="در حال ثبت…">
                  ذخیرهٔ گذرواژه
                </Button>
              </div>
            </form>

            {(problem || change.error) && (
              <p role="alert" className="text-fs-xs font-semibold text-conflict mt-s5 m-0">
                {problem ?? refusalText(change.error)}
              </p>
            )}
            {change.isSuccess && !problem && (
              <p role="status" className="text-fs-xs font-semibold text-green mt-s5 m-0">
                گذرواژهٔ شما عوض شد. دستگاه‌های دیگر از این حساب بیرون آمدند؛ همین
                دستگاه باز است.
              </p>
            )}
          </SectionCard>
  ```
  `loading` still forces `disabled`, which is what stops a second submit landing
  behind the first with a `current` the first request has already invalidated.

- [ ] **Step 8: Run it and watch it pass, then commit.**
  `cd ui && npx vitest run src/screens/Profile.test.tsx` → all green.
  ```
  git add ui/src/screens/Profile.tsx ui/src/screens/Profile.test.tsx
  git commit -m "feat(ui): new and repeat sit side by side, and the warning gets a surface"
  ```

- [ ] **Step 9: Report the two divergences. Do not write them into the ledger.**
  `docs/superpowers/ui-normalisation-ledger.md` is maintained by the reviewer at review time,
  for the same one-file-many-writers reason the harness table is frozen. **Put the block below
  in your task report, under "the ledger rows this task would add"; do not open the ledger.**
  ```md
  ## Profile (§6.13) — two adaptations

  | # | Design | Built | Why |
  |---|---|---|---|
  | P1 | A second card below the password one, listing the account's live sign-ins with a per-row ghost button | Nothing. The page ends with the change-password card | The owner removed the feature from the product — «I don't need open session card in profile. delete it from ui.» It is not built, not stubbed, and no `/api/auth/sessions` route is added or wanted. A deliberate divergence from the deliverable, written down here rather than left silent. |
  | P2 | The rule statement ends "بازنشانی گذرواژهٔ دیگران هم فقط یک لینک یک‌بارمصرف می‌سازد" | "…مدیر سامانه گذرواژهٔ تازه‌ای می‌گذارد و به شما می‌گوید" | Same cause as ledger A1: there is no reset link (D15). |
  ```
  Nothing is staged or committed by this step.

- [ ] **Step 10: Prove every class this screen writes emits.**
  ```bash
  cd ui && npx vite build
  node scripts/harvest-classes.mjs src/screens/Profile.tsx
  ```
  Expected: the run ends `DEAD 0   EMPTY 0   NOVAR 0`, both controls hold
  (`control (negative): N/N invented names reported dead` and
  `control (escaping): … escaped variant classes unescaped`), and the last line
  is `PASS`. The script exits 1 on any failure, so it can be `&&`-chained.
  The class list is **harvested out of these files**, never hand-kept, so it
  cannot drift from what they write and `tailwind-probe.txt` cannot certify it
  on their behalf — see *The class-emission check* in Global Constraints for the
  measurement that retired the old grep.

  **A failure.** `DEAD` — the class compiled to no rule at all; that is a **typo
  in the component**, so fix the class string, rebuild, re-run. `EMPTY` — the
  selector emitted with an empty body, so the theme key resolves to nothing.
  `NOVAR` — the rule reads a `var(--…)` nothing declares. The last two are theme
  regressions: **stop and report them.** Do **not** add the name to
  `ui/tailwind.config.js`, `src/styles/tokens.css`, `src/styles/roles.css` or
  `tailwind-probe.txt`. All four are frozen for the duration of this plan and
  were unfrozen exactly once, by the single minting pass in
  `.superpowers/sdd/mint-spec.md`; minting one here to make a misspelling compile
  recreates the unreachable-token problem the whole rebuild exists to fix. A
  value that genuinely has no name goes into `mint-spec.md`, not into the config
  and not into this task's commit.

  **What this step cannot prove:** that these files write a class and that the
  class compiles to a rule with declarations, yes. That the class reaches the
  right element, that the element renders, that it is visible, or that its value
  is the one the design asks for — no. That stays with the Playwright checks.

- [ ] **Step 11: Read the `profile` row the harness already holds. Do not write one.**
  This step used to say *"add `profile` to the harness table"*, in field names (`maxWidth`,
  `padX`, `padY`) that `ScreenDesign` does not have. **`ui/e2e/_harness.ts` is frozen and the
  row is already in it**, written ahead of the screens (`3dda9ef`) because eleven tasks
  appending to one file in one working tree lose all but the last write, with a green build.

  ```bash
  cd ui && node -e "const s=require('fs').readFileSync('e2e/_harness.ts','utf8');console.log('profile:', s.includes('  profile:')?'present':'MISSING')"
  ```

  Three things in the row supersede numbers written elsewhere in this task, and **none of them
  is a reason to edit it**:

  - **`h1.size` is `22px`, not the `21px` this task's Steps 3 and 11 quote.** Ledger **L-02**
    and **L-33**: `--fs-stat-sm` 21px exists for the *activity stat numeral*, which
    `tokens.css:147` says in as many words. So the class is not `text-fs-stat-sm`.
  - **`h1.color` is `TITLE_ON_FIELD`, white** (L-01), which is what the JSX writes —
    `text-role-title-on-field`, not `text-on-dark` (`#FBF7F1`, the value L-01 retired).
  - **`card.background` is `SUBPANEL_SURFACE` `#FBF9FE`** — the value the mint decided, not the
    one the role used to resolve to. `--role-surface-sub` pointed at `--tile-v4` `#F8F4FE` when
    the row was written; `mint-spec.md` §2.1 C1 re-points it at `--surface-sub` and that
    correction has landed in `roles.css:39`. If a revert ever puts `--tile-v4` back, this line
    goes red — **correct the role, not the row**, and that is a stop-and-report.

  One more, from the pre-flight: the reader deliverable draws this screen at `30px 40px`, not
  the reader's own `30px 24px 60px`, so **`Profile` must not be wrapped in a reader surface**
  or the row goes red on padding. One row serves both surfaces here.

  **If the row is missing, or a number in it disagrees with §6.13, stop and report it.**

- [ ] **Step 12: Write the Playwright check.**
  Create `ui/e2e/profile.spec.ts`:
  ```ts
  import { test, expect } from '@playwright/test'
  import { expectDesign, serve, shot, signedIn, visit } from './_harness'

  test('profile — 700 wide, paired fields, violet labels', async ({ page }) => {
    // `signedIn` + `serve`, not a bare `goto`: with nothing intercepted every
    // /api/ request leaves the browser and is answered by the FastAPI container
    // on :8000, and `expectDesign` fails the spec for it.
    await signedIn(page)
    await serve(page, { '/api/departments': DEPARTMENTS, '/api/pending': [] })
    await visit(page, '/profile', 'profile')
    await expectDesign(page, 'profile')

    const pair = page.getByTestId('password-pair')
    const boxes = await pair.locator('> *').boundingBoxes?.() ??
      await Promise.all([pair.locator('> *').nth(0), pair.locator('> *').nth(1)]
        .map((l) => l.boundingBox()))

    if (page.viewportSize()!.width > 760) {
      // §6.13 — `grid repeat(2,1fr); gap:12px`. The finding: three inputs in one
      // 882px column at y 428/509/590.
      await expect(pair).toHaveCSS('grid-template-columns', /^\d+(\.\d+)?px \d+(\.\d+)?px$/)
      expect(Math.abs(boxes[0]!.y - boxes[1]!.y)).toBeLessThan(2)
      await expect(pair).toHaveCSS('gap', '12px')
    } else {
      await expect(pair).toHaveCSS('grid-template-columns', /^\d+(\.\d+)?px$/)
      expect(boxes[1]!.y).toBeGreaterThan(boxes[0]!.y)
    }

    // §5.2 — the field-label register the app collapsed into the caption one.
    const label = page.getByText('گذرواژهٔ فعلی')
    await expect(label).toHaveCSS('font-size', '12.5px')
    await expect(label).toHaveCSS('font-weight', '600')
    await expect(label).toHaveCSS('color', 'rgb(74, 37, 169)')

    const input = page.getByLabel('گذرواژهٔ فعلی')
    await expect(input).toHaveCSS('font-size', '14px')
    await expect(input).toHaveCSS('border-radius', '12px')
    await expect(input).toHaveCSS('padding', '12px 14px')

    await expect(page.getByRole('note', { name: 'هشدار' }))
      .toHaveCSS('background-color', 'rgb(251, 238, 220)')
    await expect(page.getByRole('button', { name: 'ذخیرهٔ گذرواژه' }))
      .toHaveCSS('background-color', 'rgb(74, 37, 169)')

    await shot(page, 'profile')
  })
  ```

- [ ] **Step 13: Run it at three widths, fix, commit.**
  `cd ui && npx playwright test e2e/profile.spec.ts` → `3 passed`. Compare
  `e2e/__shots__/profile-1440.png` with
  `.superpowers/sdd/ui-audit-shots/design-profile.png` — the design's lower card
  is absent by owner ruling (Global Constraints, ledger P1); everything above it
  should match.
  ```
  git commit ui/e2e/profile.spec.ts ui/e2e/__shots__ \
    -m "test(ui): the profile's two-column pairing is checked in a browser"
  ```
  `ui/e2e/_harness.ts` is **not** staged: it is frozen and this task did not touch it. Commit
  by pathspec, not `git add` + bare `git commit` — the latter commits the *index*, and another
  agent's staged change has already been swallowed into an unrelated commit that way.

---

### Task 23: `Visibility` — one card, six rows, and a word on the left

Six **44 × 44px** native OS checkboxes, against 16px for the same control two
screens away — 2.75× apart, and neither is a drawn control (F5, X4). Six separate
floating cards where §6.12 has one. No left-hand state word, so 55–60 % of every
card is blank. And `Card` is re-implemented byte-for-byte rather than imported
(F6), with `cursor-pointer` and no hover at all (F7).

**Files**

| Action | Path |
|---|---|
| Modify | `ui/src/screens/Visibility.tsx` |
| Modify | `ui/src/screens/Visibility.test.tsx` |
| Create | `ui/e2e/visibility.spec.ts` |

**Files this task must not write**

| Path | Why | What to do instead |
|---|---|---|
| `ui/tailwind.config.js`, `ui/src/styles/tokens.css`, `ui/src/styles/roles.css`, `ui/tailwind-probe.txt` | Frozen between deliberate minting passes, so many tasks can run in one tree without clobbering each other. Unfrozen exactly once, by the single consolidated mint. | A value with no token is not minted here. Stop, and report the value and its role. |
| `ui/e2e/_harness.ts` | Pre-populated and frozen — eleven tasks appending to one file in one tree lose all but the last write, with a green build. | **This screen's row is already there, under the name `policy`.** Read it; if it is missing or wrong, stop and report. |
| `docs/superpowers/ui-normalisation-ledger.md` | Maintained by the reviewer at review time. | Report the rows you would add, in your task report. |

**Interfaces**

*Consumes* — `max-w-access` (820px, §3.3 gives policy the same 820 as Access) ·
`px-screen-x` · `py-screen-y` · `rounded-card` (16px) · `border-hair` (#F2ECE3) ·
`text-violet-on-violet` (#C9BEEE) · `shadow-card` · the `max760:` variant (the ≤760 mobile pass — there is no `narrow` screen or utility; both breakpoints are `addVariant`'d as `max1080:`/`max760:`).
`Checkbox` (Task 8, `box={19} tone="green"`), `Card` (Task 6), `Spinner`
(`ui/Button`).

*Produces*
```ts
// ui/src/screens/Visibility.tsx
export const STATE_ON: string    // 'نمایش داده می‌شود'
export const STATE_OFF: string   // 'پنهان است'
```

---

- [ ] **Step 1: A failing test for one card and one drawn control.**
  Replace the structural block of `ui/src/screens/Visibility.test.tsx` (keep every
  behavioural test — the server-driven field set, the unknown-field hint, the
  failed flip — untouched) and add:
  ```tsx
  it('is one card of rows, each with a drawn tick and a word for its state', async () => {
    drawVisibility(POLICY)
    const card = await screen.findByRole('group', { name: 'سیاست نمایش محتوا' })
    const rows = within(card).getAllByRole('checkbox')
    expect(rows).toHaveLength(6)
    // F5/X4 — `min-h-touch min-w-touch` on an `appearance:auto` checkbox renders
    // a 44px OS square with a 44px tick, beside a two-line block ~40px tall. The
    // control was bigger than the content it labelled, and the same control is
    // 16px in `ScopePicker`. §6.12 fixes it at 19×19 with a `#DCD3EC` off-border
    // and a `#1F8A5B` fill.
    rows.forEach((r) => expect(r).toHaveClass('sr-only'))       // the input is the a11y layer
    expect(within(card).getAllByTestId('tick')).toHaveLength(6)
    // The left-hand state word — the thing that fills 55–60% of a blank row.
    const summary = within(card).getByRole('listitem', { name: 'خلاصهٔ فرآیند' })
    expect(within(summary).getByText('پنهان است')).toHaveClass('text-muted')
    const actor = within(card).getByRole('listitem', { name: 'مسئول فعالیت' })
    expect(within(actor).getByText('نمایش داده می‌شود')).toHaveClass('text-green')
  })

  it('separates rows with a hairline and does not rule off the last one', async () => {
    drawVisibility(POLICY)
    const rows = within(await screen.findByRole('group', { name: 'سیاست نمایش محتوا' }))
      .getAllByRole('listitem')
    rows.slice(0, -1).forEach((r) => expect(r).toHaveClass('border-b'))
    expect(rows[rows.length - 1]).toHaveClass('last:border-b-0')
  })
  ```

- [ ] **Step 2: Run it and watch it fail.**
  `cd ui && npx vitest run src/screens/Visibility.test.tsx -t 'one card of rows'`
  Expected: `FAIL … Unable to find role="group" and name "سیاست نمایش محتوا"`.

- [ ] **Step 3: Rebuild the screen body.**
  Replace everything from `return (` to the end of `ui/src/screens/Visibility.tsx`:
  ```tsx
    return (
      <div className="flex-1 overflow-auto py-screen-y px-screen-x max760:px-s7 max760:py-s9">
        <div className="max-w-access mx-auto">
          <h1 className="text-title font-extrabold text-role-title-on-field m-0">سیاست نمایش محتوا</h1>
          {/* §6.12 — the intro makes the framing explicit: a decision applied to
              every non-editor, not a permission granted to anybody. It is
              `13px #C9BEEE lh 1.8` capped at 600px, on the violet field. */}
          <p className="text-fs-sm text-violet-on-violet leading-loose max-w-intro mt-s4 m-0">
            این تنظیم برای همهٔ کسانی که اجازهٔ ویرایش ندارند یکسان است و به دپارتمان یا
            نقش کسی بستگی ندارد. معرفی دپارتمان همیشه به‌طور کامل نمایش داده می‌شود و
            تنظیمی ندارد.
          </p>

          {/* One card, not six. `Card` imported rather than re-declared: this
              screen carried `bg-card border border-warm rounded-card shadow-card`
              inline, byte for byte identical to the primitive it did not use. */}
          <Card role="group" aria-label="سیاست نمایش محتوا"
            aria-busy={set.isPending || undefined}
            className={`px-s9 py-s4 mt-s10 transition-opacity
                        ${set.isPending ? 'opacity-60' : ''}`}>
            <ul className="list-none p-0 m-0">
              {rows.map(({ field, label, hint }) => {
                const on = fields[field]
                const failed = set.error && set.variables?.field === field
                return (
                  <li key={field} role="listitem" aria-label={label}
                    className="border-b border-hair last:border-b-0">
                    <label className="flex items-start gap-s6 py-s7 px-s1 cursor-pointer
                                      transition-colors hover:bg-tile-v4
                                      max760:flex-wrap">
                      {/* `aria-label` even though the label wraps the control:
                          the accessible name computed from a wrapping label is
                          its WHOLE subtree, so without this every row is
                          announced as its title, its explanation and its state
                          word run together. */}
                      <Checkbox box={19} tone="green" checked={on}
                        aria-label={label} aria-describedby={`vis-hint-${field}`}
                        disabled={set.isPending} label={null}
                        onChange={(v) => set.mutate({ field, visible: v })} />
                      <span className="flex-1 min-w-0">
                        <span className="block text-fs-menu font-bold text-ink">{label}</span>
                        <span id={`vis-hint-${field}`}
                          className="block text-fs-xs text-muted leading-normal mt-s2">
                          {hint}
                        </span>
                        {failed && (
                          // §4.6 — "Errors are stated in copy: a `11.5px/600
                          // #E23D35` line under the offending control." It used
                          // to be one bare red line hanging under the last card,
                          // naming no field, while the switch that failed sprang
                          // back to the server's value in silence.
                          <span role="alert"
                            className="block text-fs-xs font-semibold text-conflict mt-s3">
                            {FAILED}
                          </span>
                        )}
                      </span>
                      {/* The word §6.12 puts at the far end of the row, and the
                          reason the row is not 60% empty. `11px/600`, green when
                          shown and muted when hidden. */}
                      <span className={`ms-auto shrink-0 text-fs-xxs font-semibold
                                        ${on ? 'text-green' : 'text-muted'}`}>
                        {on ? STATE_ON : STATE_OFF}
                      </span>
                    </label>
                  </li>
                )
              })}
            </ul>
          </Card>

          <p className="text-fs-xs text-faint mt-s10 m-0">
            {/* F8/F9 — the label used to sit inside `font-mono`, a latin stack
                with no Persian glyphs, so «نسخهٔ تنظیم:» fell through to whatever
                the OS substituted; and the digest, which can hold a `-` or a `_`,
                bidi-reordered inside the Persian sentence. Only the digest is
                mono, and only the digest is pinned. */}
            نسخهٔ تنظیم: <span dir="ltr" className="font-mono">{data.version}</span>
          </p>
        </div>
      </div>
    )
  }
  ```
  Add above the component:
  ```tsx
  /** The two words §6.12 puts at the end of every row. Exported so the screen
   *  and its test cannot come to word the same state differently. */
  export const STATE_ON = 'نمایش داده می‌شود'
  export const STATE_OFF = 'پنهان است'
  ```
  Imports: `Card` from `../ui/Card`, `Checkbox` from `../ui/Checkbox`.

- [ ] **Step 4: Run it and watch it pass.**
  `cd ui && npx vitest run src/screens/Visibility.test.tsx` → all green.

- [ ] **Step 5: A failing test for the busy state.**
  F10: all six disable on one flip with no visual for it — the page goes dead for
  ~200ms with only the UA's default greying to explain it. Append:
  ```tsx
  it('looks busy rather than frozen while a flip is in flight', async () => {
    const { resolve } = drawVisibility(POLICY, { hold: true })
    await userEvent.click(await screen.findByRole('checkbox', { name: 'خلاصهٔ فرآیند' }))
    const card = screen.getByRole('group', { name: 'سیاست نمایش محتوا' })
    expect(card).toHaveAttribute('aria-busy', 'true')
    expect(card).toHaveClass('opacity-60')
    // §4.6 Disabled — "keeps its surface and fades". S1 expresses it as an
    // opacity on the container, which is exactly one flip's worth of feedback
    // for a mutation that really does hold every row.
    resolve()
    await waitFor(() => expect(card).not.toHaveAttribute('aria-busy'))
  })
  ```

- [ ] **Step 6: Run it, and pass it.**
  `cd ui && npx vitest run src/screens/Visibility.test.tsx -t 'busy rather than frozen'`
  It should pass on Step 3's code as written; if `drawVisibility` has no `hold`
  option yet, add one that returns a deferred `Response` and resolves it on
  demand. Then `npx tsc -b && npx eslint .` → clean.
  ```
  git add ui/src/screens/Visibility.tsx ui/src/screens/Visibility.test.tsx
  git commit -m "feat(ui): six floating cards become one, and every row says where it stands"
  ```

- [ ] **Step 7: Report the two divergences. Do not write them into the ledger.**
  `docs/superpowers/ui-normalisation-ledger.md` is maintained by the reviewer at review time,
  for the same one-file-many-writers reason the harness table is frozen. **Put the block below
  in your task report, under "the ledger rows this task would add"; do not open the ledger.**
  ```md
  ## Visibility policy (§6.12) — two divergences

  | # | Design | Built | Why |
  |---|---|---|---|
  | V1 | Seven rows, the first («نام گام و ترتیب گام‌ها») **on and locked** | Six rows, whatever the server declares | The switch set comes from `GET /api/visibility`, not from a constant: a field the server declared with no wording here is still drawn under its own key, and a field named here that the server does not know is not drawn at all. A hardcoded seven makes the first case a field silently published with no way to turn it off. And R5: a locked row is a control you would refuse — drawn, it is exactly the "disabled with an explanation" the rule forbids. **Owner question: should `label` become a server field?** |
  | V2 | The card is `border-radius:16px` in §6.12; `ui-audit-visual.md` reads 20px off the rendered prototype | 16px | §6.12 quotes the literal value from S1; the visual audit measured a screenshot. The spec is the authority (`ui-design-spec.md` §0). |
  ```
  Nothing is staged or committed by this step.

- [ ] **Step 8: Prove every class this screen writes emits.**
  ```bash
  cd ui && npx vite build
  node scripts/harvest-classes.mjs src/screens/Visibility.tsx
  ```
  Expected: the run ends `DEAD 0   EMPTY 0   NOVAR 0`, both controls hold
  (`control (negative): N/N invented names reported dead` and
  `control (escaping): … escaped variant classes unescaped`), and the last line
  is `PASS`. The script exits 1 on any failure, so it can be `&&`-chained.
  The class list is **harvested out of these files**, never hand-kept, so it
  cannot drift from what they write and `tailwind-probe.txt` cannot certify it
  on their behalf — see *The class-emission check* in Global Constraints for the
  measurement that retired the old grep.

  **A failure.** `DEAD` — the class compiled to no rule at all; that is a **typo
  in the component**, so fix the class string, rebuild, re-run. `EMPTY` — the
  selector emitted with an empty body, so the theme key resolves to nothing.
  `NOVAR` — the rule reads a `var(--…)` nothing declares. The last two are theme
  regressions: **stop and report them.** Do **not** add the name to
  `ui/tailwind.config.js`, `src/styles/tokens.css`, `src/styles/roles.css` or
  `tailwind-probe.txt`. All four are frozen for the duration of this plan and
  were unfrozen exactly once, by the single minting pass in
  `.superpowers/sdd/mint-spec.md`; minting one here to make a misspelling compile
  recreates the unreachable-token problem the whole rebuild exists to fix. A
  value that genuinely has no name goes into `mint-spec.md`, not into the config
  and not into this task's commit.

  **What this step cannot prove:** that these files write a class and that the
  class compiles to a rule with declarations, yes. That the class reaches the
  right element, that the element renders, that it is visible, or that its value
  is the one the design asks for — no. That stays with the Playwright checks.

- [ ] **Step 9: Read the `policy` row the harness already holds. Do not write one.**
  This step used to say *"add `policy` to the harness table"*, in field names (`maxWidth`,
  `padX`, `padY`) that `ScreenDesign` does not have. **`ui/e2e/_harness.ts` is frozen and the
  row is already in it** — written ahead of the screens (`3dda9ef`) because eleven tasks
  appending to one file in one working tree lose all but the last write, with a green build.
  It is keyed `policy`, not `visibility`, so `Visibility.tsx` writes `data-screen="policy"`.

  ```bash
  cd ui && node -e "const s=require('fs').readFileSync('e2e/_harness.ts','utf8');console.log('policy:', s.includes('  policy:')?'present':'MISSING')"
  ```

  Read it, and note what it deliberately does **not** carry:

  - `column` is `820px` (`--width-access`) — §3.3 gives the policy screen Access's width.
  - `card.radius` is **16px**, ledger **V2**: §6.12 quotes the literal, the visual audit
    measured a screenshot at 20. The row takes the spec.
  - `h1.color` is `TITLE_ON_FIELD`, white (L-01), which is what the JSX above writes —
    `text-role-title-on-field`, not `text-on-dark` (`#FBF7F1`, the value L-01 retired).
  - **no `focus`** — the row's only control is an `sr-only` input behind a drawn 19px tick, and
    a 1×1 clipped box is the wrong thing to measure a focus indicator on;
  - **no `lift`** — F7's fix is a hover *fill* (`hover:bg-tile-v4`), not a transform: §4.6
    lifts cards, not rows inside one.

  Neither omission is an oversight to fill in. **If the row is missing, or a number in it
  disagrees with §6.12, stop and report it** — do not add a row and do not edit one.

- [ ] **Step 10: Write the Playwright check.**
  Create `ui/e2e/visibility.spec.ts`:
  ```ts
  import { test, expect } from '@playwright/test'
  import { expectDesign, serve, shot, signedIn, visit } from './_harness'

  test('policy — one card, 19px ticks, a word on the left', async ({ page }) => {
    // `signedIn` + `serve`, not a bare `goto`: with nothing intercepted every
    // /api/ request leaves the browser and is answered by the FastAPI container
    // on :8000, and `expectDesign` fails the spec for it.
    await signedIn(page)
    await serve(page, { '/api/visibility': POLICY, '/api/departments': DEPARTMENTS, '/api/pending': [] })
    await visit(page, '/visibility', 'policy')
    await expectDesign(page, 'policy')

    // One card, not six (or seven).
    await expect(page.getByRole('group', { name: 'سیاست نمایش محتوا' })).toHaveCount(1)

    // §6.12 — a 19×19 tick with a `#DCD3EC` off-border, `#1F8A5B` when on. The
    // finding: a 44×44 OS checkbox with a 44px tick beside a 40px block.
    const tick = page.getByTestId('tick').first()
    await expect(tick).toHaveCSS('width', '19px')
    await expect(tick).toHaveCSS('height', '19px')
    await expect(tick).toHaveCSS('border-color', 'rgb(220, 211, 236)')

    const row = page.getByRole('listitem', { name: 'مسئول فعالیت' })
    await expect(row).toHaveCSS('border-bottom-color', 'rgb(242, 236, 227)')

    // The state word sits at the inline end — which in RTL is the physical left,
    // and it is what the empty 60% of the row was for.
    const state = row.getByText(/نمایش داده می‌شود|پنهان است/)
    const [rowBox, stateBox] = await Promise.all([row.boundingBox(), state.boundingBox()])
    expect(stateBox!.x - rowBox!.x).toBeLessThan(rowBox!.width * 0.35)
    await expect(state).toHaveCSS('font-size', '11px')
    await expect(state).toHaveCSS('font-weight', '600')

    // F7 — `cursor-pointer` on six clickable cards with no hover whatsoever.
    await row.hover()
    await expect(row.locator('label')).toHaveCSS('background-color', 'rgb(248, 244, 254)')

    await shot(page, 'visibility')
  })
  ```

- [ ] **Step 11: Run it at three widths, fix, commit.**
  `cd ui && npx playwright test e2e/visibility.spec.ts` → `3 passed`. Compare
  `e2e/__shots__/visibility-1440.png` with
  `.superpowers/sdd/ui-audit-shots/design-policy.png`.
  ```
  git commit ui/e2e/visibility.spec.ts ui/e2e/__shots__ \
    -m "test(ui): the policy card is measured in a browser, at all three widths"
  ```
  `ui/e2e/_harness.ts` is **not** staged: it is frozen and this task did not touch it. Commit
  by pathspec, not `git add` + bare `git commit` — the latter commits the *index*, and another
  agent's staged change has already been swallowed into an unrelated commit that way.

---

### Task 24: `ui/src/write/**` — `ConfirmMark` and the write flows

`ConfirmMark` is rendered into the **title line** of `ProcessList`, `Summary` and
`Overview`. `Button`'s `BASE` is `min-h-touch min-w-touch` — 44 × 44px — so one
green button forces every process row's title from its natural ~22px to 44px,
leaving the id badge and the tag floating vertically centred in the space it
made. On the process list this happens on every row, so the whole list's rhythm
is set by a button (F1). Its `px-3 py-1.5` is the only raw-Tailwind spacing in
the nine screens — 12px against `px-s8` = 16px everywhere else — and `py-1.5` is
**inert**, because `min-h-touch` already forces 44px (F2). Then the five older
dialogs, which bypass `Overlay` entirely and carry a workaround apiece for a
scrollbar decision made in a sixth file (P3, O1).

**Files**

| Action | Path |
|---|---|
| Modify | `ui/src/write/ConfirmMark.tsx` |
| Modify | `ui/src/write/ConfirmMark.test.tsx` |
| Modify | `ui/src/screens/ProcessList.tsx`, `Summary.tsx`, `Overview.tsx` (call sites only) |
| Modify | `ui/src/write/CreateProcessModal.tsx`, `DeleteProcessConfirm.tsx`, `InboxModal.tsx`, `ReorderModal.tsx`, `ExportModal.tsx`, `ExportMenu.tsx`, `ToastProvider.tsx` |
| Modify | their five `*.test.tsx` siblings |
| Modify | `ui/src/index.css` |
| Create | `ui/e2e/write.spec.ts` |

**Files this task must not write**

| Path | Why | What to do instead |
|---|---|---|
| `ui/tailwind.config.js`, `ui/src/styles/tokens.css`, `ui/src/styles/roles.css`, `ui/tailwind-probe.txt` | Frozen between deliberate minting passes, so many tasks can run in one tree without clobbering each other. Unfrozen exactly once, by the single consolidated mint. | A value with no token is not minted here — Step 22 already says so for the one this task meets. Stop, and report the value and its role. |
| `ui/e2e/_harness.ts` | Pre-populated and frozen — eleven tasks appending to one file in one tree lose all but the last write, with a green build. | **This task needs nothing from the table.** `write.spec.ts` imports `shot` only: no `expectDesign`, no `DESIGN` row, and none is wanted (`.superpowers/sdd/ui-harness-preflight-report.md`, F6 — of the eleven screen tasks, this is the one that never wanted a row). Its fixtures belong in `write.spec.ts`. If you find yourself needing to change the harness, stop and report it. |
| `docs/superpowers/ui-normalisation-ledger.md` | Maintained by the reviewer at review time. | Report the row you would add, in your task report. |

**Interfaces**

*Consumes* — `Dialog`/`Sheet` (Task 6: `width`, `subtitle`, `footer`, `icon`,
`blurScrim`), `Button` (`danger`, `affirm`, `block`, disabled appearance),
`IconButton`, `Icon`, `Menu`, `SectionCard`, `Toast`; `bg-tile-ok` · `bg-tile-c` ·
`text-green` · `text-conflict` · `rounded-tile` (14px) · `w-tool h-tool` (34px) ·
`shadow-modal` · the `max760:` variant (the ≤760 mobile pass — there is no `narrow` screen or utility; both breakpoints are `addVariant`'d as `max1080:`/`max760:`).

*Produces*
```ts
// ui/src/write/ConfirmMark.tsx
export function ConfirmMark(props: { row: Confirmation | undefined; department: string }): JSX.Element | null
export function ConfirmAction(props: { row: Confirmation | undefined; department: string }): JSX.Element | null
```

---

- [ ] **Step 1: A failing test — the mark must not resize its host row.**
  Append to `ui/src/write/ConfirmMark.test.tsx`:
  ```tsx
  describe('the mark states, and the action acts (F1, F2, F3)', () => {
    it('renders a pill and nothing that can force a row taller', async () => {
      drawMark({ confirmed: true })
      const mark = screen.getByTestId('confirm-mark')
      // F1 — `Button`'s BASE is `min-h-touch min-w-touch` = 44×44. Dropped into
      // a title line built from an 11px id badge, a 15px name and a 10.5px tag —
      // natural height ~22px — it set the height of every row on the list.
      expect(within(mark).queryAllByRole('button')).toHaveLength(0)
      expect(mark.querySelector('.min-h-touch')).toBeNull()
      expect(within(mark).getByText('تأیید شده')).toBeInTheDocument()
    })

    it('keeps the failure sentence out of the title row (F3)', async () => {
      drawMark({ confirmed: false, error: 409 })
      // MOVED is 62 Persian characters. On a 920px row already carrying a badge,
      // a name, a tag, a pill and a button, it had nowhere to go but a second
      // line — so the row silently doubled and pushed every row below it down.
      expect(within(screen.getByTestId('confirm-mark')).queryByRole('alert')).toBeNull()
    })

    it('gives the byline a colour somebody can read (F4)', async () => {
      drawMark({ confirmed: true, by: 3, at: 1753000000 })
      // `--text-faint #a99fc4` at 12.5px on cream is 2.33:1. Who signed off and
      // when was the least legible text on the row.
      expect(screen.getByTestId('confirm-by')).toHaveClass('text-muted')
      expect(screen.getByTestId('confirm-by')).not.toHaveClass('text-faint')
    })
  })
  ```

- [ ] **Step 2: Run it and watch it fail.**
  `cd ui && npx vitest run src/write/ConfirmMark.test.tsx -t 'renders a pill and nothing'`
  Expected: `FAIL … expected length 1 to be 0`.

- [ ] **Step 3: Reduce `ConfirmMark` to the state it names.**
  Replace its `return (…)` with:
  ```tsx
    return (
      <span data-testid="confirm-mark" className="inline-flex items-center gap-s4">
        <StatusPill tone={row.confirmed ? 'ok' : 'warn'}
          label={row.confirmed ? 'تأیید شده' : 'تأیید نشده'} />
        {by !== null && typeof at === 'number' && (
          // `at` is unix **seconds** — `int(time.time())` on the server, not the
          // ISO string every other timestamp in this app carries. Handed to
          // `jalali` raw it is read as milliseconds and prints ۱۳۴۸/…, five
          // decades off and perfectly plausible-looking.
          <span data-testid="confirm-by" className="text-fs-xs text-muted">
            توسط {toFa(by)} · {jalali(new Date(at * 1000).toISOString())}
          </span>
        )}
      </span>
    )
  ```
  A pill and a byline: nothing here has a `min-h`, so the row is as tall as its
  own type again. The two mutations, the failure sentence and the 409 reconciliation
  move to `ConfirmAction` in the next step — this component now states a fact and
  performs no act, which is why it can live in a title line at all.

- [ ] **Step 4: Run it and watch it pass, then commit.**
  `cd ui && npx vitest run src/write/ConfirmMark.test.tsx -t 'renders a pill'` → `1 passed`.
  ```
  git add ui/src/write/ConfirmMark.tsx ui/src/write/ConfirmMark.test.tsx
  git commit -m "fix(ui): the confirmation mark stops setting the height of every row"
  ```

- [ ] **Step 5: A failing test for the action and its dialog.**
  Append:
  ```tsx
  it('confirms behind the design\'s confirm-content dialog', async () => {
    const { set } = drawAction({ confirmed: false })
    await userEvent.click(screen.getByRole('button', { name: 'تأیید محتوا' }))
    const dialog = await screen.findByRole('dialog', { name: /تأیید محتوا/ })
    // §6.15 `confirmDialog` — a 42×42 radius-14 tinted glyph tile beside a
    // 17px/800 title; OK filled `#1F8A5B` confirming, `#FA5A52` un-confirming.
    expect(within(dialog).getByTestId('confirm-glyph')).toHaveClass('bg-tile-ok', 'text-green')
    expect(set).not.toHaveBeenCalled()
    await userEvent.click(within(dialog).getByRole('button', { name: 'تأیید محتوا' }))
    // The fingerprint comes from the server and goes straight back: the client
    // computes none, because canonical JSON here would have to agree with
    // Python's byte for byte over Persian text.
    expect(set).toHaveBeenCalledWith({ target: 'dining-003', fingerprint: 'abc' })
  })

  it('is a 44px hit target drawn at the design\'s 34px', async () => {
    drawAction({ confirmed: false })
    const button = screen.getByRole('button', { name: 'تأیید محتوا' })
    expect(button).toHaveClass('min-h-touch', 'min-w-touch')
    expect(within(button).getByTestId('confirm-box')).toHaveClass('w-tool', 'h-tool')
  })

  it('says a 409 is not a retry, and stops saying it when it stops being true', async () => {
    const { rerender } = drawAction({ confirmed: false, error: 409 })
    expect(screen.getByRole('alert')).toHaveTextContent(/دوباره بررسی کنید/)
    // `onSettled` refetches the listing, so a row carrying a *fresh* fingerprint
    // arrives moments later and the complaint stops being true. Left alone it
    // sat beside an up-to-date row telling the editor to look again at something
    // they were now looking at.
    rerender({ fingerprint: 'def' })
    expect(screen.queryByRole('alert')).toBeNull()
  })
  ```

- [ ] **Step 6: Run it and watch it fail.**
  `cd ui && npx vitest run src/write/ConfirmMark.test.tsx -t "confirm-content dialog"`
  Expected: `FAIL … drawAction is not defined` → add the helper, then
  `FAIL … Unable to find role="button" and name "تأیید محتوا"`.

- [ ] **Step 7: Write `ConfirmAction`.**
  Append to `ui/src/write/ConfirmMark.tsx`:
  ```tsx
  /**
   * The two acts the mark used to carry, moved off the title line.
   *
   * **Why it is a separate component.** A 44px control cannot live in a 22px
   * badge row, and shrinking it below the touch floor is not the trade to make:
   * the design's own answer is a `34×34` icon button in the row's action group
   * (§5.2) with the decision itself behind §6.15's confirm-content dialog. So the
   * mark states and this acts, and the row's height is the row's business again.
   *
   * The 44px hit target survives as padding around a 34px drawn box — the app's
   * touch floor is a real accessibility commitment (`--size-touch`), and the
   * design's 34px is what is *painted*, not what is pressable.
   *
   * Drawn for nobody but a holder of `confirm` on this department. Not a
   * disabled button and not a greyed mark: a non-editor is only ever served
   * content that *is* confirmed (D22), so a mark would state something true of
   * everything they can see and therefore say nothing at all.
   */
  export function ConfirmAction({ row, department }:
    { row: Confirmation | undefined; department: string }) {
    const can = useCan(useSession().data)
    const set = useSetConfirmation(department)
    const revoke = useRevokeConfirmation(department)
    const [asking, setAsking] = useState(false)
    if (!row || !can('confirm', `dept:${department}`)) return null

    const failure = set.error ?? revoke.error
    const status = failure instanceof ApiError ? failure.status : 0
    const moved = status === 409
    const outlived = moved && set.variables !== undefined
      && set.variables.fingerprint !== row.fingerprint
    const confirming = !row.confirmed
    const label = confirming ? 'تأیید محتوا' : 'لغو تأیید'

    return (
      <>
        <IconButton label={label} className="min-h-touch min-w-touch"
          onClick={() => setAsking(true)}
          icon={
            <span data-testid="confirm-box"
              className={`flex items-center justify-center w-tool h-tool rounded-button
                          border-hairline transition-colors
                          ${confirming ? 'border-line text-violet hover:bg-tile-v2'
                                       : 'border-border-danger text-conflict hover:bg-tile-c2'}`}>
              <Icon name={confirming ? 'check' : 'check-off'}
                className="w-s9 h-s9" strokeWidth={2.6} />
            </span>
          } />

        {asking && (
          // §6.15 `confirmDialog` — Modal 460, radius 24, padding 26.
          <Dialog open onClose={() => setAsking(false)} width={460} title={label}
            icon={
              <span data-testid="confirm-glyph"
                className={`flex items-center justify-center w-glyph-tile h-glyph-tile
                            rounded-tile ${confirming ? 'bg-tile-ok text-green'
                                                      : 'bg-tile-c text-conflict'}`}>
                <Icon name={confirming ? 'check' : 'check-off'}
                  className="w-s10 h-s10" strokeWidth={2.6} />
              </span>
            }
            subtitle={confirming
              ? 'تأیید شما به این نسخهٔ دقیق از محتوا بسته می‌شود؛ با هر ویرایش بعدی از بین می‌رود.'
              : 'با لغو تأیید، این محتوا برای کسانی که اجازهٔ ویرایش ندارند دیده نمی‌شود.'}
            footer={
              <div className="flex gap-s5">
                <Button variant={confirming ? 'green' : 'coral'}
                  className="flex-1 py-s6 text-fs-menu rounded-button"
                  loading={set.isPending || revoke.isPending} loadingLabel="در حال ثبت…"
                  onClick={() => {
                    if (confirming) {
                      set.mutate({ target: row.target, fingerprint: row.fingerprint },
                        { onSuccess: () => setAsking(false) })
                    } else {
                      revoke.mutate(row.target, { onSuccess: () => setAsking(false) })
                    }
                  }}>
                  {label}
                </Button>
                <Button variant="ghost" className="flex-1 py-s6 text-fs-menu rounded-button"
                  onClick={() => setAsking(false)}>انصراف</Button>
              </div>
            }>
            {failure && !outlived && (
              // role="alert": this text appears after the press that caused it,
              // so a screen reader is elsewhere when it arrives. On its own line
              // inside the dialog rather than inline in a process row.
              <p role="alert" className="text-fs-xs font-semibold text-conflict m-0">
                {moved ? MOVED : status === 403 ? GONE : FAILED}
              </p>
            )}
          </Dialog>
        )}
      </>
    )
  }
  ```

- [ ] **Step 8: Run it and watch it pass.**
  `cd ui && npx vitest run src/write/ConfirmMark.test.tsx` → all green.

- [ ] **Step 9: Move the action to each host's action group.**
  Three one-line call-site edits, each putting `<ConfirmAction>` where the row's
  other controls already are and leaving `<ConfirmMark>` in the title line:
  - `ProcessList.tsx` — beside the activity count in the row's `shrink-0` column.
  - `Summary.tsx` — in the header's `justify-between` action side.
  - `Overview.tsx` — in the header's `justify-between` action side.
  Import `ConfirmAction` alongside `ConfirmMark` in all three.

- [ ] **Step 10: Run the three host suites.**
  ```
  cd ui && npx vitest run src/screens/ProcessList.test.tsx src/screens/Summary.test.tsx \
    src/screens/Overview.test.tsx src/write/ConfirmMark.test.tsx
  ```
  → all green. Any assertion that found the button *inside* the title row moves
  with it; nothing about what the endpoints do changed.
  ```
  git add ui/src/write/ConfirmMark.tsx ui/src/write/ConfirmMark.test.tsx \
          ui/src/screens/ProcessList.tsx ui/src/screens/Summary.tsx ui/src/screens/Overview.tsx
  git commit -m "feat(ui): confirming moves out of the title line and behind a dialog"
  ```

- [ ] **Step 11: Prove the row height in a browser — this is the whole finding.**
  Create `ui/e2e/write.spec.ts`:
  ```ts
  import { test, expect } from '@playwright/test'
  import { serve, shot, signedIn, visit } from './_harness'

  const CODE = 'dining'

  test('a process row is as tall as its own type', async ({ page }) => {
    // `signedIn` + `serve`, not a bare `goto`: `shot` calls
    // `expectEveryEndpointStubbed`, which fails a spec that intercepts nothing —
    // with no route installed every /api/ request leaves the browser and is
    // answered by the FastAPI container on :8000, so the check would grade a live
    // database instead of the working tree.
    await signedIn(page)
    await serve(page, {
      '/api/departments': DEPARTMENTS,
      [`/api/departments/${CODE}/processes`]: PROCESSES,
      [`/api/confirmations?department=${CODE}`]: CONFIRMATIONS,
      '/api/pending': [],
    })
    await visit(page, `/departments/${CODE}`)
    const title = page.getByTestId('process-title').first()
    const box = (await title.boundingBox())!
    // F1 — this line was forced to 44px by one green button, on every row.
    expect(box.height).toBeLessThan(30)
    // The pill is still on it; only the act left.
    await expect(title.getByTestId('confirm-mark')).toBeVisible()
    // §2.4 — the process-row name is 17px, and the badge and tag beside it are
    // 9px. Nothing on this line is a control.
    await expect(title.getByTestId('confirm-mark').getByRole('button')).toHaveCount(0)
    await shot(page, 'process-list-row')
  })
  ```

- [ ] **Step 12: Run it at three widths, fix, commit.**
  `cd ui && npx playwright test e2e/write.spec.ts` → `3 passed`.
  ```
  git add ui/e2e/write.spec.ts ui/e2e/__shots__
  git commit -m "test(ui): the row height that started this is measured in a browser"
  ```

- [ ] **Step 13: A failing test — the five dialogs join `Overlay`.**
  Create one shared block and add it to each of the five test files
  (`CreateProcessModal`, `DeleteProcessConfirm`, `InboxModal`, `ReorderModal`,
  `ExportModal`), substituting the dialog's own name and width:
  ```tsx
  it('is a real dialog: escape closes it, focus is trapped, and the scrim is the primitive\'s', async () => {
    drawDialog()
    const box = await screen.findByRole('dialog', { name: 'فرآیند تازه' })
    expect(box).toHaveAttribute('aria-modal', 'true')
    // P3/O7 — five dialogs bypassed `Overlay` and hand-picked z-40, z-50, z-[60],
    // z-[72], z-[74] against its computed `50 + depth * 10`; three of them could
    // not be closed from the keyboard at all.
    expect(box.closest('[style*="z-index"]')).not.toBeNull()
    expect(document.body.style.overflow).toBe('hidden')
    await userEvent.keyboard('{Escape}')
    expect(screen.queryByRole('dialog')).toBeNull()
  })

  it('does not re-pin its own direction', async () => {
    drawDialog()
    // O1 — five files carried `dir="rtl"` and a comment explaining it, because
    // `ProcessList` set `dir="ltr"` on its whole scrolling region to move a
    // scrollbar. §8's own idiom flips the *container* and its immediate children
    // back, and that belongs in one place, not in every dialog that mounts
    // inside it.
    expect(screen.getByRole('dialog').getAttribute('dir')).toBeNull()
  })
  ```

- [ ] **Step 14: Run them and watch them fail.**
  ```
  cd ui && npx vitest run src/write/CreateProcessModal.test.tsx \
    src/write/DeleteProcessConfirm.test.tsx src/write/InboxModal.test.tsx \
    src/write/ReorderModal.test.tsx src/write/ExportModal.test.tsx -t 'real dialog'
  ```
  Expected: `5 failed` — `Unable to find role="dialog"` on three of them and
  `expected 'rtl' to be null` on the rest.

- [ ] **Step 15: Fix the cause — `ProcessList`'s LTR scroll box.**
  In `ui/src/screens/ProcessList.tsx` delete the `dir="ltr"` on the scrolling
  region and the `dir="rtl"` re-pin on its content, and put §8's idiom in
  `ui/src/styles/base.css` where it belongs:
  ```css
  /* §8 — every scrolling container is flipped to `ltr` so its scrollbar sits on
     the right, and its immediate children are flipped straight back to `rtl`.
     Deliberate: the design wants RTL text with a right-hand scrollbar. It lived
     in `ProcessList.tsx` as two inline attributes, which is why five write
     dialogs each carried a re-pin of their own with a comment explaining it. */
  [data-scrollbox] { direction: ltr; }
  [data-scrollbox] > * { direction: rtl; }
  ```
  and mark the region `data-scrollbox` instead. Delete the `dir="rtl"` re-pin and
  its comment from all five dialogs.

- [ ] **Step 16: Move the five onto `Overlay`.**
  Each becomes `<Dialog open onClose={…} title={…} width={…} footer={…}>`, with
  §3.3's widths: conflict inbox `640`, reorder `540`, export `520`, create `460`,
  delete confirm `440`. Delete from each: the hand-rolled `fixed inset-0` scrim,
  its `bg-[rgba(36,17,82,.45)]`, its `z-*`, its own close button and its
  `dir="rtl"`. `InboxModal`'s close button goes with the rest — it had no
  `aria-label`, no `title` and no visually-hidden text, so a screen reader
  announced "×" or nothing (O3); `Overlay`'s carries «بستن».

- [ ] **Step 17: Run the five suites and watch them pass.**
  ```
  cd ui && npx vitest run src/write/ src/screens/ProcessList.test.tsx
  ```
  → all green. Then `npx tsc -b && npx eslint .`.
  ```
  git add ui/src/write ui/src/screens/ProcessList.tsx ui/src/styles/base.css
  git commit -m "fix(ui): five dialogs stop inventing a scrim, and one file stops inverting the page"
  ```

- [ ] **Step 18: A failing test for the destructive button and the busy states.**
  Append to `ui/src/write/DeleteProcessConfirm.test.tsx`:
  ```tsx
  it('draws the one irreversible action with the danger variant', async () => {
    drawDelete()
    const go = screen.getByRole('button', { name: 'حذف کامل فرآیند' })
    // O6 — it was hand-rolled because `Button` had no `danger`: `rounded-xl`
    // (Tailwind's 12px, not `--radius-md`), `text-sm` (14px, not `--fs-body`),
    // `text-white` (not `text-card`), `text-[#6B5CA5]` on its sibling — and none
    // of `Button`'s touch floor, focus handling or loading state.
    expect(go).toHaveClass('bg-tile-c2', 'text-conflict', 'border-border-danger')
    expect(go).toHaveClass('min-h-touch')
  })

  it('looks busy rather than unchanged while the delete is in flight', async () => {
    const { hold } = drawDelete({ hold: true })
    await userEvent.click(screen.getByRole('button', { name: 'حذف کامل فرآیند' }))
    // O8/P1 — `disabled={del.isPending}` rendered no visible change at all, and
    // `Button` had no disabled appearance, so the slowest action in the product
    // looked frozen. S4: "a busy button swaps its icon for a spinner, forces
    // itself disabled, and says «در حال ذخیره…»".
    const go = screen.getByRole('button', { name: /در حال حذف/ })
    expect(go).toHaveAttribute('aria-busy', 'true')
    expect(within(go).getByTestId('btn-spinner')).toBeInTheDocument()
    hold.resolve()
  })
  ```
  The same busy assertion goes into `CreateProcessModal.test.tsx`.

- [ ] **Step 19: Run it and watch it fail.**
  `cd ui && npx vitest run src/write/DeleteProcessConfirm.test.tsx -t 'danger variant'`
  Expected: `FAIL … expected element to have class "bg-tile-c2"`.

- [ ] **Step 20: Use the variants and the loading state.**
  In `DeleteProcessConfirm.tsx`:
  ```tsx
        footer={
          <div className="flex gap-s5">
            <Button variant="danger" className="flex-1 py-s6 text-fs-menu rounded-button"
              loading={del.isPending} loadingLabel="در حال حذف…"
              onClick={() => del.mutate(pid, { onSuccess: onDone })}>
              حذف کامل فرآیند
            </Button>
            <Button variant="ghost" className="flex-1 py-s6 text-fs-menu rounded-button"
              onClick={onClose}>انصراف</Button>
          </div>
        }
  ```
  In `CreateProcessModal.tsx` replace `disabled={create.isPending}` with
  `loading={create.isPending} loadingLabel="در حال ساخت…"` — `loading` already
  forces `disabled`, so nothing is lost and the wait becomes visible.

- [ ] **Step 21: Give reordering a keyboard path (O4).**
  `ReorderModal.tsx` implements its rows as `draggable` with four drag handlers
  and nothing else: a keyboard or screen-reader user can open the dialog, read
  the order and save it unchanged. Add, per row, beside the `⣿` handle (one of
  §5.2's two sanctioned unicode glyphs, so it stays):
  ```tsx
              <div className="flex flex-col gap-s1 shrink-0">
                <IconButton label={`بردن «${p.name}» به بالا`} className="min-h-touch min-w-touch"
                  disabled={i === 0} onClick={() => move(i, i - 1)}
                  icon={<Icon name="chevron-up" className="w-s7 h-s7" strokeWidth={2.4} />} />
                <IconButton label={`بردن «${p.name}» به پایین`} className="min-h-touch min-w-touch"
                  disabled={i === seq.length - 1} onClick={() => move(i, i + 1)}
                  icon={<Icon name="chevron-down" className="w-s7 h-s7" strokeWidth={2.4} />} />
              </div>
  ```
  with a test asserting that two presses of «به بالا» move a row two places and
  that the saved sequence is what the list shows.

- [ ] **Step 22: Clear the last five line-level findings.**
  One commit each is overkill; one edit pass, one test run, one commit:
  - **The toast's two arbitrary values.** `ToastProvider.tsx:29` writes
    `text-[13px]` and `z-[60]`. Both have an exact name and neither may survive
    into Task 25, which retires `src/write/` from `PENDING_REBUILD` and bans
    `x-[…]` outright — and `text-[13px]` is already banned by the *old* regex, so
    it is only invisible because of the exemption:
    - `text-[13px]` → **`text-fs-sm`** (`--fs-sm` 13px; `Inja Panel.dc.html:2113`
      draws the toast at `font-size:13px`).
    - `z-[60]` → **`z-toast`** (`--role-z-toast`, L-42/L-47's ceiling, 1090). The
      design writes `z-index:80` here and L-42 replaces the deliverable's own
      numbers with the Bootstrap ladder, so 80 does not carry over. This is the
      rung's **first consumer** — it was minted by the single minting pass and has
      sat on `PENDING` unwritten since, which is exactly the state R11 says a
      minted utility may not stay in.

    Leave the rest of that line's Tailwind t-shirt sizes (`bottom-6`, `px-5`,
    `py-3`, `rounded-xl`, `gap-2.5`, `text-white`) to Task 25's palette and
    t-shirt guards, which name them as a class. Only note here that the design's
    toast is `bottom:26px; padding:12px 20px; radius 12px` — `bottom-s11`,
    `py-s6`, `rounded-button` and `text-card` cover all but the 20px inline
    padding, which no token holds under this role. **Do not mint one**; put it on
    Task 25's `UNTOKENISED` list with the rest.
  - **O2** — `ExportMenu.tsx:74`'s `w-[42px] h-[42px]` trigger, `ExportModal.tsx:99`
    and `InboxModal.tsx:26`'s `w-8 h-8` closes: all become `IconButton` with
    `min-h-touch min-w-touch` around a `w-tool h-tool` drawn box.
  - **O5** — `ExportMenu.tsx:83`'s `w-full text-right` → `text-start`;
    `ToastProvider.tsx:29`'s `left-1/2 -translate-x-1/2` → `start-1/2` with the
    logical translate. They happen to centre correctly today because the two
    physical offsets cancel; they are mirror bugs waiting for an LTR locale, and
    Task 25's guard will fail on them the moment `src/write/` leaves
    `PENDING_REBUILD`.
  - **O13** — `ui/src/index.css`'s `.btn` compatibility layer has three
    consumers, all in `ExportModal.tsx` (`:112`, `:123`, `:142`). Replace them
    with `Button` (`:142` is an `<a>` — `Button` takes `as="a"` from Task 6) and
    delete the five CSS rules — `.btn`, `.btn-coral`, `.btn-violet`, `.btn-green`
    and `.btn-ghost`. (The old text said four; `src/index.css` holds five.)
  - **P12** — `ExportMenu.tsx:69-94` hand-rolls a second dropdown while
    `ui/Menu.tsx` has no consumer at all. Point it at `Menu`.
  ```
  cd ui && npx vitest run src/write/ && npx tsc -b && npx eslint .
  git add ui/src/write ui/src/index.css
  git commit -m "fix(ui): the write flows reach the touch floor, mirror correctly, and drop .btn"
  ```

- [ ] **Step 23: Prove every class the write flows write emits, and check `.btn` is really gone.**
  ```bash
  cd ui && npx vite build
  node scripts/harvest-classes.mjs src/write/ConfirmMark.tsx src/write/CreateProcessModal.tsx src/write/DeleteProcessConfirm.tsx \
    src/write/ExportMenu.tsx src/write/ExportModal.tsx src/write/InboxModal.tsx \
    src/write/ReorderModal.tsx src/write/ToastProvider.tsx
  ```
  Expected: the run ends `DEAD 0   EMPTY 0   NOVAR 0`, both controls hold
  (`control (negative): N/N invented names reported dead` and
  `control (escaping): … escaped variant classes unescaped`), and the last line
  is `PASS`. The script exits 1 on any failure, so it can be `&&`-chained.
  The class list is **harvested out of these files**, never hand-kept, so it
  cannot drift from what they write and `tailwind-probe.txt` cannot certify it
  on their behalf — see *The class-emission check* in Global Constraints for the
  measurement that retired the old grep.

  `start-1/2` is why this step could not stay a `grep -F`. Tailwind escapes the
  `/`, so the emitted selector is `.start-1\/2`; `grep -qF 'start-1/2'` matches
  nothing on a build where the class is present, and would have reported the O5
  mirror fix missing at the moment it landed. Confirmed both ways against a real
  compile: the unescaped literal does not match, the escaped one does. The scanner
  unescapes on the way into its index, so neither form is something to remember.

  **A failure.** `DEAD` — the class compiled to no rule at all; that is a **typo
  in the component**, so fix the class string, rebuild, re-run. `EMPTY` — the
  selector emitted with an empty body, so the theme key resolves to nothing.
  `NOVAR` — the rule reads a `var(--…)` nothing declares. The last two are theme
  regressions: **stop and report them.** Do **not** add the name to
  `ui/tailwind.config.js`, `src/styles/tokens.css`, `src/styles/roles.css` or
  `tailwind-probe.txt`. All four are frozen for the duration of this plan and
  were unfrozen exactly once, by the single minting pass in
  `.superpowers/sdd/mint-spec.md`; minting one here to make a misspelling compile
  recreates the unreachable-token problem the whole rebuild exists to fix. A
  value that genuinely has no name goes into `mint-spec.md`, not into the config
  and not into this task's commit.

  **What this step cannot prove:** that these files write a class and that the
  class compiles to a rule with declarations, yes. That the class reaches the
  right element, that the element renders, that it is visible, or that its value
  is the one the design asks for — no. That stays with the Playwright checks.

  Then check the compatibility layer really went, and that no hand-rolled scrim
  survived:

  ```bash
  cd ui && CSS=$(ls dist/assets/*.css | head -1)
  grep -o '\.btn[a-z-]*' "$CSS" | sort -u        # expect no output
  grep -n '\.btn' src/index.css                  # expect no output
  grep -rn 'z-\[7[24]\]\|bg-\[rgba(36,17,82' src/ || echo 'no hand-rolled scrims left'
  ```
  Expected: nothing from the first two, and `no hand-rolled scrims left` from the
  third. The old check here was `grep -c '\.btn' dist/assets/*.css # expect 0`,
  which cannot do the job twice over: `grep -c` counts matching **lines** and the
  built CSS is one minified line, so it prints 1 at most however many `.btn` rules
  survive; and `\.btn` matches `.btn-coral` as happily as `.btn`, so it can only
  reach 0 once **all five** rules are gone. `grep -o … | sort -u` prints the names
  that are left, which is what you actually need to see.

- [ ] **Step 24: Extend the browser check to the dialogs, then commit.**
  Append to `ui/e2e/write.spec.ts`:
  ```ts
  test('the write dialogs are one dialog', async ({ page }) => {
    await signedIn(page)
    await serve(page, {
      '/api/departments': DEPARTMENTS,
      [`/api/departments/${CODE}/processes`]: PROCESSES,
      [`/api/confirmations?department=${CODE}`]: CONFIRMATIONS,
      [`/api/departments/${CODE}/next-id`]: { next_id: `${CODE}-002` },
      '/api/pending': [],
    })
    await visit(page, `/departments/${CODE}`)
    await page.getByRole('button', { name: 'فرآیند تازه' }).click()
    const box = page.getByRole('dialog')
    const width = page.viewportSize()!.width
    // §5.2 — one scrim, one shadow, one radius, and a bottom sheet at ≤760px.
    await expect(page.getByTestId('scrim'))
      .toHaveCSS('background-color', 'rgba(36, 17, 82, 0.45)')
    if (width > 760) {
      await expect(box).toHaveCSS('width', '460px')
      await expect(box).toHaveCSS('border-radius', '24px')
    } else {
      await expect(box).toHaveCSS('border-radius', '20px 20px 0px 0px')
    }
    await page.keyboard.press('Escape')
    await expect(box).toBeHidden()
    await shot(page, 'create-process')
  })
  ```
  `cd ui && npx playwright test e2e/write.spec.ts` → `6 passed` (2 tests × 3 widths).
  ```
  git add ui/e2e/write.spec.ts ui/e2e/__shots__
  git commit -m "test(ui): the write dialogs are checked in a browser, at all three widths"
  ```

---

### Task 25: retire `PENDING_REBUILD`, tighten the guards, sweep at three widths

`PENDING_REBUILD` exempts `src/flow/`, `src/screens/` and `src/write/`. Two of
those lines can go; `src/flow/` stays, permanently — F16 keeps the flowchart
implementation as it is. The file's own comment defers the regex work to "Task
12" and names exactly what passes today: `px-[0.6em]`, `max-w-[560px]`, `rgba()`
literals and raw px in `.css`. And the `dir=` island list is incomplete by eleven
lines, above a comment claiming it was completed *"precisely so that deleting
that line is a one-line change and not a hunt for the islands nobody wrote
down."*

**Files**

| Action | Path |
|---|---|
| Modify | `ui/src/test/guards.test.ts` |
| Modify | `ui/package.json` |
| Create | `ui/e2e/sweep.spec.ts` |
| Modify | `docs/superpowers/ui-normalisation-ledger.md` |

**Interfaces**

*Consumes* — the whole of Tasks 1–24. *Produces* — no exports; four new guard
cases and a full-app browser sweep.

---

- [ ] **Step 1: See what the guard would say today.**
  Before changing anything, find out what deleting the two lines actually costs.
  ```
  cd ui && node -e "
  const {readFileSync,readdirSync,statSync}=require('fs'),{join}=require('path');
  const w=(d,o=[])=>{for(const n of readdirSync(d)){const p=join(d,n);
    statSync(p).isDirectory()?w(p,o):/\.(tsx?|css)$/.test(n)&&o.push(p)}return o};
  const f=w('src').map(p=>({p,rel:p.slice(p.indexOf('src/'))}))
    .filter(x=>!x.rel.startsWith('src/flow/')&&!/\.test\.tsx?$/.test(x.rel)&&x.rel!=='src/styles/tokens.css');
  const R={hex:/#[0-9a-fA-F]{3,8}\b/,arb:/\b[a-z-]+-\[/,rgba:/\brgba?\(/,dir:/\bdir=/};
  for(const k of Object.keys(R)){const h=f.flatMap(x=>readFileSync(x.p,'utf8').split('\n')
    .map((l,i)=>({rel:x.rel,n:i+1,l})).filter(({l})=>R[k].test(l)));
    console.log(k, h.length); h.slice(0,40).forEach(y=>console.log('   ',y.rel+':'+y.n,y.l.trim().slice(0,90)))}"
  ```
  Expected after Tasks 14–24: `hex 0`, `arb` small and confined to
  `src/ui/Button.tsx`'s `w-[1.05em]` spinner and `src/ui/Overlay.tsx`'s viewport
  caps, `rgba` 0 outside `src/styles/`, and a `dir` list of the real islands.
  **Write the `dir` list down** — Step 7 needs it and it must be derived, not
  copied from the audit: O1's five re-pins died with Task 24 Step 15, and
  `ProcessList`'s two went with them.

- [ ] **Step 2: A failing test — retire the two lines.**
  In `ui/src/test/guards.test.ts` replace the `PENDING_REBUILD` block:
  ```ts
  /**
   * The one directory this guard does not police, and will not.
   *
   * `src/flow/` is frozen by F16: the flowchart implementation stays as it is,
   * and this exemption is **permanent** rather than pending. `src/screens/` and
   * `src/write/` left this list when the UI-conformance plan rebuilt them
   * (Tasks 14–24); nothing may be added back. A line here is a promise that
   * somebody will come and delete it, and two of them stood for a year.
   */
  const UNPOLICED = ['src/flow/']
  ```
  and update `files()`'s filter and the vacuity test's message to match.

- [ ] **Step 3: Run it and watch it fail.**
  `cd ui && npx vitest run src/test/guards.test.ts`
  Expected: `FAIL` on whichever cases Step 1 predicted — most likely the `dir=`
  islands and any surviving arbitrary value. This is the point: the failures now
  name real files instead of being hidden behind an exemption.

- [ ] **Step 4: Tighten the arbitrary-value regex.**
  Replace the second `it(…)` and the deferral comment above the file's helpers:
  ```ts
  it('no component names an arbitrary LENGTH', () => {
    // Was `(text|rounded|shadow)-\[` — three utilities out of all of them, so
    // `px-[0.6em]`, `max-w-[560px]`, `w-[42px]`, `h-16`-style caps and every
    // other `x-[…]` passed. The escape hatch is now closed by name rather than
    // by which utility happened to be listed.
    //
    // STRUCTURAL is not an escape hatch: none of these is a value off the
    // design's ladder that somebody declined to tokenise.
    //   `content-[""]`      the one declaration that makes a `::before` render
    //                       at all. `content-none` is NOT a substitute — it sets
    //                       `content:none` and the pseudo-element vanishes;
    //                       `src/ui/table.test.tsx` has a test that says so.
    //   `transition-[a,b]`  a property LIST. `transitionProperty` carries no
    //                       keys and a CSS property name is not a design value.
    //                       Three primitives already ship this form.
    //   `[prop:value]`      an arbitrary property, e.g. `[text-wrap:pretty]`.
    //   `-[…em]`            sized against the text, so it tracks its label —
    //                       `Button`'s spinner.
    //   `-[…vh|vw]`         bounded by the viewport, not by the token scale —
    //                       `Overlay`'s caps.
    //   `-[…%]`             a proportion of a parent; no token can hold one.
    //   `-[var(--x)]`       reads a token. This is the token system, not a
    //                       bypass of it — `Overlay`'s `w-[var(--width-drawer)]`.
    //   `before:-inset-[…]` the hit expander. It is DERIVED, not drawn: the
    //                       painted box stays the design's and the `::before`
    //                       grows the target to F11's 44px floor, so the number
    //                       is `(44 - box) / 2` and differs per component —
    //                       5px round a 34px `w-tool`, 6px round a 32px
    //                       `w-close`. No single token could hold it, and the
    //                       three primitives that ship it each computed their
    //                       own. `-inset-s2` is written where the rung happens
    //                       to be exact; this covers the rest.
    const ARBITRARY = /\b[a-z-]+-\[/
    const STRUCTURAL = new RegExp([
      /content-\[""\]/, /transition-\[[a-z,\- ]+\]/, /before:-inset-\[[\d.]+px\]/,
      /-\[(?:[\d.]+(?:em|vh|vw|%)|var\(--[a-z0-9-]+\))\]/,
    ].map((r) => r.source).join('|'))

    // A comment that *names* an arbitrary value is not one. `Button.tsx:7`
    // explains why it sets no default padding by quoting `px-3 py-[7px]` from
    // src/flow/, and `Toast.tsx:41` explains why the toast's z is an inline style
    // by quoting `z-[60]`. Both are the file arguing against the thing the guard
    // forbids, and a check that fails on them teaches the next person to delete
    // the explanation. Strip comments before matching, not after.
    const stripComments = (src: string) => {
      let inBlock = false
      return src.split('\n').map((line) => {
        let out = '', i = 0
        while (i < line.length) {
          if (inBlock) {
            const end = line.indexOf('*/', i)
            if (end === -1) { i = line.length } else { i = end + 2; inBlock = false }
          } else if (line.startsWith('//', i)) {
            break
          } else if (line.startsWith('/*', i)) {
            inBlock = true; i += 2
          } else {
            out += line[i]; i++
          }
        }
        return out
      })
    }

    const hits = files()
      .filter((f) => !UNTOKENISED.includes(f.rel))
      .flatMap((f) =>
        stripComments(readFileSync(f.path, 'utf8'))
          .map((line, i) => ({ rel: f.rel, n: i + 1, line }))
          .filter(({ line }) => ARBITRARY.test(line) && !STRUCTURAL.test(line)))
    expect(hits.map((h) => `${h.rel}:${h.n} ${h.line.trim()}`)).toEqual([])
  })

  it('the untokenised list only ever shrinks', () => {
    // A file on that list is exempt from the check above, so the list is the one
    // place a new arbitrary value could hide. Pin its length: adding a file to it
    // is then a deliberate edit with a number beside it, not a quiet append.
    expect(UNTOKENISED.length).toBeLessThanOrEqual(3)
    // …and every entry still has one, so the list cannot rot into a set of names
    // that stopped meaning anything.
    for (const rel of UNTOKENISED) {
      const f = files().find((x) => x.rel === rel)
      expect(f, `${rel} is on UNTOKENISED but not in files()`).toBeDefined()
      expect(/\b[a-z-]+-\[/.test(readFileSync(f!.path, 'utf8')), rel).toBe(true)
    }
  })
  ```

  Hoist beside `files()`, so both `it()` blocks see it:

  ```ts
  /**
   * The list a later pass must empty, or the owner must name. Every entry holds
   * a value the design genuinely draws that NO token holds: the single minting
   * pass minted from the screens, and none of its 23 tokens is a shell value.
   *
   * These are not waived — the point of naming the files is that the list is
   * short, reviewable, and only shrinks. Task 12's own step carries the design
   * line each value is read from, its role, and why the nearest token belongs to
   * something else. Do NOT resolve one by adding a key to `tailwind.config.js`;
   * see Step 6.
   */
  const UNTOKENISED = [
    // 265px menu, 3px hint offset, 1.25 lockup leading, the 19px count badge,
    // 13px + 7px on the inbox button, 9px crumb strip, 7px back button.
    'src/shell/PanelShell.tsx',
    // The same 1.25, 19px, 9px and 7px, on the reader's chrome.
    'src/shell/ReaderShell.tsx',
    // grid-cols-[1fr_1.4fr_1fr] — the A-0 grid. `gridTemplateColumns` holds
    // three templates (users, audit, activity) and none of them is this one.
    'src/screens/Summary.tsx',
  ]
  ```

  Three files, not five: `Pager.tsx`, `Overlay.tsx` and `PasswordField.tsx` carry
  only `before:content-[""]` and a derived `before:-inset-[…]`, both of which
  `STRUCTURAL` now covers by name, and `Button.tsx`'s only `-[…px]` is inside a
  comment. Verified against the tree.

- [ ] **Step 5: Add the two cases the regexes never had.**
  ```ts
  it('no component contains an rgb/rgba literal', () => {
    // The hex check never saw `rgba(36,17,82,.45)` — the scrim five write
    // dialogs each hand-rolled — because it is not a hex.
    const hits = files().flatMap((f) =>
      readFileSync(f.path, 'utf8').split('\n')
        .map((line, i) => ({ rel: f.rel, n: i + 1, line }))
        .filter(({ line }) => /\brgba?\(/.test(line)))
    expect(hits.map((h) => `${h.rel}:${h.n} ${h.line.trim()}`)).toEqual([])
  })

  it('no stylesheet outside the token files carries a raw px value', () => {
    // `.css` files were scanned for hex and for Tailwind class names, neither of
    // which a stylesheet writes — so `src/styles/base.css`'s raw px went by
    // untouched (P15). `tokens.css` and `roles.css` are where px belongs.
    const ALLOWED_CSS = ['src/styles/tokens.css', 'src/styles/roles.css']
    const hits = files()
      .filter((f) => f.rel.endsWith('.css') && !ALLOWED_CSS.includes(f.rel))
      .flatMap((f) =>
        readFileSync(f.path, 'utf8').split('\n')
          .map((line, i) => ({ rel: f.rel, n: i + 1, line }))
          // `0px` is not a value, it is a zero; and `1px solid` on a hairline is
          // the one width the design writes literally everywhere.
          .filter(({ line }) => /(?<![\w-])(?!0px)\d*\.?\d+px/.test(line)
            && !/var\(--/.test(line)))
    expect(hits.map((h) => `${h.rel}:${h.n} ${h.line.trim()}`)).toEqual([])
  })
  ```

- [ ] **Step 6: Run them and fix what they name. Mint nothing.**
  `cd ui && npx vitest run src/test/guards.test.ts`

  Every hit is a real value that should have come from a token. Fix each at its
  source — **by pointing the component at the name the theme already has.** Re-run
  until only the `dir=` case is red.

  **This step used to say "a missing utility goes into `tailwind.config.js`, not
  into an exception list". Do not do that.** `ui/tailwind.config.js`,
  `ui/src/styles/tokens.css` and `ui/src/styles/roles.css` were unfrozen exactly
  once, for the single minting pass (`.superpowers/sdd/mint-spec.md`), and
  re-frozen. That pass exists because minting piecemeal, from inside whichever
  task happened to need a value, is what produced the unreachable-token problem
  this whole rebuild is here to fix: a name added at the end of the plan has no
  probe line, no `EXPECTED` row, no `tokens.test.ts` assertion and no consumer
  but the one line that asked for it — and `theme.test.ts` is closed over both
  ends, so it goes red the moment the key lands without the four things around
  it. Worse, a second name for a value that already has one is invisible: both
  compile, both paint, and the day the design moves, only one of them moves.

  So a hit is one of three things, and none of them is a mint:
  1. **A name exists** — use it. This is nearly all of them.
  2. **It is structural** — `content-[""]`, a `transition-[…]` property list, an
     `em`/`vh`/`%` measure, a `var(--token)`. It belongs in `STRUCTURAL` in
     Step 4, with a line saying which of those it is.
  3. **The design draws a value nothing holds.** Then it goes on `UNTOKENISED`
     with its file, its role and the design line it is read from — and it goes
     to the owner as part of the one list this task hands over, together with
     the eight the two shells already carry. Minting it here would be the very
     defect this step is checking for, committed by the check itself.

- [ ] **Step 7: Complete the island list.**
  Replace `ISLANDS` with what Step 1's scan actually found, one commented group
  per reason:
  ```ts
  /**
   * Every element in the app that pins `dir` — declared here, so that a new one
   * is a deliberate decision rather than something a reviewer has to notice.
   *
   * The list this replaces held six entries above a comment claiming it was
   * complete "precisely so that deleting that line is a one-line change and not
   * a hunt for the islands nobody wrote down". Deleting the line found eleven
   * more (`ui-audit-existing.md` O12). Five of those eleven were re-pins of a
   * `dir="ltr"` that `ProcessList` set on its own scrolling region, and they went
   * when that moved into `base.css` (Task 24). What is left is the real set, and
   * every entry pins `ltr` on the same class of thing: a latin run inside RTL
   * prose that must keep the order it was stored in.
   */
  const ISLANDS = [
    // Process and node ids — the design's own first `dir="ltr"` case (§2.7).
    'src/ui/IdBadge.tsx',
    // Mobile numbers (D57): the form's field, the picker's candidates, the
    // signed-in account's own on the profile, one person's on their record, and
    // the users table.
    'src/screens/UserFields.tsx',
    'src/screens/SupervisorPicker.tsx',
    'src/screens/Profile.tsx',
    'src/screens/Users.tsx',
    'src/screens/UserDetail.tsx',
    'src/screens/SignIn.tsx',
    // A policy digest, which may hold a `-` or a `_` and reorders without this.
    'src/screens/Visibility.tsx',
    // IP addresses and session ids (§2.7's fourth case, S1 only).
    'src/screens/SessionsCard.tsx',
    // Export filenames and the commit chip.
    'src/write/ExportModal.tsx',
    // §8 — the flow canvas is laid out left-to-right and re-flips its own nodes.
    // Declared even though `src/flow/` is unpoliced, so the list is the whole
    // truth about the app rather than the whole truth about what is scanned.
    'src/flow/FlowScreen.tsx',
  ]
  ```
  Then add the assertion the old list lacked:
  ```ts
  it('every declared island still exists and still pins dir', () => {
    // A list that only ever grows is a list that stops describing the app. This
    // fails when an island is renamed or when its `dir=` is removed and the
    // entry is left behind.
    const scanned = new Map(walk(SRC).map((p) => [p.slice(p.indexOf('src/')), p]))
    const stale = ISLANDS.filter((rel) => {
      const p = scanned.get(rel)
      return p === undefined || !/\bdir=/.test(readFileSync(p, 'utf8'))
    })
    expect(stale).toEqual([])
  })
  ```

- [ ] **Step 8: Add the two guards the audit says would have caught most of this.**
  Neither regex above can see a missing hover, a native `<select>`, an icon that
  is not there, or two checkbox sizes that each agree with the token file and
  disagree with each other. These two can:
  ```ts
  describe('X3/X4 — form controls are drawn, not the operating system\'s', () => {
    it('no screen renders a bare input, select or button', () => {
      // The nine screens introduced one `<select>` with no `appearance-none` and
      // ~35 `<input type=checkbox|radio>` carrying nothing but `accent-violet`,
      // at two sizes 2.75× apart. Every one of them agreed with the token file.
      // `src/ui/` is where a control is drawn; everywhere else composes them.
      const BAD = /<(input|select|button)\b/
      const hits = files()
        .filter((f) => !f.rel.startsWith('src/ui/'))
        .flatMap((f) => readFileSync(f.path, 'utf8').split('\n')
          .map((line, i) => ({ rel: f.rel, n: i + 1, line }))
          .filter(({ line }) => BAD.test(line)))
      expect(hits.map((h) => `${h.rel}:${h.n} ${h.line.trim()}`)).toEqual([])
    })

    it('no component uses Tailwind\'s own numeric spacing scale', () => {
      // `tailwind.config.js` carries an explicit comment that the `s` prefix
      // exists so the design's dense scale (4,5,6,8,10…) does not collide with
      // Tailwind's sparser rem one (4,8,12,16,20…). `ConfirmMark`'s `px-3` was
      // 12px where every sibling button was `px-s8` = 16px, and no regex saw it.
      const BAD = /\b(p|m|gap|space)[xytrbles]?-\d/
      const hits = files().flatMap((f) => readFileSync(f.path, 'utf8').split('\n')
        .map((line, i) => ({ rel: f.rel, n: i + 1, line }))
        .filter(({ line }) => BAD.test(line)))
      expect(hits.map((h) => `${h.rel}:${h.n} ${h.line.trim()}`)).toEqual([])
    })
  })
  ```

- [ ] **Step 9: Run the whole guard file green.**
  `cd ui && npx vitest run src/test/guards.test.ts` → all cases pass, and the
  vacuity test still reports a scan of well over fifteen files including
  `src/ui/`, `src/screens/` and `src/write/`.

- [ ] **Step 10: Run the whole frontend suite.**
  ```
  cd ui && npx vitest run && npx tsc -b && npx eslint . && npm run build
  ```
  → all four clean. `npm run build` includes `build:export`, so the two export
  bundles are proved too.
  ```
  git add ui/src/test/guards.test.ts
  git commit -m "test(ui): the exemption ends, the regexes close, and the islands are all written down"
  ```

- [ ] **Step 11: Wire the e2e suite into the package scripts.**
  In `ui/package.json`:
  ```json
      "test:e2e": "playwright test",
      "test:e2e:update": "playwright test --update-snapshots",
  ```
  ```
  git add ui/package.json
  git commit -m "chore(ui): the browser check has a name you can type"
  ```

- [ ] **Step 12: Write the sweep — every screen, three widths, one file.**
  The per-screen specs assert their own numbers; this one asserts the things that
  are true of *every* page and were wrong on all nine.
  Create `ui/e2e/sweep.spec.ts`:
  ```ts
  import { test, expect } from '@playwright/test'
  import { shot } from './_harness'

  const ROUTES = [
    ['/departments', 'departments'], ['/departments/dining', 'process-list'],
    ['/processes/dining-003', 'summary'], ['/departments/dining/overview', 'overview'],
    ['/users', 'users'], ['/users/2', 'user-detail'],
    ['/profile', 'profile'], ['/visibility', 'visibility'],
  ] as const

  for (const [route, name] of ROUTES) {
    test(`sweep ${name}`, async ({ page }) => {
      const errors: string[] = []
      page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()) })
      await page.goto(route)

      // §9.1 — both deliverables put the whole app on the deep-violet field, and
      // the app rendered every one of these on cream. It is the largest area on
      // screen and the single biggest contributor to "this is not my design".
      await expect(page.locator('body')).toHaveCSS('background-color', 'rgb(42, 29, 94)')
      const h1 = page.getByRole('heading', { level: 1 })
      if (await h1.count()) {
        await expect(h1).toHaveCSS('color', 'rgb(255, 255, 255)')
        await expect(h1).toHaveCSS('font-weight', '800')
      }

      // §2.1 — Vazirmatn and nothing else, actually loaded.
      expect(await page.evaluate(() =>
        document.fonts.check('14px "Vazirmatn Variable"'))).toBe(true)

      // R7 — nothing scrolls sideways at any width. This is what a page that is
      // "responsive" has to be true of before any of its rules matter.
      const overflow = await page.evaluate(() =>
        document.documentElement.scrollWidth - document.documentElement.clientWidth)
      expect(overflow).toBeLessThanOrEqual(1)

      // §8 — RTL is structural, and no page may quietly drop out of it.
      await expect(page.locator('html')).toHaveCSS('direction', 'rtl')

      // §2.7 — every reader-visible number is Persian; latin survives only
      // inside `dir="ltr"` mono runs and the one latin eyebrow.
      const strayLatinDigits = await page.evaluate(() => {
        const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT)
        const bad: string[] = []
        for (let n = walker.nextNode(); n; n = walker.nextNode()) {
          const el = n.parentElement!
          if (el.closest('[dir="ltr"]') || el.closest('[data-latin]')) continue
          if (/[0-9]/.test(n.textContent ?? '')) bad.push(n.textContent!.trim().slice(0, 40))
        }
        return bad
      })
      expect(strayLatinDigits).toEqual([])

      // Chrome's own complaints, which no vitest run would ever surface.
      expect(errors).toEqual([])

      await shot(page, `sweep-${name}`)
    })
  }
  ```

- [ ] **Step 13: Run the sweep, at all three widths.**
  `cd ui && npx playwright test e2e/sweep.spec.ts`
  Expected: `24 passed` (8 routes × 3 projects). Every failure here is a real
  defect on a real page at a real width — fix it in the screen, never in the
  sweep. Then run everything:
  ```
  cd ui && npx playwright test
  ```
  → the per-screen specs and the sweep, all three projects, green.
  ```
  git add ui/e2e/sweep.spec.ts ui/e2e/__shots__
  git commit -m "test(ui): every screen, three widths, one sweep — the gate that was missing"
  ```

- [ ] **Step 14: Close the ledger and state what is left.**
  Append to `docs/superpowers/ui-normalisation-ledger.md`:
  ```md
  ## Closing state

  `PENDING_REBUILD` is gone; `UNPOLICED` holds `src/flow/` alone and permanently.
  The guard now catches every arbitrary Tailwind value, `rgb`/`rgba` literals,
  raw px in stylesheets, bare form controls outside `src/ui/`, and Tailwind's own
  numeric spacing scale. The `dir=` island list is derived and asserted rather
  than declared and trusted.

  **Open for the owner** — every one of these was recorded rather than chosen
  silently, and none of them is blocking:

  | Ref | Question |
  |---|---|
  | A1, P2 | The design's Access and Profile both describe a one-time reset **link**; this product has an administrator-chosen password (D15). Is the link wanted, or is the design out of date? |
  | A2 | §6.9's change-supervisor modal and §6.8's inline edit mode both have no counterpart: `EditUserDialog` owns role, scopes and supervisor together because the server re-validates them together. Keep one dialog? |
  | D3 | The design calls the flowchart report «سند فلوچارت»; `REPORT_KIND_LABELS` calls it «مستندات کامل», pinned to `exports.EXPORT_KINDS`. Which name is the product's? |
  | D4 | Coral is the *new-affordance* role and violet the commit (§6.7 vs §6.14). The readme's blanket "coral for anything primary" contradicts both deliverables. Confirm the rule. |
  | P1 | ~~The open-sessions card~~ — **answered.** The owner removed the feature: «I don't need open session card in profile. delete it from ui.» Not built, not stubbed, no route added. Task 22 records the divergence. |
  | V1 | §6.12 has a seventh policy row, «نام گام و ترتیب گام‌ها», on and locked. It is not a server field, and R5 forbids drawing a locked control. Should it become one? |
  ```
  ```
  git add docs/superpowers/ui-normalisation-ledger.md
  git commit -m "docs(ui): the ledger closes with six questions, none of them chosen silently"
  ```
