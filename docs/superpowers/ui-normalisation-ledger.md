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
Every row says which of the three settled it. The five rows marked
**Owner veto** are the ones rule 3 could not settle — they are listed again under
**Referred to the owner** at the end, with two further items that are not
contradictions at all.

Four rows (L-36 to L-39) record rulings the owner has **already** made. Those
outrank the deliverable outright, so they sit above rule 1 rather than inside it;
they are marked **Decided — owner ruling** and are here so this document is
complete on its own.

Counts are from `.superpowers/sdd/ui-design-spec.md`, which counted them in the
deliverables. The value chosen here is the value `ui/src/styles/roles.css` names,
and no later task may use another.

**Thirty-nine rows: thirty-four decided, five referred.**

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
| L-01 | Screen title colour on the violet field | White on every other screen title; `#FBF7F1` on departments alone. `#FBF7F1` survives in exactly two places in 4018 lines: that H1, and the flow canvas | 10 vs 1 | **Decided — dominance.** White. `#FBF7F1` is the flow canvas's ground, and reading it as a title colour is what made `--bg` look like a page background. |
| L-02 | Screen title size | `22px` on seven screens (list, dept-info, users, access, audit, activity, policy); `23px` on the summary; `21px` on the profile; `34px` on departments | 7 / 1 / 1 / 1 | **Decided — dominance.** `22px` (`--fs-h2`) is the screen title; `34px` stays as the **home hero**, a different role, not a fourth size for the same one. Summary and profile normalise to 22. The step-by-step view's `26px` is the reading surface's document title (R3), not a fifth panel title. |
| L-03 | Coral button shadow | `0 12px 26px -12px` at screen level and `-14px` inside a drawer; the panel paints 3 and 2, the reader 2 and 3 | 5 vs 5 | **Decided — the token breaks the tie.** `-12px`. `--shadow-coral` is already that value, so one of the two variants is the agreed one. |
| L-04 | Dialog radius and shadow | `24px` plus a two-layer neutral shadow on four dialogs; `22px` plus the same on the comment-confirm; `20px` plus `--shadow-modal` on the conflict inbox | 4 / 1 / 1 | **Decided — dominance.** `24px` with `0 4px 10px rgba(16,10,40,.28), 0 44px 90px -30px rgba(16,10,40,.8)`. The inbox is the only dialog left on the old recipe. |
| L-05 | “Awaiting / needs attention” amber | `#8A5A00` in three status maps — comment awaiting, unconfirmed, approval-chain awaiting — for 7 uses; `#B4690E` on the sub-process tag and the department-card subs chip, 3 uses | 7 vs 3 | **Owner veto.** `#B4690E` (`--warn`), chosen *against* the dominant value: `#8A5A00` is `--icom-control-fg`, and the ICOM palette is the one place the design says colour IS the meaning and never decorative, so a status may not borrow it. Semantics and dominance point opposite ways, which is precisely a rule-3 case. |
| L-06 | “Clear filters” link | `#7A52D0` on Users, `#E23D35` on User activity — same control, same copy | 1 vs 1 | **Decided — semantics.** `#7A52D0` (`--violet-mid`, named as `--role-link-quiet`). `--conflict` is declared *destructive and conflicts*, and clearing a filter destroys nothing. |
| L-07 | Department-info content width | `900px`; the sibling list screens are `920px` (`--width-list`) | 1 vs 2 | **Decided — dominance.** `920px`. 900 has no token, no role, and no reason. |
| L-08 | Scrollbar width | `12px` in `tokens/base.css`; `10px` in both deliverables' own style blocks | 1 vs 2 | **Decided — dominance.** `10px`. Both deliverables agree against the token file. |
| L-09 | Unchecked tick border | `#C9B8EC` everywhere; `#DCD3EC` on the visibility-policy rows | 13 vs 1 | **Decided — dominance.** `#C9B8EC`. `#DCD3EC` has no token and no role of its own. |
| L-10 | Checkbox tick size | `16px` nested view option; `17px` department scope and new-user scope; `18px` supervisor flag and “whole system”; `19px` policy row and confirmed tick (and the supervisor radio) | 1 / 2 / 2 / 2 | **Owner veto.** Provisionally two sizes by role rather than four by screen: a tick in a list row is `19px`, a tick nested inside another option is `16px`, and 17 and 18 normalise to 19. The design states no meaning for the ladder and three rungs are tied, so the rule is an invention until the owner confirms it. |
| L-11 | Table-head background | Users head none; audit head none with `#F8F4FE` on its filter bar; activity `#F8F4FE` on both; the sessions-card head on User activity `#F8F4FE` | 2 unfilled vs 2 filled | **Decided — semantics.** `#F8F4FE` on the head and on an in-table filter bar: the design's own colour census names “table-header bg” as a role of `#F8F4FE`, and it is the only value any head paints. The Users filter bar is a detached card above the table on `#F4EFFB` — a different component, not a third variant. |
| L-12 | `ProcessTag.plain` | Byte-identical to `.kpi` — `--violet` on `--tile-v` | 2 of 5 tags indistinguishable | **Owner veto.** A plain process draws **no tag**. A tag marks an exception (sub-process, conflict, KPI, tombstone); one that says «فرآیند» on a screen of processes marks nothing. If the owner prefers a visible tag, the alternative is the muted skin, `--text-muted` on `--tile-v3`. |
| L-13 | Reader compose drawer | Two drawers mount at once on the flow screen: 340 and 380px wide, padding 20 and 24, title 18 and 19, textarea 13.5 and 15.5, radius 12 and 14, submit violet and coral | 2 | **Decided — semantics.** One drawer, the panel's: `380px`, padding `20px`, title `18px`, textarea `13.5px`, radius `12px`, **violet** submit. The submit is a normal save, not a destructive-forward act, so coral is the error — coral opens, violet commits. |
| L-14 | Card on the violet field | White in both deliverables; cream `--bg` with `--shadow-card-dark` in the design system's `Card onDark`, `DepartmentCard`, `StatCard` and `Modal` | 2 deliverables vs 1 component layer | **Decided — dominance.** White with `1px solid rgba(42,29,94,.07)` and the two-layer neutral shadow. **`Card` therefore gets no `onDark` prop** — the cream-card idiom is unused by both deliverables and its two dark-screen shadows are dead. |
| L-15 | Card border | `rgba(42,29,94,.07)` at `1px`; `#EFE7DC` at `1.5px` on the comments-inbox list card and the unselected scope tile | 46 vs 2 | **Decided — dominance.** `1px solid rgba(42,29,94,.07)`, named as `--role-border-card`. `#EFE7DC` keeps its own role — the top-bar, flow-bar and drawer edges. |
| L-16 | Dialog title size | `18px` stated as the rule and used 11 times across dialog, drawer and pane titles; `17px` on the conflict inbox and the two confirm dialogs | 11 vs 3 | **Decided — dominance.** `18px`. The panel type scale gains the step in Task 3 — see L-33. |
| L-17 | Line-height for prose | `1.7` ×22, `1.8` ×17, `1.9` ×14, `1.75` ×3, `1.85` ×2, `1.95` ×2, `2` ×2, `2.05` ×1 | 8 values | **Decided — dominance.** Three roles, three values: body copy `1.7`; explanatory sub-copy under a control `1.8` (`--role-lh-subcopy`); long-form prose — department description, comment body, step description — `1.9`. `1.75`, `1.85`, `1.95`, `2` and `2.05` normalise. |
| L-18 | Row transition | `.16s` on the two lifting surfaces; `.14s` on a users-table row | 2 vs 1 | **Decided — dominance.** `.16s` (`--duration`). `.14s` is not a token and nothing else uses it. |
| L-19 | The “more” affordance | A vertical kebab (three `r=1.8` circles at `cx=12`), the horizontal `InjaIcons.dots` (`cy=12`), and the literal character `⋯` in five places | 3 renderings | **Decided — semantics.** The vertical kebab SVG. `⋯` is a unicode glyph used as an icon, which the design forbids in the same breath it sanctions `⣿` and the ICOM arrows. |
| L-20 | Pill radius | `--radius-pill: 20px` in the tokens; `999px` in both deliverables | 0 vs 20+ | **Decided — dominance.** `999px`. Neither deliverable ever uses the token, and a 20px radius on a 24px-tall pill is visibly not a pill. |
| L-21 | Mono stack | `'JetBrains Mono',ui-monospace,SFMono-Regular,Menlo,monospace` written 23 times and **never loaded**; the token is `ui-monospace,'SF Mono',Menlo,Consolas,monospace` | 23 vs 1 | **Decided — semantics.** The token. The deliverable's first choice silently falls through to `ui-monospace` because no stylesheet it links loads JetBrains Mono, so the token is what the design actually renders. |
| L-22 | The add button | `ListEditor`'s inline add at `11px` and radius `9px`; the exported `AddButton` at `12.5px` and radius `10px` | 1 vs 1 | **Decided — semantics.** `AddButton`'s: `12.5px`, radius `10px`. It is the exported one, so it is the one a second caller would reuse. |
| L-23 | Close button | `32×32` radius 8 (drawer), `32×32` radius 9 (modal), `28×28` radius 8 (`DetailDrawer`), `34×34` radius 10 with a 19px glyph (new-user dialog) | 4 | **Decided — dominance.** One close button: `32×32`, `--tile-v2` fill, radius `9px` (`--role-radius-close`), glyph `×` at `18px` in `--text-muted`. |
| L-24 | FAB count-badge ring | `#2A1D5E` in the panel; `#FBF7F1` in the reader | 1 vs 1 | **Decided — semantics.** `#2A1D5E`. The ring exists to cut the badge out of the field it sits on, and that field is `#2A1D5E` on both surfaces; the cream ring is a stray light halo the reader's own spec calls a defect. |
| L-25 | Reader process-list empty state | Renders the search-miss copy «فرآیندی با این نام پیدا نشد» even when the department is simply empty, ignoring its own computed `emptyText` | 1 | **Decided — semantics.** The computed text. An empty department says «فرآیندی برای این دپارتمان ثبت نشده است.»; only a search with no hit says «فرآیندی با این نام پیدا نشد». |
| L-26 | Reader status vocabulary | Two maps, `RST` and `ST`: identical colours, different labels («رسیدگی شد» against «رسیدگی‌شده», «رد شد» against «رد شده»), and only one of them carrying `withdrawn` | 2 | **Decided — semantics.** `ST` — the panel's map, so one vocabulary serves both surfaces, and the one `cmtCard` already dereferences unguarded. `RST`'s labels normalise to it and `withdrawn` is carried into it, so the unguarded lookup cannot break. |
| L-27 | Panel body and dense sizes | `14px` ×27 (body copy, paragraphs), `13.5px` ×48 (menu items, dropdown values, sub-card titles, dialog buttons), `13px` ×73 (buttons, table cells, hints, list body), `12.5px` ×85 (controls, chips, labels, breadcrumb) | 4 sizes | **Decided — semantics.** Four roles, four sizes, no overlap: body copy `14px`; menu, dropdown and dialog-button copy `13.5px`; dense list, table and hint copy `13px`; control, chip and label copy `12.5px`. R3's “13–14px” names the range; this names which is which. `13.5px` has no token — see L-33. |
| L-28 | Subtitle colour on the dark field | `#B7A6E0` (`--violet-on-dark-body`, the correctly *named* token) on departments; `#C9BEEE` on every other panel screen and throughout the reader | 1 vs 13 | **Decided — dominance.** `#C9BEEE`. The role points at `--violet-on-violet`, whose declared role (“mono id inside a violet box”) is wrong but whose *value* is the design's, so the role renders correctly today rather than after Task 3. |
| L-29 | `StatTile` 4-up value | Audit: `23px`, centred. User activity: `21px`, line-height 1.2, start-aligned. Every other metric of the two grids is identical | 4 tiles vs 4 tiles | **Owner veto.** Provisionally `23px` centred — `23px` is on the token scale (`--fs-h1`) where `21px` is one of the ten off-scale sizes, and start-aligned numerals read ragged across a 4-up grid. But the design states no reason for either and the count is an exact tie. |
| L-30 | Drawer shadow | `20px 0 50px -30px rgba(74,37,169,.5)` on the node and compose drawers; `24px 0 60px -30px rgba(16,10,40,.7)` on the department-comments drawer | 3 vs 1 | **Decided — dominance.** The 20px violet cut (`--shadow-drawer`). One drawer shadow, not one per drawer. |
| L-31 | Popover shadow | `0 20px 45px -20px rgba(74,37,169,.45)` on every dropdown and popover; `0 24px 50px -22px rgba(74,37,169,.5)` on the process-list export menu; `--shadow-pop` is a third value the deliverable never paints | 13 vs 1 vs 0 | **Decided — dominance.** `0 20px 45px -20px rgba(74,37,169,.45)`. Task 3 re-cuts `--shadow-pop` to it, so the token stops being a fourth opinion. |
| L-32 | `ConflictCard` compact variant | `fontSize: compact ? var(--fs-sm2) : var(--fs-sm2)` — a ternary whose two branches are the same value, inside a variant that genuinely changes eleven other declarations | 2 branches, 1 value | **Decided — semantics.** One size, `--fs-sm2`, in both variants; the ternary goes. A variant axis that reads as a choice and is not one is how the next inconsistency gets built in. |
| L-33 | Type sizes with no token | Ten of the twenty-four sizes the panel paints have none: 46, 26, 25, 21, 18, 14.5, 12, 10, 9.5, 9 — and `13.5px`, which the deliverable leans on 48 times, has none either | 11 token-less sizes | **Decided — semantics.** Task 3 mints the three that carry a role: `18px` (dialog title, L-16), `13.5px` (menu and dialog copy, L-27) and `12px` (caption, 38 uses). `21px` normalises to `22px` (L-02). The rest are single-site literals and stay as written — the token file's own instruction is not to snap the half-pixel sizes to a scale. |
| L-34 | Reader screen-title scale | Home `26px`, process list `30px`, department info `24px` — so the reader's home hero is *smaller* than the titles beneath it, inverting the panel's own 34-over-22 relationship | 3 sizes, hero under title | **Owner veto.** Kept exactly as written, because R3 is an owner ruling and the reader is a different surface at a different scale. Recorded anyway because it reads as a defect rather than a decision, and only the owner can say which it is. |
| L-35 | Secondary body ink | `#5a5175` carries all secondary body copy (27 uses in the panel, 14 in the reader); `--text-body`, the token named for exactly that role, is used by nothing | 41 vs 0 | **Decided — dominance.** `#5a5175`. `--role-ink-body` points at `--text-current`, whose declared role (“conflict current value”) is wrong but whose value is the design's. Task 3 may rename the token; the role does not move when it does. |
| L-36 | Coral against violet on a forward action | Coral fills «فرآیند جدید» and «کاربر جدید» and the reject commit; violet fills «ذخیره», «ایجاد کاربر» and «ثبت کامنت». The reader's second compose drawer submits an ordinary save in coral | 1 site disagrees | **Decided — owner ruling.** **Coral opens, violet commits.** Coral is the affordance that *starts* a creation flow, and it stays on a destructive-forward commit (a reject) because `--coral`'s declared role covers that; violet is the ordinary commit inside a form or dialog; `--conflict` stays destructive. The one coral save is the error — see L-13. |
| L-37 | Password reset | Access panel 3 draws «ساختن لینک بازنشانی», and both it and the profile note state that no password is ever created or shown. The product has `POST /api/users/{id}/password`, an administrator-chosen value, and **no reset-link route at all** | design 2 sentences vs D15 | **Decided — owner ruling.** D15 wins over the design: the administrator types the value and tells the person, because this system is Telegram-fed and has no delivery channel. Build the design's shell around the app's own control and **rewrite the two sentences** that describe a link. A button for a route that does not exist is a control that answers 404, which R5 forbids. |
| L-38 | The profile's open-sessions card | A second profile card, «نشست‌های باز», listing each open session with a revoke button | 1 card | **Decided — owner ruling.** It is not built: not drawn, not stubbed, and no `/api/auth/sessions` route is added. The owner removed the feature from the product. A deliberate divergence from the deliverable, recorded so it is never read as drift. |
| L-39 | Icons the design never draws | Only 11 of the 33 `InjaIcons` paths are fixed, and seven glyphs the panel actually renders have no key at all: the breadcrumb house, the hamburger, the users filter funnel, the eye and eye-off, the FAB comment mark and the sign-out mark | 11 of 33 specified | **Decided — owner ruling.** The 29 unspecified icons are authored to the set's own construction rules — a 24×24 box, `stroke="currentColor"`, `fill="none"`, round caps and joins, stroke `2.2`–`2.6`, matching joinery and optical weight. **Each authored path is appended to this ledger by the task that authors it**, so the owner can review or replace any of them rather than discovering them in the app. |

