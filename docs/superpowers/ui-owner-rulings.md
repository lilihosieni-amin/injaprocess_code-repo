# Owner rulings for the UI conformance work

Rules the owner stated directly. Several are **not** in `ui/design/` — they are
product knowledge that the deliverable does not carry, which is exactly why the
first nine screens missed them. Anything here outranks an inference from the
design files.

## R1 — The design of record

`ui/design/Inja Panel.dc.html` (and `Inja Reader.dc.html` for the reader surface)
are the authority. Where the extracted `_ds/` token set or its `readme.md`
disagrees, **the deliverable wins** and the token is corrected to match, with the
reason recorded.

Consequences already known:
- The app sits on the deep violet field `#2A1D5E`, not the readme's "warm cream
  paper". Both deliverables agree on this; `--bg: #FBF7F1` no longer describes the
  page background (it remains the flow canvas's ground).
- The readme's claim that the product has "no Tabs, Accordion or Select" is false
  of the deliverables: five tab trays, ~15 custom selects, two accordions.

## R2 — Scope

Everything: the nine admin screens, the legacy screens, the write flows, the shell
defects, `tailwind.config.js`, and retiring `PENDING_REBUILD` from
`ui/src/test/guards.test.ts`.

## R3 — Panel and reader are two surfaces, not two themes

They share every foundation — the violet field, the two-layer card shadow, the
`rgba(42,29,94,.07)` border, `translateY(-2px)` over `.16s`, the coral focus
border, the scrim, the 10px scrollbar, the flow canvas, the RTL scroll trick.

They deliberately differ in scale, composition and chrome:

| | Panel (admin/editor) | Reader |
|---|---|---|
| Content column | 920 / 960 / 980 / 1120px | 720px (700 profile, 760 steps) |
| Screen padding | `30px 40px` | `30px 24px 60px` |
| Departments | 3-column grid, gap 18 | single column list, gap 14 |
| Department tile | 48x48, radius 14 | 54x54, radius 16, glyph 26px |
| Screen H1 | 22px (34 on home) | 26 home / 30 list / 24 dept-info |
| Body copy | 13-14px | 14.5-15px; comment body 17px / lh 1.95 |
| Icon buttons | 40x40 | 42x42, radius 12 |
| FAB | 52x52 | 56x56 |
| Chrome off home | breadcrumb strip | a back bar — and **neither on the flow screen** |

**A single shared component set cannot satisfy both.** Card, tile, top bar, H1 and
the compose drawer must be surface-aware — either a prop or a scale layer that
`PanelShell` and `ReaderShell` each supply. The shells already exist; what is
missing is that the components beneath them do not know which one they are in.

## R4 — A reader with one department never sees the department list

If a reader's reachable departments number exactly one, they land on **that
department's process list**, not on a list holding a single tile.

- **The rule depends only on scope, never on content.** A department with nothing
  confirmed still redirects; the reader lands on the process list and sees its
  empty state. The same person therefore always lands in the same place, rather
  than moving as content gets confirmed. (Owner ruling.)
- A report-scoped reader (`dept:x/report:k`) reaches one department and is landed
  on the process list, not deeper — that is the screen their scope describes.
- **The process list is then their root**, so it carries no back bar.
- **Reader-only.** An admin or editor scoped to one department still sees the
  department list: their chrome is the breadcrumb strip and the list is a real
  navigation level for them.
- The backend needs no change — `GET /api/departments` already returns only what
  the caller can reach, so the count is available client-side.

## R5 — Never draw what you would refuse

If a person cannot reach something, **it is not on their screen at all**. Not
greyed out, not drawn with an explanation, not a row that answers 404 when
clicked. The UI must never lead anybody to a refusal.

This is the affordance half of the rule the owner already set for data ("if a
reader isn't supposed to see it, it must never be sent"). Same principle, applied
to controls, nav entries, rows, menu items and whole screens.

What it does **not** mean: the refusal surfaces still exist. A person can type a
URL, and `access.requires` answers 404 out of scope and 403 for a refused action
on a visible resource — those screens stay, and they stay distinct. The rule is
that **nothing inside the app may ever navigate you to one**. A refusal reached by
a typed URL is correct; a refusal reached by clicking is a bug in the screen that
drew the control.

Consequences to check for during the rebuild:
- A nav entry, tab or menu item whose target the caller cannot reach is absent,
  not disabled.
- A list never renders a row it would then refuse to open.
- An action a caller may not perform is absent, not disabled-with-a-tooltip.
- A whole screen the caller cannot use is absent from the chrome that leads to it.
- Where a control's availability depends on the *target* rather than the caller
  (this account holds more than you do), it is still absent rather than explained.

## R6 — Every page is verified in a real browser

`vitest` runs on jsdom, which renders nothing — no layout, no computed colour, no
font metrics. That is the direct reason nine screens shipped where every value was
legal and the page still looked wrong. A real-browser check is the missing gate,
and each page gets one as it is rebuilt.

Tooling decided: **Playwright as a committed dev dependency**, not as an ad-hoc
browser session. `@playwright/test` 1.62.1 resolves from the registry, and Chrome
is already installed at `/usr/bin/google-chrome`, so the config uses
`channel: 'chrome'` and needs no browser download on this restricted network.

The check per page asserts **computed values against the design's numbers** — page
background, content column width, screen padding, H1 size and weight, body size,
card radius/shadow/border, focus border colour, hover lift — and captures a
screenshot at a fixed viewport for comparison against `ui/design/`. Committed, so
it re-runs on every later change; an ad-hoc session verifies once and is gone,
which is how this drifted in the first place.

## R7 — Every page and every component is responsive to mobile

Stated by the owner as a first-class requirement, not a finishing pass. The design
specifies it; the app has essentially none of it.

**Measured today** (`ui/src`, Tailwind responsive prefixes): `src/screens/` **0**
across 30 files · `src/write/` **0** across 16 · `src/shell/` **0** across 5 ·
`src/flow/` **0** across 21 · `src/ui/` **18** across 17 (all in the dialog
primitive). **Zero** `@media` queries in `src/**/*.css`. **Zero** `data-r-*` hooks.

The shell holding zero is the most consequential fact here: both breakpoints are
largely shell behaviour, and it implements none of it.

**The design's two breakpoints** (S1's `<style>` block — there are only two):

**≤1080px**
- `[data-r-deptgrid]` → 2 columns
- `[data-r-nav]` hidden
- inside `[data-r-topbar]`: `[data-r-hide]` → `display:none`, `[data-r-show]` →
  `display:flex`

**≤760px — the full mobile pass**
- `[data-r-pad]` → `padding: 18px 14px`
- `[data-r-topbar]` → `padding: 10px 14px; gap: 10px`
- `[data-r-title]` → `font-size: 25px`
- `[data-r-stack]` → column, `align-items: stretch`, `gap: 12px`
- `[data-r-2col]` → `1fr`
- `[data-r-idef0]` → flex column
- every `[data-r-actions]` wraps; its buttons become `flex: 0 0 auto;
  align-self: flex-start; justify-content: center`
- `[data-r-plistactions]` hidden; `[data-r-plistmore]`, `[data-r-mmore]` and
  `[data-r-flowmore]` shown
- `[data-r-crumbs]` hidden

**Implementation note.** The design expresses these as attribute hooks because the
deliverable is hand-written HTML. In this codebase the same rules belong in
Tailwind breakpoints configured to `1080px` and `760px`, applied at the same
elements. Whichever form is used, the *behaviour* above is the contract, and the
Playwright check of R6 asserts it at both widths as well as at desktop.

The reader deliverable declares 62 responsive hooks for 22 that exist — do not
treat its hook list as a specification without checking the rule actually fires.

## R8 — One rule per role. Do not reproduce the design's inconsistencies

R1 makes the deliverable the authority over the token set. **R8 limits it**: where
the deliverable contradicts *itself*, the inconsistency is a defect in the design,
not a specification. The owner's words: *"the confirm button might be green in one
place and orange in another — which isn't right at all; they should all follow the
same rule."*

**Method — role first, not location.** Every element takes its treatment from
**what it is**, never from which screen it happens to sit on. Before any screen is
rebuilt, the plan's first deliverable is a **semantic table**: one row per role,
one colour / size / radius / shadow per row, derived from the design's own stated
semantics and its dominant usage. Every later task reads its values from that
table.

The design's semantics are already explicit and mostly self-consistent — the
contradictions are the exceptions:

| Role | Token | Value |
|---|---|---|
| Committed / accepted / approved / confirmed | `--green` / `--ok` | `#1F8A5B` on `#E4F6EC` |
| New, primary-forward, destructive-forward | `--coral` | `#FA5A52` |
| Danger / failure / conflict | `--conflict` | `#E23D35` |
| Primary ink, headings | `--violet` / `--ink` | `#4A25A9` / `#2A1D5E` |

**Resolution rule.** Where the deliverable shows two treatments for one role:
1. The design's own stated semantics decide it (green *is* accept/approve — 38
   uses — so a coral confirm is the error, not the green one).
