# UI normalisation ledger

**This is the owner's veto point.** Nothing after this document chooses a value.
Every row below is a place where the design contradicts itself, or where the
deliverable and the token file it links disagree about what a single role's value
is. R8 says an internal contradiction is a defect in the design, not a
specification — so exactly one treatment is chosen per role, the losing variant
normalises to it, and the choice is written down here before a line of it is
built.

Resolution order, from R8: (1) the design's own stated semantics decide;
(2) failing that, dominant usage wins; (3) failing that, it goes to the owner.
Every row says which of the three settled it. The rows marked
**Owner veto** are the ones rule 3 could not settle — they are listed again under
**Referred to the owner** at the end, with three further items that are not
contradictions at all. Seven rows were referred; five have since been ruled on
and two are still open.

Nine rows record rulings the owner has **already** made — L-36 to L-39, and
L-05, L-12, L-23, L-40 and L-10, ruled on 2026-08-19 as R27, R28, R29, R26 and
R36. Those outrank the deliverable outright, so they sit above rule 1 rather
than inside it; they are marked **Decided — owner ruling** and are here so this
document is complete on its own.

Counts are from `.superpowers/sdd/ui-design-spec.md`, which counted them in the
deliverables. The value chosen here is the value `ui/src/styles/roles.css` names,
and no later task may use another.

The line below is checked against the table by `ui/src/test/roles.test.ts`, so a
row cannot be dropped off the end of the ledger without the test noticing.

**61 rows: 60 decided, 1 referred.**

## Action versus state

Decided once, here, so no screen decides it again.

**An action and a state share the role’s hue and never its treatment.**
The hue comes from the role table: committed/accepted/approved/confirmed is
`--green #1F8A5B`; new and primary-forward is `--coral #FA5A52`;
danger/failure/conflict is `--conflict #E23D35`; primary is `--violet #4A25A9`.

- An **action** *fills* the hue: `background: <hue>; color: #fff; border: 0`, plus
  the hue's glow shadow. A confirm button is therefore `#1F8A5B` on white ink with
  `0 10px 22px -13px rgba(31,138,91,.9)`.
- A **state** *tints* the hue: `background: <hue-soft>; color: <hue>`, no shadow,
  no border. A confirmed badge is therefore `#1F8A5B` ink on `#E4F6EC`.
- The one bridge the design already draws is the **ghost action**: an action of
  lower commitment that borrows the state's tint and is told apart from a state by
  a `1.5px` border in the role's edge colour — affirmative ghost `#E4F6EC` /
  `#1F8A5B` / `1.5px #BFE5D0`; destructive ghost `#FFF3F2` / `#E23D35` /
  `1.5px #FDD9D6`.

So the answer to *“is the confirm button the same colour as the confirmed
badge?”* is **yes, the same hue; no, not the same treatment** — and a coral
confirm is the error, because green *is* accept/approve in the design's own
semantics, 38 times.

The owner's own ruling sits on top of this and is not re-litigated below:
**coral opens, violet commits.** Coral starts a creation flow («کاربر جدید»);
violet is the commit inside the form or dialog; `--conflict` stays destructive.

## The ledger

