# Phase 6 — UI Frontend · Sub-project A: Foundation, Shell & Read-only Navigation

| | |
|---|---|
| **Date** | 2026-07-11 |
| **Status** | Approved design; ready for implementation plan |
| **Repo** | `code-repo/ui/` |
| **Phase** | 6 (UI frontend), per `PLAN.md §8` |
| **Basis** | PRD (FR-I2/I3, NFR-3), ARD §13, the design prototype, Phase-5 backend, frozen `schemas/process.schema.json` + `overview.schema.json` |

## 0. Context & decomposition

Phase 6 is large (full design system + ~12 screens + a view/edit flowchart editor on
`@xyflow/react`). It is split into three sub-projects, each with its own spec → plan →
implement cycle:

- **A (this spec)** — design-system foundation, app shell, auth/login, routing, the data
  layer, and **all read-only viewing** (departments → process list → department overview →
  summary card).
- **B (later)** — the flowchart canvas on `@xyflow/react`: custom activity/terminal/junction
  nodes, edges with labels, view + edit (drag, drag-to-link, delete, add, undo/redo,
  relayout, manual Save), node detail drawer (view + edit), junction gate editor. This holds
  the flagged reconciliation risk (bespoke SVG prototype → `@xyflow/react`) and gets an early
  spike.
- **C (later)** — the non-canvas write flows: overview edit, summary edit, manual
  create-process modal, delete confirms, conflict inbox modal + inline conflict accept/reject,
  the pending-count badge data, and toasts.

**Authoritative visual/behavioral source of truth:** `ui/design/Inja Process System.dc.html`
(+ `support.js`). The working-tree version (with per-process delete and the sub-process parent
picker) is authoritative, not the last commit. It is a *reference to reproduce, not to ship*:
it hand-rolls an SVG canvas, whereas the ARD mandates `@xyflow/react` — reconciled in B.

**Frozen contracts A consumes (Phase 5, done):**
- `GET /api/departments` → `[{code, name, count}]`
- `GET /api/departments/{code}/overview` → `overview.json`
- `GET /api/departments/{code}/processes` → `process.json[]`
- `GET /api/processes/{pid}` → `process.json`
- `POST /api/auth/login`, `POST /api/auth/logout`, `GET /api/auth/me`

## 1. Scope

**In A:**
- Design-system/token layer: exact prototype palette, radii, shadow scale, type scale, shared
  button variants (coral/violet/green/ghost) and ICOM chip styles; Vazirmatn font; global RTL.
- Data layer: typed API client, TanStack Query read hooks, the schema↔UI adapter, `toFa`
  (Persian numerals), Jalali date formatter, the department icon/accent map.
- Auth: **Login** screen, session gate, logout.
- App shell: top bar (logo/home, contextual back button, breadcrumb, review-inbox button,
  user avatar) + routing.
- Read-only screens: **Departments grid**, **Process list** (search by name/ID),
  **Department overview (view mode)**, **Summary card (view mode)** — IDEF0 A-0 box + KPI cards
  (incl. the empty-KPI no-fabrication note, INV-3).

**Explicitly deferred:**
- To **B**: the flowchart canvas (`/processes/:pid/flow`) — A renders a placeholder.
- To **C**: every edit affordance — overview edit, summary edit, create-process modal, delete
  confirms, conflict inbox modal + its badge count, toasts. In A these buttons appear in the
  layout (so the shell is visually complete) but are inert/stubbed.

**Non-goals for A:** any mutation call; any `@xyflow/react` work; deploy/build packaging
(Phase 7).

## 2. Architecture

### 2.1 Routing (react-router — new dependency)

| Route | Screen |
|---|---|
| `/login` | Login |
| `/` | redirect → `/departments` |
| `/departments` | Departments grid |
| `/departments/:code` | Process list |
| `/departments/:code/overview` | Department overview (view) |
| `/processes/:pid` | Summary card (view) |
| `/processes/:pid/flow` | Flowchart placeholder (→ B) |

- Breadcrumb and contextual back button derive from the active route (Home → Department →
  Process), replacing the prototype's in-memory `screen`/`stack`.
- `<RequireAuth>` wraps the app routes: it reads `GET /api/auth/me`; unauthenticated →
  redirect to `/login`. Refresh keeps the user on the current screen.

### 2.2 Server state

TanStack Query read hooks: `useMe`, `useDepartments`, `useProcesses(code)`,
`useOverview(code)`, `useProcess(pid)`. Read-only in A → no mutations. A single `QueryClient`
at the root. The fetch client sends `credentials: 'include'` (signed session cookie) and maps
non-2xx to typed errors (401 → auth redirect).

### 2.3 Design tokens & styling (Tailwind — already present)

- Encode the prototype's exact values in `tailwind.config.js` `theme.extend`:
  - colors: `bg #FBF7F1`, `ink #2A1D5E`, `violet #4A25A9`, `coral #FA5A52`,
    `green #1F8A5B`, `conflict #E23D35`, `muted #8a7db0`, borders `#EFE7DC`/`#E3D8F5`,
    tile fills `#F0E9FB`/`#F4EFFB`, plus the login deep-violet `#2E1668`/`#3A1D85`.
  - `fontFamily.sans = ['Vazirmatn', ...]`, radii, and the box-shadow scale used by cards,
    buttons, and modals.
