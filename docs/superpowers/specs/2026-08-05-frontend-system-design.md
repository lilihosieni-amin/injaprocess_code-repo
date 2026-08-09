# Frontend System — Design

| | |
|---|---|
| **Date** | 2026-08-05 |
| **Status** | Approved. Sub-project **F**; every P0–P4 plan builds against it. |
| **Basis** | `2026-08-04-multi-user-rbac-design.md` (D46–D49, D56), `PRD.md` v0.6 NFR-15, `ARD.md` v0.4 §13 |
| **Visual input** | `ui/design/Inja Panel.dc.html`, `ui/design/Inja Reader.dc.html` |

---

## 1. What this decides

The system every screen is built from: two shells, one component set, one token
set, the responsive and RTL rules, the accessibility baseline, and the four
states every surface must have.

It does **not** decide individual screens. A screen belongs to whichever
sub-project owns its feature — the sign-in and user-administration screens are
P0's, the comment inbox is P4's — and each of those plans covers both sides of
its slice.

**The mockups are visual input, not source.** `Inja Panel.dc.html` and
`Inja Reader.dc.html` settle the shape and the feel. No code is taken from them:
they are a template DSL with inline styles, they reference tokens without using
them, they carry no accessibility layer and no loading or error states, and their
sample data still contains concepts the access model does not have. Where they
disagree with a spec, the spec wins.

---

## 2. Two shells, one application

### F1 — One build, one router, two shells

A single Vite app. The shell is chosen at runtime from the session descriptor
(D47); everything below the shell is shared.

Two builds were considered and rejected. The flowchart already renders in three
places — panel, report, printed PDF — and the only thing preventing drift is that
they are literally the same component, pinned by `parity.test.tsx`. A second
build makes it four and duplicates the comment inbox, which both shells need.

### F2 — Shell selection is by capability, not by role name

```
Panel  ⟺  the user holds any of: edit · confirm · set_visibility ·
                                  manage_users · view_audit
Reader ⟺  otherwise
```

Derived from capabilities so that a role composed later (D50 permits new roles
from the six delegable capabilities) lands in the right shell without anyone
updating a list of role names. In the current deployment this resolves to: Editor
and Admin get the Panel, every Reader gets the Reader — including a department
head, whose `can_supervise` flag grants nothing (D51).

### F3 — What actually differs between the shells

Only three things. Everything else is shared.

| | Panel | Reader |
|---|---|---|
| **Density** | compact — more on screen, desktop-first reading | roomy — larger type, longer line-height |
| **Navigation** | breadcrumb trail, admin menu, multi-pane layouts | one screen at a time, history-stack back |
| **Extra surfaces** | user administration, activity reports, visibility policy, conflict inbox, confirmation controls | — |

The Reader is not a cut-down Panel with things hidden. It is the same components
at a different density, plus fewer of them. A waiter reading a procedure on a
phone and an analyst working through IDEF0 on a desktop are not the same reading
posture, and one density could only have served one of them.

---

## 3. Components

### F4 — One component set, built once

A component used by both shells is written once and takes density from the shell,
never from a prop the caller passes. Anything a caller can pass, a caller can
pass inconsistently.

**Shared** — Button · IconButton · StatusPill · Chip · IdBadge (mono, `dir="ltr"`)
· Card · Sheet (side panel on wide, bottom sheet on narrow) · Dialog (same
transform) · Toast · SearchField · Menu · Accordion · Tabs · FAB ·
DepartmentCard · ProcessRow · FlowCanvas · NodeDetail · StepList · StepCard ·
GateGroup · ProcessSummaryCard · DepartmentInfo · CommentCard · CommentComposer ·
ApprovalTrail · EmptyState · LoadingState · ErrorState · DeniedState

**Panel only** — DataTable · FilterBar · JalaliDatePicker · UserRow · UserDetail
· RolePicker · ScopePicker · SupervisorPicker · PolicyToggleRow · ConfirmChip ·
ConfirmDialog · ConflictInbox

**Reader only** — nothing structural. That is the point of F3.

### F5 — Overlays are one component with two presentations

`Sheet` and `Dialog` render as a side panel and a centred modal on wide screens,
and as bottom sheets on narrow ones. Written once, switched by breakpoint, so no
screen implements its own mobile variant and none can forget to.

---

## 4. Tokens

### F6 — Tokens are the only source of values

`ui/design/_ds/…/tokens/` is the source of truth: colours, spacing, radii,
shadows, typography, effects. They land in `tailwind.config.js` as theme
extensions, so components use semantic Tailwind classes and never literals.

**No component contains a hex colour, a pixel font-size, or an ad-hoc radius.**
Pinned by a test that greps `ui/src/**` for `#[0-9a-fA-F]{3,8}` and for
`text-\[` / `rounded-\[` arbitrary values, and fails on a hit.