| # | Role | What the design showed | Count | Chosen, and why |
|---|---|---|---|---|
| L-01 | Screen title colour on the violet field | White on every other screen title; `#FBF7F1` on departments alone. `#FBF7F1` survives in exactly two places in 4018 lines: that H1, and the flow canvas | 10 vs 1 | **Decided — dominance.** `#FFFFFF` (`--card`, named as `--role-title-on-field`). `#FBF7F1` is the flow canvas's ground, and reading it as a title colour is what made `--bg` look like a page background. |
| L-02 | Screen title size | `22px` on seven screens (list, dept-info, users, access, audit, activity, policy); `23px` on the summary; `21px` on the profile; `34px` on departments | 7 / 1 / 1 / 1 | **Decided — dominance.** `22px` (`--fs-h2`) is the screen title; `34px` stays as the **home hero**, a different role, not a fourth size for the same one. Summary and profile normalise to 22. The step-by-step view's `26px` is the reading surface's document title (R3), not a fifth panel title. |
| L-03 | Coral button shadow | `0 12px 26px -12px` at screen level and `-14px` inside a drawer; the panel paints 3 and 2, the reader 2 and 3 | 5 vs 5 | **Decided — the token breaks the tie.** `-12px`. `--shadow-coral` is already that value, so one of the two variants is the agreed one. |
| L-04 | Dialog radius and shadow | `24px` plus a two-layer neutral shadow on four dialogs; `22px` plus the same on the comment-confirm; `20px` plus `--shadow-modal` on the conflict inbox | 4 / 1 / 1 | **Decided — dominance.** `24px` with `0 4px 10px rgba(16,10,40,.28), 0 44px 90px -30px rgba(16,10,40,.8)`. The inbox is the only dialog left on the old recipe. |
| L-05 | “Awaiting / needs attention” amber | `#8A5A00` in three status maps — comment awaiting, unconfirmed, approval-chain awaiting — for 7 uses; `#B4690E` on the sub-process tag and the department-card subs chip, 3 uses | 7 vs 3 | **Decided — owner ruling (R27): `#8A5A00`**, the dominant value, overturning the provisional pick below. The counter-argument was weighed and rejected: the design keeps the ICOM-exclusivity rule only once in four. `--warn` cannot be re-valued — it is `#B4690E` in the read-only design bundle — so `--role-awaiting` points at `--warn-fg`, which already holds `#8A5A00`. *Superseded reasoning:* provisionally `#B4690E` (`--warn`), chosen *against* the dominant value: `#8A5A00` is `--icom-control-fg`, and the ICOM palette is the one place the design says colour IS the meaning and never decorative, so a status may not borrow it. **That argument is weaker than it reads, and the owner should have the fact: three of the four ICOM hues are already shared with app-wide roles** — `#1F8A5B` is both `--icom-output-fg` and accept/approve (38 uses), `#4A25A9` is both `--icom-mech-fg` and primary (185 uses), `#1F6FB2` is both `--icom-input-fg` and `--info`. Only `#8A5A00` is exclusive to ICOM, so "a status may not borrow an ICOM colour" is contradicted by the design's own green. Semantics and dominance point opposite ways, which is precisely a rule-3 case. |
| L-06 | “Clear filters” link | `#7A52D0` on Users, `#E23D35` on User activity — same control, same copy | 1 vs 1 | **Decided — semantics.** `#7A52D0` (`--violet-mid`, named as `--role-link-quiet`). `--conflict` is declared *destructive and conflicts*, and clearing a filter destroys nothing. |
| L-07 | Department-info content width | `900px`; the sibling list screens are `920px` (`--width-list`) | 1 vs 2 | **Decided — dominance.** `920px`. 900 has no token, no role, and no reason. |
| L-08 | Scrollbar width | `12px` in `tokens/base.css`; `10px` in both deliverables' own style blocks | 1 vs 2 | **Decided — dominance.** `10px`. Both deliverables agree against the token file. |
| L-09 | Unchecked tick border | `#C9B8EC` everywhere; `#DCD3EC` on the visibility-policy rows | 13 vs 1 | **Decided — dominance.** `#C9B8EC`. `#DCD3EC` has no token and no role of its own. |
| L-10 | Checkbox tick size | `16px` nested view option; `17px` department scope and new-user scope; `18px` supervisor flag and “whole system”; `19px` policy row and confirmed tick (and the supervisor radio) | 1 / 2 / 2 / 2 | **Decided — owner ruling (R36).** **All four rungs are kept, exactly as drawn** — “checkbox should be like design. exactly like design.” The provisional two-by-role normalisation, which sent 17 and 18 up to 19, is **withdrawn**. Each rung is named for the site it is drawn at rather than for its number: `--size-tick` a tick in a screen row (panel 1764, 579, 600 — and 1470, the supervisor radio's ring), `--size-tick-field` a whole form field (1344, 1356), `--size-tick-scope` a department-scope cell (1369), `--size-tick-nested` a tick inside another option (1386). Every site in the column to the left was re-read against the deliverable and **the catalogue was right**. Two things it did not record: the **radius does not track the box** — 19, 18 and 17 are all drawn at 6 and only 16 at 5, so the mint adds no third radius — and the design draws a **fifth pairing**, 17px at radius 5 (1897, the new-user dialog's department dropdown), which this build has no site for because it draws that same choice as ScopePicker's cell grid |
| L-11 | Table-head background | Users head none; audit head none with `#F8F4FE` on its filter bar; activity `#F8F4FE` on both; the sessions-card head on User activity `#F8F4FE` | 2 unfilled vs 2 filled | **Decided — semantics.** `#F8F4FE` on the head and on an in-table filter bar: the design's own colour census names “table-header bg” as a role of `#F8F4FE`, and it is the only value any head paints. The Users filter bar is a detached card above the table on `#F4EFFB` — a different component, not a third variant. |
| L-12 | `ProcessTag.plain` | Byte-identical to `.kpi` — `--violet` on `--tile-v` | 2 of 5 tags indistinguishable | **Decided — owner ruling (R28).** A plain process draws **no tag**. A tag marks an exception (sub-process, conflict, KPI, tombstone); one that says «فرآیند» on a screen of processes marks nothing. The muted-skin alternative was offered and declined. Made structural rather than conventional: `deriveTag` returns `null`, `TagKind` has no `plain` member and `TAG_TONE` has no `plain` key, so no screen can render it by reaching for a tone that no longer exists. (The label was «مستند», not «فرآیند» as this row first recorded; the collision with `.kpi` is what the row is about and that was exact.) |
| L-13 | Reader compose drawer | Two drawers mount at once on the flow screen: 340 and 380px wide, padding 20 and 24, title 18 and 19, textarea 13.5 and 15.5, radius 12 and 14, submit violet and coral | 2 | **Decided — semantics.** One drawer, the panel's: `380px`, padding `20px`, title `18px`, textarea `13.5px`, radius `12px`, **violet** submit. The submit is a normal save, not a destructive-forward act, so coral is the error — coral opens, violet commits. |
| L-14 | Card on the violet field | White in both deliverables; cream `--bg` with `--shadow-card-dark` in the design system's `Card onDark`, `DepartmentCard`, `StatCard` and `Modal` | 2 deliverables vs 1 component layer | **Decided — dominance.** `#FFFFFF` (`--card`) with `1px solid rgba(42,29,94,.07)` and the two-layer neutral shadow. **`Card` therefore gets no `onDark` prop** — the cream-card idiom is unused by both deliverables and its two dark-screen shadows are dead. |
| L-15 | Card border | `rgba(42,29,94,.07)` at `1px`; `#EFE7DC` at `1.5px` on the comments-inbox list card and the unselected scope tile | 46 vs 2 | **Decided — dominance.** `1px solid rgba(42,29,94,.07)`, named as `--role-border-card`. No token held that value, so it is **minted** as `--border-card` in this task rather than reached by re-valuing `--warm`: `#EFE7DC` keeps its own role — the top-bar, flow-bar and drawer edges (`--role-border-warm`) — so correcting `--warm` would simply move the defect. |
| L-16 | Dialog title size | `18px` stated as the rule and used 11 times across dialog, drawer and pane titles; `17px` on the conflict inbox and the two confirm dialogs | 11 vs 3 | **Decided — dominance.** `18px` (`--fs-dialog`, named as `--role-fs-dialog`). The panel type scale gains the step in this task — see L-33. |
| L-17 | Line-height for prose | `1.7` ×22, `1.8` ×17, `1.9` ×14, `1.75` ×3, `1.85` ×2, `1.95` ×2, `2` ×2, `2.05` ×1 | 8 values | **Decided — dominance.** Three roles, three values: body copy `1.7`; explanatory sub-copy under a control `1.8` (`--role-lh-subcopy`); long-form prose — department description, comment body, step description — `1.9`. `1.75`, `1.85`, `1.95`, `2` and `2.05` normalise. |
| L-18 | Row transition | `.16s` on the two lifting surfaces; `.14s` on a users-table row | 2 vs 1 | **Decided — dominance.** `.16s` (`--duration`). `.14s` is not a token and nothing else uses it. |
| L-19 | The “more” affordance | A vertical kebab (three `r=1.8` circles at `cx=12`), the horizontal `InjaIcons.dots` (`cy=12`), and the literal character `⋯` in five places | 3 renderings | **Decided — semantics.** The vertical kebab SVG. `⋯` is a unicode glyph used as an icon, which the design forbids in the same breath it sanctions `⣿` and the ICOM arrows. |
| L-20 | Pill radius | `--radius-pill: 20px` in the tokens; `999px` in both deliverables | 0 vs 20+ | **Decided — dominance.** `999px`. Neither deliverable ever uses the token, and a 20px radius on a 24px-tall pill is visibly not a pill. |
| L-21 | Mono stack | `'JetBrains Mono',ui-monospace,SFMono-Regular,Menlo,monospace` written 23 times and **never loaded**; the token is `ui-monospace,'SF Mono',Menlo,Consolas,monospace` | 23 vs 1 | **Decided — semantics.** The token. The deliverable's first choice silently falls through to `ui-monospace` because no stylesheet it links loads JetBrains Mono, so the token is what the design actually renders. |
| L-22 | The add button | `ListEditor`'s inline add at `11px` and radius `9px`; the exported `AddButton` at `12.5px` and radius `10px` | 1 vs 1 | **Decided — semantics.** `AddButton`'s: `12.5px`, radius `10px`. It is the exported one, so it is the one a second caller would reuse. |
| L-23 | Close button | `32×32` radius 8 (drawer), `32×32` radius 9 (modal), `28×28` radius 8 (`DetailDrawer`), `34×34` radius 10 with a 19px glyph (new-user dialog) | 4 | **Decided — owner ruling (R29): one close button**, `32×32`, `--tile-v2` fill, radius `9px` (`--role-radius-close`), glyph `×` at `18px` in `--text-muted`. The box is settled — `32×32` is 2 of 4 — but **the radius is not, and dominance points the other way**: `8px` is 2 of 4 and `9px` is 1 of 4, and §4.4's own role map states *two* roles, `8px` for the drawer close and `9px` for the dialog close. Collapsing them to one radius was an invention until the owner made it a ruling; `8px` therefore stays **token-less on purpose**, and a later task reading §4.4 must not reintroduce it. Two outliers still normalise: `DetailDrawer`'s `28×28 r8` — which is in `src/flow/`, so it needs a fifth narrow unfreeze — and the new-user dialog's `34×34 r10`. |
| L-24 | FAB count-badge ring | `#2A1D5E` in the panel; `#FBF7F1` in the reader | 1 vs 1 | **Decided — semantics.** `#2A1D5E`. The ring exists to cut the badge out of the field it sits on, and that field is `#2A1D5E` on both surfaces; the cream ring is a stray light halo the reader's own spec calls a defect. |
| L-25 | Reader process-list empty state | Renders the search-miss copy «فرآیندی با این نام پیدا نشد» even when the department is simply empty, ignoring its own computed `emptyText` | 1 | **Decided — semantics.** The computed text. An empty department says «فرآیندی برای این دپارتمان ثبت نشده است.»; only a search with no hit says «فرآیندی با این نام پیدا نشد». |
| L-26 | Reader status vocabulary | Two maps, `RST` and `ST`: identical colours, different labels («رسیدگی شد» against «رسیدگی‌شده», «رد شد» against «رد شده»), and only one of them carrying `withdrawn` | 2 | **Decided — semantics.** `ST` — the panel's map, so one vocabulary serves both surfaces, and the one `cmtCard` already dereferences unguarded. `RST`'s labels normalise to it and `withdrawn` is carried into it, so the unguarded lookup cannot break. |
| L-27 | Panel body and dense sizes | `14px` ×27 (body copy, paragraphs), `13.5px` ×48 (menu items, dropdown values, sub-card titles, dialog buttons), `13px` ×73 (buttons, table cells, hints, list body), `12.5px` ×85 (controls, chips, labels, breadcrumb) | 4 sizes | **Decided — semantics.** Four roles, four sizes, no overlap: body copy `14px`; menu, dropdown and dialog-button copy `13.5px`; dense list, table and hint copy `13px`; control, chip and label copy `12.5px`. R3's “13–14px” names the range; this names which is which. The four roles are `--role-fs-body`, `--role-fs-menu`, `--role-fs-dense` and `--role-fs-control`; `13.5px` had no token and is minted as `--fs-menu` — see L-33. |
| L-28 | Subtitle colour on the dark field | `#B7A6E0` (`--violet-on-dark-body`, the correctly *named* token) on departments; `#C9BEEE` on every other panel screen and throughout the reader | 1 vs 13 | **Decided — dominance.** `#C9BEEE`. The role points at `--violet-on-violet`, whose declared role (“mono id inside a violet box”) is wrong but whose *value* is the design's, so the role renders correctly today rather than after Task 3. |
| L-29 | `StatTile` 4-up value | Audit: `23px`, centred. User activity: `21px`, line-height 1.2, start-aligned. Every other metric of the two grids is identical | 4 tiles vs 4 tiles | **Decided — owner rulings R14 and R51: `21px`, centred.** See **L-61**, which carries the reasoning: the owner supplied what the design never stated. *Superseded reasoning:* provisionally `23px` centred — `23px` is on the token scale (`--fs-h1`) where `21px` is one of the ten off-scale sizes, and start-aligned numerals read ragged across a 4-up grid. But the design states no reason for either and the count is an exact tie. |
| L-30 | Drawer shadow | `20px 0 50px -30px rgba(74,37,169,.5)` on the node and compose drawers; `24px 0 60px -30px rgba(16,10,40,.7)` on the department-comments drawer | 3 vs 1 | **Decided — dominance.** The 20px violet cut (`--shadow-drawer`). One drawer shadow, not one per drawer. |
| L-31 | Popover shadow | `0 20px 45px -20px rgba(74,37,169,.45)` on every dropdown and popover; `0 24px 50px -22px rgba(74,37,169,.5)` on the process-list export menu; `--shadow-pop` is a third value the deliverable never paints | 13 vs 1 vs 0 | **Decided — dominance.** `0 20px 45px -20px rgba(74,37,169,.45)`. Task 3 re-cuts `--shadow-pop` to it, so the token stops being a fourth opinion. |
| L-32 | `ConflictCard` compact variant | `fontSize: compact ? var(--fs-sm2) : var(--fs-sm2)` — a ternary whose two branches are the same value, inside a variant that genuinely changes eleven other declarations | 2 branches, 1 value | **Decided — semantics.** One size, `--fs-sm2`, in both variants; the ternary goes. A variant axis that reads as a choice and is not one is how the next inconsistency gets built in. |
| L-33 | Type sizes with no token | Ten of the twenty-four sizes the panel paints have none: 46, 26, 25, 21, 18, 14.5, 12, 10, 9.5, 9 — and `13.5px`, which the deliverable leans on 48 times, has none either | 11 token-less sizes | **Decided — semantics.** Three of them carry a role, so all three are minted **in this task** (`ui/src/styles/tokens.css`) and named in `roles.css`: `18px` → `--fs-dialog` / `--role-fs-dialog` (dialog title, L-16), `13.5px` → `--fs-menu` / `--role-fs-menu` (menu and dialog copy, L-27) and `12px` → `--fs-caption` / `--role-fs-caption` (caption, 38 uses). Minted, not corrected: every existing panel step keeps its value. `21px` normalises to `22px` (L-02). The rest are single-site literals and stay as written — the token file's own instruction is not to snap the half-pixel sizes to a scale. |
| L-34 | Reader screen-title scale | Home `26px`, process list `30px`, department info `24px` — so the reader's home hero is *smaller* than the titles beneath it, inverting the panel's own 34-over-22 relationship | 3 sizes, hero under title | **Decided — owner ruling (R37): kept exactly as the design draws it.** Verified against `tokens.css:208-210` — `26px` home, `30px` list, `24px` dept are the deliverable's own values, unchanged. Asked directly, the owner answered *should be like design too*. Recorded as a decision rather than left looking like an oversight. *Original reasoning:* kept as written, because R3 is an owner ruling and the reader is a different surface at a different scale. Recorded anyway because it reads as a defect rather than a decision, and only the owner can say which it is. |
| L-35 | Secondary body ink | `#5a5175` carries all secondary body copy (27 uses in the panel, 14 in the reader); `--text-body`, the token named for exactly that role, is used by nothing | 41 vs 0 | **Decided — dominance.** `#5a5175`. `--role-ink-body` points at `--text-current`, whose declared role (“conflict current value”) is wrong but whose value is the design's. Task 3 may rename the token; the role does not move when it does. |
| L-36 | Coral against violet on a forward action | Coral fills «فرآیند جدید» and «کاربر جدید» and the reject commit; violet fills «ذخیره», «ایجاد کاربر» and «ثبت کامنت». The reader's second compose drawer submits an ordinary save in coral | 1 site disagrees | **Decided — owner ruling.** **Coral opens, violet commits.** Coral is the affordance that *starts* a creation flow, and it stays on a destructive-forward commit (a reject) because `--coral`'s declared role covers that; violet is the ordinary commit inside a form or dialog; `--conflict` stays destructive. The one coral save is the error — see L-13. |
| L-37 | Password reset | Access panel 3 draws «ساختن لینک بازنشانی», and both it and the profile note state that no password is ever created or shown. The product has `POST /api/users/{id}/password`, an administrator-chosen value, and **no reset-link route at all** | design 2 sentences vs D15 | **Decided — owner ruling.** D15 wins over the design: the administrator types the value and tells the person, because this system is Telegram-fed and has no delivery channel. Build the design's shell around the app's own control and **rewrite the two sentences** that describe a link. A button for a route that does not exist is a control that answers 404, which R5 forbids. |
| L-38 | The profile's open-sessions card | A second profile card, «نشست‌های باز», listing each open session with a revoke button | 1 card | **Decided — owner ruling.** It is not built: not drawn, not stubbed, and no `/api/auth/sessions` route is added. The owner removed the feature from the product. A deliberate divergence from the deliverable, recorded so it is never read as drift. |
| L-39 | Icons the design never draws | Only 11 of the 33 `InjaIcons` paths are fixed, and seven glyphs the panel actually renders have no key at all: the breadcrumb house, the hamburger, the users filter funnel, the eye and eye-off, the FAB comment mark and the sign-out mark | 11 of 33 specified | **Decided — owner ruling.** The 29 unspecified icons are authored to the set's own construction rules — a 24×24 box, `stroke="currentColor"`, `fill="none"`, round caps and joins, stroke `2.2`–`2.6`, matching joinery and optical weight. **The authored paths are not appended here.** This document is the owner's veto point on a fixed set of normalisations; a ledger that grows after it is reviewed is no longer a veto point. Each authoring task instead records its path in its own report, and the icon module carries a header comment listing which of its keys are design-fixed and which are authored — so the owner reviews the set in one place, `ui/src/ui/icons/index.tsx`, rather than discovering them in the app. |
| L-40 | Control and input radius | Three heavily-used steps for one family of controls: `12px` (primary button, input, card-in-a-drawer, tab tray, dialog action), `11px` (secondary/ghost button, menu row, tile, back button, small input), `10px` (control, menu item, actor pill, pager button, tab pill). The token set names all three — `--radius-md`, `--radius-input`, `--radius-control` | 72 vs 38 vs 23 | **Decided — owner ruling (R26): the three-rung ladder STAYS.** 12px button, 11px input, 10px control; **zero sites change**. The design is *consistent* about the ladder, which makes it a deliberate hierarchy rather than a contradiction, so the simplification is declined. **This row was also wrong about the product:** it recorded the collapse as though it had happened, but `--role-radius-control` and `--role-radius-input` had **zero consumers**, so all sixty sites painted the ladder through the raw tokens the whole time — the L-41 defect, a semantic layer nothing reads. The utilities now resolve *through* the role names, so record and paint cannot drift apart again. *Superseded reasoning:* provisionally `12px` for both, which normalises **61 sites** — the largest single visual change in the role table. It is referred rather than decided because neither rule reaches it: §4.4's role map assigns the three steps to *different* components consistently, so this is not the design contradicting itself, and dominance only decides a tie between variants of one role. If the owner keeps the ladder, the two tokens gain roles of their own and no value moves; if the owner takes the normalisation, 11 and 10 disappear from the product. |
| L-41 | Two semantic layers for type | `ui/src/styles/tokens.css` already declares an F8 set — `--fs-role-body/-caption/-title/-subtitle`, `--lh-role-body/-prose`, with `[data-shell='panel']` and `[data-shell='reader']` overrides — and **nothing consumes any of it**. Its names are transposed against this task's set (`--fs-role-*` against `--role-fs-*`) and two of its values disagree: `--lh-role-body` is `1.6` where `--role-lh-body` is `1.7` (L-17), and its reader `--fs-role-title` is `27px`, the staff-guide document title, where the reader's own titles are 26/30/24 (L-34) | 0 consumers vs the whole role table | **Decided — semantics.** `roles.css` is the single semantic layer; the F8 set is retired by Task 3 when it re-cuts `tokens.css`, and no task may read a `--fs-role-*` or `--lh-role-*` name. Recorded because the two vocabularies differ by word order alone, so a later task reading the wrong one would get `1.6` where the design says `1.7` and never notice. R3's surface-awareness survives: the reader shell overrides the `--role-*` values themselves, which is one vocabulary at two scales rather than two vocabularies. |
| L-42 | Stacking order — the z-index ladder | No ladder. The two deliverables write 26 distinct z-index values over 50 declarations, from 15 to 80, with no token, no comment and no value standing for a role. The same Dropdown popover is written 25, 27, 30, 35, 37, 39 and 57 — differing only by how deeply its anchor happens to be nested — and a modal scrim is 50, 55 or 62 depending only on which screen raised it. Six product roles are legible beneath the numbers: in-canvas drawer, app chrome, anchored popover, floating action, overlay, toast | 26 values, 50 declarations, 0 tokens | **Decided — owner ruling.** The ladder is built on a STANDARD and is not reverse-engineered from these numbers. Adopted: **Bootstrap 5's documented `$zindex-*` scale** — a published table of role-named rungs rather than a framework internal, and the only mainstream scale whose rungs cover this app's role set (it is the one that ships both an offcanvas rung and a `fixed` rung; MUI puts its FAB *below* the app bar and has no dropdown rung, Chakra has neither a drawer nor a floating rung). Mapping, role for role: anchored popover — dropdown, select menu, kebab, export menu, date picker — takes `$zindex-dropdown` 1000; app chrome — top bar, flow bar, breadcrumb strip, reader back bar, sticky table head — takes `$zindex-sticky` 1020; the FAB takes `$zindex-fixed` 1030; drawer, bottom sheet and mobile full-bleed pane take `$zindex-offcanvas` 1045; modal scrim and box take `$zindex-modal` 1055; the toast takes `$zindex-toast` 1090. `$zindex-popover` 1070 and `$zindex-tooltip` 1080 are reserved for a portalled popover or tooltip and are consumed by nothing today. Nesting adds **1** inside the rung's own band rather than 10 across bands, so fifteen stacked overlays fit beneath the reserved 1070 where the deliverables reach two. The inventory still validates the mapping rather than dictating it: the two boundaries the deliverables genuinely force are FAB-under-scrim (verified co-occurrence — the conflict inbox and the confirm-content dialog both open on screens where `showFab` is true) and toast-over-overlay (`ui/src/ui/Toast.tsx` already documents a static 60 losing to a third stacked scrim), and Bootstrap orders both the same way. The rungs are named by role in our own tokens — `--role-z-dropdown`, `--role-z-chrome`, `--role-z-floating`, `--role-z-drawer`, `--role-z-modal`, `--role-z-toast` — so no number reaches a component and `guards.test.ts` sees no t-shirt size |
| L-43 | Popover stacking — dropdown, menu, kebab, date picker | One component at seven values: 25 on the process-list export menu and both flow overflow menus, 27 on a process-row kebab, 30 on the top-bar admin menu, 35 on the Access role select, 37 on the Users filter and both date pickers and both activity selects, 39 on the scope-views select one level deeper, 57 on the three selects inside the new-user dialog. Every value is exactly high enough to clear whatever its own anchor happens to sit in, and nothing else | 15 popovers, 7 values | **Decided — semantics.** One role, one rung: `--role-z-dropdown`, Bootstrap's `$zindex-dropdown` at 1000. A value that moves with nesting depth and not with what the element IS records no distinction, so there is none to preserve. The 57 case is why the rung needs no variants — a popover is always a DOM descendant of what it is anchored in, and an overlay's scrim carries a z-index, so it forms a stacking context and a select opened inside a dialog resolves against that dialog's own children rather than against the page. The standard placing a dropdown *below* the chrome rung (1000 under 1020) where the deliverables put every popover above it, 15 to 0, is safe in this layout and is a reading rather than a concession: the root is `height:100vh` with `overflow:hidden` and the bar is `flex:none`, so content scrolls inside its own box and never passes under the chrome, and all fifteen popovers open downward (`top: calc(100% + 6px)`), so none can be clipped by it |
| L-44 | Modal, drawer, bottom sheet and mobile full-bleed pane | Scrims at 50 (conflict inbox), 55 (change supervisor, new user, views, confirm content) and 62 (confirm comment decision); over-page drawers at 56 (department comments) and 58 (compose); the mobile nav sheet at 60; the mobile full-bleed comment detail at 45 — seven values for one family, with the drawers written ABOVE the dialogs | 16 declarations, 7 values | **Decided — semantics.** Two rungs taken from the standard, not one and not seven: a dialog takes `--role-z-modal` (`$zindex-modal` 1055) and a drawer, bottom sheet or full-bleed pane takes `--role-z-drawer` (`$zindex-offcanvas` 1045). That maps one-for-one onto the `presentation` prop `ui/src/ui/Overlay.tsx` already carries, whose two values are `dialog` and `sheet`. The standard putting a drawer *below* a dialog where the deliverables put it above costs nothing, because the two never co-occur: `openComposeDept` closes the department drawer before opening the compose drawer, `showFab` is false whenever either is open, and the confirm-comment dialog is never raised over a drawer because the drawer's comment cards carry no decision buttons. The four values that are neither dialog nor drawer resolve by role — the mobile nav sheet is an offcanvas, and the ≤760 block that rewrites the compose drawer into `position:fixed; inset:0` with the modal scrim is presentation, not role |
| L-45 | Drawers inside the flow canvas | The flow detail drawer at 15, the flow comments drawer at 16, and the reader's in-canvas compose drawer at 17 — three drawers at one geometry (`position:absolute; top:0; bottom:0; left:0; width:340px`), numbered in the order a person opens them rather than by what any of them is | 5 declarations, 3 values | **Decided — semantics.** One rung, `--role-z-canvas-overlay`, plus the same opening-order ordinal every overlay gets. These three genuinely overlap and genuinely co-occur — the detail drawer and the comments drawer are independent flags in both deliverables — so something must win, but nothing about what they ARE says which. The rung's value is **not chosen**: `ui/src/flow/DetailDrawer.tsx` writes `z-[15]` and `ui/src/flow/**` is frozen, so 15 is dictated by a file this project may not touch. It sits below the lowest rung of the adopted scale by 985, which is what makes the freeze harmless |
| L-46 | The dismiss backdrop under a popover | An invisible `position:fixed; inset:0` click-catcher sits under six of the fifteen popovers, always at exactly one below the popover it dismisses — 24 under 25, 26 under 27, 29 under 30, 34 under 35, 36 under 37, 38 under 39 — and is simply absent under the other nine, which dismiss on nothing at all | 6 of 15 | **Decided — semantics.** The role is deleted, not renumbered. It is a technique for catching an outside click in hand-written HTML, and this codebase already has a better one: `ui/src/ui/Menu.tsx` dismisses on a document `mousedown` and joins `dismissibleStack` for Escape, with no element and no z-index of its own. Deleting it is also what lets a ladder be a ladder — a rung whose only purpose is to sit one below another rung is not a role, and six of the deliverables' twenty-six values exist for no other reason |
| L-47 | The toast | 80 in both deliverables — the single highest value either file writes, and the only one nothing else comes within eighteen of | 2 of 2 | **Decided — semantics.** `--role-z-toast`, Bootstrap's `$zindex-toast` at 1090. The ladder is adopted rather than derived, so the deliverables' 80 carries the ORDER — a toast is the ceiling — and not the value. The app has already reached this rung twice and disagrees with itself: `ui/src/ui/Toast.tsx` documents that a static 60 falls behind the topmost scrim once three overlays are open and sets 100 for that reason, while `ui/src/write/ToastProvider.tsx` still ships the 60. Two toasts, two values, one of them known-broken; both collapse onto this rung |
| L-48 | Checkbox “on” fill | Violet `#4A25A9` on the supervisor flag, the whole-system scope, the department scope row, the nested view option and the new-user scope option; green `#1F8A5B` on the visibility-policy row. The supervisor radio's picked dot is violet. Green appears twice more and neither is a checkbox: on the capability rows, which the panel computes and never renders, and on the flow screen's confirmed tick, which is driven by `isConfirmedNow` | 5 violet vs 1 green | **Decided — owner ruling.** **Violet `#4A25A9`.** Stated by the owner directly rather than read off the deliverable — though dominance (5 to 1) and semantics both point the same way, so nothing here is being overruled. The visibility-policy row's green normalises to violet. **This does not disturb the colour table**: green remains committed / accepted / approved / confirmed, because a checkbox in the “on” state is a CONTROL and not a confirmation — the same action-versus-state line this ledger already draws at the top. The flow screen's confirmed tick keeps its green precisely because it *is* the state, and the radio's violet dot was already on the right side of that line |
| L-49 | Where «بازگشت» lives on the flowchart | The two deliverables disagree. Panel `:558-613` draws `data-r-flownav` with **no back button**, and carries «بازگشت» in the crumb strip above. Reader `:312-316` draws «بازگشت» as the toolbar's first child (`data-r-flowback`) and **no bar at all** | 2 surfaces, opposite | **Decided — owner ruling (R41).** Exactly one «بازگشت» per screen, on every route but `/departments`, counted rather than looked for. The doubling was `PanelShell` lacking the `onFlow` guard `ReaderShell` already had, so the strip and the toolbar both drew one. **Known deviation, recorded not smoothed:** on the panel the design puts it in the strip and none in the toolbar; this build leaves it in the toolbar. Same count, same destination — one `FlowScreen` serves two contradictory deliverables, and the reader is stranded without the toolbar's (R21). Design-exact repair is one `useSurface()` branch in `FlowScreen.tsx` plus deleting the `!onFlow &&` guard, whenever that file is next opened. |
| L-50 | The «اطلاعات کلی» button on a process row | Drawn on every row, including rows whose summary, IDEF0 and KPIs were all withheld — a door to a page with nothing on it | 1 | **Decided — owner ruling (R39).** Withheld when all three switchable fields arrive blank. **R5:** never draw a control you would refuse. It discloses nothing: the list already receives each row through the *same* `Disclosure` the summary endpoint runs, so no count, flag or new payload crosses the wire, and the answer is identical for "withheld" and "never recorded" — a button that vanished only for *withheld* would be a policy oracle drawn one row at a time. The predicate lives once, in `src/lib/published.ts`, shared with `Summary`; their agreement is proved rather than asserted — turning that predicate's OR into an AND reddens 6 tests in one and 4 in the other. |
| L-51 | The flowchart screen's ground | `#FBF7F1` (`--bg`), the flow canvas's own ground — see L-01. The screen inherited the shells' `--ink` field instead, because `FlowScreen` declared no background of its own and the shell rebuild moved both roots to `bg-ink` | 1 | **Decided — owner ruling (R40).** Cream, on both surfaces and for every role, **declared by `FlowScreen` itself** rather than inherited. The shells keep the violet field — every other screen belongs on it — and an e2e assertion pins that, so the wrong fix (reverting the shells) fails. `Canvas.tsx` stays unchanged: `@xyflow`'s `.react-flow` is transparent, so the cream shows through exactly as it did at the merge base. Confirms L-01 and turns it from an inheritance into a declaration. |
| L-52 | What a non-editor sees where a withheld field would be | §6.3 says a non-editor sees a *stated limit, not a blank*, and Task 16 built that card. But `Inja Panel.dc.html` :409–:463 wraps the A-0 card, its heading, the KPI heading and both KPI states in **one `sc-if isEditor`** — a non-editor is drawn nothing at all | design vs §6.3 | **Decided — owner ruling (R43).** Nothing at all: no heading, no card, no sentence. §6.3 is **overruled for this screen**, on the owner's general rule — *"if a user couldn't see anything, we shouldn't see anything about it."* A heading is itself a disclosure. The three switches stay independent, so a field that survives still draws normally with its heading. `IDEF0_NOT_SHOWN` and `KPIS_NOT_SHOWN` are deleted as unreachable. **Note for a later reader:** the design *does* carry a stated-limit sentence at :402–:407, but under `sc-if isOverseer` — a deliberate role this product has no variant of, so it is not the non-editor case. |
| L-53 | Which edge an off-canvas panel stands on | Every drawer in both deliverables is pinned `left:0` — Panel `:804`, `:900`, `:1965`, `:1998`; Reader `:564`, `:659`, `:681`, `:904`, `:941` — and `--shadow-drawer` (`20px 0 50px -30px`) casts to the right, which is the shadow a panel on the left throws. In an RTL document `left` is the inline **END**. `Overlay.tsx` said the opposite in as many words | 9 drawers, 0 on the inline start | **Decided — owner ruling (R45).** `presentation="sheet"` anchors to the inline END. Fixed on the **shared rule**, not the one caller: the side was wrong for every sheet and the panel's nav is merely the first built. It now opens from the same edge as the `margin-inline-start:auto` cluster holding its opener (`:150`, `:165`, `:189`). **The shape is a separate, settled question:** the deliverable's mobile menu (`:2072-2073`) is a full-width bottom sheet at *every* width; this build keeps a 340px drawer above 760. **Owner ruling R50 keeps the drawer** — the platform convention over the drawing, chosen knowingly. |
| L-54 | A sheet row's text alignment when the row is a `<button>` | `text-align:start` on every sheet row (Panel `:2083`, `:2093`). `SHEET_ITEM` omitted it, which cost nothing on the four `<a>` rows and **centred the two `<button>` ones** — Chrome's UA stylesheet writes `text-align:center` on a button and it inherits into the `flex:1` label span | 2 of 6 rows | **Decided — the design's own declaration.** `text-start` on the one class string every row wears, fixing the cause once. **A recurrence:** Task 12 fixed the `justify-content` half of the same cascade. It came back because **jsdom has no UA stylesheet**, so every class assertion passed while the text was visibly centred, and the e2e row test read `getByRole('link')` — the four rows that were never broken. The guard against a third occurrence is that the spec now collects rows **by element kind** and pins each count above zero. |
| L-55 | Where a process confirmation is drawn | The act sits in the flow bar's `data-r-actions` on both surfaces (panel 597-608, reader 357-368); the summary's action group holds only «ویرایش اطلاعات» (panel 393-396) and its badge row keeps a status pill (panel 389) | 2 surfaces agree | **Decided — owner ruling (R46).** The **act** moves to the flowchart; the **mark** stays on the summary as a status. The design proved more precise than the ruling, which said only "accept or reject should be in flowchart page" — following the deliverable separated the two halves correctly. `Overview`'s own `ConfirmMark` is untouched: it confirms a **department's general information**, which FR-V1 names as a separate target. |
| L-56 | The confirmed tick's colour on the flow bar | L-48 made every `TickBox` violet and reserved green for the confirmed *state*, naming this element as the one exception. The design draws a green tick here | 1 | **Owner veto — the only row still referred.** There is no green rung on the tick ladder, so the design's green tick is currently undrawable without a mint. Left undrawn rather than silently violet, because L-48's whole point was that a control and a state are different things. |
| L-57 | The flow bar's ⋯ menu, and the ≤760 action collapse | The panel replaces `data-r-actions` and `data-r-flownav` with a `34×34` ⋯ at ≤760 (panel 99, 102); the reader keeps its actions and draws no ⋯ (reader 113, 118) | 2 surfaces, deliberately different (R3) | **Decided — owner ruling (R46), built by R47.** Blocked until then on a 225px popover width that no token held — `tokens.css:548-554` had named those very design lines and said *"a later screen whose menu genuinely wants 225 mints its own name"*, and this was that screen. Known deviation: the collapse is gated on `!editing`, because the design draws no flowchart edit mode at all and hiding that toolbar would strand a phone mid-edit. |
| L-58 | The confirm control's ink on the white flow bar | The design's `7px 12px` pill (panel 599, reader 359) carries its label at **3.72:1** unconfirmed and **3.86:1** confirmed against the white bar | 2 states | **Decided — owner ruling (R48): drawn, with darker ink than the design.** The owner was shown the measurements in plain language and chose readability over colour fidelity, their stated reason being that staff read on phones, in a kitchen and on a floor (NFR-15). The divergence is the *ink only*; padding, shape and placement are the design's. |
| L-59 | The reader flow bar's department crumb | `deptName` at **3.72:1** and its «/» separator at **1.44:1** on the same white bar (reader 317-318) — the separator effectively invisible | 2 | **Decided — owner ruling (R48), same choice as L-58.** At 1.44:1 the separator failed even R13's deliberately relaxed census floor of 2, so this was never merely an AA question. Minted and left unwritten by R47 rather than shipped unreadable; drawn now at readable ink. |
| L-60 | `data-r-actions` is unreachable on the reader surface | Reader 357-368 draws a confirm control and an «ویرایش» under `showEditTools` | 1 | **Decided — owner ruling (R49): the reader's flow bar draws neither.** `selectShell` (F2) sends every holder of `edit` or `confirm` to the panel, so **no session that can reach the reader flow bar could ever be offered either control**. A deliverable/spec conflict rather than a build gap. Recorded so a later reviewer comparing screen to drawing does not "restore" two controls nobody can use. |
| L-61 | The 4-up stat numeral | Audit draws `23px` centred; User activity draws `21px` start-aligned. Every other metric of the two grids is identical | 4 tiles vs 4 tiles | **Decided — owner rulings R14 and R51.** `21px`, **centred** — the alignment from R51, the size confirmed twice. **This closes L-29**, which recorded the exact four-to-four tie with no stated reason on either side; the owner supplied the reason. |


