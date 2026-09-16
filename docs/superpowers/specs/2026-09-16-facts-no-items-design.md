# Facts store: no item entries — design

**Status:** proposal for the owner's approval, 2026-09-16. **Nothing in this document is implemented.**
**Owner's instruction (2026-09-16):** «I don't want anything referencing items anymore either. Items, and
any reference that was made to items, should be removed.» Raw materials appear once, in a table, as
quantitative data — nowhere else.
**Scope:** the facts store contract (`schemas/facts*.json`), the planner and assembly
(`engine/facts_plan`), the store verbs (`engine/merge_facts`), the panel's facts views, the quantify
and edit-fact playbooks, the existing stores (laptop and server).

---

## 1. Why

The item kind was meant to be a shared master list every other fact points at. In practice
(server store, 2026-09-16): 27 items, none with a code, **no rule, measurement or form column
references any of them**; the same restaurant had 137 items after the cooking run and 27 after the
preparation run because items were minted from whatever a meeting or a photo happened to name.
For the ERP the owner intends to build, master data will come from the coded raw-materials
workbook; that workbook is already stored as a table. A separate item kind is a second, weaker copy.

## 2. Rules

1. **The store has four kinds:** `record`, `measurement`, `rule`, `note`. The `item` kind, its
   `itemData` shape and its file `facts/items.json` are gone.
2. **Nothing references an item.** A form cell that names an ingredient is **text**: the column type
   `refItems` (and its `namespace`/`resolved_by`) is removed; such columns become `text`. A
   measurement's `of` and a rule's `per` may name a record (and a field or row of it) or be text — never
   an item. The `##` / `#` code namespaces stop being reference targets; a code printed on a sheet is
   text in a cell, like any other cell.
3. **Raw materials are a table.** The coded raw-materials tabs are read as any reference tab is today
   (a record with rows keyed by the sheet's own key column). No candidate, no unit and no card is
   built from them beyond the record itself.
4. **The planner mints no item candidates** (`item_candidates`, the `u-items` unit, the items half of
   the reuse slice, `ITEM_PARAM` handling in scripts) and the agent has no item mode. The
   «آنچه تا کنون ثبت شده» and reuse slices list records, rules, measurements and notes only.
5. **The panel** has no item card, no item list or filter, no item label; a record's cells that used
   to resolve items show their text.
6. **The report** counts four kinds.
7. **Existing stores.** `facts/items.json` is deleted and item ids leave `.index.json`; the id
   sequence is not rewound (F-ids already used stay used). Nothing else in the store references those
   ids (verified: 0 references on the server store), so no entry changes. The deletion is one
   commit per store, made by the owner's word: laptop (throwaway branch and main) and server.
8. **Runs already on disk** (`runs/facts/**`) are history and are not rewritten; a run whose
   `facts-delta.json` still holds `item` entries cannot be re-applied under the new contract —
   `apply` refuses it with one line, as it refuses any wrong-contract delta.

## 3. Consequences

- Fewer entries to extract, review and browse; no more department-dependent item lists.
- A meeting that only names an ingredient produces nothing on its own — the ingredient exists where
  it is defined (the workbook) or where it is used (a form column, a rule's text).
- The ERP's item master is exported from the raw-materials table's rows, keyed by the sheet's codes.
- Lost: per-item pages in the panel and "used by" cross-links per item. Accepted by the owner.

## 4. What changes where

| Area | Change |
|---|---|
| `schemas/facts.schema.json`, `facts-delta.schema.json`, `facts-unit.schema.json` | kind enum without `item`; `itemData` removed; `refItems` column type removed; `of`/`per` shapes without item targets; the schema contract tests updated |
| `engine/facts_plan/build.py` | no `item_candidates`, no `u-items`, no `_code_slug`/items split axis, no `item_units` in `reuse_slice`/`recorded_slice`, `KIND_*` maps without item, cards without the item example |
| `engine/facts_plan/assemble.py` | `KIND_ORDER`/labels without item; `_row_keys`/`refItems` resolution removed; report counts four kinds |
| `engine/merge_facts/*` | kind files without items; `refItems` preconditions/repairs/audit rows removed; `export`/`audit`/`retire` over four kinds; `.index.json` writer |
| `engine/facts_plan/preflight.py`, generality property | no item units |
| `ui/src/facts` | `ItemCard` removed; lists, filters, labels, types without item; text cells where `refItems` cells were |
| `ui-backend/inja_ui_backend/facts_store.py` | four kind files; the item code index removed |
| data-repo `quantify` agent + playbook, `edit-fact` playbook | item mode, classification rows and examples removed; the «قلم» vocabulary removed; lint pins updated |
| docs | runbook 07, walkthrough, ADR 0017 ruling paragraph dated 2026-09-16 quoting the owner |
| stores | `facts/items.json` deleted, `.index.json` without item ids (laptop main, server; the throwaway branch too) |

## 5. Tests

- Schema: an `item` entry, a `refItems` column, an `of` pointing at a former item id are refused.
- Planner: the prep-run fixture and the 24-seed generality estates plan with no `u-items` unit; the
  coded raw-materials tab still yields its record with rows.
- Store: `apply` of a delta carrying an `item` refuses with one line naming the kind; the four kind
  files round-trip; `export` and `audit` cover four kinds.
- Panel: a record with a former `refItems` column renders its cells as text; no item route.
- Playbook lint: no «قلم»/item sentence remains pinned or present.
- Real-run check: the 2026-09-15 local run re-planned → same units minus none (preparation had no
  item unit), and the cooking estate re-planned → one unit fewer (`u-items-*` gone), all else equal.

## 6. Open question for the owner

The 27 items now on the server: delete the file (git history keeps them) — proposed — or first export
them to a plain list for you, then delete.
