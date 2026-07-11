# Phase 6 UI — Sub-project A (Foundation, Shell & Read-only Navigation) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the React/TypeScript frontend foundation — design tokens, data layer, auth, app shell, URL routing — and all read-only screens (departments → process list → department overview → summary card), pixel-faithful to the prototype.

**Architecture:** A Vite SPA in `code-repo/ui/`. Server data via TanStack Query hooks against the Phase-5 FastAPI backend (dev: Vite proxies `/api` → `:8000`); local UI state via React. URL routing via `react-router-dom` v6. Styling via Tailwind v3 with the prototype's exact palette/shadows/font encoded as tokens. The app works directly in the frozen `process.json`/`overview.json` schema shape; Persian-numeral and Jalali-date formatting happen at render. All editing is out of scope (deferred to sub-projects B and C) — edit buttons appear but are inert.

**Tech Stack:** React 19, TypeScript (strict, `verbatimModuleSyntax`), Vite 6, Tailwind CSS 3, `@tanstack/react-query` 5, `react-router-dom` 6, `@fontsource-variable/vazirmatn` 5, Vitest 2 + Testing Library.

**Spec:** `docs/superpowers/specs/2026-07-11-phase-6-ui-sub-a-foundation-design.md`

## Global Constraints

- **Node 18** (`node -v` = v18.19.1) — pin `react-router-dom@^6.28.0` (v7 needs Node 20), `vitest@^2.1.8`, `jsdom@^25`.
- **Backend contract is frozen** — consume only: `GET /api/auth/me` → `{username}` (401 if no session); `POST /api/auth/login {username,password}` → `{username}` (sets cookie) / 401; `POST /api/auth/logout` → `{ok:true}`; `GET /api/departments` → `[{code,name,count}]`; `GET /api/departments/{code}/overview` → overview; `GET /api/departments/{code}/processes` → process[]; `GET /api/processes/{pid}` → process.
- **Data shape = the schema** (`schemas/process.schema.json`, `overview.schema.json`). Node field is `description` (not `desc`); node `source` is `{created_by,touched_by}`; nodes have `layout:"auto"|"manual"`; junction has `junctionType` + `direction`.
- **All fetches use `credentials:'include'`** (signed session cookie).
- **TypeScript:** `verbatimModuleSyntax` is on → type-only imports MUST use `import type`. `erasableSyntaxOnly` is on → NO `enum`/`namespace`/param-properties (use union types + `const` objects). Local imports are extensionless.
- **RTL + Persian:** `<html dir="rtl" lang="fa">`; every displayed number goes through `toFa`; every displayed date through `jalali`. Stored data stays ISO/Latin.
- **Exact palette** (from the prototype): bg `#FBF7F1`, ink `#2A1D5E`, violet `#4A25A9`, coral `#FA5A52`, green `#1F8A5B`, conflict `#E23D35`, muted `#8a7db0`, faint `#a99fc4`, card-border `#EFE7DC`, input-border `#E3D8F5`, tile-violet `#F0E9FB`, tile-violet-2 `#F4EFFB`, tile-coral `#FFE9E7`, login-bg `#2E1668`, login-orb `#3A1D85`. Chips: input `#1F6FB2`/`#E7F1FB`, control `#8A5A00`/`#FBF0DA`, output `#1F8A5B`/`#E4F6EC`, mech `#4A25A9`/`#F0E9FB`.
- **Visual source of truth:** `ui/design/Inja Process System.dc.html` (working-tree version). Cross-check each screen against it.
- **Commit after every task.** Work on branch `phase-6-ui-foundation` (already checked out).

---

## File structure

```
ui/
  index.html                      # MODIFY: lang=fa dir=rtl, title, drop vite.svg
  vite.config.ts                  # MODIFY: dev proxy + vitest config
  tailwind.config.js              # MODIFY: content globs + token theme
  package.json                    # MODIFY: deps + test scripts
  src/
    main.tsx                      # MODIFY: font import, QueryClient + RouterProvider
    index.css                     # REPLACE: Tailwind layers + RTL base + component classes
    assets/inja-logo.jpg          # CREATE: copied from ui/design/assets
    api/
      client.ts                   # CREATE: fetchJson + ApiError
      types.ts                    # CREATE: schema-mirroring TS types
      hooks.ts                    # CREATE: TanStack Query read hooks (+ auth hooks in Task 6)
    lib/
      format.ts                   # CREATE: toFa, jalali, deriveTag
      departments.ts              # CREATE: code → {icon, accent, ...} meta map
    ui/
      Button.tsx  Chip.tsx  Card.tsx  IdBadge.tsx   # CREATE: design-system primitives
    shell/
      AppShell.tsx  TopBar.tsx  Breadcrumb.tsx  BackButton.tsx   # CREATE
    screens/
      Login.tsx  Departments.tsx  ProcessList.tsx  Overview.tsx  Summary.tsx  FlowPlaceholder.tsx  # CREATE
    auth/
      RequireAuth.tsx             # CREATE
    routes.tsx                    # CREATE: router table
    test/
      setup.ts  utils.tsx         # CREATE: vitest setup + render helpers
  # DELETE: src/App.tsx, src/App.css, src/assets/react.svg, public/vite.svg
```

---

## Task 1: Toolchain, design tokens & RTL base

Sets up dependencies, the Tailwind token layer, RTL/font base, the Vite dev proxy, and Vitest — the foundation every later task builds on. Removes the Vite template cruft.

**Files:**
- Modify: `ui/package.json` (deps + scripts)
- Modify: `ui/tailwind.config.js`, `ui/postcss.config.js` (already correct), `ui/vite.config.ts`, `ui/index.html`, `ui/src/main.tsx`, `ui/src/index.css`
- Create: `ui/src/test/setup.ts`, `ui/src/assets/inja-logo.jpg`
- Delete: `ui/src/App.tsx`, `ui/src/App.css`, `ui/src/assets/react.svg`, `ui/public/vite.svg`

**Interfaces:**
- Produces: Tailwind token classes (`bg-bg`, `text-ink`, `bg-violet`, `border-warm`, `border-line`, `bg-tile-v`, `text-conflict`, `font-sans`, `shadow-card`/`shadow-coral`/`shadow-violet`/`shadow-green`/`shadow-modal`) and component classes (`btn`, `btn-coral`, `btn-violet`, `btn-green`, `btn-ghost`, `chip`, `chip-input`, `chip-control`, `chip-output`, `chip-mech`, `id-badge`). `npm test` runs Vitest.

- [ ] **Step 1: Install dependencies**

Run:
```bash
cd ui
npm install react-router-dom@^6.28.0 @fontsource-variable/vazirmatn@^5.1.0
npm install -D vitest@^2.1.8 @testing-library/react@^16.1.0 @testing-library/jest-dom@^6.6.3 @testing-library/user-event@^14.5.2 jsdom@^25.0.1
```
Expected: installs succeed; `react-router-dom`, `@fontsource-variable/vazirmatn` appear under `dependencies`, the test libs under `devDependencies`.

- [ ] **Step 2: Add test scripts to `ui/package.json`**

In the `"scripts"` block add:
```json
    "test": "vitest run",
    "test:watch": "vitest"
```

- [ ] **Step 3: Configure Vite (dev proxy + Vitest)**

Replace `ui/vite.config.ts` with:
```ts
/// <reference types="vitest/config" />
import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'

// Dev: proxy /api to the FastAPI backend so the session cookie stays same-origin.
export default defineConfig({
  plugins: [react()],
  server: { proxy: { '/api': 'http://localhost:8000' } },
  test: {
    environment: 'jsdom',
    globals: false,
    setupFiles: ['./src/test/setup.ts'],
    css: true,
  },
})
```

- [ ] **Step 4: Create the Vitest setup file**

Create `ui/src/test/setup.ts`:
```ts
import '@testing-library/jest-dom/vitest'
import { afterEach } from 'vitest'
import { cleanup } from '@testing-library/react'

afterEach(() => cleanup())
```

- [ ] **Step 5: Write the Tailwind token theme**

Replace `ui/tailwind.config.js` with:
```js
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
```

- [ ] **Step 6: Replace `ui/src/index.css` with the Tailwind + RTL base**

```css
@tailwind base;
@tailwind components;
@tailwind utilities;

@layer base {
  html { direction: rtl; }
  body { margin: 0; }
  ::selection { background: #FA5A52; color: #fff; }
  ::-webkit-scrollbar { width: 10px; height: 10px; }
  ::-webkit-scrollbar-thumb { background: #DFD6EE; border-radius: 8px; border: 2px solid transparent; background-clip: content-box; }
}

@layer components {
  .btn { @apply inline-flex items-center justify-center gap-2 rounded-xl font-bold cursor-pointer border-0; }
  .btn-coral  { @apply bg-coral  text-white shadow-coral  hover:brightness-105; }
  .btn-violet { @apply bg-violet text-white shadow-violet hover:brightness-110; }
  .btn-green  { @apply bg-green  text-white shadow-green  hover:brightness-105; }
  .btn-ghost  { @apply bg-white text-violet border-[1.5px] border-line hover:bg-[#F4EFFB]; }
  .chip { @apply text-[11px] px-[9px] py-[3px] rounded-[7px] whitespace-nowrap; }
  .chip-input   { @apply chip text-[#1F6FB2] bg-[#E7F1FB]; }
  .chip-control { @apply chip text-[#8A5A00] bg-[#FBF0DA]; }
  .chip-output  { @apply chip text-[#1F8A5B] bg-[#E4F6EC]; }
  .chip-mech    { @apply chip text-[#4A25A9] bg-[#F0E9FB]; }
  .id-badge { @apply font-mono text-[11px] px-2 py-[2px] rounded-md; }
}
```

- [ ] **Step 7: Update `ui/index.html`**