## Referred to the owner

**One** row above, plus three items that are not contradictions and cannot be
resolved by looking harder at the design.

> All seven of the original referrals are now ruled. On 2026-08-19: **L-05** (R27),
> **L-12** (R28), **L-23** (R29), **L-40** (R26). On 2026-08-20: **L-10** (R36, all
> four tick rungs kept exactly as drawn), **L-29** (R51, via L-61) and **L-34**
> (R37). The last of these were put to the owner in plain language at their own
> request, after they said they could not follow the shorthand — and three of those
> answers confirmed existing behaviour and changed no code, which is precisely why
> they are recorded here instead of nowhere. The single row below is new, raised by
> the flowchart work.

1. **L-56 — the confirmed tick's colour on the flow bar.** L-48 reserved green for
   the confirmed *state* and made every control violet, naming this element as its
   one exception. The design draws a green tick here, and the tick ladder has no
   green rung, so it cannot be drawn without a mint. Left undrawn rather than
   silently violet — a violet tick here would erase the very distinction L-48 drew,
   that a control is not a confirmation.
2. **The Users screen has no subtitle.** Every one of the thirteen panel screens
   carries a one-sentence subtitle saying what the screen is for; Users has the
   slot and it ships empty. The copy does not exist in the design and cannot be
   inferred — it has to be written.
