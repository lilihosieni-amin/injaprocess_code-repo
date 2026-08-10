# Frontend System (F) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the design system every screen in P0–P4 is assembled from — one token set, two shells, one shared component library, five states, and the accessibility and RTL baseline.

**Architecture:** One Vite app. Design tokens live in CSS custom properties imported from the frozen `_ds` token set; `tailwind.config.js` maps Tailwind's theme onto those variables so components use semantic classes and never literals, enforced by a test. Type size is never named by a component — it asks for a role (`body`, `title`) and the shell root maps roles to sizes, which is how one component set serves two densities. Shell selection is a pure function over capabilities, so it is fully testable before P0 builds the endpoint that supplies them.

**Tech Stack:** React 19, TypeScript 5.8 (strict, `noUnusedLocals`), Vite 6, Tailwind 3.4, Vitest 3.2 + Testing Library, `@fontsource-variable/vazirmatn`.

## Global Constraints

- **Spec:** `docs/superpowers/specs/2026-08-05-frontend-system-design.md` (F1–F16). Where anything here disagrees with it, the spec wins.
- **Vitest runs with `globals: false`** (`ui/vite.config.ts:9`) — every test file must `import { describe, it, expect } from 'vitest'` explicitly.
- **Persian, RTL.** All user-facing copy is Persian. Root is `dir="rtl" lang="fa"`.
- **No literals in components.** No hex colour, no `text-[Npx]`, no `rounded-[Npx]` anywhere under `ui/src/**` except `ui/src/styles/tokens.css`. Task 1 adds the test that enforces this; every later task must keep it green.
- **44px minimum touch target** on every interactive element (F11).
- **Logical properties only** — `margin-inline-start`, never `margin-left`; `text-align: start`, never `left`.
- **Run tests from `ui/`:** `cd ui && npx vitest run <path>`.
- **Existing tests must stay green.** `ui/src/ui/primitives.test.tsx` covers today's `Button`, `Chip` and `IdBadge`; Tasks 4–5 modify those components and must update that file rather than leave it failing.
- **Do not touch** `ui/src/flow/**` or `ui/export/**`. F16 keeps the flowchart implementation as-is, and `ui/export/` imports eight modules from `ui/src/` whose output is verified against signed-off PDFs.

---

## File Structure

**Created:**

| Path | Responsibility |
|---|---|
| `ui/src/styles/tokens.css` | The only file containing literal values. Imports the four `_ds` token files, applies the F7 reconciliations, adds the reader density scale. |
| `ui/src/styles/base.css` | Root RTL/lang setup, focus-visible ring, scrollbar, selection. Replaces the `@layer base` block of `index.css`. |
| `ui/src/auth/session.ts` | `SessionDescriptor` type (D47) and `selectShell()` (F2). Pure, no I/O. |
| `ui/src/auth/session.test.ts` | Shell-selection tests. |
| `ui/src/ui/IconButton.tsx` | Icon-only button with a required accessible name. |
| `ui/src/ui/StatusPill.tsx` | Status with text — never colour alone. |
| `ui/src/ui/Overlay.tsx` | `Sheet` and `Dialog`: side/centred above the breakpoint, bottom sheet below. Esc, focus trap, restore. |
| `ui/src/ui/Toast.tsx` | `ToastProvider` + `useToast`, `aria-live`. |
| `ui/src/ui/SearchField.tsx` | Labelled search input. |
| `ui/src/ui/Menu.tsx` | Kebab menu, keyboard-navigable. |
| `ui/src/ui/Tabs.tsx` | Tab list with roving focus. |
| `ui/src/ui/Accordion.tsx` | Disclosure with a real button header. |
| `ui/src/ui/states/` | `LoadingState`, `EmptyState`, `ErrorState`, `DeniedState`, `NotFoundState` (F12). |
| `ui/src/lib/digits.ts` | `toFa()` re-export point and `toLatinDigits()` for input normalisation (D57). |
| `ui/src/shell/PanelShell.tsx`, `ui/src/shell/ReaderShell.tsx` | The two shells; each sets `data-shell` and owns its chrome. |
| `ui/src/shell/AppShell.tsx` (modify) | Picks a shell from the descriptor. |
| `ui/src/test/guards.test.ts` | The F6/F10 greps: no literals, no physical properties, no density props. |
| `ui/src/test/a11y.ts` | Shared assertions used by component tests. |

**Modified:** `ui/tailwind.config.js` (theme onto variables), `ui/src/index.css` (imports only), `ui/src/api/client.ts` (401 handling), `ui/src/ui/{Button,Card,Chip,IdBadge}.tsx` (tokens + a11y), `ui/src/ui/primitives.test.tsx`.

---

### Task 1: Token pipeline and the no-literals guard

**Files:**
- Create: `ui/src/styles/tokens.css`, `ui/src/styles/base.css`, `ui/src/test/guards.test.ts`
- Modify: `ui/src/index.css`, `ui/tailwind.config.js`

**Interfaces:**
- Consumes: nothing.
- Produces: CSS custom properties named in `ui/design/_ds/inja-food-design-system-1ef55d80-2e17-482f-b420-9d004eaa22de/tokens/*.css`, plus `--fs-*`/`--lh-*` resolved per shell. Tailwind classes `bg-violet`, `text-ink`, `border-line`, `shadow-card`, `rounded-card` etc. resolve to those variables. Later tasks use only these classes.

- [ ] **Step 1: Write the failing guard test**

Create `ui/src/test/guards.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'

const SRC = join(process.cwd(), 'src')

/** The only file allowed to hold literal values. */
const ALLOWED = ['src/styles/tokens.css']

/**
 * Directories this guard does not police yet, each with the plan that clears it.
 * The list only ever shrinks: whoever rebuilds a directory deletes its line.
 *   src/flow/    — F16 keeps the flowchart implementation as-is. Permanent for F.
 *   src/shell/   — rebuilt by Task 11 of this plan, which removes this line.
 *   src/screens/ — rebuilt by P0–P4 as each screen is redone.
 *   src/write/   — rebuilt by P1–P4 with the write flows.
 */
const PENDING_REBUILD = ['src/flow/', 'src/shell/', 'src/screens/', 'src/write/']

function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name)
    if (statSync(p).isDirectory()) walk(p, out)
    else if (/\.(tsx?|css)$/.test(name)) out.push(p)
  }
  return out
}

function files() {
  return walk(SRC)
    .map((p) => ({ path: p, rel: p.slice(p.indexOf('src/')) }))
    .filter((f) => !ALLOWED.includes(f.rel))
    .filter((f) => !PENDING_REBUILD.some((d) => f.rel.startsWith(d)))
    .filter((f) => !/\.test\.tsx?$/.test(f.rel))
}

describe('F6 — tokens are the only source of values', () => {
  it('no component contains a hex colour', () => {
    const hits = files().flatMap((f) =>
      readFileSync(f.path, 'utf8')
        .split('\n')
        .map((line, i) => ({ rel: f.rel, n: i + 1, line }))
        .filter(({ line }) => /#[0-9a-fA-F]{3,8}\b/.test(line)),
    )
    expect(hits.map((h) => `${h.rel}:${h.n} ${h.line.trim()}`)).toEqual([])
  })

  it('no component names an arbitrary size or radius', () => {
    const hits = files().flatMap((f) =>
      readFileSync(f.path, 'utf8')
        .split('\n')
        .map((line, i) => ({ rel: f.rel, n: i + 1, line }))
        .filter(({ line }) => /(text|rounded|shadow)-\[/.test(line)),
    )
    expect(hits.map((h) => `${h.rel}:${h.n} ${h.line.trim()}`)).toEqual([])
  })
})
```

- [ ] **Step 2: Run it and watch it fail**

Run: `cd ui && npx vitest run src/test/guards.test.ts`
Expected: FAIL — both assertions list hits, because `src/index.css` and `src/ui/*.tsx` are full of literals today (e.g. `src/index.css:… #FA5A52`, `src/ui/Button.tsx` has none but `index.css` does).

- [ ] **Step 3: Create the token layer**

Create `ui/src/styles/tokens.css`:

```css
/* The ONLY file in src/ that may contain literal values.
   The four imports are the frozen design-system token set; everything after
   them is a deliberate reconciliation recorded in the frontend spec (F7, F8). */
@import '../../design/_ds/inja-food-design-system-1ef55d80-2e17-482f-b420-9d004eaa22de/tokens/colors.css';
@import '../../design/_ds/inja-food-design-system-1ef55d80-2e17-482f-b420-9d004eaa22de/tokens/spacing.css';
@import '../../design/_ds/inja-food-design-system-1ef55d80-2e17-482f-b420-9d004eaa22de/tokens/typography.css';
@import '../../design/_ds/inja-food-design-system-1ef55d80-2e17-482f-b420-9d004eaa22de/tokens/effects.css';

:root {
  /* F7 — the card shadow is the prototypes' two-layer neutral-dark, replacing
     the violet-tinted value in effects.css. Not both: one card shadow. */
  --shadow-card: 0 1px 2px rgba(16, 10, 40, .16), 0 14px 30px -16px rgba(16, 10, 40, .55);
  --shadow-card-hover: 0 3px 6px rgba(16, 10, 40, .2), 0 26px 52px -22px rgba(16, 10, 40, .6);

  /* F7 — the mono stack drops JetBrains Mono, which the prototypes name and
     never load. */
  --font-mono: ui-monospace, 'SF Mono', Menlo, Consolas, monospace;

  /* F11 — the smallest interactive box. */
  --size-touch: 44px;

  /* F8 — semantic type roles. The shell overrides these; the panel scale is
     the default so anything rendered outside a shell is still legible. */
  --fs-role-body: var(--fs-body);
  --fs-role-caption: var(--fs-sm2);
  --fs-role-title: var(--fs-h2);
  --fs-role-subtitle: var(--fs-lg);
  --lh-role-body: var(--lh-snug);
  --lh-role-prose: var(--lh-normal);
}

/* F8 — density is a property of the shell, never a prop a caller passes. */
[data-shell='panel'] {
  --fs-role-body: var(--fs-body);        /* 14px */
  --fs-role-caption: var(--fs-sm2);      /* 12.5px */
  --fs-role-title: var(--fs-h2);         /* 22px */
  --fs-role-subtitle: var(--fs-lg);      /* 15px */
  --lh-role-body: var(--lh-snug);        /* 1.6 */
  --lh-role-prose: var(--lh-normal);     /* 1.7 */
}

[data-shell='reader'] {
  --fs-role-body: var(--fs-lg);          /* 15px */
  --fs-role-caption: var(--fs-sm);       /* 13px */
  --fs-role-title: var(--fs-doc-title);  /* 27px */
  --fs-role-subtitle: var(--fs-h5);      /* 16px */
  --lh-role-body: var(--lh-loose);       /* 1.9 */
  --lh-role-prose: var(--lh-looser);     /* 2.1 */
}
```