2. Where semantics do not settle it, the **dominant usage wins** and the minority
   is normalised to it.
3. Where neither settles it, it goes to the owner rather than being chosen
   silently.

**Every normalisation is recorded** — what the design showed, how many of each,
what was chosen and why — in a normalisation ledger the owner can veto before
implementation. A silent choice here is how the next inconsistency gets built in.

**Action versus state is a real distinction and must be decided once**, not per
screen: a *confirm button* is an action, a *confirmed badge* is a state. If the
same colour serves both, say so once in the table; if not, say that once too.

Known contradictions already catalogued, each needing a row in the ledger: two
"clear filters" colours · coral button shadow `-12px` vs `-14px` · four screen-title
sizes · the conflict-inbox modal alone on the old radius+shadow · department-info
900px vs every sibling's 920px · scrollbar 12px (`base.css`) vs 10px (panel) · the
reader's two status vocabularies · the reader's two compose drawers (violet vs
coral submit) · `ProcessTag.plain` identical to `.kpi` · `ConflictCard`'s ternary
with two identical branches · ten off-scale font sizes including the 18px every
dialog title uses.

## Known traps in the deliverables — do not reproduce

The reader file carries defects that are easy to copy by accident:

- `composeOpen` renders **two different drawers** (340 / 380px, padding 20 / 24,
  title 18 / 19, textarea 13.5 / 15.5, radius 12 / 14, submit **violet / coral**),
  and both mount at once on the flow screen. Build one; the panel's is the model.
- The flow overflow menu is unreachable (`display:none` inline and `!important`
  below 760px) while the nav it replaces is also hidden.
- Two `sc-if` blocks and two content slots ship empty in the panel.

Where a deliverable contradicts itself, record the choice rather than picking
silently.