## Referred to the owner

Five rows above, plus two items that are not contradictions and cannot be
resolved by looking harder at the design.

1. **L-05 — the “awaiting” amber.** `#B4690E` was chosen against the dominant
   value. The deliverable paints `#8A5A00` for all three status maps, so a veto
   here is reasonable; the counter-argument is that `#8A5A00` is the ICOM control
   colour and the ICOM palette is the one place the design says colour *is* the
   meaning.
2. **L-10 — the checkbox tick size.** Two sizes by role (19 in a row, 16 when
   nested) is an invention. The design gives a four-rung ladder keyed to nesting
   depth with three rungs tied at two sites each.
3. **L-12 — `ProcessTag.plain`.** Whether a plain process shows no tag at all, or
   a muted one.
4. **L-29 — the 4-up stat value.** `23px` centred or `21px` start-aligned. An
   exact four-to-four tie with no stated reason on either side.
5. **L-34 — the reader's screen-title scale.** Kept as R3 wrote it, but its hero
   is smaller than its titles.
6. **The Users screen has no subtitle.** Every one of the thirteen panel screens
   carries a one-sentence subtitle saying what the screen is for; Users has the
   slot and it ships empty. The copy does not exist in the design and cannot be
   inferred — it has to be written.
7. **The department card's heavier rest shadow.** The one feature card carries
   `0 2px 4px rgba(16,10,40,.18), 0 22px 46px -20px rgba(16,10,40,.65)` where
   every other surface carries the standard two-layer card shadow. Read as
   deliberate (a feature card is its own role) and therefore *not* normalised —
   but it is a single use against 25, so if the owner reads it as drift instead,
   it collapses into `--role-shadow-card` and the home screen flattens by one
   notch.