- [ ] **Step 4: Create the base layer**

Create `ui/src/styles/base.css`:

```css
@layer base {
  html {
    direction: rtl;
    scrollbar-color: var(--violet-mid) transparent;
  }
  body {
    margin: 0;
    font-family: var(--font-sans);
    background: var(--bg);
    color: var(--text-strong);
  }
  ::selection { background: var(--selection-bg); color: var(--card); }

  /* F11 — a visible focus ring on everything focusable, buttons included. */
  :focus-visible {
    outline: 3px solid var(--coral);
    outline-offset: 2px;
    border-radius: var(--radius-sm);
  }

  ::-webkit-scrollbar { width: 12px; height: 12px; }
  ::-webkit-scrollbar-track { background: var(--tile-v); border-radius: var(--radius-sm); }
  ::-webkit-scrollbar-thumb {
    background: var(--violet-mid);
    border-radius: var(--radius-sm);
    border: 2px solid transparent;
    background-clip: content-box;
  }
  ::-webkit-scrollbar-thumb:hover { background: var(--violet); }
}
```

- [ ] **Step 5: Reduce `index.css` to imports**

Replace the entire contents of `ui/src/index.css` with:

```css
@import './styles/tokens.css';

@tailwind base;
@tailwind components;
@tailwind utilities;

@import './styles/base.css';

@layer components {
  .id-badge {
    font-family: var(--font-mono);
    font-size: var(--fs-xxs);
    padding-inline: var(--space-4);
    padding-block: var(--space-1);
    border-radius: var(--radius-badge);
  }
}
```

The `.btn*` and `.chip*` classes are deliberately gone — Tasks 4 and 5 move that styling into the components, where the variant lives next to its markup instead of in a stylesheet a component silently depends on.

- [ ] **Step 6: Point Tailwind's theme at the variables**

Replace the `theme` block of `ui/tailwind.config.js`:

```js
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
    },
  },
  plugins: [],
}
```

- [ ] **Step 7: Repoint the export parity test at the token file**

`ui/export/print/edge-parity.test.tsx:165` reads `tailwind.config.js` as **text** and greps it for a literal:

```ts
const tile = TAILWIND.match(/'tile-v2':\s*'(#[0-9A-Fa-f]{6})'/)
```

Step 6 replaces that literal with `var(--tile-v2)`, so the match returns null and the test fails. The colour itself does not change — `#F4EFFB` moves from the Tailwind config to the token file, which is now its source of truth.

This is the one place F touches `ui/export/**`, and it is a **test**, never the render path: no component, no CSS that reaches a PDF, and the asserted value is byte-identical. The parity guarantee the test exists for is preserved, now pointed at the file that actually defines the colour.

At the top of the file, alongside the existing `TAILWIND` constant (line 32), add:

```ts
const TOKENS = readFileSync(
  join(HERE, '../../design/_ds/inja-food-design-system-1ef55d80-2e17-482f-b420-9d004eaa22de/tokens/colors.css'),
  'utf8',
)
```

and change the match at line 165 to read the token instead:

```ts
    const tile = TOKENS.match(/--tile-v2:\s*(#[0-9A-Fa-f]{6})/)
    expect(tile, 'the token set defines tile-v2').not.toBeNull()
```

Leave the rest of the test — including how the captured hex is compared against `print.css` — untouched.

- [ ] **Step 8: Run the guard test**

Run: `cd ui && npx vitest run src/test/guards.test.ts`
Expected: PASS — both assertions return empty arrays. `src/ui`, `src/api`, `src/lib` and `src/auth` contain no hex literals today, and `PENDING_REBUILD` covers the four directories F does not rebuild. **Do not widen `ALLOWED`.** If a file under a policed directory reports a hit, stop and report it rather than adding an allowance.

- [ ] **Step 9: Verify nothing else broke**

Run: `cd ui && npx vitest run && npx tsc -b`
Expected: existing suites pass; TypeScript clean. Component tests that assert on `.btn`/`.chip` classes will fail — those are `src/ui/primitives.test.tsx`, fixed in Tasks 4–5. Note the failures and continue.

- [ ] **Step 10: Commit**

```bash
git add ui/src/styles ui/src/index.css ui/tailwind.config.js ui/src/test/guards.test.ts
git commit -m "feat(ui): tokens become the only source of values

Tailwind's theme now resolves to the frozen _ds custom properties, so a
component names a role and never a value. A test greps src/ for hex literals
and arbitrary Tailwind sizes and fails on a hit, which is what keeps it true.

Two reconciliations from F7 land here rather than in 200 places: the card
shadow becomes the prototypes' neutral-dark two-layer, and the mono stack drops
JetBrains Mono, which the prototypes name and never load."
```

---

### Task 2: Shell selection

**Files:**
- Create: `ui/src/auth/session.ts`, `ui/src/auth/session.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces: `type Capability`, `type SessionDescriptor`, `selectShell(caps: Capability[]): Shell` where `type Shell = 'panel' | 'reader'`. P0 populates the descriptor from `GET /api/auth/me`; nothing here performs I/O.

- [ ] **Step 1: Write the failing test**

Create `ui/src/auth/session.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { selectShell, type Capability } from './session'

const READER: Capability[] = ['view', 'comment', 'export_pdf']
const ADMIN: Capability[] = [...READER, 'manage_users', 'manage_peers', 'view_audit']
const EDITOR: Capability[] = [...ADMIN, 'edit', 'confirm', 'set_visibility']

describe('F2 — the shell is chosen by capability, not by role name', () => {
  it('gives the Reader shell to a reader', () => {
    expect(selectShell(READER)).toBe('reader')
  })

  it('gives the Reader shell to a reader without download', () => {
    expect(selectShell(['view', 'comment'])).toBe('reader')
  })

  it('gives the Panel shell to an admin and an editor', () => {
    expect(selectShell(ADMIN)).toBe('panel')
    expect(selectShell(EDITOR)).toBe('panel')
  })

  it('gives the Panel shell to an unnamed role holding a panel capability', () => {
    // The point of deriving from capabilities: a role seeded later, with a name
    // nothing in this file knows, still lands in the right shell.
    expect(selectShell(['view', 'view_audit'])).toBe('panel')
  })

  it('treats an empty capability set as a reader', () => {
    expect(selectShell([])).toBe('reader')
  })
})
```

- [ ] **Step 2: Run it and watch it fail**

Run: `cd ui && npx vitest run src/auth/session.test.ts`
Expected: FAIL — `Failed to resolve import "./session"`.

- [ ] **Step 3: Write the implementation**

Create `ui/src/auth/session.ts`:

```ts
/** The nine capabilities (spec D9). */
export type Capability =
  | 'view' | 'comment' | 'export_pdf'
  | 'manage_users' | 'manage_peers' | 'view_audit'
  | 'edit' | 'confirm' | 'set_visibility'

export type Scope = string        // '*' | 'dept:{code}' | 'dept:{code}/report:{kind}'
export type Shell = 'panel' | 'reader'

/** What `GET /api/auth/me` returns (spec D47). P0 builds the endpoint. */
export interface SessionDescriptor {
  username: string
  displayName: string
  role: string
  capabilities: Capability[]
  scopes: Scope[]
  supervisor: string | null
  canSupervise: boolean
  pendingApprovals: number
}

/** Capabilities that only the Panel surfaces (spec F2). */
const PANEL_CAPABILITIES: readonly Capability[] = [
  'edit', 'confirm', 'set_visibility', 'manage_users', 'view_audit',
]

/**
 * Derived from capabilities rather than from the role's name, so a role added to
 * the seed later (D50 — roles come from the seed, never from the UI) lands in the
 * right shell with nobody updating a list of names.
 */
export function selectShell(capabilities: Capability[]): Shell {
  return capabilities.some((c) => PANEL_CAPABILITIES.includes(c)) ? 'panel' : 'reader'
}

export function can(descriptor: SessionDescriptor, capability: Capability): boolean {
  return descriptor.capabilities.includes(capability)
}
```

- [ ] **Step 4: Run the test**

Run: `cd ui && npx vitest run src/auth/session.test.ts`
Expected: PASS — 5 tests.

- [ ] **Step 5: Commit**

```bash
git add ui/src/auth/session.ts ui/src/auth/session.test.ts
git commit -m "feat(ui): shell selection is a pure function over capabilities

