# Facts store: tables as the spine — design

**Status:** proposal for the owner's approval, 2026-09-16. **Nothing in this document is implemented.**
**Owner's instructions (2026-09-16):** items and every reference to them are removed; every rule,
measurement and note is tied to a table wherever one fits and is listed on that table's page; entries
that fit no table keep their own pages; the quantitative-data pages stay as they are; a table's page
lists its rules, measurements and notes, and a click opens the entry's page as today; a person can
move an entry from one table to another through the agent; the JSON format stays, a table link is
added; the confirm tick stays on each entry.
**Folds in:** `2026-09-16-facts-no-items-design.md` (its rules are §3 here, unchanged).
**Builds on:** the gate tiers (2026-09-13) and the form-anchored units (2026-09-15).
**Scope:** `schemas/facts*.json`, `engine/facts_plan`, `engine/merge_facts`, `ui/src/facts`,
`ui-backend/inja_ui_backend/facts_store.py`, the data-repo `quantify` agent and playbook and the
`edit-fact` playbook, the existing stores.

---

## 1. Why

The process engineer who tested the system reported three things: the volume of quantitative data is
too large to check, the relationships between entries are unclear (where a measurement is written,
which table a rule belongs to), and the item list adds entries nobody links to. The store already
carries half of the answer — a formula rule is bound to its table and column (`applies_to`), a
measurement may name the form field it is written in (`of`), a note names what it is about
(`about`), and a table's page lists «استفاده‌کنندگان» — but the link is optional, most speech-derived
entries lack it, and the panel is organised by kind rather than by table.

## 2. Principles

1. **The table is the spine.** A rule, a measurement or a note lives under the table it belongs to;
   the table's page is where a person checks them together.
2. **Unattached is legal and visible.** An entry that fits no table is stored, listed apart and
   counted; it is never refused for being unattached.
3. **The tick stays on the entry.** Grouping changes where a thing is found, not who vouches for it.
4. **The format stays; a link is added.** One entry, one id, one file per kind; the merge ladder,
   `edit`, `retire`, the audit and the history are untouched.
5. **Nothing references an item.** Raw materials are a table, read once, cells as text.

## 3. Items (from the folded spec, unchanged)

1. The store has four kinds: `record`, `measurement`, `rule`, `note`. `item`, `itemData` and
   `facts/items.json` are gone.
2. Nothing references an item: the column type `refItems` becomes `text`; `of` and `per` name a
   record (with a field or row) or are text; the `##`/`#` namespaces are no longer reference targets.
3. Coded raw-materials tabs are read as any reference tab: one record with rows.
4. The planner mints no item candidates (`item_candidates`, `u-items`, the items half of the reuse
   and recorded slices, `ITEM_PARAM`); the agent has no item mode; the panel has no item card, list,
   filter or label; the report counts four kinds.
5. Existing stores: `facts/items.json` is deleted and item ids leave `.index.json`; the id sequence is
   not rewound. Verified on the server store: 0 references to any item id from any other entry. One
   commit per store, on the owner's word (owner chose deletion, no export).
6. Runs on disk are history; a delta that still carries an `item` is refused by `apply` with one line.

## 4. The home link

### 4.1 Contract
- Rules, measurements and notes gain an envelope member `home`: `{"ref": "F-…"}` with an optional
  `"field"` (a column key of that record) — the store's existing `ref` shape, restricted to a
  **record**. `home: null` (or absent) means unattached. Records have no `home`.
- `home` is a first-class link: the assembly rewrites temp ids and provisional field keys in it as it
  does for every ref; the store gate treats a `home` that names no record like any dangling
  reference — **severed with a note** (C29 tier), never a refusal; `retire` of a record leaves its
  dependants' `home` pointing at the tombstone, which the panel shows as «جدول بازنشسته» (no
  cascade; INV-4).
- Existing links keep their meaning and are not replaced by `home`: a rule's `applies_to` (what it
  computes, possibly several tables), a measurement's `of` (which field holds the value), a note's
  `about` (everything it mentions). `home` answers one question only: *under which table is this
  listed*. Derivation at assembly, when the unit wrote none: a rule with bindings on exactly one
  record → that record; a measurement whose `of` names a record → that record; a note whose `about`
  names exactly one record → that record; otherwise unattached.
- `.index.json` rows gain `home` (the record id or null) so the panel lists a table's subsets without
  opening the kind files.

### 4.2 The units and the reviewer
- Phase 2's instruction becomes: every rule, measurement or note you write names its `home` from
  «آنچه تا کنون ثبت شده» (a listed table, by its printed handle) — the table the fact is *about* or
  *written on*; leave it empty only when no listed table fits, and say why in one phrase in the
  entry's `statement`. A measurement that is really a column of a listed form is written as a
  measurement with `home.field` set, not as a new table.