- A small `@layer components` set: `btn-coral/violet/green/ghost`, `chip-input/control/
  output/mech`, `id-badge`. Pixel-specific one-offs use Tailwind arbitrary values so the port
  stays pixel-faithful (approved fidelity bar).
- `dir="rtl"` on `<html>`; `::selection` and scrollbar styling from the prototype.

### 2.4 Fonts & assets

- Self-host Vazirmatn via `@fontsource-variable/vazirmatn` (no runtime Google-CDN dependency;
  the VPS deploy should not need external network). New dependency.
- Copy `ui/design/assets/inja-logo.jpg` → `ui/src/assets/inja-logo.jpg`.

## 3. Module & file structure

```
ui/src/
  main.tsx                 # QueryClient + RouterProvider; sets dir=rtl
  routes.tsx               # route table + RequireAuth
  api/
    client.ts              # fetch wrapper (credentials: include, error mapping)
    types.ts               # TS types mirroring process/overview/registry schemas
    hooks.ts               # TanStack Query read hooks
  lib/
    format.ts              # toFa(), jalali(iso), deriveTag(process)
    departments.ts         # code -> { icon path, accent } static map (9 depts)
  ui/                       # design-system primitives
    Button.tsx  Chip.tsx  Card.tsx  IdBadge.tsx  (+ as needed)
  shell/
    AppShell.tsx  TopBar.tsx  Breadcrumb.tsx  BackButton.tsx
  screens/
    Login.tsx
    Departments.tsx
    ProcessList.tsx
    Overview.tsx           # view mode only (edit -> C)
    Summary.tsx            # IDEF0 A-0 + KPIs, view only (edit -> C)
    FlowPlaceholder.tsx    # replaced in B
```

The existing Vite template files (`App.tsx`, `App.css`, default `index.css` content) are
replaced.

## 4. Data adapter & presentation

- The app works **directly in the frozen schema shape** returned by Phase 5 — no divergent
  internal model. Presentation-only transforms at render:
  - `toFa(x)` — map Latin digits to Persian for every displayed number.
  - `jalali(iso)` — format `updated_at` (ISO/Latin on disk) as a Jalali date for display. The
    concrete converter (port the prototype's inline one vs. `date-fns-jalali`) is chosen in the
    implementation plan; stored data stays ISO/Latin (Phase-0 note).
  - `deriveTag(p)` — reproduce the prototype's process-card tag rule, all derivable from
    `process.json`: `parent` present → "زیرفرآیند"; else `pending.length` → "N تعارض"; else
    `kpis.length` → "دارای KPI"; else "مستند". Tag color follows the same branches.
- **Department icon/accent map** keyed by the 9 registry codes (`management`, `accounting`,
  `warehouse`, `procurement`, `cooking`, `preparation`, `dining`, `cashier`, `logistics`),
  taken from the prototype's SVG paths + violet/coral tile alternation. `registry.json` carries
  only code+name, so this presentation asset lives in the UI.
- Activity count on a process card = `nodes` with `type === 'activity'` and not `removed`.
- **Field-name reconciliation** (prototype in-memory → real schema, for A's read screens):
  node description is `description` (schema), not the prototype's `desc`; node `source` is the
  object `{created_by, touched_by}` (schema), not a string; nodes carry a `layout` field. A's
  read screens only surface `name`, `summary`, `idef0`, `kpis`, and process/department
  metadata, so A stays clear of the node-level naming; B/C handle node internals.

## 5. Testing

- **Vitest + React Testing Library** (new dev dependencies), API layer mocked.
- Unit: `toFa`, `jalali`, `deriveTag` pure functions.
- Component: design-system primitives render with the correct token classes; each read screen
  renders from a fixture (reuse Phase-0 golden `process.json` / an `overview.json` fixture);
  `RequireAuth` redirects when `me` is unauthenticated; breadcrumb derives correctly per route;
  process-list search filters by name and by ID.

## 6. Exit criteria (A)

- Login → departments → process list → department overview (view) → summary card (view) all
  navigate via URLs and match the prototype pixel-faithfully against live `data-repo` data.
- Refresh keeps the current screen; unauthenticated access redirects to `/login`.
- Persian numerals and Jalali dates render everywhere numbers/dates appear.
- View-only: no editing is possible yet (edit affordances present but inert), preventing
  accidental changes (ARD §13.2 default-view-only).
- Vitest suite passes.

## 7. New dependencies introduced by A

- `react-router` (routing) — runtime.
- `@fontsource-variable/vazirmatn` (self-hosted font) — runtime.
- `vitest`, `@testing-library/react`, `@testing-library/jest-dom`, `jsdom` — dev/test.

(`@xyflow/react`, `@tanstack/react-query`, `react`, `tailwindcss` already in `package.json`.)

## 8. Traceability

- FR-I2 (department → process → summary navigation; search) — A read screens.
- FR-I3 (view-only default) — A enforces; edit modes land in B/C.
- NFR-3 (auth: no plaintext, signed cookie) — A wires Login/`me`/logout to the Phase-5 backend.
- INV-3 (no fabrication) — the empty-KPI note is reproduced on the summary card.
