# audit:structure

## summary
The cooking store holds 486 entries, and roughly half of them are the same definition written twice or eight times. 131 entry clusters differ only by a branch token in the key (77 chalebagh rules / 77 naharkhoran rules, 73 / 70 records); 126 of those 131 clusters were produced by two *different* passes (B4/B6 and B5/B7), so the sequential split itself manufactured the duplication. `template_of` and `divergence` — the exact spec mechanism (QF-4, §7) for a branch instance of a template — are used ZERO times. Widening to branch+line, 100 of 156 rules are 14 families of 8 (`enheraf` = `masraf_vaqei - masraf_elami` written eight times); only 30 distinct `expr` strings exist across the 75 rules that have one, and the same expression is spelled two ways (`ruz` vs `ruz = tarikh_ruz`) depending on which pass wrote it. 140 `originals/F-*.txt` files hold only 53 unique contents (87 redundant). 70 records (45% of all records) are `role: mirror` with rows=0 and fields=0 — pure "this is a copy of X" — and NOTHING references them (0 in-edges from non-mirrors), so deleting all 70 breaks nothing. 30 stubs point at four workbooks whose dumps are already on disk with every stub tab present, so the engine could have minted those skeletons deterministically from `sheets.json`; the engine's own QF-20 adoption path never fired (`adopted.json` is `[]`, all 30 carry no `grain: "workbook"`). 44% of the store is unreachable from any rule with inputs. Payload conformance is bad where the schema does not check: `measurement.quantity` is 0/13 on the spec enum (it holds the *value*, and `writes_to`/`by`/`when` are on 0/13, so all 13 measurements are actually misfiled constants), `item.category` is 7/139 on the enum, and 0/139 items carry `pack` or `units`. 491 stored field occurrences across 15 invented keys (`unit_ref` ×137, `bindings` ×41, `import`/`named_range` ×70 each, `applies_to` ×19, `row_meta` ×10) appear nowhere in the UI, the backend or the schemas; `note.data` has no card at all, so all 22 notes' payloads are dead storage. Of the 96 issues, 93 have `affects[]` pointing at their own entry, and about 78 are current-sheet bug reports (column_shift, bug, cross_record, most junk) that belong in a list handed to the sheet owner, not in a definitions store. `merge facts audit` reports 88 findings and none of them is any of this — its duplicate detectors key on `(kind, key, scope)` and on spacing/digit-folded titles, and the branch token lives inside the key, so the duplication is invisible to every check the engine has.