- Phase 1's workbook and photo units set `home` on the rules and measurements they write for their
  own tables (a formula's home is the table its first binding names).
- The reviewer gets one more flag in its digest: `homeless` — a rule or measurement with no home
  beside a record whose title shares its subject; it may `keep` with `home` set, exactly as it
  corrects any other field. Attachments the reviewer makes are notes the owner sees (the entry's
  history says «جدول: بازبین»).
- The digest and the report group by table: «فرم تبدیل آماده‌سازی برگر: ۸ قاعده، ۳ اندازه‌گیری،
  ۱ یادداشت» and, last, «بدون جدول: ۱۲ قاعده، ۴ اندازه‌گیری». A run whose entry names a different
  home than the one a person set is listed too: «جای «سقف ضایعات» تغییر نکرد؛ این اجرا آن را زیر
  «فرم تولید نیمه‌ساخته» می‌دید.»

### 4.3 Moving an entry
- `merge facts edit` accepts `set home` / `unset home` like any envelope field (the same `ops`
  contract: gated, audited, `updated_at` bumped); the entry's id, ticks and history stay. A `set`
  whose target is not a record, or names no entry, is refused with one line (R3 — a reference that
  cannot be severed by a person's explicit edit is the person's mistake to fix).
- `edit-fact` gains two cases in its three-case table: **move** («قاعدهٔ «سقف ضایعات» را زیر «فرم
  تبدیل آماده‌سازی برگر» ببر») and **detach** («… را از جدولش جدا کن»). Both resolve the names against
  the index (title, aliases, id), show the owner the one-line plan in Persian, and apply on «بله».
  Ambiguous names are asked back with lettered choices, as the playbook already does.

### 4.4 The panel (data pages unchanged)
- The facts list pages stay as they are.
- A record's page gains three sections after its own cards: «قواعد این جدول», «اندازه‌گیری‌های این
  جدول», «یادداشت‌های این جدول» — each a list of the entries whose `home` is this record (and, for a
  note, whose `about` names it and whose `home` is empty), each row showing title, tick state and
  the column it is tied to when `home.field` is set; the section header carries «۵ از ۸ تأیید شده».
  A click opens the entry's page as today.
- The entry's page shows its home as a link («جدول: فرم تبدیل آماده‌سازی برگر») or «بدون جدول».
- «تأیید همهٔ موارد این جدول» on the record's page confirms each unconfirmed subset entry one by one
  (one audit row each, the existing confirm endpoint); the record's own tick is unchanged by it.
- The «استفاده‌کنندگان» card stays for links that are not homes (a rule computing a column of this
  table while living under another).
- No move action in the UI; moving is the agent's (§4.3).

### 4.5 Ticks
- Per entry, unchanged. A record's tick covers the record (columns, rows, medium, location) only.
- Moving an entry does not reset its tick (content unchanged); a content change resets it as today.
- The report counts tables fully confirmed (the record and every subset entry) and tables with open
  pieces.

## 5. What changes where

| Area | Change |
|---|---|
| schemas (3) | kind enum without `item`; `itemData`/`refItems` removed; `home` on rule/measurement/note (record-only ref); index row `home` |
| `facts_plan/build.py` | §3.4; the recorded slice prints each table's handle for `home`; cards say how `home` is written |
| `facts_plan/assemble.py` | `home` resolved with the other refs; derivation when absent; `homeless` digest flag; report grouped by table; four kinds |
| `merge_facts/*` | four kind files; `refItems` rows removed; `home` in the ladder: placement, not a fact — a later run's different home never overwrites the stored one; it is recorded as a note on the entry and listed in `report.md` (decision 1); `edit` set/unset home; `.index.json` `home`; `audit` rows |
| `ui/src/facts` | ItemCard and item filter removed; record page sections; home link on entry pages; batch confirm |
| `ui-backend/facts_store.py` | four kind files; index `home`; batch confirm reuses the per-entry endpoint |
| data-repo agent + playbooks | item mode removed; `home` rule for units; reviewer `homeless` flag; `edit-fact` move/detach cases; lint pins |
| docs | runbook 07, walkthrough, ADR 0017 ruling paragraph dated 2026-09-16 quoting the owner and the process engineer's feedback |
| stores | items deleted; existing rules/measurements/notes get `home` only through a new run (the owner tests from zero) |

## 6. Tests
- Schema: `item` entry, `refItems` column, `home` on a record, `home` naming a non-record → refused.
- Assembly: a unit-written `home` resolves through temp ids and renamed fields; derivation from
  `applies_to`/`of`/`about`; a dangling home is severed with a note; the digest flags a homeless
  rule beside a matching table; the report groups by table with an unattached block.
- Store: `edit set home` moves an entry and keeps its tick and history; `unset` detaches; a run's
  different home does not overwrite a person's move (note instead).
- Panel: a record page lists its subsets with tick counts; a click opens the entry; the batch confirm
  ticks each entry once; a retired home shows «جدول بازنشسته»; no item route.
- Playbook lint: no item sentence remains; the `home` and move/detach sentences pinned.
- Real-run check: the 2026-09-15 local run re-assembled → every rule/measurement/note has a derived
  home or is listed unattached; the counts per table are printed.

## 7. Decisions (owner, 2026-09-16)
1. When a later run disagrees with a person's move, the stored home stays; the run's opinion is
   recorded as a note on the entry **and mentioned in the owner's chat message** (the report names
   the entry and the table the run would have put it under).
2. Unattached entries have no separate list: they stay in the facts list pages exactly as today; only
   the entry's page says «بدون جدول». The report's «بدون جدول» block stays.
3. A note that mentions two tables is listed under the first it names, unless the unit set `home`.