This is the single change that most improves on both today's code and the
mockups. `ui/src` currently carries magic hex values through dozens of
components; the prototypes are worse — `Inja Panel.dc.html` uses `var()` four
times in 4,017 lines and `Inja Reader.dc.html` not once.

### F7 — Three reconciliations, decided once

The prototypes diverge from their own token file. Resolved here so it is settled
in one place rather than 200:

- **Card shadow** — adopt the prototypes' two-layer neutral-dark shadow as the
  token value. It is what the design actually looks like against the deep-violet
  field; the existing violet-tinted `--shadow-card` is replaced, not both kept.
- **Radius** — normalise to the `--radius-*` ladder. The prototypes use 9, 10,
  11, 12, 13, 14, 16, 18, 20 and 22px, which is a ladder with the rungs filed
  off.
- **Mono stack** — drop JetBrains Mono. It is named in the prototypes and loaded
  nowhere, so it renders as the fallback anyway; shipping another font file for
  ID chips is not worth the bytes.

### F8 — Type is semantic, and density is a shell property

Components ask for a role — `body`, `caption`, `title` — never a size. The shell
root maps roles to steps:

```
[data-shell="panel"]   --fs-body: 14px;  --lh-body: 1.6
[data-shell="reader"]  --fs-body: 15px;  --lh-body: 1.95
```

One scale, two mappings. Changing the Reader's density is one declaration, not a
sweep through every component.

The mockups' measured scales are the starting values: the Panel clusters at
11–13px, the Reader at 14–17px with comment body at 17px. Persian at small sizes
with tight leading is genuinely hard to read, which is why the Reader's
line-heights sit at 1.9–2.05 and its long-form prose is justified with
`text-wrap: pretty`.

---

## 5. Layout, RTL and accessibility

### F9 — Mobile-first

`min-width` breakpoints, Tailwind's defaults. The Reader is authored at phone
width and grows; the Panel is usable on a phone and comfortable on a desktop.

The prototypes are desktop-first with two `max-width` overrides and `!important`
throughout — reasonable for a mockup, wrong for a product whose largest user
group reads on a phone. Wide content that cannot reflow (the Panel's tables, the
flow canvas) scrolls inside its own container; **the page body never scrolls
horizontally**.

### F10 — RTL is structural

`dir="rtl"` and `lang="fa"` at the root. Logical properties throughout —
`margin-inline-start`, `border-inline-end`, `inset-inline-start`, `text-align:
start`. No component pins `dir` to escape an ancestor, which is a live papercut
in today's code.

`dir="ltr"` islands, each a shared component rather than an ad-hoc attribute: ID
badges, phone numbers, IP addresses, and the flow canvas. Persian digits are
rendered by `toFa()` for display; **input is normalised back to ASCII** before it
reaches the API (D57 — the sign-in field will receive `۰۹۱۲۳۴۵۶۷۸۹`).

The prototypes' scrollbar treatment is worth keeping: `direction: ltr` on the
scroll container with `direction: rtl` on its children puts the scrollbar on the
correct edge without flipping content.

### F11 — Accessibility baseline

Non-negotiable, and cheap while building rather than expensive afterwards. The
mockups have none of it — every title is a styled `div`, no `aria`, no bound
labels, no focus ring.

- Real headings (`h1`–`h3`) in document order. Every screen has one `h1`.
- Every input has a bound `<label>`; placeholders are not labels.
- A visible `:focus-visible` ring on every interactive element, buttons included.
- `Esc` closes any overlay; focus is trapped inside dialogs and returns to the
  trigger on close.
- Toasts announce via `aria-live="polite"`; errors via `assertive`.
- **44px minimum touch target.** The prototypes have 32px close buttons and an
  18px node-detail control.
- Status is never carried by colour alone — every pill carries text, which the
  mockups already do.
- Icon-only buttons have an accessible name, not just a `title`.

---

## 6. States

### F12 — Every surface has four states, and they are designed, not improvised

| State | Rule |
|---|---|
| **Loading** | Skeletons shaped like the content, not spinners, so nothing shifts when data lands. Operations that genuinely take tens of seconds — a cold PDF render (D27) — get explicit progress and a sentence saying why. |
| **Empty** | A sentence of fact, in plain Persian, saying what is not there and what would put something there. The mockups do this well throughout and it carries over verbatim. |
| **Error** | What failed, in one sentence, plus a retry. Never a raw status code. |
| **Denied** | Rarer than expected — see F13. |

Neither prototype has a loading or an error state anywhere. Real requests fail
and real renders are slow.

### F13 — Denied is for actions; out-of-scope is "not found"

D56 routes most refusals to **404**, so the denied state is narrower than it
looks: it is for a **refused action on a resource the user can already see** — a
Reader reaching an edit endpoint on their own department.

A resource outside the user's scope returns 404 and renders as **not found**,
deliberately indistinguishable from a typo. It must not hint that something
exists there, which means no "contact your administrator" copy on that path — the
UI cannot know, and saying it would answer the question 404 exists to refuse.