3. **The department card's heavier rest shadow.** The one feature card carries
   `0 2px 4px rgba(16,10,40,.18), 0 22px 46px -20px rgba(16,10,40,.65)` where
   every other surface carries the standard two-layer card shadow. Read as
   deliberate (a feature card is its own role) and therefore *not* normalised —
   but it is a single use against 25, so if the owner reads it as drift instead,
   it collapses into `--role-shadow-card` and the home screen flattens by one
   notch.

4. **The two z-index values in `ui/src/flow/**` that the adopted scale cannot
   reach.** That directory is frozen, so neither can be corrected by this
   project. `DetailDrawer.tsx`'s `z-[15]` is harmless and is simply adopted as
   the value of `--role-z-canvas-overlay` (L-45). `DeleteNodeConfirm.tsx`'s
   `z-[70]` is not: under a scale that begins at 1000 it lands *below* every
   rung, the dropdown at 1000 included, so an open menu would paint over that
   confirmation's scrim. **Nothing collides today** — the flow screen raises it
   only after closing the drawer, its toolbars carry no popovers, and
   `DetailDrawer`'s inner select at `z-20` is local to the drawer's own stacking
   context and can never reach it. It is recorded because it is a latent
   conflict the ladder creates and cannot fix from outside `flow/`, and the
   correction is one line whenever that directory thaws.

   For completeness, what the flow canvas occupies and why the adopted scale
   clears it: `@xyflow/react` paints background `-1`, pane `1`, viewport `2`,
   node selection `3`, renderer `4`, panel — the `Controls` — `5`, and selection
   `6`. Its one high value, `svg.react-flow__connectionline` at **1001**, would
   otherwise land between the dropdown and chrome rungs; it renders inside
   `.react-flow__viewport`, which always carries an inline `transform` and
   therefore always forms a stacking context, so that 1001 is contained and
   never reaches the page. The canvas's effective range in the app's own
   stacking context is **1 to 6**, clear of the adopted scale by three orders of
   magnitude.