A role seeded later lands in the right shell without anyone updating a list of
role names, which is the whole reason this reads capabilities rather than the
role's name. No I/O, so it is fully tested before P0 builds the endpoint that
supplies the descriptor."
```

---

### Task 3: Buttons

**Files:**
- Modify: `ui/src/ui/Button.tsx`, `ui/src/ui/primitives.test.tsx`
- Create: `ui/src/ui/IconButton.tsx`, `ui/src/test/a11y.ts`

**Interfaces:**
- Consumes: Tailwind token classes from Task 1.
- Produces: `<Button variant loading loadingLabel>` (unchanged public API, restyled), `<Button.Spinner>`, and `<IconButton label icon>` where `label` is **required** and becomes the accessible name.

- [ ] **Step 1: Write the shared touch-target assertion**

Create `ui/src/test/a11y.ts`:

```ts
import { expect } from 'vitest'

/**
 * F11 — 44px minimum touch target. jsdom reports no layout, so we assert the
 * class contract that produces the size rather than a computed box.
 */
export function expectTouchTarget(el: HTMLElement) {
  expect(el.className).toMatch(/min-h-touch/)
  expect(el.className).toMatch(/min-w-touch/)
}
```

- [ ] **Step 2: Write the failing tests**

Replace the `Button` cases in `ui/src/ui/primitives.test.tsx` and add the `IconButton` ones. The whole file becomes:

```tsx
import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { Button } from './Button'
import { IconButton } from './IconButton'
import { Chip } from './Chip'
import { IdBadge } from './IdBadge'
import { expectTouchTarget } from '../test/a11y'

const Icon = () => <svg viewBox="0 0 24 24" aria-hidden><path d="M12 5v14" /></svg>

describe('Button', () => {
  it('meets the touch-target minimum', () => {
    render(<Button>ذخیره</Button>)
    expectTouchTarget(screen.getByRole('button'))
  })
  it('shows a spinner, swaps the label and disables itself while loading', () => {
    render(<Button variant="green" loading loadingLabel="در حال ذخیره…">ذخیره</Button>)
    const btn = screen.getByRole('button')
    expect(btn).toBeDisabled()
    expect(btn).toHaveAttribute('aria-busy', 'true')
    expect(btn).toHaveTextContent('در حال ذخیره…')
    expect(screen.getByTestId('btn-spinner')).toBeInTheDocument()
  })
  it('keeps its own children when loading without a loadingLabel', () => {
    render(<Button loading>ذخیره</Button>)
    expect(screen.getByRole('button')).toHaveTextContent('ذخیره')
  })
  it('is idle by default', () => {
    render(<Button>ذخیره</Button>)
    const btn = screen.getByRole('button')
    expect(btn).not.toBeDisabled()
    expect(btn).not.toHaveAttribute('aria-busy')
    expect(screen.queryByTestId('btn-spinner')).not.toBeInTheDocument()
  })
})

describe('IconButton', () => {
  it('exposes its label as the accessible name', () => {
    render(<IconButton label="بستن" icon={<Icon />} />)
    expect(screen.getByRole('button', { name: 'بستن' })).toBeInTheDocument()
  })
  it('hides the glyph from assistive technology', () => {
    const { container } = render(<IconButton label="بستن" icon={<Icon />} />)
    expect(container.querySelector('svg')).toHaveAttribute('aria-hidden')
  })
  it('meets the touch-target minimum', () => {
    render(<IconButton label="بستن" icon={<Icon />} />)
    expectTouchTarget(screen.getByRole('button'))
  })
  it('fires onClick', async () => {
    let clicked = false
    render(<IconButton label="بستن" icon={<Icon />} onClick={() => { clicked = true }} />)
    await userEvent.click(screen.getByRole('button'))
    expect(clicked).toBe(true)
  })
})

describe('Chip', () => {
  it('renders its text', () => {
    render(<Chip kind="control">بودجه</Chip>)
    expect(screen.getByText('بودجه')).toBeInTheDocument()
  })
})

describe('IdBadge', () => {
  it('renders LTR monospace', () => {
    render(<IdBadge>cooking-001</IdBadge>)
    const el = screen.getByText('cooking-001')
    expect(el).toHaveClass('id-badge')
    expect(el).toHaveAttribute('dir', 'ltr')
  })
})
```

- [ ] **Step 3: Run and watch it fail**

Run: `cd ui && npx vitest run src/ui/primitives.test.tsx`
Expected: FAIL — `Failed to resolve import "./IconButton"`, and the touch-target cases fail because `Button` has no `min-h-touch`.

- [ ] **Step 4: Restyle `Button` onto tokens**

Replace `ui/src/ui/Button.tsx`:

```tsx
import type { ButtonHTMLAttributes, ReactNode } from 'react'

type Variant = 'coral' | 'violet' | 'green' | 'ghost'

const BASE =
  'inline-flex items-center justify-center gap-2 min-h-touch min-w-touch px-4 ' +
  'rounded-control font-bold text-body cursor-pointer border-0 transition-[filter,transform]'

const V: Record<Variant, string> = {
  coral: 'bg-coral text-card shadow-coral hover:brightness-105',
  violet: 'bg-violet text-card shadow-violet hover:brightness-110',
  green: 'bg-green text-card shadow-green hover:brightness-105',
  ghost: 'bg-card text-violet border border-line hover:bg-tile-v2',
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
  variant = 'ghost', className = '', loading = false, loadingLabel, children, disabled, ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: Variant; loading?: boolean; loadingLabel?: ReactNode
}) {
  return (
    // a slow save must look busy, not frozen: the spinner is the feedback and the
    // forced `disabled` is what stops a second submit while the first is in flight
    <button
      className={`${BASE} ${V[variant]} ${loading ? 'cursor-progress' : ''} ${className}`}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      {...props}
    >
      {loading && <Spinner />}
      {loading && loadingLabel !== undefined ? loadingLabel : children}
    </button>
  )
}
```

- [ ] **Step 5: Write `IconButton`**

Create `ui/src/ui/IconButton.tsx`:

```tsx
import type { ButtonHTMLAttributes, ReactElement } from 'react'
import { cloneElement } from 'react'

/**
 * An icon-only control. `label` is required and becomes the accessible name —
 * the mockups rely on `title`, which screen readers treat inconsistently and
 * which never reaches a keyboard user (F11).
 */
export function IconButton({
  label, icon, className = '', ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { label: string; icon: ReactElement }) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      className={
        'inline-flex items-center justify-center min-h-touch min-w-touch ' +
        `rounded-control bg-transparent text-violet border-0 cursor-pointer hover:bg-tile-v2 ${className}`
      }
      {...props}
    >
      {cloneElement(icon, { 'aria-hidden': true, focusable: 'false' } as Record<string, unknown>)}
    </button>
  )
}
```

- [ ] **Step 6: Run the tests**

Run: `cd ui && npx vitest run src/ui/primitives.test.tsx src/test/guards.test.ts`
Expected: PASS — all Button, IconButton, Chip and IdBadge cases, and the guards stay green.

- [ ] **Step 7: Commit**

```bash
git add ui/src/ui/Button.tsx ui/src/ui/IconButton.tsx ui/src/ui/primitives.test.tsx ui/src/test/a11y.ts
git commit -m "feat(ui): buttons carry tokens, a focus ring and a real name

Variant styling moves out of a stylesheet and next to the markup it applies to.
IconButton requires a label rather than accepting a title, because the mockups'
title-only pattern reaches neither a keyboard user nor most screen readers, and
every control clears the 44px minimum."
```

---

### Task 4: Display primitives

**Files:**
- Modify: `ui/src/ui/Card.tsx`, `ui/src/ui/Chip.tsx`, `ui/src/ui/IdBadge.tsx`
- Create: `ui/src/ui/StatusPill.tsx`, `ui/src/ui/StatusPill.test.tsx`

**Interfaces:**
- Consumes: token classes from Task 1.
- Produces: `<Card>`, `<Chip kind>` (`'input'|'control'|'output'|'mech'`), `<IdBadge tone>`, and `<StatusPill tone label>` where `tone` is `'ok'|'warn'|'danger'|'neutral'|'info'`.

- [ ] **Step 1: Write the failing test**

Create `ui/src/ui/StatusPill.test.tsx`:

```tsx
import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { StatusPill } from './StatusPill'

describe('StatusPill', () => {
  it('always renders its label as text, never colour alone', () => {
    // F11: status is never carried by colour alone.
    render(<StatusPill tone="warn" label="در انتظار تأیید" />)
    expect(screen.getByText('در انتظار تأیید')).toBeInTheDocument()
  })
  it('distinguishes tones by class so the same label can mean different states', () => {
    const { rerender, container } = render(<StatusPill tone="ok" label="تأییدشده" />)
    const ok = container.firstElementChild!.className
    rerender(<StatusPill tone="danger" label="تأییدشده" />)
    expect(container.firstElementChild!.className).not.toBe(ok)
  })
})
```

- [ ] **Step 2: Run and watch it fail**

Run: `cd ui && npx vitest run src/ui/StatusPill.test.tsx`
Expected: FAIL — `Failed to resolve import "./StatusPill"`.

- [ ] **Step 3: Write `StatusPill`**

Create `ui/src/ui/StatusPill.tsx`:

```tsx
type Tone = 'ok' | 'warn' | 'danger' | 'neutral' | 'info'