Replace its contents with:
```html
<!doctype html>
<html lang="fa" dir="rtl">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>سامانهٔ مستندسازی فرآیندها — اینجا فست‌فود</title>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/main.tsx"></script>
  </body>
</html>
```

- [ ] **Step 8: Copy the logo asset**

Run:
```bash
cd ui && mkdir -p src/assets && cp "design/assets/inja-logo.jpg" src/assets/inja-logo.jpg
```

- [ ] **Step 9: Replace `ui/src/main.tsx` with a minimal green render**

```tsx
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import '@fontsource-variable/vazirmatn'
import './index.css'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <div className="min-h-screen bg-bg text-ink font-sans grid place-items-center">
      در حال ساخت…
    </div>
  </StrictMode>,
)
```
(This placeholder is replaced by the router in Task 12.)

- [ ] **Step 10: Delete template cruft**

Run:
```bash
cd ui && rm -f src/App.tsx src/App.css src/assets/react.svg public/vite.svg
```

- [ ] **Step 11: Write a token smoke test**

Create `ui/src/test/tokens.test.tsx`:
```tsx
import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'

describe('token base', () => {
  it('renders an element carrying token classes', () => {
    render(<button className="btn btn-coral">ذخیره</button>)
    const el = screen.getByText('ذخیره')
    expect(el).toHaveClass('btn', 'btn-coral')
  })
})
```

- [ ] **Step 12: Run the test and the build**

Run:
```bash
cd ui && npm test
```
Expected: `tokens.test.tsx` PASSES.

Run:
```bash
cd ui && npm run build
```
Expected: `tsc -b` + `vite build` succeed with no errors.

- [ ] **Step 13: Commit**

```bash
git add ui/package.json ui/package-lock.json ui/vite.config.ts ui/tailwind.config.js ui/index.html ui/src/index.css ui/src/main.tsx ui/src/test/setup.ts ui/src/test/tokens.test.tsx ui/src/assets/inja-logo.jpg
git add -A ui/src ui/public
git commit -m "feat(ui): toolchain, design tokens & RTL base (phase-6 sub-A)"
```

---

## Task 2: Formatters (`toFa`, `jalali`, `deriveTag`)

Pure functions used by every screen. TDD.

**Files:**
- Create: `ui/src/lib/format.ts`, `ui/src/lib/format.test.ts`

**Interfaces:**
- Produces:
  - `toFa(x: string | number): string` — Latin digits → Persian.
  - `jalali(iso: string): string` — ISO date-time → Jalali `YYYY/MM/DD` in Persian digits.
  - `deriveTag(p: Process): { label: string; kind: 'sub' | 'conflict' | 'kpi' | 'plain' }`.
- Consumes: `Process` type (Task 4 defines it; for this task, import `type { Process }` — the file compiles once Task 4 lands; run this task's test with a local minimal cast as shown).

- [ ] **Step 1: Write the failing test**

Create `ui/src/lib/format.test.ts`:
```ts
import { describe, it, expect } from 'vitest'
import { toFa, jalali, deriveTag } from './format'

describe('toFa', () => {
  it('maps Latin digits to Persian', () => {
    expect(toFa(2026)).toBe('۲۰۲۶')
    expect(toFa('id-007')).toBe('id-۰۰۷')
  })
})

describe('jalali', () => {
  it('formats an ISO date as a Jalali date in Persian digits', () => {
    // 2026-07-06 (Gregorian) = 1405/04/15 (Jalali)
    expect(jalali('2026-07-06T10:00:00Z')).toBe('۱۴۰۵/۰۴/۱۵')
  })
})

describe('deriveTag', () => {
  const base = { parent: null, pending: [], kpis: [] }
  it('flags a sub-process', () => {
    expect(deriveTag({ ...base, parent: { process: 'x', node: 'y' } } as never))
      .toEqual({ label: 'زیرفرآیند', kind: 'sub' })
  })
  it('flags conflicts with a Persian count', () => {
    expect(deriveTag({ ...base, pending: [{}, {}] } as never))
      .toEqual({ label: '۲ تعارض', kind: 'conflict' })
  })
  it('flags has-KPI', () => {
    expect(deriveTag({ ...base, kpis: [{ name: 'k' }] } as never))
      .toEqual({ label: 'دارای KPI', kind: 'kpi' })
  })
  it('falls back to documented', () => {
    expect(deriveTag(base as never)).toEqual({ label: 'مستند', kind: 'plain' })
  })
})
```

- [ ] **Step 2: Run to verify it fails**

Run: `cd ui && npx vitest run src/lib/format.test.ts`
Expected: FAIL — `Cannot find module './format'`.

- [ ] **Step 3: Implement `ui/src/lib/format.ts`**

```ts
import type { Process } from '../api/types'

const FA = '۰۱۲۳۴۵۶۷۸۹'

export function toFa(x: string | number): string {
  return String(x).replace(/[0-9]/g, (d) => FA[Number(d)])
}

// Gregorian → Jalali (proleptic). Adapted from the standard jalaali algorithm.
function toJalali(gy: number, gm: number, gd: number): [number, number, number] {
  const gdm = [0, 31, 59, 90, 120, 151, 181, 212, 243, 273, 304, 334]
  let jy = gy <= 1600 ? 0 : 979
  gy -= gy <= 1600 ? 621 : 1600
  const gy2 = gm > 2 ? gy + 1 : gy
  let days =
    365 * gy + Math.floor((gy2 + 3) / 4) - Math.floor((gy2 + 99) / 100) +
    Math.floor((gy2 + 399) / 400) - 80 + gd + gdm[gm - 1]
  jy += 33 * Math.floor(days / 12053)
  days %= 12053
  jy += 4 * Math.floor(days / 1461)
  days %= 1461
  jy += Math.floor((days - 1) / 365)
  if (days > 365) days = (days - 1) % 365
  const jm = days < 186 ? 1 + Math.floor(days / 31) : 7 + Math.floor((days - 186) / 30)
  const jd = 1 + (days < 186 ? days % 31 : (days - 186) % 30)
  return [jy, jm, jd]
}

export function jalali(iso: string): string {
  const d = new Date(iso)
  const [jy, jm, jd] = toJalali(d.getUTCFullYear(), d.getUTCMonth() + 1, d.getUTCDate())
  const p = (n: number) => toFa(String(n).padStart(2, '0'))
  return `${toFa(jy)}/${p(jm)}/${p(jd)}`
}

export type TagKind = 'sub' | 'conflict' | 'kpi' | 'plain'

export function deriveTag(p: Process): { label: string; kind: TagKind } {
  if (p.parent) return { label: 'زیرفرآیند', kind: 'sub' }
  if (p.pending && p.pending.length) return { label: `${toFa(p.pending.length)} تعارض`, kind: 'conflict' }
  if (p.kpis && p.kpis.length) return { label: 'دارای KPI', kind: 'kpi' }
  return { label: 'مستند', kind: 'plain' }
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `cd ui && npx vitest run src/lib/format.test.ts`
Expected: all PASS. (If `format.ts` errors on the missing `../api/types` import, create Task 4 first, or temporarily change the import to `type Process = { parent: unknown; pending: unknown[]; kpis: unknown[] }` — but the standing order is to keep Task order; Task 4's types land next.)

- [ ] **Step 5: Commit**

```bash
git add ui/src/lib/format.ts ui/src/lib/format.test.ts
git commit -m "feat(ui): toFa/jalali/deriveTag formatters (TDD)"
```

---

## Task 3: Department metadata map

Static per-department icon SVG path + accent, keyed by registry code (registry carries only code+name). Values verbatim from the prototype's `buildData` DEPTS array.

**Files:**
- Create: `ui/src/lib/departments.ts`, `ui/src/lib/departments.test.ts`

**Interfaces:**
- Produces: `deptMeta(code: string): { icon: string; accent: 'violet' | 'coral'; tileClass: string }` — `icon` is an SVG `path` `d`; `tileClass` is the 48px tile color classes.

- [ ] **Step 1: Write the failing test**

Create `ui/src/lib/departments.test.ts`:
```ts
import { describe, it, expect } from 'vitest'
import { deptMeta, DEPT_CODES } from './departments'

describe('deptMeta', () => {
  it('covers all nine registry departments', () => {
    expect(DEPT_CODES).toHaveLength(9)
    for (const code of DEPT_CODES) {
      const m = deptMeta(code)
      expect(m.icon.length).toBeGreaterThan(0)
      expect(['violet', 'coral']).toContain(m.accent)
    }
  })
  it('maps a violet department to the violet tile classes', () => {
    expect(deptMeta('management').tileClass).toContain('bg-tile-v')
  })
  it('maps a coral department to the coral tile classes', () => {
    expect(deptMeta('accounting').tileClass).toContain('bg-tile-c')
  })
})
```

- [ ] **Step 2: Run to verify it fails**

Run: `cd ui && npx vitest run src/lib/departments.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement `ui/src/lib/departments.ts`**

```ts
type Accent = 'violet' | 'coral'
interface Meta { icon: string; accent: Accent }

// Verbatim from the prototype buildData() DEPTS (t:'v'→violet, t:'c'→coral).
const META: Record<string, Meta> = {
  management:  { accent: 'violet', icon: 'M4 21V5l8-2v18M12 21V9l6 2v10M8 8h.01M8 12h.01M8 16h.01' },
  accounting:  { accent: 'coral',  icon: 'M6 3h12v18l-2-1-2 1-2-1-2 1-2-1-2 1V3zM9 8h6M9 12h6' },
  warehouse:   { accent: 'violet', icon: 'M3 8l9-4 9 4v8l-9 4-9-4V8zM3 8l9 4 9-4M12 12v9' },
  procurement: { accent: 'coral',  icon: 'M3 4h2l2 12h11l2-8H6M9 20a1 1 0 1 0 .01 0M17 20a1 1 0 1 0 .01 0' },
  cooking:     { accent: 'coral',  icon: 'M12 3c2 4 5 5 5 9a5 5 0 0 1-10 0c0-2 1-3 2-4 .5 1 1 1.5 2 1.5-1-2 0-4 1-6.5z' },
  preparation: { accent: 'violet', icon: 'M4 20l7-7M14 4l4 4-8 8-3-1 1-3z' },
  dining:      { accent: 'coral',  icon: 'M6 3v8a2 2 0 0 0 4 0V3M8 11v10M17 3c-2 0-3 2-3 5s1 4 3 4v9' },
  cashier:     { accent: 'violet', icon: 'M3 6h18v12H3zM3 10h18M7 15h4' },
  logistics:   { accent: 'coral',  icon: 'M3 6h11v9H3zM14 9h4l3 3v3h-7M7 18a1.5 1.5 0 1 0 .01 0M18 18a1.5 1.5 0 1 0 .01 0' },
}

export const DEPT_CODES = Object.keys(META)

const TILE: Record<Accent, string> = {
  violet: 'bg-tile-v text-violet',
  coral: 'bg-tile-c text-conflict',
}

export function deptMeta(code: string): { icon: string; accent: Accent; tileClass: string } {
  const m = META[code] ?? { accent: 'violet', icon: '' }
  return { ...m, tileClass: TILE[m.accent] }
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `cd ui && npx vitest run src/lib/departments.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add ui/src/lib/departments.ts ui/src/lib/departments.test.ts
git commit -m "feat(ui): department icon/accent metadata map"
```

---

## Task 4: API layer — types, client, read hooks

Typed fetch wrapper, schema-mirroring types, and TanStack Query read hooks. Also the shared test helpers.

**Files:**
- Create: `ui/src/api/types.ts`, `ui/src/api/client.ts`, `ui/src/api/hooks.ts`, `ui/src/api/client.test.ts`, `ui/src/test/utils.tsx`

**Interfaces:**
- Produces:
  - `types.ts`: `Department`, `Icom`, `Kpi`, `Pending`, `Position`, `ActivityNode`, `TerminalNode`, `JunctionNode`, `ProcNode`, `Edge`, `Process`, `Overview`, `Me`.
  - `client.ts`: `class ApiError extends Error { status: number }`; `fetchJson<T>(path, init?): Promise<T>`.
  - `hooks.ts`: `useDepartments()`, `useProcesses(code)`, `useOverview(code)`, `useProcess(pid)` (auth hooks added in Task 6).
  - `test/utils.tsx`: `createWrapper()` (QueryClientProvider), `renderAt(path, element, initialUrl)` (MemoryRouter + single Route).

- [ ] **Step 1: Write `ui/src/api/types.ts`**

```ts
export interface Department { code: string; name: string; count: number }

export interface Icom { inputs: string[]; controls: string[]; outputs: string[]; mechanisms: string[] }
export interface Kpi { name: string; definition?: string; target?: string; unit?: string }
export interface Pending {
  node: string; field: string; current: unknown; proposed: unknown
  source: string; status: 'open' | 'accepted' | 'rejected'
}
export interface Position { x: number; y: number }
export interface NodeSource { created_by: string; touched_by: string[] }

export interface ActivityNode {
  id: string; type: 'activity'; label: string; description: string; actor: string
  icom: Icom; subprocess: string | null; position: Position
  layout: 'auto' | 'manual'; source: NodeSource; removed?: boolean
}
export interface TerminalNode {
  id: 'start' | 'end'; type: 'start' | 'end'; label: string
  position: Position; layout: 'auto' | 'manual'; removed?: boolean
}
export interface JunctionNode {
  id: string; type: 'junction'; junctionType: 'AND' | 'OR' | 'XOR'
  direction: 'split' | 'join'; position: Position; layout: 'auto' | 'manual'; removed?: boolean
}
export type ProcNode = ActivityNode | TerminalNode | JunctionNode
export interface Edge { from: string; to: string; label?: string }

export interface Process {
  id: string; department: string; name: string; summary: string
  source: { type: 'voice' | 'manual' | 'chat' | 'auto'; ref: string | null; run: string | null }
  parent: { process: string; node: string } | null
  created_at: string; updated_at: string
  idef0: Icom; kpis: Kpi[]; nodes: ProcNode[]; edges: Edge[]; pending: Pending[]
}

export interface Overview {
  department: string; name: string
  sub_units: { name: string; description: string }[]
  personnel: { role: string; duties: string[] }[]
  updated_at: string
}

export interface Me { username: string }
```

- [ ] **Step 2: Write the failing client test**

Create `ui/src/api/client.test.ts`:
```ts
import { describe, it, expect, vi, afterEach } from 'vitest'
import { fetchJson, ApiError } from './client'

afterEach(() => vi.restoreAllMocks())

describe('fetchJson', () => {
  it('returns parsed JSON and sends credentials', async () => {
    const spy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ ok: 1 }), { status: 200, headers: { 'Content-Type': 'application/json' } }),
    )
    const data = await fetchJson<{ ok: number }>('/api/x')
    expect(data).toEqual({ ok: 1 })
    expect(spy).toHaveBeenCalledWith('/api/x', expect.objectContaining({ credentials: 'include' }))
  })

  it('throws ApiError with status on non-2xx', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ detail: 'nope' }), { status: 401, headers: { 'Content-Type': 'application/json' } }),
    )
    await expect(fetchJson('/api/auth/me')).rejects.toMatchObject({ status: 401, message: 'nope' })
    await expect(fetchJson('/api/auth/me')).rejects.toBeInstanceOf(ApiError)
  })
})
```

- [ ] **Step 3: Run to verify it fails**

Run: `cd ui && npx vitest run src/api/client.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 4: Implement `ui/src/api/client.ts`**