---

## Closing state — Task 25

`PENDING_REBUILD` is gone. `UNPOLICED` holds `src/flow/` alone, permanently and
under F16, and it is now the only directory under `src/` that F6/F8/F10 do not
police. `src/screens/` and `src/write/` had been exempt for the whole of this
rebuild, which means every one of Tasks 14–24 was graded with the guards partly
switched off; turning them on found four real defects and no false ones.

The guard now catches every arbitrary Tailwind value (not the three utilities
that happened to be listed), `rgb`/`rgba` literals, raw px in stylesheets, a
native form control left for the operating system to paint, and Tailwind's own
numeric spacing scale. The `dir=` island list is derived from a scan and
asserted rather than declared and trusted — it was wrong in five places and
incomplete by four when the exemption came off. Comments are stripped before
matching in the four new checks and in none of the old ones, which is a
deliberate split: three files are written around the fact that the island and
palette scans read prose as code.

A browser sweep covers all nine screens at 1440 / 1080 / 760
(`ui/e2e/sweep.spec.ts`, 27 cases): the screen on §9.1's field, Vazirmatn
loaded, RTL, no sideways scroll, no latin numeral outside a declared island, no
console error. `signIn` is swept as the one deliberate exception and pinned in
both directions.

### What did not close, and why

1. **R11's ledger cannot reach 0, and no longer says it will.** It was named
   `PENDING`, it claimed every line was a screen that had not landed yet, and it
   carried an instruction that Task 25 assert it empty. 24 tasks later 129 lines
   remain, and they are not late: 89 of them are the sole utility name for a
   token declared in `design/_ds/…/tokens/*.css`, which is read-only
   specification. Deleting the utility strands the token and turns `leaves no
   declared token without a utility name` red; the only fix for that is deleting
   the token, which this repo may not do. The design system is larger than this
   product. It is `UNPAINTED` now, with a derived census — 40 are a second
   spelling of a value the app does paint, 89 are painted nowhere for a reason
   declared per family — and a test that fails when a new orphan matches
   neither. The ceiling follows it to exactly 129 and loses the headroom it
   carried while tasks were still landing.