const T: Record<Tone, string> = {
  ok: 'bg-tile-ok text-green',
  warn: 'bg-tile-warn text-[color:var(--warn)]',
  danger: 'bg-tile-c text-conflict',
  neutral: 'bg-tile-dead text-muted',
  info: 'bg-[color:var(--tile-info)] text-[color:var(--info)]',
}

/** Status always carries text. Colour is reinforcement, never the message (F11). */
export function StatusPill({ tone, label }: { tone: Tone; label: string }) {
  return (
    <span className={`inline-flex items-center px-3 py-1 rounded-chip text-caption font-bold ${T[tone]}`}>
      {label}
    </span>
  )
}
```

Note `text-[color:var(--warn)]` is a variable reference, not a literal — the guard test greps for `#hex` and for `text-\[`, so add `warn`/`info` to the Tailwind `colors` map instead and use `text-warn` / `bg-tile-info` / `text-info`. Update `ui/tailwind.config.js` `colors` with:

```js
        warn: 'var(--warn)', info: 'var(--info)', 'tile-info': 'var(--tile-info)',
```

then use `bg-tile-warn text-warn` and `bg-tile-info text-info` in `T`.

- [ ] **Step 4: Restyle the three existing primitives**

`ui/src/ui/Card.tsx`:

```tsx
import type { HTMLAttributes } from 'react'

export function Card({ className = '', ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={`bg-card border border-warm rounded-card shadow-card ${className}`} {...props} />
}
```

`ui/src/ui/Chip.tsx`:

```tsx
import type { ReactNode } from 'react'

type Kind = 'input' | 'control' | 'output' | 'mech'

const K: Record<Kind, string> = {
  input: 'bg-icom-input text-icom-input',
  control: 'bg-icom-control text-icom-control',
  output: 'bg-icom-output text-icom-output',
  mech: 'bg-icom-mech text-icom-mech',
}

export function Chip({ kind, children }: { kind: Kind; children: ReactNode }) {
  return (
    <span className={`inline-block px-[0.6em] py-[0.25em] rounded-chip text-caption break-words min-w-0 max-w-full ${K[kind]}`}>
      {children}
    </span>
  )
}
```

Add the ICOM colours to `ui/tailwind.config.js` `colors`:

```js
        'icom-input': 'var(--icom-input-bg)', 'icom-control': 'var(--icom-control-bg)',
        'icom-output': 'var(--icom-output-bg)', 'icom-mech': 'var(--icom-mech-bg)',
```

and to `textColor` via a separate `extend.textColor` entry mapping the same names to the `-fg` variables:

```js
      textColor: {
        'icom-input': 'var(--icom-input-fg)', 'icom-control': 'var(--icom-control-fg)',
        'icom-output': 'var(--icom-output-fg)', 'icom-mech': 'var(--icom-mech-fg)',
      },
```

`ui/src/ui/IdBadge.tsx`:

```tsx
import type { ReactNode } from 'react'

export function IdBadge({ children, tone = 'muted' }: { children: ReactNode; tone?: 'violet' | 'muted' }) {
  const cls = tone === 'violet' ? 'bg-violet text-card' : 'bg-tile-v2 text-muted'
  return <span dir="ltr" className={`id-badge ${cls}`}>{children}</span>
}
```

- [ ] **Step 5: Run the tests**

Run: `cd ui && npx vitest run src/ui src/test/guards.test.ts`
Expected: PASS — StatusPill's 2 cases, the primitives file, and both guards.

- [ ] **Step 6: Commit**

```bash
git add ui/src/ui ui/tailwind.config.js
git commit -m "feat(ui): display primitives on tokens, and a status pill that speaks

StatusPill always renders its label, so a state is never communicated by colour
alone — which matters for a system whose statuses are the difference between a
comment being waited on and being refused."
```

---

### Task 5: Overlays — one component, two presentations

**Files:**
- Create: `ui/src/ui/Overlay.tsx`, `ui/src/ui/Overlay.test.tsx`

**Interfaces:**
- Consumes: `IconButton` (Task 3).
- Produces: `<Sheet open onClose title children>` and `<Dialog open onClose title children>`. Both trap focus, close on `Esc`, restore focus to the trigger, and render as bottom sheets below the `md` breakpoint (F5).

- [ ] **Step 1: Write the failing test**

Create `ui/src/ui/Overlay.test.tsx`:

```tsx
import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { Dialog } from './Overlay'

function Harness({ onClose }: { onClose: () => void }) {
  return (
    <Dialog open onClose={onClose} title="حذف فرآیند">
      <button>تأیید</button>
      <button>انصراف</button>
    </Dialog>
  )
}

describe('Overlay', () => {
  it('exposes itself as a dialog with an accessible name', () => {
    render(<Harness onClose={() => {}} />)
    expect(screen.getByRole('dialog', { name: 'حذف فرآیند' })).toBeInTheDocument()
  })

  it('closes on Escape', async () => {
    const onClose = vi.fn()
    render(<Harness onClose={onClose} />)
    await userEvent.keyboard('{Escape}')
    expect(onClose).toHaveBeenCalledOnce()
  })

  it('moves focus into the dialog when it opens', async () => {
    render(<Harness onClose={() => {}} />)
    // The close button is first in DOM order and takes initial focus.
    expect(screen.getByRole('button', { name: 'بستن' })).toHaveFocus()
  })

  it('traps Tab inside the dialog', async () => {
    render(<Harness onClose={() => {}} />)
    const close = screen.getByRole('button', { name: 'بستن' })
    const confirm = screen.getByRole('button', { name: 'تأیید' })
    const cancel = screen.getByRole('button', { name: 'انصراف' })
    await userEvent.tab()
    expect(confirm).toHaveFocus()
    await userEvent.tab()
    expect(cancel).toHaveFocus()
    await userEvent.tab()          // wraps rather than escaping to the page
    expect(close).toHaveFocus()
  })

  it('restores focus to whatever was focused before it opened', () => {
    const trigger = document.createElement('button')
    document.body.appendChild(trigger)
    trigger.focus()
    const { unmount } = render(<Harness onClose={() => {}} />)
    expect(trigger).not.toHaveFocus()      // focus moved into the dialog
    unmount()
    expect(trigger).toHaveFocus()          // and came back
    trigger.remove()
  })

  it('renders as a bottom sheet below the md breakpoint', () => {
    render(<Harness onClose={() => {}} />)
    // F5: one component, switched by breakpoint — never a per-screen variant.
    expect(screen.getByRole('dialog').className).toMatch(/rounded-t-panel/)
    expect(screen.getByRole('dialog').className).toMatch(/md:rounded-panel/)
  })
})
```

- [ ] **Step 2: Run and watch it fail**

Run: `cd ui && npx vitest run src/ui/Overlay.test.tsx`
Expected: FAIL — `Failed to resolve import "./Overlay"`.

- [ ] **Step 3: Write the implementation**

Create `ui/src/ui/Overlay.tsx`:

```tsx
import { useEffect, useRef, type ReactNode } from 'react'
import { IconButton } from './IconButton'

const CloseIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" width="20" height="20">
    <path d="M6 6l12 12M18 6L6 18" strokeLinecap="round" />
  </svg>
)

const FOCUSABLE =
  'a[href],button:not([disabled]),textarea:not([disabled]),input:not([disabled]),select:not([disabled]),[tabindex]:not([tabindex="-1"])'

interface OverlayProps {
  open: boolean
  onClose: () => void
  title: string
  children: ReactNode
  /** 'dialog' centres above the breakpoint; 'sheet' anchors to the inline start. */
  presentation?: 'dialog' | 'sheet'
}

function Overlay({ open, onClose, title, children, presentation = 'dialog' }: OverlayProps) {
  const box = useRef<HTMLDivElement>(null)
  const restoreTo = useRef<HTMLElement | null>(null)

  useEffect(() => {
    if (!open) return
    restoreTo.current = document.activeElement as HTMLElement | null
    box.current?.querySelector<HTMLElement>(FOCUSABLE)?.focus()
    return () => restoreTo.current?.focus()
  }, [open])

  useEffect(() => {
    if (!open) return
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') { onClose(); return }
      if (e.key !== 'Tab' || !box.current) return
      // F11 — Tab wraps inside the overlay rather than escaping to the page behind it.
      const items = Array.from(box.current.querySelectorAll<HTMLElement>(FOCUSABLE))
      if (items.length === 0) return
      const first = items[0]
      const last = items[items.length - 1]
      const active = document.activeElement
      if (!e.shiftKey && active === last) { e.preventDefault(); first.focus() }
      if (e.shiftKey && active === first) { e.preventDefault(); last.focus() }
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [open, onClose])

  if (!open) return null

  // F5 — bottom sheet below md, panel or centred dialog above it. Written once so
  // no screen implements its own mobile variant and none can forget to.
  const shape =
    presentation === 'sheet'
      ? 'w-full max-h-[88vh] rounded-t-panel md:rounded-panel md:w-[var(--width-drawer)] md:h-full md:max-h-none md:me-auto md:ms-0'
      : 'w-full max-h-[92vh] rounded-t-panel md:rounded-panel md:w-auto md:max-w-[560px] md:max-h-[85vh]'

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-scrim md:items-center"
      onMouseDown={(e) => { if (e.target === e.currentTarget) onClose() }}
    >
      <div
        ref={box}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className={`bg-card shadow-modal overflow-auto p-6 ${shape}`}
      >
        <div className="flex items-center gap-3 mb-4">
          <h2 className="text-title font-extrabold text-ink m-0 flex-1">{title}</h2>
          <IconButton label="بستن" icon={<CloseIcon />} onClick={onClose} />
        </div>
        {children}
      </div>
    </div>
  )
}

export function Dialog(props: Omit<OverlayProps, 'presentation'>) {
  return <Overlay {...props} presentation="dialog" />
}

export function Sheet(props: Omit<OverlayProps, 'presentation'>) {
  return <Overlay {...props} presentation="sheet" />
}
```