### F14 — Session expiry is a state, and today it is missing

A `401` on any request redirects to sign-in, preserving the attempted location so
the user returns to it. Today the app has no interceptor: `RequireAuth` only
tests `/api/auth/me` once at mount, so an expired session surfaces as a thrown
`ApiError` inside whatever query happens to run next.

---

## 7. Navigation

### F15 — Each shell navigates in its own way, and both keep a real history stack

**Reader** — one screen at a time. Landing screen is *my departments*, or the
department's process list when the user holds exactly one department. Back pops a
history stack rather than guessing a parent, so a reader who reached a flowchart
from the comment inbox returns to the inbox.

**Panel** — same stack, plus a breadcrumb trail and an administration menu.

**The badge for comments awaiting you lives on the landing screen**, which is
where every session starts, so it is seen on entry. With in-app notification as
the only channel (D40), that placement is the whole signal.

### F16 — The flowchart is today's implementation, unchanged

`ui/src/flow/` — `Canvas`, `adapt.ts`, `useFlowEditor`, the node and edge
components — is used as-is, in both shells and in the reports. The mockups draw a
fixed 1340×420 stage with literal coordinates; real processes run 20–40 nodes
with serpentine wrapping (FR-D9) and the reader's device is a phone, so the
mockup's canvas is a picture of a node, not a viewport design.

Keeping the existing implementation preserves `parity.test.tsx` and takes the
riskiest piece of the rebuild off the table. Node **styling** follows the
mockups; viewport behaviour does not change.

---

## 8. What survives from today's `ui/`

| Survives | Rebuilt |
|---|---|
| `flow/` — `Canvas`, `adapt.ts`, `useFlowEditor`, nodes, edges (~450 lines), already read/edit separable and already proven reusable read-only by the export | All five screen layouts — no breakpoints exist in them today |
| `api/client.ts`, `api/hooks.ts`, `api/types.ts` — additive change only | `RequireAuth` (9 lines) |
| `lib/` — `format.ts`, `counts.ts`, `departments.ts`, `process-nav.ts` | `shell/` (89 lines) — needs a user menu, a **sign-out control** (`useLogout()` exists today and is called nowhere), and mobile navigation |
| `export/` render pipeline | `Overview`/`Summary`'s read-versus-edit branching — a `draft !== null` boolean cannot express "may comment but not edit" |
| **The edit mode** — `useFlowEditor`, the write modals, the edit branches. The editing screens are deliberately not redesigned, so they are wrapped in the new shell and otherwise left alone | |

**The one trap to budget for:** `ui/export/` imports eight modules from
`ui/src/`, and its output is verified page-by-page against signed-off PDFs plus
tests asserting on CSS *source text*. Restyling a shared component changes the
printed documents. Either freeze that surface behind an adapter or budget full
PDF re-verification.

---

## 9. Testing

1. **No literals** — `ui/src/**` contains no hex colour and no arbitrary
   Tailwind size or radius value (F6).
2. **Shell selection** — each preset role and a composed role resolve to the
   expected shell by capability, not by name (F2).
3. **Overlay transform** — `Sheet` and `Dialog` render as bottom sheets below the
   breakpoint and as panel/modal above it (F5).
4. **No horizontal body scroll** at 320px on every screen; wide content scrolls
   inside its own container (F9).
5. **Accessibility** — one `h1` per screen, every input labelled, focus ring
   present, `Esc` closes overlays, focus returns to trigger, 44px targets (F11).
6. **States** — every data surface renders loading, empty and error; 404 renders
   not-found and 403 renders denied, and the not-found path contains no copy
   implying the resource exists (F12, F13).
7. **Session expiry** — a 401 mid-session redirects to sign-in and returns the
   user to the attempted location afterwards (F14).
8. **Persian input normalisation** — Persian and Arabic-Indic digits typed into
   the sign-in field reach the API as ASCII (F10, D57).
9. **Flow parity** — `parity.test.tsx` continues to pass, and the export's PDFs
   are re-verified after any change to a shared component (F16, §8).

---

## 10. Open items

- **Reader flowchart on a phone.** F16 keeps today's viewport behaviour, which
  was designed for a desktop editor. Whether a 40-node serpentine flow is usable
  on a 390px screen is unknown and untested; the step-by-step report is the
  fallback that makes it survivable. Worth measuring with real cashier data
  before assuming either way.
- **Skeleton fidelity.** F12 says skeletons shaped like the content; how far to
  take that per surface is a judgement call left to each plan.
- **Whether the Panel needs a phone layout at all.** It is specified as usable on
  a phone, but its users are an analyst and a deputy manager who work on
  desktops. If that holds, some Panel-only surfaces (the activity tables) could
  stay desktop-only with a horizontal scroll rather than being reflowed.