2. **Three values had no token; one was minted and two must not be.**
   `--pad-toast-x: 20px` is the toast's inline padding, `padding:12px 20px`
   (reader 978) — a design number with four owners in `tokens.css` and none of
   them a toast, written as Tailwind's own `px-5` by both toast components. The
   other two are NOT design numbers: the reorder modal's 3px drop indicator was
   `h-[3px]` before Task 24 and the design draws no drag-reorder affordance at
   all, and the export menu's 288px was `w-[288px]`, which Task 24's own report
   calls "itself not a design number" — it is `min-w-menu` now, the role, and
   sizes to content above 265. Minting either would make an invention permanent.
   **The 3px indicator keeps `h-hint`, which is the right value under the wrong
   role** (`--space-hint` is "a hint under its label"), and that is the one
   thing here still worth an owner's word.

3. **`src/ui/Menu.tsx` has no production consumer, and four popovers reimplement
   it.** `ExportMenu`, `ProcessList`'s `⋯` and `PanelShell`'s admin menu each
   carry a comment saying they would be `Menu` if it could express an icon
   trigger, link items or a second line, and `Menu` itself is rendered only by
   `controls.test.tsx`. Recorded rather than closed: widening a shared primitive
   and re-adopting it on three screens is its own change with its own browser
   pass, and `min-w-menu` reaches the stylesheet through the unused component
   alone.