- [ ] **Step 4: Run the tests**

Run: `cd ui && npx vitest run src/ui/Overlay.test.tsx`
Expected: PASS — 6 cases. If the trap test fails because `userEvent.tab()` skips the close button, confirm the close button is the first `FOCUSABLE` match in DOM order.

- [ ] **Step 5: Commit**

```bash
git add ui/src/ui/Overlay.tsx ui/src/ui/Overlay.test.tsx
git commit -m "feat(ui): one overlay, two presentations, focus handled once

Sheet and Dialog are the same component switched by breakpoint, so no screen
writes its own mobile variant and none can forget to. Focus moves in on open,
Tab wraps inside, Escape closes, and focus returns to whatever opened it — none
of which the mockups have and all of which is cheap here and expensive later."
```

---

### Task 6: Toast

**Files:**
- Create: `ui/src/ui/Toast.tsx`, `ui/src/ui/Toast.test.tsx`

**Interfaces:**
- Consumes: nothing.
- Produces: `<ToastProvider>` and `useToast(): (message: string, tone?: 'ok' | 'danger') => void`.

- [ ] **Step 1: Write the failing test**

Create `ui/src/ui/Toast.test.tsx`:

```tsx
import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { ToastProvider, useToast } from './Toast'

function Fixture() {
  const toast = useToast()
  return <button onClick={() => toast('ذخیره شد')}>ذخیره</button>
}

describe('Toast', () => {
  it('announces politely so a screen reader hears it without losing focus', async () => {
    render(<ToastProvider><Fixture /></ToastProvider>)
    await userEvent.click(screen.getByRole('button', { name: 'ذخیره' }))
    const live = screen.getByRole('status')
    expect(live).toHaveTextContent('ذخیره شد')
    expect(live).toHaveAttribute('aria-live', 'polite')
  })

  it('announces errors assertively', async () => {
    function ErrFixture() {
      const toast = useToast()
      return <button onClick={() => toast('ذخیره نشد', 'danger')}>خطا</button>
    }
    render(<ToastProvider><ErrFixture /></ToastProvider>)
    await userEvent.click(screen.getByRole('button', { name: 'خطا' }))
    expect(screen.getByRole('alert')).toHaveTextContent('ذخیره نشد')
  })
})
```

- [ ] **Step 2: Run and watch it fail**

Run: `cd ui && npx vitest run src/ui/Toast.test.tsx`
Expected: FAIL — `Failed to resolve import "./Toast"`.

- [ ] **Step 3: Write the implementation**

Create `ui/src/ui/Toast.tsx`:

```tsx
import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react'

type Tone = 'ok' | 'danger'
interface Toast { id: number; message: string; tone: Tone }

const Ctx = createContext<((message: string, tone?: Tone) => void) | null>(null)

export function useToast() {
  const push = useContext(Ctx)
  if (!push) throw new Error('useToast must be used inside <ToastProvider>')
  return push
}

export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<Toast[]>([])

  const push = useCallback((message: string, tone: Tone = 'ok') => {
    setItems((xs) => [...xs, { id: Date.now() + Math.random(), message, tone }])
  }, [])

  useEffect(() => {
    if (items.length === 0) return
    const t = setTimeout(() => setItems((xs) => xs.slice(1)), 2600)
    return () => clearTimeout(t)
  }, [items])

  return (
    <Ctx.Provider value={push}>
      {children}
      <div className="fixed inset-inline-0 bottom-6 flex flex-col items-center gap-2 pointer-events-none z-[60]">
        {items.map((t) => (
          <div
            key={t.id}
            // F11 — a success is polite, a failure interrupts. A toast nobody can
            // hear is not feedback.
            role={t.tone === 'danger' ? 'alert' : 'status'}
            aria-live={t.tone === 'danger' ? 'assertive' : 'polite'}
            className={`px-5 py-3 rounded-control text-body font-bold shadow-modal ${
              t.tone === 'danger' ? 'bg-conflict text-card' : 'bg-ink text-card'
            }`}
          >
            {t.message}
          </div>
        ))}
      </div>
    </Ctx.Provider>
  )
}
```

- [ ] **Step 4: Run the tests**

Run: `cd ui && npx vitest run src/ui/Toast.test.tsx`
Expected: PASS — 2 cases.

- [ ] **Step 5: Commit**

```bash
git add ui/src/ui/Toast.tsx ui/src/ui/Toast.test.tsx
git commit -m "feat(ui): toasts that are actually announced

role=status for a success, role=alert for a failure. The mockups' toast is a
styled div, which is invisible to anyone not looking at that corner of the
screen at that moment."
```

---

### Task 7: The five states

**Files:**
- Create: `ui/src/ui/states/index.tsx`, `ui/src/ui/states/states.test.tsx`

**Interfaces:**
- Consumes: `Button` (Task 3), `Card` (Task 4).
- Produces: `<LoadingState rows>`, `<EmptyState title hint>`, `<ErrorState message onRetry>`, `<DeniedState>`, `<NotFoundState>`.

- [ ] **Step 1: Write the failing test**

Create `ui/src/ui/states/states.test.tsx`:

```tsx
import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { LoadingState, EmptyState, ErrorState, DeniedState, NotFoundState } from './index'

describe('states', () => {
  it('LoadingState announces itself and renders skeleton rows', () => {
    render(<LoadingState rows={3} />)
    expect(screen.getByRole('status')).toHaveAttribute('aria-busy', 'true')
    expect(screen.getAllByTestId('skeleton-row')).toHaveLength(3)
  })

  it('EmptyState states what is not there', () => {
    render(<EmptyState title="فرآیندی ثبت نشده است" hint="با پردازش یک جلسه، فرآیندها اینجا می‌آیند." />)
    expect(screen.getByText('فرآیندی ثبت نشده است')).toBeInTheDocument()
    expect(screen.getByText('با پردازش یک جلسه، فرآیندها اینجا می‌آیند.')).toBeInTheDocument()
  })

  it('ErrorState offers a retry and never shows a status code', async () => {
    const onRetry = vi.fn()
    render(<ErrorState message="اطلاعات بارگذاری نشد." onRetry={onRetry} />)
    await userEvent.click(screen.getByRole('button', { name: 'تلاش دوباره' }))
    expect(onRetry).toHaveBeenCalledOnce()
    expect(screen.queryByText(/50\d|40\d/)).not.toBeInTheDocument()
  })

  it('DeniedState names the action refused', () => {
    render(<DeniedState />)
    expect(screen.getByText('اجازهٔ این کار را ندارید')).toBeInTheDocument()
  })

  it('NotFoundState says nothing about what might exist', () => {
    // F13 — the not-found path must not hint that a resource is being withheld,
    // which is the whole reason D56 answers 404 instead of 403.
    render(<NotFoundState />)
    expect(screen.getByText('چیزی اینجا نیست')).toBeInTheDocument()
    const text = document.body.textContent ?? ''
    expect(text).not.toMatch(/دسترسی|مدیر|اجازه|محدود/)
  })
})
```

- [ ] **Step 2: Run and watch it fail**

Run: `cd ui && npx vitest run src/ui/states/states.test.tsx`
Expected: FAIL — `Failed to resolve import "./index"`.

- [ ] **Step 3: Write the implementation**

Create `ui/src/ui/states/index.tsx`:

```tsx
import { Button } from '../Button'
import { Card } from '../Card'

export function LoadingState({ rows = 3 }: { rows?: number }) {
  // F12 — skeletons shaped like the content, so nothing shifts when data lands.
  return (
    <div role="status" aria-busy="true" aria-label="در حال بارگذاری" className="flex flex-col gap-3">
      {Array.from({ length: rows }, (_, i) => (
        <div key={i} data-testid="skeleton-row"
          className="h-16 rounded-card bg-tile-v2 animate-pulse" />
      ))}
    </div>
  )
}

export function EmptyState({ title, hint }: { title: string; hint?: string }) {
  return (
    <Card className="p-8 text-center">
      <p className="text-subtitle font-bold text-ink m-0">{title}</p>
      {hint && <p className="text-body text-muted mt-2 mb-0">{hint}</p>}
    </Card>
  )
}

export function ErrorState({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <Card className="p-8 text-center">
      <p className="text-subtitle font-bold text-ink m-0">{message}</p>
      {onRetry && (
        <div className="mt-4">
          <Button variant="violet" onClick={onRetry}>تلاش دوباره</Button>
        </div>
      )}
    </Card>
  )
}

export function DeniedState() {
  // F13 — for a refused *action* on something the user can see. Everything
  // out of scope is a 404 and renders NotFoundState instead.
  return (
    <Card className="p-8 text-center">
      <p className="text-subtitle font-bold text-ink m-0">اجازهٔ این کار را ندارید</p>
      <p className="text-body text-muted mt-2 mb-0">اگر فکر می‌کنید اشتباهی رخ داده، با سرپرست خود صحبت کنید.</p>
    </Card>
  )
}

export function NotFoundState() {
  // F13 — deliberately indistinguishable from a typo. No copy may hint that
  // something exists here and is being withheld; the UI cannot know, and saying
  // it would answer the question the 404 exists to refuse.
  return (
    <Card className="p-8 text-center">
      <p className="text-subtitle font-bold text-ink m-0">چیزی اینجا نیست</p>
      <p className="text-body text-muted mt-2 mb-0">نشانی را بررسی کنید یا به خانه برگردید.</p>
    </Card>
  )
}
```