```ts
export class ApiError extends Error {
  status: number
  constructor(status: number, message: string) {
    super(message)
    this.status = status
    this.name = 'ApiError'
  }
}

export async function fetchJson<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(path, {
    credentials: 'include',
    headers: { 'Content-Type': 'application/json', ...(init?.headers ?? {}) },
    ...init,
  })
  if (!res.ok) {
    let detail = res.statusText
    try {
      const body = await res.json()
      if (body && typeof body.detail === 'string') detail = body.detail
    } catch { /* non-JSON error body */ }
    throw new ApiError(res.status, detail)
  }
  if (res.status === 204) return undefined as T
  return (await res.json()) as T
}
```

- [ ] **Step 5: Run to verify it passes**

Run: `cd ui && npx vitest run src/api/client.test.ts`
Expected: PASS.

- [ ] **Step 6: Implement `ui/src/api/hooks.ts`**

```ts
import { useQuery } from '@tanstack/react-query'
import { fetchJson } from './client'
import type { Department, Overview, Process } from './types'

export const useDepartments = () =>
  useQuery({ queryKey: ['departments'], queryFn: () => fetchJson<Department[]>('/api/departments') })

export const useProcesses = (code: string) =>
  useQuery({ queryKey: ['processes', code], queryFn: () => fetchJson<Process[]>(`/api/departments/${code}/processes`) })

export const useOverview = (code: string) =>
  useQuery({ queryKey: ['overview', code], queryFn: () => fetchJson<Overview>(`/api/departments/${code}/overview`) })

export const useProcess = (pid: string) =>
  useQuery({ queryKey: ['process', pid], queryFn: () => fetchJson<Process>(`/api/processes/${pid}`) })
```

- [ ] **Step 7: Create the test helpers `ui/src/test/utils.tsx`**

```tsx
import type { ReactElement, ReactNode } from 'react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { render } from '@testing-library/react'

export function createWrapper() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return function Wrapper({ children }: { children: ReactNode }) {
    return <QueryClientProvider client={client}>{children}</QueryClientProvider>
  }
}

// Render `element` at route `path`, with the browser location at `initialUrl`.
export function renderAt(path: string, element: ReactElement, initialUrl: string) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={[initialUrl]}>
        <Routes>
          <Route path={path} element={element} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  )
}
```

- [ ] **Step 8: Run the whole suite + build**