4. **Two toast systems are mounted at once.** `main.tsx` mounts
   `src/write/ToastProvider.tsx` and `AppShell` mounts `src/ui/Toast.tsx` inside
   it, so nothing calls the second one's `useToast`. Its own comment deferred
   consolidation to "the plan that rebuilds `src/write/`", which was Task 24.
   Both now write the design's numbers; which one survives is a product call.

5. **`src/screens/UserFields.tsx` keeps its own sub-panel.** `SectionCard` took
   `label`, `data-card`, `actions` and §6.8's two missing skins, and `Profile`
   and `UserDetail` are the shared box again. `UserFields` is not, because §6.14
   draws the dialog's sub-panels at 16px against R8's 18px, and settling that
   inside the component means a `pad` prop — a density knob on a shared
   component, which F4/F8 forbids.

6. **`src/styles/base.css` keeps three literals, declared in the guard.** F11's
   3px focus ring (the radius ladder has no 3px rung and the two 3px spacing
   tokens are a hint's offset and the flow nav group's gap) and the two login
   orbs' diameters, which are byte-faithful to the design system's own
   `Login.jsx`. Their four physical offsets are negative and the px regex cannot
   reach a `-140px`; recorded so whoever closes that hole knows what it surfaces.

7. **`src/test/roles.test.ts` reads `.superpowers/sdd/ui-owner-rulings.md`,**
   which is gitignored. The file cannot run from a clean checkout of this
   repository — it fails at import with `ENOENT`, not as an assertion. Found
   while mutation-grading in a private tree.