- [ ] **Step 4: Run the tests**

Run: `cd ui && npx vitest run src/ui/states/states.test.tsx`
Expected: PASS — 5 cases.

- [ ] **Step 5: Commit**

```bash
git add ui/src/ui/states
git commit -m "feat(ui): the five states, including the two that are easy to get wrong

Denied is for a refused action on something visible; everything out of scope is
a 404 and renders not-found. The not-found copy is asserted to contain no word
about access or administrators, because saying so would answer the question the
404 exists to refuse."
```

---

### Task 8: Persian digit normalisation

**Files:**
- Create: `ui/src/lib/digits.ts`, `ui/src/lib/digits.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces: `toLatinDigits(s: string): string` and `normalisePhone(s: string): string`.

- [ ] **Step 1: Write the failing test**

Create `ui/src/lib/digits.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { toLatinDigits, normalisePhone } from './digits'

describe('toLatinDigits', () => {
  it('folds Persian digits', () => {
    expect(toLatinDigits('۰۹۱۲۳۴۵۶۷۸۹')).toBe('09123456789')
  })
  it('folds Arabic-Indic digits', () => {
    expect(toLatinDigits('٠٩١٢٣٤٥٦٧٨٩')).toBe('09123456789')
  })
  it('leaves latin digits and other text alone', () => {
    expect(toLatinDigits('cashier-013')).toBe('cashier-013')
  })
})

describe('normalisePhone', () => {
  it('strips separators', () => {
    expect(normalisePhone('0912 345 6789')).toBe('09123456789')
    expect(normalisePhone('0912-345-6789')).toBe('09123456789')
    expect(normalisePhone('(0912) 3456789')).toBe('09123456789')
  })
  it('rewrites a country code to a leading zero', () => {
    expect(normalisePhone('+989123456789')).toBe('09123456789')
    expect(normalisePhone('00989123456789')).toBe('09123456789')
    expect(normalisePhone('989123456789')).toBe('09123456789')
  })
  it('handles Persian digits with a country code together', () => {
    expect(normalisePhone('+۹۸۹۱۲۳۴۵۶۷۸۹')).toBe('09123456789')
  })
  it('leaves an already-canonical number unchanged', () => {
    expect(normalisePhone('09123456789')).toBe('09123456789')
  })
})
```

- [ ] **Step 2: Run and watch it fail**

Run: `cd ui && npx vitest run src/lib/digits.test.ts`
Expected: FAIL — `Failed to resolve import "./digits"`.

- [ ] **Step 3: Write the implementation**

Create `ui/src/lib/digits.ts`:

```ts
const PERSIAN = '۰۱۲۳۴۵۶۷۸۹'
const ARABIC = '٠١٢٣٤٥٦٧٨٩'

/**
 * Folds Persian and Arabic-Indic digits to ASCII. Not optional in a
 * Persian-language interface: ordinary keyboards emit ۰۹…, and a username that
 * reaches the API unfolded is a different string from the same number typed on a
 * latin keyboard (spec D57).
 */
export function toLatinDigits(s: string): string {
  return s.replace(/[۰-۹٠-٩]/g, (ch) => {
    const p = PERSIAN.indexOf(ch)
    return String(p >= 0 ? p : ARABIC.indexOf(ch))
  })
}

/** Canonical Iranian mobile: `^09\d{9}$` (spec D57). */
export function normalisePhone(input: string): string {
  let s = toLatinDigits(input).replace(/[\s\-()]/g, '')
  if (s.startsWith('+98')) s = '0' + s.slice(3)
  else if (s.startsWith('0098')) s = '0' + s.slice(4)
  else if (s.startsWith('98') && s.length === 12) s = '0' + s.slice(2)
  return s
}
```

- [ ] **Step 4: Run the tests**

Run: `cd ui && npx vitest run src/lib/digits.test.ts`
Expected: PASS — 8 cases.

- [ ] **Step 5: Commit**

```bash
git add ui/src/lib/digits.ts ui/src/lib/digits.test.ts
git commit -m "feat(ui): fold Persian digits before anything reaches the API

Ordinary Persian keyboards emit ۰۹…, so without this the same person signs in
with two different strings and the uniqueness D57 promises stops meaning
anything."
```

---

### Task 9: Session expiry in the API client

**Files:**
- Modify: `ui/src/api/client.ts`
- Modify: `ui/src/api/client.test.ts` — **this file already exists with three passing tests** (parsed JSON + credentials, `ApiError` on non-2xx, header merging). **Append** the new `describe` block; do not replace the file. Note the existing non-2xx test uses a **401** response, so once the interceptor lands it will invoke the handler — harmless, since the default is a no-op, but do not be surprised by it.

**Interfaces:**
- Consumes: nothing.
- Produces: `fetchJson<T>` unchanged in signature, plus `onUnauthorized(handler: () => void): void` for the shell to register a redirect.

- [ ] **Step 1: Write the failing test**

**Append** to `ui/src/api/client.test.ts`, leaving the existing `describe('fetchJson', …)` block untouched. Add `onUnauthorized` to the existing import from `./client`, and add a second `afterEach` that resets the handler:

```ts
import { describe, it, expect, vi, afterEach } from 'vitest'
import { fetchJson, onUnauthorized, ApiError } from './client'

afterEach(() => { vi.restoreAllMocks(); onUnauthorized(() => {}) })

function mockFetch(status: number, body: unknown = {}) {
  vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify(body), {
    status, headers: { 'Content-Type': 'application/json' },
  })))
}

describe('fetchJson', () => {
  it('returns the parsed body on success', async () => {
    mockFetch(200, { ok: true })
    await expect(fetchJson<{ ok: boolean }>('/api/x')).resolves.toEqual({ ok: true })
  })

  it('calls the unauthorized handler on 401 and still rejects', async () => {
    // F14 — an expired session must be a redirect, not an error surfacing inside
    // whatever query happens to run next.
    const handler = vi.fn()
    onUnauthorized(handler)
    mockFetch(401, { detail: 'authentication required' })
    await expect(fetchJson('/api/x')).rejects.toBeInstanceOf(ApiError)
    expect(handler).toHaveBeenCalledOnce()
  })

  it('does not call the unauthorized handler on 403', async () => {
    const handler = vi.fn()
    onUnauthorized(handler)
    mockFetch(403, { detail: 'forbidden' })
    await expect(fetchJson('/api/x')).rejects.toBeInstanceOf(ApiError)
    expect(handler).not.toHaveBeenCalled()
  })

  it('does not call the unauthorized handler on 404', async () => {
    const handler = vi.fn()
    onUnauthorized(handler)
    mockFetch(404, { detail: 'not found' })
    await expect(fetchJson('/api/x')).rejects.toBeInstanceOf(ApiError)
    expect(handler).not.toHaveBeenCalled()
  })
})
```

- [ ] **Step 2: Run and watch it fail**

Run: `cd ui && npx vitest run src/api/client.test.ts`
Expected: FAIL — `onUnauthorized` is not exported.

- [ ] **Step 3: Add the interceptor**

Modify `ui/src/api/client.ts` — keep `ApiError` as-is and add:

```ts
let unauthorizedHandler: () => void = () => {}

/**
 * Registered once by the shell. A 401 means the session ended, which is a
 * redirect to sign-in — not an error for a component to render (F14).
 * 403 and 404 are deliberately excluded: 403 is a refused action the screen
 * should show, and 404 is indistinguishable from a typo by design (D56).
 */
export function onUnauthorized(handler: () => void) {
  unauthorizedHandler = handler
}
```

and inside `fetchJson`, in the `if (!res.ok)` branch, before the `throw`:

```ts
    if (res.status === 401) unauthorizedHandler()
```

- [ ] **Step 4: Run the tests**

Run: `cd ui && npx vitest run src/api/client.test.ts`
Expected: PASS — 4 cases.

- [ ] **Step 5: Commit**

```bash
git add ui/src/api/client.ts ui/src/api/client.test.ts
git commit -m "feat(ui): an expired session redirects instead of erroring somewhere

RequireAuth tests /api/auth/me once at mount, so today a session that ends
mid-use surfaces as a thrown ApiError inside whatever query runs next. 403 and
404 are deliberately not intercepted."
```

---

### Task 10: SearchField, Tabs, Accordion, Menu

**Files:**
- Create: `ui/src/ui/SearchField.tsx`, `ui/src/ui/Tabs.tsx`, `ui/src/ui/Accordion.tsx`, `ui/src/ui/Menu.tsx`, `ui/src/ui/controls.test.tsx`

**Interfaces:**
- Consumes: `IconButton` (Task 3).
- Produces: `<SearchField label value onChange placeholder>`, `<Tabs items value onChange>` with `items: {id, label}[]`, `<Accordion title children defaultOpen>`, `<Menu label items>` with `items: {id, label, onSelect, tone?}[]`.

- [ ] **Step 1: Write the failing test**

Create `ui/src/ui/controls.test.tsx`:

```tsx
import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { SearchField } from './SearchField'
import { Tabs } from './Tabs'
import { Accordion } from './Accordion'
import { Menu } from './Menu'