## problems
- [high/orchestration] 131 entry clusters are the same definition written once per branch; the pass split created them and template_of was never used :: /home/lili/Desktop/DriveD/work/Moshtaghi/Inja food/process/process dev/data-repo/facts/{rules,records}.json — scope counts: rule 77 chalebagh + 77 naharkhoran + 2 both; record 73 + 70 + 12. Normalising chalebagh|naharkhoran|markazi|cb|nk out of the key yields 131 clusters covering 262 entries (146 r
- [high/agent-prompt] 100 of 156 rules are 14 rule families repeated per branch × per line; only 30 distinct expressions exist :: Normalising branch AND line (pitza|farangi|sokhari|kanter) out of rule keys gives 14 families with >2 members covering 100 of 156 rules — eleven families of 8 and three of 4: `__ruz`, `__mah`, `__sal`, `__mojudi_avval_shab`, `__daryaft_az_anbar`, `__mojudi_akhar_shab`, `__masraf_elami`, `__masraf_va
- [high/output-format] 70 mirror records (45% of all records) carry no information and nothing references them :: records.json: role counts mirror 70, log 58, reference 18, report 8, config 1, checklist 1. All 70 mirrors have rows=0 and fields=0. Their entire payload is {medium, role, location, grain, mirror_of, import, named_range} — and `import` + `named_range` are not in the spec, the UI or the schema. Ref-g
- [medium/data-quality] 43 of 96 issues are defects observed in a mirror — a copy of a table, not the table :: 43 issues sit on mirror records: column_shift 19, junk 16, unit_kind 2, code_collision 2, bug 2, scale 1, cross_record 1. Eight of them (F-00272, F-00274..F-00281) carry near-identical text «ردیف تاریخ ۱۴۰۴/۰۹/۱۴ در این آینه دو بار … تکرار شده است» — the same duplicate source row seen through eight 
- [high/orchestration] 30 stubs were minted for workbooks whose dumps were already on disk, and the engine's own stub-adoption path never fired :: 30 records carry data.stub:true, all role:log, in four workbooks: Tedade Fooroosh markazi (11 tabs), Tedade Fooroosh naharkhoran (11), Anbar markazi (4), Anbar shobe 2 (4). Checked every stub tab name against attachments/sheets/.dump/<id>/sheets.json: 30/30 present, 0 missing — the structure was sit
- [medium/data-quality] 44% of the store is unreachable from any rule that computes something; 11 entries are total islands :: 1562 {ref} edges, 1017 unique directed pairs, 0 dangling. 268 of 486 nodes have zero in-edges (107 rules, 74 records, 54 items, all 22 notes, 11 measurements); 76 have zero out-edges. 11 nodes are complete islands: F-00155, F-00157, F-00179, F-00294, F-00295 (records), F-00303, F-00306, F-00308 (mea
- [high/spec] measurement is a dead kind: 0/13 conform to the spec, all 13 are misfiled constants :: Spec §7 requires `quantity` from the enum mass|count|volume|duration|money|ratio|other and defines the kind as "what is captured, by whom, into which record field". Actual values of data.quantity: 30, null, 110, 285, 200, 100, 1.2, 200, null, null, 450, 10, null — the measured *number*, not the dime
- [high/data-quality] item.category is 7/139 on the spec enum and no item carries pack, units or tracked :: Spec §7 enum: ingredient|product|packaging|consumable|place|other. Actual: menu_item 69, meat 22, beverage 14, vegetable 8, packaging 7, dairy 6, bread 4, sauce 3, prepared 3, dough 1, pasta 1, oil 1 — the agent wrote the menu taxonomy (which the spec calls `group`) into the required `category`. Onl
- [medium/ux] 491 stored field occurrences across 15 invented keys are rendered nowhere; note.data has no card at all :: Cross-referencing the store's data keys against every `d.<field>` / `data.<field>` read in ui/src/facts/cards/*.tsx + FactDetail.tsx, and against ui/src/api/types.ts and schemas/facts-delta.schema.json. Never rendered, never typed, never validated: item `unit_ref` ×129; record `import` ×70, `named_r
- [medium/spec] 78 of 96 issues are current-sheet bug reports, not definitions :: 96 issues on 84 entries. Kinds: junk 39, column_shift 20, scale 11, cross_record 10, bug 9, code_collision 4, unit_kind 3. Definitional (belong in facts, per QF-11): unit_kind 3 (F-00173: ##15 is counted in one file and weighed in kg in another — a unit disagreement the ERP must resolve), code_colli
- [low/engine] 140 originals files hold 53 unique contents — 87 byte-identical duplicates :: md5 over data-repo/facts/originals/F-*.txt: 140 files, 53 distinct contents, 43 duplicate groups, 87 redundant files. Every one of the 14 branch pairs of .gs / named-function rules stores the same source twice: F-00315/F-00388 (FORMAT_PERSIAN_DATE), F-00316/F-00389, F-00317/F-00390, F-00318/F-00391,
- [high/engine] merge facts audit reports 88 findings and catches none of the structural duplication :: `merge facts audit` on the current store: row_gone 62, unconsumed_constant 15, unknown_role 7, duplicate_output 4 — 88 total. Zero from `_lookalike_title`, `_natural_key_dup`, `_scope_shadow`, `_template_drift`, `_recurring_note_shape`, `_stale_stub`. `_natural_key_dup` (audit.py:674) groups on (kin
- [medium/orchestration] Two passes wrote the same rule in two different shapes, so half the branch pairs are fake divergences :: F-00337 (B4) data: `{lang: feel, expr: "ruz", inputs: [{from:…, key: "ruz"}], outputs: [{writes_to:…, key: "ruz"}]}` — no `title`, no `unit` on either member. F-00410 (B6), the naharkhoran twin: `{lang: feel, expr: "ruz = tarikh_ruz", inputs: [{key: "tarikh_ruz", title: "روز در تب تاریخ", unit: null
- [medium/data-quality] 24 date-plumbing rules and 16 conditional-format flag rules encode spreadsheet mechanics, not business quantities :: Bucketing all 156 rules: business computation 46, verbatim script/named-function 34, date plumbing 24, verbatim formula 21, conditional-format colour flag 16, constant 15. The 24 date-plumbing rules are `gozaresh_{markazi,naharkhoran}__{pitza,farangi,sokhari,kanter}__{ruz,mah,sal}`, each saying «سلو
- [high/spec] The record kind conflates a physical table with a table's definition, forcing per-branch and per-line duplication :: A record's identity is its `location` (§7: "location is always an object … {spreadsheetId, sheetId, sheet, hidden} for a sheet"), so two branch copies of one form are necessarily two records — F-00182 gozaresh_markazi__pitza and F-00239 gozaresh_naharkhoran__pitza have byte-identical fields[] and di

## details
## Store shape (all paths absolute)

`/home/lili/Desktop/DriveD/work/Moshtaghi/Inja food/process/process dev/data-repo/facts/`

| file | entries |
|---|---|
| items.json | 139 |
| records.json | 156 |
| measurements.json | 13 |
| rules.json | 156 |
| notes.json | 22 |
| **total** | **486** |

Delta `/home/lili/.../data-repo/runs/facts/cooking/20260902-080737/facts-delta.json` = 485 entries; sum of the 8 parts = 485; no key or temp-id collisions; `apply` de-duplicated nothing (486 = 485 + the pre-existing `units` record F-00001). Run `meta.json` names 13 workbooks; 28 are dumped under `attachments/sheets/.dump/` (313 tabs).

Envelope usage: status confirmed 192 / inferred 161 / unknown 130 / informal 3; retired 0/486; `valid_from`/`valid_to` set on 0; `supersedes` on 1; `aliases` on 81; `field_status` on 185 entries (401 marks); `accounts[]` on 10 (24 accounts); `processes[]` on 34.

---

## 1. Branch duplication

Normalising `chalebagh|naharkhoran|markazi|cb|nk` out of `(kind, key)`:

| | clusters | entries | collapse saving |
|---|---|---|---|
| branch only | 131 | 262 (146 rules, 116 records) | **131** (27% of 486) |
| branch + line (`pitza\|farangi\|sokhari\|kanter`) | — | — | **187** (38%) |

Producing pass of each cluster (via `id-map.json` → `parts/facts-delta-B*.json`): **(B4,B6) 80, (B5,B7) 46, (B1,B2) 5** — every single cluster spans two passes. Entries per pass: B3 100, B4 81, B6 80, B1 67, B5 50, B7 50, B8 39, B2 18.

Payload similarity of the 131 clusters after stripping `location` and mapping paired refs to a canonical token: **>0.99 (identical) 29**, >0.95 11, >0.9 24, >0.8 22, ≤0.8 45.

### Ten pairs

| # | kind | ids | key (branch stripped) |
|---|---|---|---|
| 1 | record | F-00145 / F-00158 | `ashpazkhne_*__khamir` |
| 2 | record | F-00144 / F-00157 | `ashpazkhne_*__niazmandiha_va_moshkelat` |
| 3 | record | F-00143 / F-00156 | `ashpazkhne_*__off_ejraei` |
| 4 | record | F-00141 / F-00154 | `ashpazkhne_*__zaman_tahvil_va_sanjesh_keyfiyat` |
| 5 | record | F-00142 / F-00155 | `ashpazkhne_*__zayeat` |
| 6 | record | F-00183 / F-00240 | `gozaresh_*__farangi` (identical payload) |
| 7 | record | F-00185 / F-00242 | `gozaresh_*__kanter` (identical) |
| 8 | record | F-00182 / F-00239 | `gozaresh_*__pitza` (identical) |
| 9 | record | F-00186 / F-00243 | `gozaresh_*__sheets_file_ids` |
| 10 | record | F-00229 / F-00286 | `gozaresh_*__table_ingredients_farangi` (identical) |

Ten more, rules, all `original_ref`-only diffs over byte-identical source text: F-00315/F-00388, F-00316/F-00389, F-00317/F-00390, F-00318/F-00391, F-00319/F-00392, F-00320/F-00393, F-00321/F-00394, F-00322/F-00395, F-00323/F-00396, F-00324/F-00397.

### The 14 rule families (100 of 156 rules)

`gozaresh_{markazi,naharkhoran}__{pitza,farangi,sokhari,kanter}__X` for X ∈ {ruz, mah, sal, mojudi_avval_shab, daryaft_az_anbar, mojudi_akhar_shab, masraf_elami, masraf_vaqei, enheraf, flag_enheraf_mosbat, flag_enheraf_manfi} (×8 each) and {tedad_forush, enheraf_ba_tolerance, enheraf_har_adad_ba_tolerance} (×4 each).

75 rules carry an `expr`; **30 distinct strings**. Top repeats: `ruz` ×4, `mah` ×4, `sal` ×4, `ruz = tarikh_ruz` ×4, `mah = tarikh_mah` ×4, `sal = tarikh_sal` ×4, `(mojudi_avval_shab + daryaft_az_anbar) - mojudi_akhar_shab` ×4, `masraf_vaqei - masraf_elami` ×4.

`template_of`: **0**. `divergence`: **0**.

Originals: 140 files, **53 unique contents**, 43 duplicate groups, **87 redundant files**.

**Notes are NOT branch-duplicated** — 22 notes, all distinct (best pairwise statement similarity < 0.6), 19 chalebagh / 1 naharkhoran / 2 both. The per-branch duplication the user saw in "notes" is the issues[] repetition (below) and the record/rule families.

---

## 2. Mirrors

70 records `role: mirror` (45% of records, 14% of store), F-00202..F-00236 and F-00259..F-00293. Every one: `rows: []`, `fields: []`. Payload = `{medium, role, location, grain, mirror_of, import, named_range}`.

- Edges **into** mirrors from non-mirrors: **0**.
- Edges out of mirrors: 70 `mirror_of` + 90 `issues[].affects` (45 of which are self-loops).
- Deleting all 70 breaks **nothing**. The 43 issues on them must move to the source record (`mirror_of.ref`), where the eight copies of «ردیف تاریخ ۱۴۰۴/۰۹/۱۴ … دو بار تکرار شده» (F-00272, F-00274…F-00281) collapse to one on the Anbar/Tedade source.
- Two branch mirrors of one source: F-00225 and F-00282 both `mirror_of: F-00167`. Deleting both loses no fact.

Rules that "merely pull": `gozaresh_*__fn__import_from_sheet` (F-00321, F-00394) — the IMPORTRANGE LAMBDA, stored twice with identical `original`.

---

## 3. Stubs

30, all `record`, all `role: log`, all `data.stub: true`, **all lacking `grain`**.

| workbook | stubs | tabs dumped | stub tabs found in dump |
|---|---|---|---|
| Tedade Fooroosh markazi.xlsx | 11 | 12 | 11/11 |
| Tedade Fooroosh naharkhoran.xlsx | 11 | 11 | 11/11 |
| Anbar markazi.xlsx | 4 | 5 | 4/4 |
| Anbar shobe 2.xlsx | 4 | 6 | 4/4 |

Every stub tab is already in `sheets.json` on disk. `adopted.json` = `[]`. `engine/merge_facts/apply.py:391` matches `data.get("grain") == "workbook"`, so the adoption path could not have fired for any of these anyway.

**Yes — the engine should mint record skeletons for all manifest workbooks up front.** `dump-workbook` already writes `sheets.json` (tab titles + ids) and `rows.tsv` (header rows). A deterministic `merge facts skeleton` pass would emit one record per tab with `location`, `title` from the tab name, and `fields[]` from row 1 — 313 skeletons across 28 workbooks — leaving the agent to *fill* (units, filled_by, primaryKey) instead of *invent identity*. That removes the stub concept entirely, removes the QF-37 deferred-edge machinery, and gives `apply` a natural key that exists before any LLM runs.

---

## 4. Reference graph

1562 `{ref}` occurrences → 1017 unique directed pairs, **0 dangling**.

Edge paths: `data/fields/*/unit_ref` 317, `data/fields/*/of` 216, `data/inputs/*/from` 181, `issues/*/affects` 171, `data/unit_ref` 137, `data/calls` 134, `data/outputs/*/writes_to` 108, `data/mirror_of` 70, `data/row_meta/*/of` 50, `data/about` 47, `accounts/*/value/of` 33, `data/row_meta/*/items` 28, `data/of` 22, `data/bindings/*/tolerance` 10, rest ≤6.

| metric | value |
|---|---|
| nodes | 486 |
| islands (0 in, 0 out) | **11** — F-00155, F-00157, F-00179, F-00294, F-00295, F-00303, F-00306, F-00308, F-00330, F-00403, F-00463 |
| zero in-edges | 268 (rule 107, record 74, item 54, note 22, measurement 11) |
| zero out-edges | 76 (record 48, rule 15, item 10, measurement 3) |
| weak components | 46 — sizes 405, 4, then 33 pairs and 11 singletons |
| reachable from the 139 rules with inputs | 272 (**56%**) |
| unreachable | **214 (44%)** — record 115 (mirror 70, log 42, reference 2, checklist 1), item 59, note 22, measurement 13, rule 5 |

---

## 5. Sources

691 source rows over 486 entries, mean 1.42. **No bloat**: max is 10, distribution 1×360, 2×88, 3×16, 4×9, 5×11, 6×1, 10×1; zero entries above 10 sources; zero duplicate rows within an entry.

By type: sheet 472, voice 64, validation 53, cf 39, process 35, script 23, chat 3, comment 2.

All 472 sheet sources carry both `sheet` and `cell`; none carries a `range`. **592 of 691 (86%) have `hash: null`**, including all 472 sheet sources — no provenance verification is possible.

`bindings`: 41 rule entries, sizes 10×12, 9×12, 6×8, 5×8, 2×1 — arrays of `{row, cell, ingredient_id}` cell addresses. Not in the schema, not in `ui/src/api/types.ts`, not read by any card.

---

## 6. Issues[]

96 issues on 84 entries. **93 of 96 have `affects[]` containing their own entry id.** Only 8 carry a `fix`. 79 distinct descriptions of 96 (one text repeated ×6, four ×3, several ×2).

| kind | n | on mirrors | verdict |
|---|---|---|---|
| junk | 39 | 16 | mostly sheet-owner bug list; a handful (F-00060 one code two titles, F-00071 a column with no `##` code) are definitional |
| column_shift | 20 | 19 | **sheet-owner bug list** — "this tab starts with two empty `Column 40`/`Column 41` columns" |
| scale | 11 | 1 | **facts** (QF-11 history defect: F-00149, grams in a kg column on 16 Azar) |
| cross_record | 10 | 1 | **sheet-owner** — "this tab has 8 rows, its sibling has 104" |
| bug | 9 | 2 | **sheet-owner** — F-00234, a formula looking up food #4 in a table with no such row → `#NUM!` |
| code_collision | 4 | 2 | **facts** — F-00044 «مینی مک» is `##43` and `##47` |
| unit_kind | 3 | 2 | **facts** — F-00173 `##15` counted in one file, kg in another |

≈ **18 definitional / 78 sheet-owner bug reports.**

---

## 7. What the UI actually renders

Backend: `/home/lili/.../code-repo/ui-backend/inja_ui_backend/routers/facts.py` — `GET /api/facts`, `GET /api/facts/branches`, `GET /api/facts/{fid}`, `GET /api/facts/source`, `POST /api/facts/{fid}/resolve`. It serves `data` whole (no key filtering), with visibility masking only.

Frontend: `/home/lili/.../code-repo/ui/src/facts/FactDetail.tsx:156-166` mounts **RuleValueCards, LifecycleCard, RuleCard, RecordCard, ItemCard, MeasurementCard, AccountsCard, FieldStatusCard, IssuesCard, SourcesCard**. There is **no NoteCard**.

Rendered `data` fields:

- **item** — category, unit, unit_raw, code, code_absent, group, state, grade, pack, units, tracked
- **record** — medium, role, location, fields, rows, header_fields, sections, signatures, primaryKey, foreignKeys, reconciled_against, movement, mirror_of, grain, cadence, day_boundary, approved_by, blank_master
- **measurement** — quantity, unit, of, writes_to, when, by, method, exceptions
- **rule** — inputs, outputs, lang, expr, identifier, original, original_ref, port, calls, template_of, divergence, edge_cases, table
- **note** — *nothing*

Stored but never rendered (491 occurrences, 15 keys):

| kind | entries affected | keys |
|---|---|---|
| item | 129/139 | `unit_ref` ×129 |
| record | 122/156 | `import` ×70, `named_range` ×70, `stub` ×30, `filled_by` ×11, `frequency` ×11, `row_meta` ×10, `hidden` ×1 |
| measurement | 13/13 | `per` ×11, `range` ×6, `unit_ref` ×3, sample_size, tolerance, dishes, portions_per_pack, gram_per_portion, pack_size |
| rule | 76/156 | `bindings` ×41, `applies_to` ×19, `of` ×12, `per` ×5, `unit_ref` ×5, `precision` ×4, `text` ×2, flag, effect, range, threshold, meaning, function, port_reason, constants |
| note | 22/22 | `about` ×22 + 12 singletons |

`grep -rn 'unit_ref|bindings|row_meta|applies_to|named_range' ui/src ui-backend/inja_ui_backend schemas/` → no functional hit.

**Drop candidates**: all 15 keys above. `unit_ref` is the largest (137 occurrences) and is fully derivable from `unit` + the `units` registry record.

Off-enum values the UI will render as a label miss: `record.medium: "app"` and `record.role: "checklist"` (both F-00295); `measurement.quantity` on all 13; `item.category` on 132 of 139.

---

## 8. What `merge facts audit` sees

Run against the current store: **88 findings** — `row_gone` 62, `unconsumed_constant` 15, `unknown_role` 7, `duplicate_output` 4. Zero from `_lookalike_title`, `_natural_key_dup`, `_scope_shadow`, `_template_drift`, `_recurring_note_shape`, `_stale_stub`, `_orphan_ref`, `_reconciliation`, `_component_sum`.

The 4 `duplicate_output` findings are the only ones that touch the real problem — and only because five rules collide on one target field:
`duplicate_output F-00332  F-00182/enheraf_ba_tolerance is written by F-00332, F-00333, F-00334, F-00335, F-00347`

The 7 `unknown_role` findings all come from the invented record-level `filled_by: "سرپرست بخش"`.

---

## Concrete structural rules

**Dedup key.** Stop putting the workbook and branch inside the minted key. Key a rule by its *semantics* — `{department}__{concept}` (`cooking__enheraf`, `cooking__masraf_vaqei`) — and move the workbook/branch/line into a `bindings[]` list of `{record: {ref}, branch, line, cell_range}`. Then `_natural_key_dup` sees the collision on the first duplicate instead of never. Add an audit check that hashes `(kind, lang, expr, sorted(input keys), sorted(output keys))` and reports any hash with more than one entry — that one check would have caught 100 of the 156 rules.

**Scope rule.** An entry gets `branches: [chalebagh, naharkhoran]` unless the two branches genuinely differ; where they do, one entry with `template_of` + `divergence` on the instance, never two independent entries. Make `validate` reject a delta in which two entries share a normalised key (branch tokens folded) and neither carries `template_of`. And do not split a run on a branch axis — split on a *subject* axis (all four lines' deviation rules in one pass, both branches) so one pass sees both instances and can write the template relation.

**Mirror rule.** A hidden IMPORT_FROM_SHEET / IMPORTRANGE tab produces **no entry at all**. Its content is one field on the source record: `mirrored_in: [{spreadsheetId, sheet, range}]`. Defects found in a mirror attach to the source record. This deletes 70 entries and folds 43 issues down to roughly 12.

**Stub rule.** Delete the concept. `dump-workbook` already knows every tab; add a deterministic `merge facts skeleton <manifest>` that mints one `record` per tab from `sheets.json` + the header row of `rows.tsv` before any agent runs. Agents then only fill. No stub means no `data.stub`, no `_stale_stub`, no QF-37 deferred edges, and no pass ever inventing identity for a file it did not read.

**Payload rule.** Close `data`. `additionalProperties: true` bought 15 invented keys, 491 dead field occurrences, `measurement.quantity` holding a number in 13 of 13 entries and `item.category` holding a menu taxonomy in 132 of 139. Give each kind a closed `properties` list with the spec's enums, and let a genuinely new shape go to `note` (which is what `note` is for) until the schema is extended deliberately.

**Issue rule.** Split `issues[]` in two. `issues[]` keeps only what changes how the ERP must import: `scale`, `unit_kind`, `code_collision` (18 here). Everything about today's sheet — `column_shift`, `bug`, `cross_record`, most `junk` (78 here) — goes to a separate `runs/facts/<dept>/<ts>/sheet-defects.json` that the playbook hands to the sheet owner and that never enters the store. Drop `affects[]` when its only member is the entry the issue is already on (93 of 96).

**Originals rule.** Key `facts/originals/` by `sha256(content)` rather than by entry id. 140 files → 53. As a side effect two entries holding the same verbatim source stop looking different to every byte-wise comparison.