### Still frozen, still wrong — `src/flow/**` (F16)

Reported, never edited. The exemption was hiding: 14 hex literals, ~60
arbitrary `[…]` lengths, Tailwind's own palette and radii, ten `dir=` islands
(now declared, so the island list is the whole truth about the app rather than
about what is scanned), and two stacking values the adopted ladder cannot reach.
`DeleteNodeConfirm.tsx:3` is the sixth hand-rolled scrim in the app — `fixed
inset-0`, the scrim colour as an `rgba()` literal, and `z-[70]`, which under a
scale beginning at 1000 lands below every rung including the dropdown.
`DetailDrawer.tsx:135` writes `z-20` where `tokens.css` names that file as
`--z-canvas-overlay`'s one intended consumer. Nothing collides today; both are
one line whenever that directory thaws.

### Open for the owner

Every one of these was recorded rather than chosen silently, and none is
blocking.

| Ref | Question |
|---|---|
| A1, P2 | The design's Access and Profile both describe a one-time reset **link**; this product has an administrator-chosen password (D15). Is the link wanted, or is the design out of date? |
| A2 | §6.9's change-supervisor modal and §6.8's inline edit mode both have no counterpart: `EditUserDialog` owns role, scopes and supervisor together because the server re-validates them together. Keep one dialog? |
| D3 | The design calls the flowchart report «سند فلوچارت» (nine times in each deliverable); `REPORT_KIND_LABELS` calls it «مستندات کامل», pinned to `exports.EXPORT_KINDS`. Which name is the product's? |
| D4 | Coral is the *new-affordance* role and violet the commit (§6.7 vs §6.14). The readme's blanket "coral for anything primary" contradicts both deliverables. Confirm the rule. |
| V1 | §6.12 has a seventh policy row, «نام گام و ترتیب گام‌ها», on and locked. It is not a server field, and R5 forbids drawing a locked control. Should it become one? |
| T-1 | The reorder modal's drop indicator is 3px on `--space-hint`, a token minted for a hint's offset. The design draws no drag-reorder affordance, so there is no number to read. Keep the borrowed role, or is the modal itself out of scope? |
| P1 | ~~The open-sessions card~~ — **answered.** The owner removed the feature: «I don't need open session card in profile. delete it from ui.» Not built, not stubbed, no route added. Task 22 records the divergence. |

Two ledger rows remain referred and are **not** settled here: **L-29** (the 4-up
stat value) and **L-34** (the reader's title scale). So does the Users screen's
missing subtitle, which is unwritten copy that exists nowhere in the design and
cannot be inferred. **L-10** (the checkbox tick size) was referred until
2026-08-19, when the owner ruled on it as **R36**: all four rungs the design
draws are kept, exactly as drawn.