describe('SearchField', () => {
  it('binds a real label to the input', () => {
    // F11 — a placeholder is not a label.
    render(<SearchField label="جست‌وجوی فرآیند" value="" onChange={() => {}} />)
    expect(screen.getByLabelText('جست‌وجوی فرآیند')).toBeInTheDocument()
  })
  it('reports typing', async () => {
    const onChange = vi.fn()
    render(<SearchField label="جست‌وجو" value="" onChange={onChange} />)
    await userEvent.type(screen.getByLabelText('جست‌وجو'), 'س')
    expect(onChange).toHaveBeenCalledWith('س')
  })
})

describe('Tabs', () => {
  const items = [{ id: 'a', label: 'همه' }, { id: 'b', label: 'باز' }]
  it('exposes a tablist with the active tab selected', () => {
    render(<Tabs items={items} value="a" onChange={() => {}} />)
    expect(screen.getByRole('tablist')).toBeInTheDocument()
    expect(screen.getByRole('tab', { name: 'همه' })).toHaveAttribute('aria-selected', 'true')
    expect(screen.getByRole('tab', { name: 'باز' })).toHaveAttribute('aria-selected', 'false')
  })
  it('reports a change', async () => {
    const onChange = vi.fn()
    render(<Tabs items={items} value="a" onChange={onChange} />)
    await userEvent.click(screen.getByRole('tab', { name: 'باز' }))
    expect(onChange).toHaveBeenCalledWith('b')
  })
})

describe('Accordion', () => {
  it('uses a button header with aria-expanded', async () => {
    render(<Accordion title="سرپرست سالن"><p>محتوا</p></Accordion>)
    const header = screen.getByRole('button', { name: 'سرپرست سالن' })
    expect(header).toHaveAttribute('aria-expanded', 'false')
    await userEvent.click(header)
    expect(header).toHaveAttribute('aria-expanded', 'true')
    expect(screen.getByText('محتوا')).toBeInTheDocument()
  })
})

describe('Menu', () => {
  it('opens, selects and closes on Escape', async () => {
    const onSelect = vi.fn()
    render(<Menu label="ابزارها" items={[{ id: 'del', label: 'حذف', onSelect }]} />)
    await userEvent.click(screen.getByRole('button', { name: 'ابزارها' }))
    await userEvent.click(screen.getByRole('menuitem', { name: 'حذف' }))
    expect(onSelect).toHaveBeenCalledOnce()

    await userEvent.click(screen.getByRole('button', { name: 'ابزارها' }))
    expect(screen.getByRole('menu')).toBeInTheDocument()
    await userEvent.keyboard('{Escape}')
    expect(screen.queryByRole('menu')).not.toBeInTheDocument()
  })
})
```

- [ ] **Step 2: Run and watch it fail**

Run: `cd ui && npx vitest run src/ui/controls.test.tsx`
Expected: FAIL — four unresolved imports.

- [ ] **Step 3: Write `SearchField`**

Create `ui/src/ui/SearchField.tsx`:

```tsx
import { useId } from 'react'

export function SearchField({
  label, value, onChange, placeholder,
}: { label: string; value: string; onChange: (v: string) => void; placeholder?: string }) {
  const id = useId()
  return (
    <div className="flex flex-col gap-1">
      {/* F11 — bound label. The mockups use placeholders alone, which vanish on
          focus and are not announced as names. */}
      <label htmlFor={id} className="text-caption font-bold text-muted">{label}</label>
      <input
        id={id}
        type="search"
        value={value}
        placeholder={placeholder}
        onChange={(e) => onChange(e.target.value)}
        className="min-h-touch w-full px-4 rounded-control border border-line bg-card text-body text-ink"
      />
    </div>
  )
}
```

- [ ] **Step 4: Write `Tabs`**

Create `ui/src/ui/Tabs.tsx`:

```tsx
export interface TabItem { id: string; label: string }

export function Tabs({
  items, value, onChange,
}: { items: TabItem[]; value: string; onChange: (id: string) => void }) {
  return (
    <div role="tablist" className="inline-flex gap-1 p-1 rounded-control bg-tile-v2">
      {items.map((t) => {
        const active = t.id === value
        return (
          <button
            key={t.id}
            role="tab"
            type="button"
            aria-selected={active}
            onClick={() => onChange(t.id)}
            className={`min-h-touch px-4 rounded-control text-caption font-bold border-0 cursor-pointer ${
              active ? 'bg-violet text-card' : 'bg-transparent text-muted hover:text-violet'
            }`}
          >
            {t.label}
          </button>
        )
      })}
    </div>
  )
}
```

- [ ] **Step 5: Write `Accordion`**

Create `ui/src/ui/Accordion.tsx`:

```tsx
import { useId, useState, type ReactNode } from 'react'

export function Accordion({
  title, children, defaultOpen = false,
}: { title: string; children: ReactNode; defaultOpen?: boolean }) {
  const [open, setOpen] = useState(defaultOpen)
  const panelId = useId()
  return (
    <div className="border border-warm rounded-card overflow-hidden">
      <button
        type="button"
        aria-expanded={open}
        aria-controls={panelId}
        onClick={() => setOpen((v) => !v)}
        className="w-full min-h-touch px-4 flex items-center justify-between gap-3 bg-tile-v2 border-0 cursor-pointer text-subtitle font-bold text-ink text-start"
      >
        {title}
        <span aria-hidden>{open ? '−' : '+'}</span>
      </button>
      {open && <div id={panelId} className="p-4">{children}</div>}
    </div>
  )
}
```

- [ ] **Step 6: Write `Menu`**

Create `ui/src/ui/Menu.tsx`:

```tsx
import { useEffect, useRef, useState } from 'react'

export interface MenuItem { id: string; label: string; onSelect: () => void; tone?: 'danger' }