Run: `cd ui && npm test && npm run build`
Expected: all tests PASS (Task 2's `format.ts` now resolves `../api/types`); build succeeds.

- [ ] **Step 9: Commit**

```bash
git add ui/src/api ui/src/test/utils.tsx
git commit -m "feat(ui): api types, fetch client & read hooks + test helpers"
```

---

## Task 5: Design-system primitives

Reusable `Button`, `Chip`, `Card`, `IdBadge` built on the Task-1 token classes.

**Files:**
- Create: `ui/src/ui/Button.tsx`, `ui/src/ui/Chip.tsx`, `ui/src/ui/Card.tsx`, `ui/src/ui/IdBadge.tsx`, `ui/src/ui/primitives.test.tsx`

**Interfaces:**
- Produces:
  - `Button({ variant?: 'coral'|'violet'|'green'|'ghost', ...buttonProps })` — default `ghost`.
  - `Chip({ kind: 'input'|'control'|'output'|'mech', children })`.
  - `Card({ className?, children, ... })` — white rounded card with warm border + `shadow-card`.
  - `IdBadge({ children, tone?: 'violet'|'muted' })` — monospace LTR id pill.

- [ ] **Step 1: Write the failing test**

Create `ui/src/ui/primitives.test.tsx`:
```tsx
import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { Button } from './Button'
import { Chip } from './Chip'
import { IdBadge } from './IdBadge'

describe('primitives', () => {
  it('Button applies the variant class and defaults to ghost', () => {
    render(<Button variant="coral">ذخیره</Button>)
    expect(screen.getByRole('button', { name: 'ذخیره' })).toHaveClass('btn', 'btn-coral')
    render(<Button>خب</Button>)
    expect(screen.getByRole('button', { name: 'خب' })).toHaveClass('btn-ghost')
  })
  it('Chip maps kind to the chip class', () => {
    render(<Chip kind="control">بودجه</Chip>)
    expect(screen.getByText('بودجه')).toHaveClass('chip-control')
  })
  it('IdBadge renders LTR monospace', () => {
    render(<IdBadge>cooking-001</IdBadge>)
    const el = screen.getByText('cooking-001')
    expect(el).toHaveClass('id-badge')
    expect(el).toHaveAttribute('dir', 'ltr')
  })
})
```

- [ ] **Step 2: Run to verify it fails**

Run: `cd ui && npx vitest run src/ui/primitives.test.tsx`
Expected: FAIL — modules not found.

- [ ] **Step 3: Implement the primitives**

`ui/src/ui/Button.tsx`:
```tsx
import type { ButtonHTMLAttributes } from 'react'

type Variant = 'coral' | 'violet' | 'green' | 'ghost'
const V: Record<Variant, string> = {
  coral: 'btn-coral', violet: 'btn-violet', green: 'btn-green', ghost: 'btn-ghost',
}

export function Button({ variant = 'ghost', className = '', ...props }:
  ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant }) {
  return <button className={`btn ${V[variant]} ${className}`} {...props} />
}
```

`ui/src/ui/Chip.tsx`:
```tsx
import type { ReactNode } from 'react'

type Kind = 'input' | 'control' | 'output' | 'mech'
const K: Record<Kind, string> = {
  input: 'chip-input', control: 'chip-control', output: 'chip-output', mech: 'chip-mech',
}

export function Chip({ kind, children }: { kind: Kind; children: ReactNode }) {
  return <span className={K[kind]}>{children}</span>
}
```

`ui/src/ui/Card.tsx`:
```tsx
import type { HTMLAttributes } from 'react'

export function Card({ className = '', ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={`bg-white border border-warm rounded-2xl shadow-card ${className}`} {...props} />
}
```

`ui/src/ui/IdBadge.tsx`:
```tsx
import type { ReactNode } from 'react'

export function IdBadge({ children, tone = 'muted' }: { children: ReactNode; tone?: 'violet' | 'muted' }) {
  const cls = tone === 'violet' ? 'bg-violet text-white' : 'bg-tile-v2 text-muted'
  return <span dir="ltr" className={`id-badge ${cls}`}>{children}</span>
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `cd ui && npx vitest run src/ui/primitives.test.tsx`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add ui/src/ui
git commit -m "feat(ui): design-system primitives (Button/Chip/Card/IdBadge)"
```

---

## Task 6: Auth — hooks, RequireAuth, Login screen

**Files:**
- Modify: `ui/src/api/hooks.ts` (add auth hooks)
- Create: `ui/src/auth/RequireAuth.tsx`, `ui/src/screens/Login.tsx`, `ui/src/auth/auth.test.tsx`

**Interfaces:**
- Consumes: `fetchJson`, `Me`, `Button`, logo asset, `renderAt`/`createWrapper`.
- Produces:
  - `hooks.ts`: `useMe()`, `useLogin()` (mutation → invalidates `['me']`), `useLogout()`.
  - `RequireAuth` (renders `<Outlet/>` when authed, else `<Navigate to="/login" replace/>`).
  - `Login` screen.

- [ ] **Step 1: Add auth hooks to `ui/src/api/hooks.ts`**

Append:
```ts
import { useMutation, useQueryClient } from '@tanstack/react-query'
import type { Me } from './types'

export const useMe = () =>
  useQuery({ queryKey: ['me'], queryFn: () => fetchJson<Me>('/api/auth/me'), retry: false })

export function useLogin() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (body: { username: string; password: string }) =>
      fetchJson<Me>('/api/auth/login', { method: 'POST', body: JSON.stringify(body) }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['me'] }),
  })
}

export function useLogout() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: () => fetchJson<{ ok: boolean }>('/api/auth/logout', { method: 'POST' }),
    onSuccess: () => qc.clear(),
  })
}
```
(Merge the `useMutation`/`useQueryClient`/`Me` imports with the existing import lines rather than duplicating.)

- [ ] **Step 2: Write the failing test**

Create `ui/src/auth/auth.test.tsx`:
```tsx
import { describe, it, expect, vi, afterEach } from 'vitest'
import { screen, waitFor } from '@testing-library/react'
import { RequireAuth } from './RequireAuth'
import { Login } from '../screens/Login'
import { renderAt } from '../test/utils'

afterEach(() => vi.restoreAllMocks())

function mockFetch(handler: (url: string, init?: RequestInit) => Response) {
  vi.spyOn(globalThis, 'fetch').mockImplementation(
    (input: RequestInfo | URL, init?: RequestInit) => Promise.resolve(handler(String(input), init)),
  )
}

describe('RequireAuth', () => {
  it('redirects to /login when unauthenticated', async () => {
    mockFetch((url) =>
      url.endsWith('/api/auth/me')
        ? new Response('unauthorized', { status: 401 })
        : new Response('', { status: 404 }),
    )
    renderAt('/*', <RequireAuth />, '/departments')
    await waitFor(() => expect(screen.getByTestId('login-marker')).toBeInTheDocument())
  })
})

describe('Login', () => {
  it('renders the brand + submits credentials', async () => {
    const calls: string[] = []
    mockFetch((url) => {
      calls.push(url)
      if (url.endsWith('/api/auth/login')) return new Response(JSON.stringify({ username: 'analyst' }), { status: 200, headers: { 'Content-Type': 'application/json' } })
      return new Response('unauthorized', { status: 401 })
    })
    const { container } = renderAt('/login', <Login />, '/login')
    ;(screen.getByPlaceholderText('analyst') as HTMLInputElement).value = 'analyst'
    container.querySelector('form')!.requestSubmit()
    await waitFor(() => expect(calls.some((u) => u.endsWith('/api/auth/login'))).toBe(true))
  })
})
```
Note: `RequireAuth`'s redirect target route (`/login`) renders a `<div data-testid="login-marker"/>` in this test harness — see the route wired below. To make the redirect observable, this test renders `RequireAuth` under a `/*` catch route whose `<Outlet/>` fallback and the `/login` element are both provided by `renderAt`. Since `renderAt` mounts a single Route, adjust: instead assert redirect via the Login marker by rendering the tiny wrapper below.

Replace the `RequireAuth` test body with this self-contained version:
```tsx
  it('redirects to /login when unauthenticated', async () => {
    mockFetch((url) => url.endsWith('/api/auth/me') ? new Response('x', { status: 401 }) : new Response('', { status: 404 }))
    const { MemoryRouter, Routes, Route, Navigate } = await import('react-router-dom')
    const { QueryClient, QueryClientProvider } = await import('@tanstack/react-query')
    const { render } = await import('@testing-library/react')
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    render(
      <QueryClientProvider client={qc}>
        <MemoryRouter initialEntries={['/departments']}>
          <Routes>
            <Route element={<RequireAuth />}>
              <Route path="/departments" element={<div>secret</div>} />
            </Route>
            <Route path="/login" element={<div data-testid="login-marker" />} />
            <Route path="*" element={<Navigate to="/login" replace />} />
          </Routes>
        </MemoryRouter>
      </QueryClientProvider>,
    )
    await waitFor(() => expect(screen.getByTestId('login-marker')).toBeInTheDocument())
  })
```

- [ ] **Step 3: Run to verify it fails**

Run: `cd ui && npx vitest run src/auth/auth.test.tsx`
Expected: FAIL — modules not found.

- [ ] **Step 4: Implement `ui/src/auth/RequireAuth.tsx`**

```tsx
import { Navigate, Outlet } from 'react-router-dom'
import { useMe } from '../api/hooks'

export function RequireAuth() {
  const { data, isLoading, isError } = useMe()
  if (isLoading) return <div className="min-h-screen bg-bg" />
  if (isError || !data) return <Navigate to="/login" replace />
  return <Outlet />
}
```

- [ ] **Step 5: Implement `ui/src/screens/Login.tsx`**

Cross-check prototype lines 29–48. Full-height deep-violet panel with two blurred orbs and a centered card.
```tsx
import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useLogin } from '../api/hooks'
import { Button } from '../ui/Button'
import logo from '../assets/inja-logo.jpg'

export function Login() {
  const [username, setUsername] = useState('analyst')
  const [password, setPassword] = useState('')
  const [err, setErr] = useState(false)
  const login = useLogin()
  const nav = useNavigate()

  function onSubmit(e: React.FormEvent) {
    e.preventDefault()
    setErr(false)
    login.mutate({ username, password }, {
      onSuccess: () => nav('/departments', { replace: true }),
      onError: () => setErr(true),
    })
  }

  return (
    <div className="min-h-screen relative flex items-center justify-center bg-login-bg overflow-hidden font-sans">
      <div className="absolute w-[420px] h-[420px] rounded-full bg-login-orb opacity-55 -top-[140px] -left-[110px]" />
      <div className="absolute w-[300px] h-[300px] rounded-full bg-login-orb opacity-50 -bottom-[120px] -right-[90px]" />
      <form onSubmit={onSubmit} className="relative w-[380px] bg-bg rounded-3xl p-8 shadow-modal">
        <div className="flex flex-col items-center gap-3.5 mb-6">
          <img src={logo} alt="اینجا فست‌فود" className="w-[76px] h-[76px] rounded-[20px] object-cover" />
          <div className="text-center">
            <div className="font-extrabold text-[19px] text-ink">اینجا فست‌فود</div>
            <div className="text-[12.5px] text-muted mt-1">سامانهٔ مستندسازی فرآیندها</div>
          </div>
        </div>
        <label className="block text-[12.5px] font-semibold text-violet mb-1.5">نام کاربری</label>
        <input value={username} onChange={(e) => setUsername(e.target.value)} placeholder="analyst"
          className="w-full px-3.5 py-3 border-[1.5px] border-line rounded-xl text-sm text-ink bg-white outline-none mb-4 focus:border-coral" />
        <label className="block text-[12.5px] font-semibold text-violet mb-1.5">گذرواژه</label>
        <input value={password} onChange={(e) => setPassword(e.target.value)} type="password" placeholder="••••••••"
          className="w-full px-3.5 py-3 border-[1.5px] border-line rounded-xl text-sm text-ink bg-white outline-none mb-2 focus:border-coral" />
        {err && <div className="text-conflict text-[12px] mb-2">نام کاربری یا گذرواژه نادرست است</div>}
        <Button variant="coral" type="submit" className="w-full py-3.5 mt-2 text-[14.5px]">ورود به سامانه</Button>
        <div className="text-center mt-4 text-[11px] text-faint">دسترسی تک‌کاربره · محافظت‌شده با نام‌کاربری و گذرواژه</div>
      </form>
    </div>
  )
}
```

- [ ] **Step 6: Run to verify it passes**

Run: `cd ui && npx vitest run src/auth/auth.test.tsx`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add ui/src/api/hooks.ts ui/src/auth ui/src/screens/Login.tsx
git commit -m "feat(ui): auth hooks, RequireAuth gate & Login screen"
```

---

## Task 7: Departments grid screen

**Files:**
- Create: `ui/src/screens/Departments.tsx`, `ui/src/screens/Departments.test.tsx`

**Interfaces:**
- Consumes: `useDepartments`, `deptMeta`, `toFa`, `Card`, react-router `useNavigate`.

- [ ] **Step 1: Write the failing test**

Create `ui/src/screens/Departments.test.tsx`:
```tsx
import { describe, it, expect, vi, afterEach } from 'vitest'
import { screen } from '@testing-library/react'
import { Departments } from './Departments'
import { renderAt } from '../test/utils'

afterEach(() => vi.restoreAllMocks())

describe('Departments', () => {
  it('renders tiles with Persian counts from the API', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(
      JSON.stringify([{ code: 'cooking', name: 'پخت', count: 12 }, { code: 'cashier', name: 'صندوق', count: 3 }]),
      { status: 200, headers: { 'Content-Type': 'application/json' } },
    ))
    renderAt('/departments', <Departments />, '/departments')
    expect(await screen.findByText('پخت')).toBeInTheDocument()
    expect(screen.getByText('۱۲ فرآیند')).toBeInTheDocument()
    expect(screen.getByText('۳ فرآیند')).toBeInTheDocument()
  })
})
```

- [ ] **Step 2: Run to verify it fails**

Run: `cd ui && npx vitest run src/screens/Departments.test.tsx`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement `ui/src/screens/Departments.tsx`**

Cross-check prototype lines 84–104.
```tsx
import { useNavigate } from 'react-router-dom'
import { useDepartments } from '../api/hooks'
import { deptMeta } from '../lib/departments'
import { toFa } from '../lib/format'