export function Menu({ label, items }: { label: string; items: MenuItem[] }) {
  const [open, setOpen] = useState(false)
  const box = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    function onKey(e: KeyboardEvent) { if (e.key === 'Escape') setOpen(false) }
    function onDown(e: MouseEvent) {
      if (box.current && !box.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('keydown', onKey)
    document.addEventListener('mousedown', onDown)
    return () => {
      document.removeEventListener('keydown', onKey)
      document.removeEventListener('mousedown', onDown)
    }
  }, [open])

  return (
    <div ref={box} className="relative inline-block">
      <button
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
        className="min-h-touch min-w-touch rounded-control bg-transparent text-violet border-0 cursor-pointer hover:bg-tile-v2"
      >
        {label}
      </button>
      {open && (
        <div role="menu" className="absolute inset-inline-end-0 mt-1 min-w-[220px] bg-card rounded-card shadow-pop border border-line p-1 z-40">
          {items.map((it) => (
            <button
              key={it.id}
              role="menuitem"
              type="button"
              onClick={() => { it.onSelect(); setOpen(false) }}
              className={`w-full min-h-touch px-3 rounded-control text-start text-body border-0 bg-transparent cursor-pointer hover:bg-tile-v2 ${
                it.tone === 'danger' ? 'text-conflict' : 'text-ink'
              }`}
            >
              {it.label}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
```

- [ ] **Step 7: Run the tests**

Run: `cd ui && npx vitest run src/ui/controls.test.tsx src/test/guards.test.ts`
Expected: PASS — 7 control cases, guards still green. If `min-w-[220px]` trips the guard, add `menu: '220px'` to `theme.extend.minWidth` and use `min-w-menu`.

- [ ] **Step 8: Commit**

```bash
git add ui/src/ui/SearchField.tsx ui/src/ui/Tabs.tsx ui/src/ui/Accordion.tsx ui/src/ui/Menu.tsx ui/src/ui/controls.test.tsx
git commit -m "feat(ui): controls with real roles and bound labels

Tabs are a tablist, the accordion header is a button with aria-expanded, the
menu closes on Escape and on an outside click, and the search field has a label
rather than a placeholder pretending to be one."
```

---

### Task 11: The two shells

**Files:**
- Create: `ui/src/shell/PanelShell.tsx`, `ui/src/shell/ReaderShell.tsx`, `ui/src/shell/shells.test.tsx`
- Modify: `ui/src/shell/AppShell.tsx`

**Interfaces:**
- Consumes: `SessionDescriptor`, `selectShell` (Task 2); `ToastProvider` (Task 6); `onUnauthorized` (Task 9).
- Produces: `<AppShell session>` which renders the correct shell, sets `data-shell`, and registers the 401 redirect. Both shells render `<Outlet/>`.

- [ ] **Step 1: Write the failing test**

Create `ui/src/shell/shells.test.tsx`:

```tsx
import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MemoryRouter, Routes, Route } from 'react-router-dom'
import { AppShell } from './AppShell'
import type { SessionDescriptor, Capability } from '../auth/session'

function session(capabilities: Capability[]): SessionDescriptor {
  return {
    username: '09123456789', displayName: 'سحر بیات', role: 'reader',
    capabilities, scopes: ['dept:dining'], supervisor: '09120000000',
    canSupervise: false, pendingApprovals: 0,
  }
}

function renderShell(caps: Capability[]) {
  return render(
    <MemoryRouter initialEntries={['/']}>
      <Routes>
        <Route element={<AppShell session={session(caps)} />}>
          <Route path="/" element={<p>محتوا</p>} />
        </Route>
      </Routes>
    </MemoryRouter>,
  )
}

describe('AppShell', () => {
  it('marks the reader shell so density resolves', () => {
    const { container } = renderShell(['view', 'comment', 'export_pdf'])
    expect(container.querySelector('[data-shell="reader"]')).toBeInTheDocument()
  })

  it('marks the panel shell for anyone holding a panel capability', () => {
    const { container } = renderShell(['view', 'comment', 'edit'])
    expect(container.querySelector('[data-shell="panel"]')).toBeInTheDocument()
  })

  it('renders the routed content in either shell', () => {
    renderShell(['view'])
    expect(screen.getByText('محتوا')).toBeInTheDocument()
  })

  it('gives every shell exactly one h1', () => {
    // F11 — one h1 per screen, in document order.
    const { container } = renderShell(['view'])
    expect(container.querySelectorAll('h1')).toHaveLength(1)
  })

  it('sets the document direction and language', () => {
    renderShell(['view'])
    expect(document.documentElement).toHaveAttribute('dir', 'rtl')
    expect(document.documentElement).toHaveAttribute('lang', 'fa')
  })
})
```

- [ ] **Step 2: Run and watch it fail**

Run: `cd ui && npx vitest run src/shell/shells.test.tsx`
Expected: FAIL — `AppShell` does not accept a `session` prop and renders no `data-shell`.

- [ ] **Step 3: Write `ReaderShell`**

Create `ui/src/shell/ReaderShell.tsx`:

```tsx
import { Outlet } from 'react-router-dom'
import type { SessionDescriptor } from '../auth/session'

/**
 * Roomier density, one screen at a time. The badge for comments awaiting you
 * lives here because this is where every session starts, and with in-app
 * notification as the only channel that placement is the whole signal (F15).
 */
export function ReaderShell({ session }: { session: SessionDescriptor }) {
  return (
    <div data-shell="reader" className="min-h-screen bg-ink text-card">
      <header className="flex items-center gap-3 px-4 py-3">
        <h1 className="text-title font-extrabold m-0 flex-1">اینجا فست‌فود</h1>
        {session.pendingApprovals > 0 && (
          <span className="min-h-touch min-w-touch inline-flex items-center justify-center rounded-control bg-coral text-card font-bold">
            {session.pendingApprovals}
          </span>
        )}
      </header>
      <main className="px-4 pb-8"><Outlet /></main>
    </div>
  )
}
```

- [ ] **Step 4: Write `PanelShell`**

Create `ui/src/shell/PanelShell.tsx`:

```tsx
import { Outlet } from 'react-router-dom'
import type { SessionDescriptor } from '../auth/session'

/** Compact density, breadcrumb trail, administration surfaces. */
export function PanelShell({ session }: { session: SessionDescriptor }) {
  return (
    <div data-shell="panel" className="min-h-screen bg-bg text-ink">
      <header className="flex items-center gap-3 px-6 py-3 bg-ink text-card">
        <h1 className="text-title font-extrabold m-0 flex-1">اینجا فست‌فود</h1>
        <span className="text-caption">{session.displayName}</span>
      </header>
      <main className="px-6 py-6"><Outlet /></main>
    </div>
  )
}
```

- [ ] **Step 5: Rewrite `AppShell`**

Replace `ui/src/shell/AppShell.tsx`:

```tsx
import { useEffect } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import { selectShell, type SessionDescriptor } from '../auth/session'
import { onUnauthorized } from '../api/client'
import { ToastProvider } from '../ui/Toast'
import { PanelShell } from './PanelShell'
import { ReaderShell } from './ReaderShell'

export function AppShell({ session }: { session: SessionDescriptor }) {
  const navigate = useNavigate()
  const location = useLocation()

  useEffect(() => {
    document.documentElement.setAttribute('dir', 'rtl')
    document.documentElement.setAttribute('lang', 'fa')
  }, [])

  useEffect(() => {
    // F14 — a session that ends mid-use returns the user to where they were.
    onUnauthorized(() => navigate('/login', { replace: true, state: { from: location.pathname } }))
    return () => onUnauthorized(() => {})
  }, [navigate, location.pathname])

  const Shell = selectShell(session.capabilities) === 'panel' ? PanelShell : ReaderShell
  return <ToastProvider><Shell session={session} /></ToastProvider>
}
```

- [ ] **Step 6: Run the tests**

Run: `cd ui && npx vitest run src/shell src/test/guards.test.ts && npx tsc -b`
Expected: PASS — 5 shell cases, guards green, TypeScript clean. The existing `src/routes.tsx` still renders the old `AppShell` with no props; update its usage to pass a placeholder descriptor only if `tsc` fails, and note that P0 replaces this with the real `useMe()` result.

- [ ] **Step 7: Commit**

```bash
git add ui/src/shell
git commit -m "feat(ui): two shells over one component set

The shell is picked from capabilities and marked with data-shell, which is what
resolves the density variables — so density comes from the shell and never from
a prop a caller could pass inconsistently. Both shells register the 401 redirect
and provide toasts."
```

---

### Task 12: The remaining guards

**Files:**
- Modify: `ui/src/test/guards.test.ts`

**Interfaces:**
- Consumes: everything built so far.
- Produces: no runtime code — three assertions that keep F4, F8 and F10 true as P0–P4 add screens.

- [ ] **Step 1: Write the failing assertions**

Append to `ui/src/test/guards.test.ts`:

```ts
describe('F10 — RTL is structural', () => {
  it('no component uses a physical direction property', () => {
    const BAD = /(margin|padding)-(left|right)|text-align:\s*(left|right)|\b(ml|mr|pl|pr|left|right)-\d/
    const hits = files().flatMap((f) =>
      readFileSync(f.path, 'utf8')
        .split('\n')
        .map((line, i) => ({ rel: f.rel, n: i + 1, line }))
        .filter(({ line }) => BAD.test(line)),
    )
    expect(hits.map((h) => `${h.rel}:${h.n} ${h.line.trim()}`)).toEqual([])
  })

  it('only the declared islands pin dir', () => {
    // IdBadge is the sole dir="ltr" island in this sub-project; P0 adds the
    // phone-number and IP fields to this list as it builds them.
    const ISLANDS = ['src/ui/IdBadge.tsx']
    const hits = files()
      .filter((f) => !ISLANDS.includes(f.rel))
      .flatMap((f) =>
        readFileSync(f.path, 'utf8')
          .split('\n')
          .map((line, i) => ({ rel: f.rel, n: i + 1, line }))
          .filter(({ line }) => /\bdir=/.test(line)),
      )
    expect(hits.map((h) => `${h.rel}:${h.n} ${h.line.trim()}`)).toEqual([])
  })
})

describe('F4/F8 — density comes from the shell', () => {
  it('no shared component accepts a density or size prop', () => {
    const BAD = /\b(density|size|scale)\??:\s*('|"|[A-Za-z])/
    const hits = files()
      .filter((f) => f.rel.startsWith('src/ui/'))
      .flatMap((f) =>
        readFileSync(f.path, 'utf8')
          .split('\n')
          .map((line, i) => ({ rel: f.rel, n: i + 1, line }))
          .filter(({ line }) => BAD.test(line)),
      )
    expect(hits.map((h) => `${h.rel}:${h.n} ${h.line.trim()}`)).toEqual([])
  })
})
```

- [ ] **Step 2: Run them**

Run: `cd ui && npx vitest run src/test/guards.test.ts`
Expected: FAIL initially if any component slipped a physical property in. Fix each reported line by switching to the logical equivalent (`ms-`/`me-`, `ps-`/`pe-`, `text-start`, `inset-inline-start`), then re-run until PASS.

- [ ] **Step 3: Run the whole suite**

Run: `cd ui && npx vitest run && npx tsc -b && npm run lint`
Expected: all suites pass, TypeScript clean, lint clean.

- [ ] **Step 4: Commit**

```bash
git add ui/src
git commit -m "test(ui): guards that keep the system true as screens arrive

Physical direction properties, stray dir attributes outside the declared LTR
islands, and density props on shared components all fail the suite. These are
the assertions that stop F drifting the moment P0 starts adding screens."
```

---

## Self-Review

**Spec coverage.** F1 → Task 11 (one build, two shells). F2 → Task 2. F3 → Tasks 1, 11 (density + shell chrome). F4 → Tasks 3–7, 10 and the Task 12 guard. F5 → Task 5. F6 → Task 1 and its guard. F7 → Task 1 (all three reconciliations). F8 → Task 1 (role variables) and the Task 12 guard. F9 → Task 5's breakpoint transform; the 320px no-horizontal-scroll assertion is **not** covered here because jsdom reports no layout — it belongs to the first plan that renders a real screen, and P0 owns it. F10 → Tasks 8, 12. F11 → Tasks 3, 5, 6, 7, 10, 11. F12/F13 → Task 7. F14 → Tasks 9, 11. F15 → Task 11 (badge placement; full navigation lands with P0's screens). F16 → nothing to do, enforced by the "do not touch `ui/src/flow/`" constraint.

**Deliberately deferred to P0, and named so nobody assumes they were missed:** the sign-in screen, the real `useMe()` wiring that replaces `AppShell`'s `session` prop, the 320px layout assertion, and the phone-number/IP `dir="ltr"` islands added to the Task 12 island list.

**Placeholder scan.** No "TBD", no "add error handling", no "similar to Task N". Every code step shows its code in full.

**Type consistency.** `SessionDescriptor` fields used in Task 11 (`displayName`, `pendingApprovals`, `capabilities`) match Task 2's definition. `selectShell` takes `Capability[]` in both. `onUnauthorized` has the same signature in Tasks 9 and 11. `expectTouchTarget` from Task 3 is used in Task 3 only. `Tone` in `StatusPill` and `Toast` are distinct local types and never cross.