export function Departments() {
  const nav = useNavigate()
  const { data = [] } = useDepartments()

  return (
    <div className="flex-1 overflow-auto py-[34px] px-10">
      <div className="max-w-[1080px] mx-auto">
        <div className="mb-6">
          <div className="font-extrabold text-2xl text-ink">دپارتمان‌ها</div>
          <div className="text-[13.5px] text-muted mt-1.5">یک دپارتمان را برای مشاهدهٔ فرآیندهای مستندشدهٔ آن انتخاب کنید.</div>
        </div>
        <div className="grid grid-cols-3 gap-[18px]">
          {data.map((d) => {
            const m = deptMeta(d.code)
            return (
              <div key={d.code} onClick={() => nav(`/departments/${d.code}`)}
                className="bg-white border border-warm rounded-[18px] p-5 cursor-pointer flex items-center gap-[15px] shadow-card hover:-translate-y-0.5 hover:shadow-card-hover transition">
                <div className={`w-12 h-12 rounded-[14px] flex items-center justify-center shrink-0 ${m.tileClass}`}>
                  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round"><path d={m.icon} /></svg>
                </div>
                <div className="flex-1 min-w-0">
                  <div className="font-bold text-[15.5px] text-ink">{d.name}</div>
                  <div className="text-xs text-muted mt-1">{toFa(d.count)} فرآیند</div>
                </div>
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#C9B8EC" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><path d="M15 18l-6-6 6-6" /></svg>
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `cd ui && npx vitest run src/screens/Departments.test.tsx`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add ui/src/screens/Departments.tsx ui/src/screens/Departments.test.tsx
git commit -m "feat(ui): departments grid screen"
```

---

## Task 8: Process list screen (search + cards + tag)

**Files:**
- Create: `ui/src/screens/ProcessList.tsx`, `ui/src/screens/ProcessList.test.tsx`

**Interfaces:**
- Consumes: `useProcesses`, `useDepartments` (for the header name/icon), `deriveTag`, `toFa`, `IdBadge`, `Button`, react-router `useParams`/`useNavigate`.

- [ ] **Step 1: Write the failing test**

Create `ui/src/screens/ProcessList.test.tsx`:
```tsx
import { describe, it, expect, vi, afterEach } from 'vitest'
import { screen, fireEvent } from '@testing-library/react'
import { ProcessList } from './ProcessList'
import { renderAt } from '../test/utils'

afterEach(() => vi.restoreAllMocks())

const PROCS = [
  { id: 'cooking-001', department: 'cooking', name: 'خرید و پرداخت', summary: 's1', parent: null, kpis: [{ name: 'k' }], pending: [], nodes: [{ type: 'activity' }, { type: 'start' }] },
  { id: 'cooking-014', department: 'cooking', name: 'پرداخت هزینه', summary: 's2', parent: { process: 'cooking-001', node: 'n' }, kpis: [], pending: [], nodes: [] },
]

function mock() {
  vi.spyOn(globalThis, 'fetch').mockImplementation((input: RequestInfo | URL) => {
    const url = String(input)
    if (url.includes('/processes')) return Promise.resolve(new Response(JSON.stringify(PROCS), { status: 200, headers: { 'Content-Type': 'application/json' } }))
    return Promise.resolve(new Response(JSON.stringify([{ code: 'cooking', name: 'پخت', count: 2 }]), { status: 200, headers: { 'Content-Type': 'application/json' } }))
  })
}

describe('ProcessList', () => {
  it('renders cards with derived tags and activity counts', async () => {
    mock()
    renderAt('/departments/:code', <ProcessList />, '/departments/cooking')
    expect(await screen.findByText('خرید و پرداخت')).toBeInTheDocument()
    expect(screen.getByText('دارای KPI')).toBeInTheDocument()   // cooking-001
    expect(screen.getByText('زیرفرآیند')).toBeInTheDocument()   // cooking-014
    expect(screen.getByText('۱')).toBeInTheDocument()           // 1 activity node on cooking-001
  })

  it('filters by id', async () => {
    mock()
    renderAt('/departments/:code', <ProcessList />, '/departments/cooking')
    await screen.findByText('خرید و پرداخت')
    fireEvent.change(screen.getByPlaceholderText('جست‌وجو براساس نام یا شناسهٔ فرآیند…'), { target: { value: 'cooking-014' } })
    expect(screen.queryByText('خرید و پرداخت')).not.toBeInTheDocument()
    expect(screen.getByText('پرداخت هزینه')).toBeInTheDocument()
  })
})
```

- [ ] **Step 2: Run to verify it fails**

Run: `cd ui && npx vitest run src/screens/ProcessList.test.tsx`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement `ui/src/screens/ProcessList.tsx`**

Cross-check prototype lines 108–176. New-process and delete buttons are present but inert (wired in sub-project C).
```tsx
import { useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { useDepartments, useProcesses } from '../api/hooks'
import { deptMeta } from '../lib/departments'
import { deriveTag, toFa } from '../lib/format'
import { IdBadge } from '../ui/IdBadge'
import { Button } from '../ui/Button'
import type { Process } from '../api/types'

const TAG_CLS: Record<string, string> = {
  sub: 'text-[#B4690E] bg-[#FBEEDC]', conflict: 'text-conflict bg-[#FFE9E7]',
  kpi: 'text-violet bg-tile-v', plain: 'text-violet bg-tile-v',
}

export function ProcessList() {
  const { code = '' } = useParams()
  const nav = useNavigate()
  const [q, setQ] = useState('')
  const { data: procs = [] } = useProcesses(code)
  const { data: depts = [] } = useDepartments()
  const dept = depts.find((d) => d.code === code)
  const m = deptMeta(code)

  const query = q.trim()
  const list = procs.filter((p) => !query || p.name.includes(query) || p.id.includes(query))
  const activityCount = (p: Process) => p.nodes.filter((n) => n.type === 'activity' && !('removed' in n && n.removed)).length

  return (
    <div className="flex-1 overflow-auto py-[30px] px-10">
      <div className="max-w-[920px] mx-auto">
        <div className="flex items-end justify-between gap-4 mb-[22px]">
          <div>
            <div className="flex items-center gap-3">
              <div className={`w-12 h-12 rounded-[14px] flex items-center justify-center shrink-0 ${m.tileClass}`}>
                <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round"><path d={m.icon} /></svg>
              </div>
              <div className="font-extrabold text-[22px] text-ink">دپارتمان {dept?.name ?? ''}</div>
            </div>
            <div className="text-[13px] text-muted mt-2">{toFa(dept?.count ?? procs.length)} فرآیند مستندشده · برای مشاهدهٔ کارت خلاصه و فلوچارت روی هر فرآیند بزنید.</div>
          </div>
          <div className="flex items-center gap-2.5 shrink-0">
            <Button variant="ghost" onClick={() => nav(`/departments/${code}/overview`)} className="px-4 py-[11px] text-[13px]">اطلاعات دپارتمان</Button>
            <Button variant="coral" className="px-4 py-[11px] text-[13px]">فرآیند جدید</Button>
          </div>
        </div>

        <div className="relative mb-4">
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="جست‌وجو براساس نام یا شناسهٔ فرآیند…"
            className="w-full box-border px-11 py-[13px] border-[1.5px] border-line rounded-[13px] text-[13px] text-ink bg-white outline-none focus:border-coral" />
        </div>

        <div className="flex flex-col gap-3">
          {list.length === 0 && (
            <div className="text-center py-12 px-5 text-faint bg-white border border-warm rounded-2xl">فرآیندی با این نام پیدا نشد</div>
          )}
          {list.map((p) => {
            const tag = deriveTag(p)
            return (
              <div key={p.id} className="bg-white border border-warm rounded-2xl px-[19px] py-[17px] flex items-center gap-4 shadow-card">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2.5">
                    <IdBadge>{p.id}</IdBadge>
                    <span className="font-bold text-[15px] text-ink">{p.name}</span>
                    <span className={`text-[10.5px] px-2 py-0.5 rounded-full font-semibold ${TAG_CLS[tag.kind]}`}>{tag.label}</span>
                  </div>
                  <div className="text-[12.5px] text-muted mt-1.5 leading-normal">{p.summary}</div>
                </div>
                <div className="text-center shrink-0 min-w-[52px]">
                  <div className="font-extrabold text-[17px] text-violet">{toFa(activityCount(p))}</div>
                  <div className="text-[10px] text-faint">فعالیت</div>
                </div>
                <div className="flex gap-2 shrink-0">
                  <Button variant="ghost" onClick={() => nav(`/processes/${p.id}`)} className="px-3.5 py-[9px] text-[12.5px]">اطلاعات کلی</Button>
                  <Button variant="violet" onClick={() => nav(`/processes/${p.id}/flow`)} className="px-3.5 py-[9px] text-[12.5px]">فلوچارت</Button>
                </div>
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `cd ui && npx vitest run src/screens/ProcessList.test.tsx`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add ui/src/screens/ProcessList.tsx ui/src/screens/ProcessList.test.tsx
git commit -m "feat(ui): process list screen with search + derived tags"
```

---

## Task 9: Department overview (view mode)

**Files:**
- Create: `ui/src/screens/Overview.tsx`, `ui/src/screens/Overview.test.tsx`

**Interfaces:**
- Consumes: `useOverview`, `deptMeta`, `jalali`, `Card`, react-router `useParams`. The "ویرایش" button is present but inert (edit mode → sub-project C).

- [ ] **Step 1: Write the failing test**

Create `ui/src/screens/Overview.test.tsx`:
```tsx
import { describe, it, expect, vi, afterEach } from 'vitest'
import { screen } from '@testing-library/react'
import { Overview } from './Overview'
import { renderAt } from '../test/utils'

afterEach(() => vi.restoreAllMocks())

const OV = {
  department: 'cooking', name: 'دپارتمان پخت', updated_at: '2026-07-06T10:00:00Z',
  sub_units: [{ name: 'آشپزخانهٔ گرم', description: 'غذاهای گرم' }],
  personnel: [{ role: 'سرآشپز', duties: ['مدیریت آشپزخانه', 'کنترل کیفیت'] }],
}

describe('Overview', () => {
  it('renders sub-units, personnel duties and the Jalali update date', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(JSON.stringify(OV), { status: 200, headers: { 'Content-Type': 'application/json' } }))
    renderAt('/departments/:code/overview', <Overview />, '/departments/cooking/overview')
    expect(await screen.findByText('دپارتمان پخت')).toBeInTheDocument()
    expect(screen.getByText('آشپزخانهٔ گرم')).toBeInTheDocument()
    expect(screen.getByText('سرآشپز')).toBeInTheDocument()
    expect(screen.getByText('کنترل کیفیت')).toBeInTheDocument()
    expect(screen.getByText(/۱۴۰۵\/۰۴\/۱۵/)).toBeInTheDocument()
  })
})
```

- [ ] **Step 2: Run to verify it fails**

Run: `cd ui && npx vitest run src/screens/Overview.test.tsx`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement `ui/src/screens/Overview.tsx`**

Cross-check prototype lines 179–286 (view branches only).
```tsx
import { useParams } from 'react-router-dom'
import { useOverview } from '../api/hooks'
import { deptMeta } from '../lib/departments'
import { jalali } from '../lib/format'
import { Card } from '../ui/Card'
import { Button } from '../ui/Button'

export function Overview() {
  const { code = '' } = useParams()
  const { data } = useOverview(code)
  const m = deptMeta(code)
  if (!data) return <div className="flex-1 bg-bg" />

  return (
    <div className="flex-1 overflow-auto py-[30px] px-10">
      <div className="max-w-[920px] mx-auto">
        <div className="flex items-start justify-between gap-4 mb-6">
          <div className="flex items-center gap-3">
            <div className={`w-12 h-12 rounded-[14px] flex items-center justify-center shrink-0 ${m.tileClass}`}>
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round"><path d={m.icon} /></svg>
            </div>
            <div>
              <div className="font-extrabold text-[22px] text-ink">{data.name}</div>
              <div className="text-xs text-faint mt-1">آخرین به‌روزرسانی: {jalali(data.updated_at)}</div>
            </div>
          </div>
          <Button variant="violet" className="px-4 py-2.5 text-[13px]">ویرایش</Button>
        </div>

        <section className="mb-7">
          <div className="font-extrabold text-[15px] text-ink mb-3">واحدهای زیرمجموعه</div>
          {data.sub_units.length === 0 && <div className="text-[12.5px] text-faint px-0.5 py-1.5">واحدی ثبت نشده است.</div>}
          <div className="grid grid-cols-2 gap-3">
            {data.sub_units.map((s, i) => (
              <Card key={i} className="px-[17px] py-[15px]">
                <div className="font-bold text-sm text-ink">{s.name}</div>
                <div className="text-[12.5px] text-muted mt-1.5 leading-relaxed">{s.description}</div>
              </Card>
            ))}
          </div>
        </section>

        <section>
          <div className="font-extrabold text-[15px] text-ink mb-3">پرسنل و شرح وظایف</div>
          {data.personnel.length === 0 && <div className="text-[12.5px] text-faint px-0.5 py-1.5">پرسنلی ثبت نشده است.</div>}
          <div className="flex flex-col gap-3">
            {data.personnel.map((pr, i) => (
              <Card key={i} className="px-[18px] py-4">
                <div className="font-bold text-sm text-ink mb-2.5">{pr.role}</div>
                <div className="flex flex-wrap gap-1.5">
                  {pr.duties.length === 0 && <div className="text-[11.5px] text-faint">وظیفه‌ای ثبت نشده است.</div>}
                  {pr.duties.map((d, j) => (
                    <span key={j} className="text-[11.5px] text-violet bg-tile-v2 px-2.5 py-1 rounded-full">{d}</span>
                  ))}
                </div>
              </Card>
            ))}
          </div>
        </section>
      </div>
    </div>
  )
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `cd ui && npx vitest run src/screens/Overview.test.tsx`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add ui/src/screens/Overview.tsx ui/src/screens/Overview.test.tsx
git commit -m "feat(ui): department overview (view mode)"
```

---

## Task 10: Summary card (view mode) — IDEF0 A-0 + KPIs

**Files:**
- Create: `ui/src/screens/Summary.tsx`, `ui/src/screens/Summary.test.tsx`

**Interfaces:**
- Consumes: `useProcess`, `Chip`, `IdBadge`, `Button`, react-router `useParams`/`useNavigate`. Edit + flow buttons present; flow navigates, edit is inert (→ C).

- [ ] **Step 1: Write the failing test**

Create `ui/src/screens/Summary.test.tsx`:
```tsx
import { describe, it, expect, vi, afterEach } from 'vitest'
import { screen } from '@testing-library/react'
import { Summary } from './Summary'
import { renderAt } from '../test/utils'

afterEach(() => vi.restoreAllMocks())

const withKpi = {
  id: 'cooking-002', name: 'پخت غذای روز', summary: 'خلاصه', parent: null,
  idef0: { inputs: ['لیست سفارش'], controls: ['دستور پخت'], outputs: ['غذای آماده'], mechanisms: ['آشپز'] },
  kpis: [{ name: 'زمان آماده‌سازی', definition: 'میانگین زمان', target: 'کمتر از ۱۵ دقیقه' }],
  nodes: [], edges: [], pending: [],
}

function mock(doc: unknown) {
  vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(JSON.stringify(doc), { status: 200, headers: { 'Content-Type': 'application/json' } }))
}

describe('Summary', () => {
  it('renders the A-0 ICOM chips and KPI cards', async () => {
    mock(withKpi)
    renderAt('/processes/:pid', <Summary />, '/processes/cooking-002')
    expect(await screen.findByText('پخت غذای روز')).toBeInTheDocument()
    expect(screen.getByText('لیست سفارش')).toBeInTheDocument()
    expect(screen.getByText('غذای آماده')).toBeInTheDocument()
    expect(screen.getByText('زمان آماده‌سازی')).toBeInTheDocument()
  })

  it('shows the no-fabrication note when there are no KPIs', async () => {
    mock({ ...withKpi, kpis: [] })
    renderAt('/processes/:pid', <Summary />, '/processes/cooking-002')
    expect(await screen.findByText(/سامانه اطلاعات را نمی‌سازد/)).toBeInTheDocument()
  })
})
```

- [ ] **Step 2: Run to verify it fails**

Run: `cd ui && npx vitest run src/screens/Summary.test.tsx`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement `ui/src/screens/Summary.tsx`**

Cross-check prototype lines 289–413 (view branches). ICOM box uses the 3-col grid around a violet center box.
```tsx
import { useNavigate, useParams } from 'react-router-dom'
import { useProcess } from '../api/hooks'
import { Chip } from '../ui/Chip'
import { IdBadge } from '../ui/IdBadge'
import { Button } from '../ui/Button'

export function Summary() {
  const { pid = '' } = useParams()
  const nav = useNavigate()
  const { data: p } = useProcess(pid)
  if (!p) return <div className="flex-1 bg-bg" />

  return (
    <div className="flex-1 overflow-auto py-[30px] px-10">
      <div className="max-w-[960px] mx-auto">
        <div className="flex items-start justify-between gap-4 mb-[22px]">
          <div>
            <div className="flex items-center gap-2.5 mb-2">
              <IdBadge tone="violet">{p.id}</IdBadge>
              {p.parent && <span className="text-[11px] text-violet bg-tile-v px-2.5 py-1 rounded-md font-semibold">زیرفرآیند</span>}
            </div>
            <div className="font-extrabold text-[23px] text-ink">{p.name}</div>
            <div className="text-[13.5px] text-muted mt-2 max-w-[640px] leading-relaxed">{p.summary}</div>
          </div>
          <div className="flex gap-2.5 shrink-0">
            <Button variant="ghost" className="px-4 py-3 text-[13px]">ویرایش اطلاعات</Button>
            <Button variant="coral" onClick={() => nav(`/processes/${p.id}/flow`)} className="px-[18px] py-3 text-[13.5px]">مشاهدهٔ فلوچارت</Button>
          </div>
        </div>

        <div className="bg-white border border-warm rounded-[18px] p-6 mb-5 shadow-card">
          <div className="font-bold text-sm text-violet mb-[18px] flex items-center gap-2">
            <span className="w-2 h-2 bg-coral rounded-full" />نمای IDEF0 سطح فرآیند (A-0)
          </div>
          <div className="grid grid-cols-[1fr_1.4fr_1fr] gap-3.5 items-center">
            <div className="col-start-2 row-start-1 text-center">
              <div className="text-[11px] text-muted mb-1.5">کنترل‌ها ↓</div>
              <div className="flex flex-wrap gap-1.5 justify-center">{p.idef0.controls.map((t, i) => <Chip key={i} kind="control">{t}</Chip>)}</div>
            </div>
            <div className="col-start-3 row-start-2 text-center">
              <div className="text-[11px] text-muted mb-1.5">ورودی‌ها →</div>
              <div className="flex flex-col gap-1.5 items-center">{p.idef0.inputs.map((t, i) => <Chip key={i} kind="input">{t}</Chip>)}</div>
            </div>
            <div className="col-start-2 row-start-2 bg-violet rounded-[14px] px-4 py-[22px] text-center text-white shadow-violet">
              <div className="font-bold text-[15px]">{p.name}</div>
              <div className="font-mono text-[11px] text-[#C9BEEE] mt-1.5" dir="ltr">A-0 · {p.id}</div>
            </div>
            <div className="col-start-1 row-start-2 text-center">
              <div className="text-[11px] text-muted mb-1.5">← خروجی‌ها</div>
              <div className="flex flex-col gap-1.5 items-center">{p.idef0.outputs.map((t, i) => <Chip key={i} kind="output">{t}</Chip>)}</div>
            </div>
            <div className="col-start-2 row-start-3 text-center">
              <div className="flex flex-wrap gap-1.5 justify-center">{p.idef0.mechanisms.map((t, i) => <Chip key={i} kind="mech">{t}</Chip>)}</div>
              <div className="text-[11px] text-muted mt-1.5">↑ مکانیزم‌ها</div>
            </div>
          </div>
        </div>

        <div className="font-bold text-[15px] text-ink mb-3">شاخص‌های کلیدی عملکرد (KPI)</div>
        {p.kpis.length > 0 ? (
          <div className="grid grid-cols-2 gap-3.5">
            {p.kpis.map((k, i) => (
              <div key={i} className="bg-white border border-warm rounded-[14px] px-[18px] py-4">
                <div className="flex items-center justify-between">
                  <div className="font-bold text-sm text-ink">{k.name}</div>
                  {k.target && <div className="text-xs font-bold text-conflict bg-[#FFE9E7] px-2.5 py-0.5 rounded-lg">{k.target}</div>}
                </div>
                <div className="text-xs text-muted mt-2 leading-normal">{k.definition}</div>
              </div>
            ))}
          </div>
        ) : (
          <div className="bg-white border border-dashed border-line rounded-[14px] p-5 text-center text-faint text-[12.5px]">
            شاخصی برای این فرآیند ثبت نشده است. (سامانه اطلاعات را نمی‌سازد؛ فقط از محتوای واقعی جلسه پر می‌شود.)
          </div>
        )}
      </div>
    </div>
  )
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `cd ui && npx vitest run src/screens/Summary.test.tsx`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add ui/src/screens/Summary.tsx ui/src/screens/Summary.test.tsx
git commit -m "feat(ui): summary card view (IDEF0 A-0 + KPIs)"
```

---

## Task 11: App shell + flow placeholder

Top bar (logo/home, back, breadcrumb, review-inbox button [inert], avatar) wrapping an `<Outlet/>`. The inbox button and its badge data are wired in sub-project C; here the button renders without a badge.

**Files:**
- Create: `ui/src/shell/AppShell.tsx`, `ui/src/shell/TopBar.tsx`, `ui/src/shell/Breadcrumb.tsx`, `ui/src/shell/BackButton.tsx`, `ui/src/screens/FlowPlaceholder.tsx`, `ui/src/shell/Breadcrumb.test.tsx`

**Interfaces:**
- Consumes: react-router `useLocation`/`useParams`/`useNavigate`/`Outlet`/`Link`, `useDepartments`, `useProcess`, logo asset.
- Produces: `AppShell` (column layout: `TopBar` + scrollable `Outlet`); `Breadcrumb` deriving crumbs from the path.

- [ ] **Step 1: Write the failing breadcrumb test**

Create `ui/src/shell/Breadcrumb.test.tsx`:
```tsx
import { describe, it, expect, vi, afterEach } from 'vitest'
import { screen } from '@testing-library/react'
import { Breadcrumb } from './Breadcrumb'
import { renderAt } from '../test/utils'

afterEach(() => vi.restoreAllMocks())

describe('Breadcrumb', () => {
  it('derives Home → department → process from the route', async () => {
    vi.spyOn(globalThis, 'fetch').mockImplementation((input: RequestInfo | URL) => {
      const url = String(input)
      if (url.endsWith('/api/departments')) return Promise.resolve(new Response(JSON.stringify([{ code: 'cooking', name: 'پخت', count: 1 }]), { status: 200, headers: { 'Content-Type': 'application/json' } }))
      if (url.endsWith('/api/processes/cooking-001')) return Promise.resolve(new Response(JSON.stringify({ id: 'cooking-001', department: 'cooking', name: 'خرید', nodes: [], edges: [], kpis: [], pending: [], parent: null, idef0: { inputs: [], controls: [], outputs: [], mechanisms: [] } }), { status: 200, headers: { 'Content-Type': 'application/json' } }))
      return Promise.resolve(new Response('{}', { status: 200, headers: { 'Content-Type': 'application/json' } }))
    })
    renderAt('/processes/:pid', <Breadcrumb />, '/processes/cooking-001')
    expect(await screen.findByText('دپارتمان‌ها')).toBeInTheDocument()
    expect(await screen.findByText('پخت')).toBeInTheDocument()
    expect(await screen.findByText('خرید')).toBeInTheDocument()
  })
})
```

- [ ] **Step 2: Run to verify it fails**

Run: `cd ui && npx vitest run src/shell/Breadcrumb.test.tsx`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement `ui/src/shell/Breadcrumb.tsx`**

```tsx
import { Link, useLocation, useParams } from 'react-router-dom'
import { useDepartments, useProcess } from '../api/hooks'

export function Breadcrumb() {
  const loc = useLocation()
  const { code, pid } = useParams()
  const { data: depts = [] } = useDepartments()
  const { data: proc } = useProcess(pid ?? '')

  const crumbs: { label: string; to: string }[] = [{ label: 'دپارتمان‌ها', to: '/departments' }]
  const deptCode = code ?? proc?.department
  const dept = depts.find((d) => d.code === deptCode)
  if (deptCode && dept) crumbs.push({ label: dept.name, to: `/departments/${deptCode}` })
  if (pid && proc) crumbs.push({ label: proc.name, to: loc.pathname })

  return (
    <div className="flex items-center gap-1.5 text-[12.5px] text-muted flex-wrap">
      {crumbs.map((c, i) => (
        <span key={c.to + i} className="flex items-center gap-1.5">
          {i > 0 && <span className="text-faint">/</span>}
          <Link to={c.to} className={i === crumbs.length - 1 ? 'text-ink font-semibold' : 'text-muted hover:text-coral'}>{c.label}</Link>
        </span>
      ))}
    </div>
  )
}
```

- [ ] **Step 4: Implement the rest of the shell**

`ui/src/shell/BackButton.tsx`:
```tsx
import { useLocation, useNavigate } from 'react-router-dom'

export function BackButton() {
  const nav = useNavigate()
  const loc = useLocation()
  if (loc.pathname === '/departments') return null
  return (
    <button onClick={() => nav(-1)} className="btn btn-ghost px-[13px] py-2 text-[12.5px]">
      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><path d="M9 18l6-6-6-6" /></svg>
      بازگشت
    </button>
  )
}
```

`ui/src/shell/TopBar.tsx` (cross-check prototype lines 55–81; inbox button present, no badge yet):
```tsx
import { useNavigate } from 'react-router-dom'
import { Breadcrumb } from './Breadcrumb'
import { BackButton } from './BackButton'
import logo from '../assets/inja-logo.jpg'

export function TopBar() {
  const nav = useNavigate()
  return (
    <div className="flex items-center gap-3.5 px-[22px] py-3 bg-white border-b border-warm shrink-0 z-20">
      <div onClick={() => nav('/departments')} className="flex items-center gap-2.5 cursor-pointer">
        <img src={logo} alt="" className="w-[38px] h-[38px] rounded-[11px] object-cover" />
        <div className="leading-tight">
          <div className="font-bold text-sm text-ink">اینجا فست‌فود</div>
          <div className="text-[10.5px] text-muted">سامانهٔ فرآیندها</div>
        </div>
      </div>
      <div className="w-px h-[26px] bg-[#EDE5F5] mx-1" />
      <BackButton />
      <Breadcrumb />
      <div className="ms-auto flex items-center gap-2.5">
        <button className="btn btn-ghost px-[13px] py-2 text-[12.5px]" title="صندوق بازبینی">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M22 12h-6l-2 3h-4l-2-3H2" /><path d="M5.45 5.11 2 12v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-6l-3.45-6.89A2 2 0 0 0 16.76 4H7.24a2 2 0 0 0-1.79 1.11z" /></svg>
          صندوق بازبینی
        </button>
        <div className="w-[34px] h-[34px] rounded-[10px] bg-tile-v text-violet flex items-center justify-center font-bold text-[13px]">آ</div>
      </div>
    </div>
  )
}
```

`ui/src/shell/AppShell.tsx`:
```tsx
import { Outlet } from 'react-router-dom'
import { TopBar } from './TopBar'

export function AppShell() {
  return (
    <div dir="rtl" className="h-screen flex flex-col bg-bg overflow-hidden font-sans text-ink">
      <TopBar />
      <Outlet />
    </div>
  )
}
```

`ui/src/screens/FlowPlaceholder.tsx`:
```tsx
export function FlowPlaceholder() {
  return (
    <div className="flex-1 grid place-items-center text-muted text-sm">
      فلوچارت در فاز بعدی افزوده می‌شود.
    </div>
  )
}
```

- [ ] **Step 5: Run to verify the breadcrumb test passes**

Run: `cd ui && npx vitest run src/shell/Breadcrumb.test.tsx`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add ui/src/shell ui/src/screens/FlowPlaceholder.tsx
git commit -m "feat(ui): app shell (top bar, breadcrumb, back) + flow placeholder"
```

---

## Task 12: Routing composition + integration gate

Wire everything into the router and boot it from `main.tsx`. Final integration test + build gate.

**Files:**
- Create: `ui/src/routes.tsx`, `ui/src/routes.test.tsx`
- Modify: `ui/src/main.tsx`

**Interfaces:**
- Consumes: every screen, `AppShell`, `RequireAuth`.
- Produces: `router` (a `createBrowserRouter` table) and a booted `RouterProvider` + `QueryClientProvider`.

- [ ] **Step 1: Write the failing integration test**

Create `ui/src/routes.test.tsx`:
```tsx
import { describe, it, expect, vi, afterEach } from 'vitest'
import { screen, waitFor } from '@testing-library/react'
import { render } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { RouterProvider, createMemoryRouter } from 'react-router-dom'
import { appRoutes } from './routes'

afterEach(() => vi.restoreAllMocks())

function boot(initial: string, authed: boolean) {
  vi.spyOn(globalThis, 'fetch').mockImplementation((input: RequestInfo | URL) => {
    const url = String(input)
    if (url.endsWith('/api/auth/me')) return Promise.resolve(new Response(authed ? JSON.stringify({ username: 'analyst' }) : 'x', { status: authed ? 200 : 401, headers: { 'Content-Type': 'application/json' } }))
    if (url.endsWith('/api/departments')) return Promise.resolve(new Response(JSON.stringify([{ code: 'cooking', name: 'پخت', count: 1 }]), { status: 200, headers: { 'Content-Type': 'application/json' } }))
    return Promise.resolve(new Response('[]', { status: 200, headers: { 'Content-Type': 'application/json' } }))
  })
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  const router = createMemoryRouter(appRoutes, { initialEntries: [initial] })
  return render(<QueryClientProvider client={qc}><RouterProvider router={router} /></QueryClientProvider>)
}

describe('routing', () => {
  it('redirects an unauthenticated visit to /login', async () => {
    boot('/departments', false)
    await waitFor(() => expect(screen.getByPlaceholderText('analyst')).toBeInTheDocument())
  })
  it('shows the departments grid when authenticated', async () => {
    boot('/departments', true)
    await waitFor(() => expect(screen.getByText('دپارتمان‌ها')).toBeInTheDocument())
  })
})
```

- [ ] **Step 2: Run to verify it fails**

Run: `cd ui && npx vitest run src/routes.test.tsx`
Expected: FAIL — `./routes` not found.

- [ ] **Step 3: Implement `ui/src/routes.tsx`**

```tsx
import { Navigate, type RouteObject } from 'react-router-dom'
import { RequireAuth } from './auth/RequireAuth'
import { AppShell } from './shell/AppShell'
import { Login } from './screens/Login'
import { Departments } from './screens/Departments'
import { ProcessList } from './screens/ProcessList'
import { Overview } from './screens/Overview'
import { Summary } from './screens/Summary'
import { FlowPlaceholder } from './screens/FlowPlaceholder'

export const appRoutes: RouteObject[] = [
  { path: '/login', element: <Login /> },
  {
    element: <RequireAuth />,
    children: [
      {
        element: <AppShell />,
        children: [
          { path: '/', element: <Navigate to="/departments" replace /> },
          { path: '/departments', element: <Departments /> },
          { path: '/departments/:code', element: <ProcessList /> },
          { path: '/departments/:code/overview', element: <Overview /> },
          { path: '/processes/:pid', element: <Summary /> },
          { path: '/processes/:pid/flow', element: <FlowPlaceholder /> },
        ],
      },
    ],
  },
  { path: '*', element: <Navigate to="/departments" replace /> },
]
```

- [ ] **Step 4: Run to verify it passes**

Run: `cd ui && npx vitest run src/routes.test.tsx`
Expected: PASS.

- [ ] **Step 5: Boot the router from `main.tsx`**

Replace `ui/src/main.tsx` with:
```tsx
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { RouterProvider, createBrowserRouter } from 'react-router-dom'
import '@fontsource-variable/vazirmatn'
import './index.css'
import { appRoutes } from './routes'

const queryClient = new QueryClient()
const router = createBrowserRouter(appRoutes)

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} />
    </QueryClientProvider>
  </StrictMode>,
)
```

- [ ] **Step 6: Full gate — suite, types, build**

Run:
```bash
cd ui && npm test && npm run build
```
Expected: every test PASSES; `tsc -b` clean (no unused-locals/params errors); `vite build` emits `dist/`.

- [ ] **Step 7: Manual smoke (optional but recommended)**

With the backend running (`uvicorn inja_ui_backend.app:app --port 8000` from `ui-backend/`, env per its README) and `cd ui && npm run dev`: log in, walk departments → list → overview → summary, refresh on each screen (stays put), confirm Persian numerals + Jalali dates, and that no edit action mutates anything.

- [ ] **Step 8: Commit**

```bash
git add ui/src/routes.tsx ui/src/routes.test.tsx ui/src/main.tsx
git commit -m "feat(ui): route table + RouterProvider boot (sub-A complete)"
```

---

## Self-Review (completed during authoring)

**Spec coverage:**
- Design-system/token layer → Task 1. Vazirmatn self-host + logo → Task 1. RTL → Task 1/Task 11 (`dir` on `<html>` and `AppShell`).
- `toFa`/`jalali`/`deriveTag` → Task 2. Department icon/accent map → Task 3.
- API client + types + read hooks → Task 4. Primitives → Task 5.
- Auth (Login, session gate, logout hook) → Task 6.
- Routing (react-router URL table, RequireAuth, refresh-persist) → Task 12; back/breadcrumb → Task 11.
- Read screens: departments grid → Task 7; process list + search → Task 8; overview view → Task 9; summary view (A-0 + KPIs + INV-3 note) → Task 10.
- Flow placeholder → Task 11. Testing (Vitest + RTL, fixtures, RequireAuth redirect, breadcrumb, search) → across Tasks 2–12.
- Exit criteria (navigation via URLs, refresh persists, Persian/Jalali, view-only) → Task 12 gate + manual smoke.

**Placeholder scan:** No "TBD"/"handle edge cases" — every step has concrete code or an exact command. The Task-6 test intentionally shows a first-draft then a corrected self-contained version; the corrected block is the one to type.

**Type consistency:** `Process`/`Overview`/`Department`/`Me` (Task 4) are used unchanged in Tasks 2, 7–12. Hook names (`useDepartments`, `useProcesses`, `useOverview`, `useProcess`, `useMe`, `useLogin`, `useLogout`) are consistent. `deptMeta` returns `{icon, accent, tileClass}` used identically in Tasks 7–10. `deriveTag` returns `{label, kind}` consumed in Task 8 (`TAG_CLS[tag.kind]`).

**Note on cross-task test ordering:** `format.ts` (Task 2) imports `../api/types` (Task 4). If executed strictly in order, run Task 2's test with the temporary inline type noted in its Step 4, or accept that `npm test` first goes fully green at Task 4 Step 8. Either is fine; the per-file `npx vitest run <file>` commands isolate each task's own assertions.
