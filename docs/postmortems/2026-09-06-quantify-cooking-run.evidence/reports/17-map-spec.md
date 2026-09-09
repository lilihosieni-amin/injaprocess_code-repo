# map:spec

## summary
The spec is a 2,396-line, 45-decision design that models identity, time, epistemic status and UI in extreme detail and models the *runtime* not at all. Its own §0 admits the weakness it then shipped: the v1 review "found the pipeline section written against an idealised runtime" (line 25), and v2 changed nothing about execution. §13 + QF-19 mandate ONE agent, in ONE dispatch, walking every workbook dump, every .gs, every image and every transcript and returning ONE facts-delta.json; the words token, output, limit, chunk, batch, parallel, incremental and budget do not occur anywhere in the file, and there is no planning step — Gate M decides manifest judgement columns, not units of work. Almost every "junk" category the user complains about is not an agent failure but an explicit spec mandate: mirrors are records (QF-19 obl. 2, §7 line 908; 70 in the store), cell comments become constants or notes (obl. 2, line 1432), conditional formats become flag rules plus a threshold constant (§8 rule 5, line 1097; 20 in the store), each formula literal becomes its own constant rule (QF-32 line 380), and the whole Jalali conversion family must be ported (QF-12). The per-line rule explosion is structural, not stylistic: QF-32 keys a sheet rule `{record.key}__{column.key}` and QF-15 makes (kind, key, scope) the natural key, so one formula living in eight line-tabs is eight entries by construction — the spec dedups identical *script* bodies but never identical *sheet* formulas, and it has no axis for "line" at all (QF-4 says a third axis is encoded in the key and adding it to scope later "would be a key change"). Nothing in the spec gates an entry on having a consumer; the only consumer test is a post-hoc audit report ("constants no rule consumes"), while QF-44 and `check` define readiness as *workbook coverage* — a metric that rewards volume. `statement` is specified only as "a Persian sentence or short paragraph in the agent's own words" with no register rule and no ban on locators (292 stored statements name a cell, tab or file), and QF-17 then freezes prose fields so a re-run can never improve one. Finally, the spec's own anti-explosion tests exist on paper only: §17's classification fixture ("`Salon - Chalebagh` must yield between 3 and 5 rules … not 574") and the cooking acceptance fixture were never built — the acceptance PDF sits in tests/fixtures/facts/ with no test reading it, so the first real run was the first test.

## problems
- [high/orchestration] §13/QF-19 mandate a single agent, single dispatch over the entire input set; no sizing, chunking, parallelism, output-limit or incremental-write model anywhere in the spec :: /home/lili/Desktop/DriveD/work/Moshtaghi/Inja food/process/process dev/code-repo/docs/superpowers/specs/2026-08-29-quantitative-facts-design.md:1379 (Stage 3: "`Task: quantify` (full) | inputs: department, run_dir, transcript paths, dump paths, image descriptions and image paths, script paths, the d
- [high/orchestration] No planning step: the playbook goes from set resolution straight to one full extraction dispatch :: spec:1371-1391 — the stage table is 0 resume, M manifest, set resolution, A checkpoint, 1 transcribe, 2 prepare, 3 extract, 4 validate, B checkpoint, 5 apply, 6 commit, 7 report, C audit. Stage 0's resume routes "to the first incomplete stage" (:1371) — stage granularity, not unit granularity. Gate 
- [high/spec] Rule identity is the sheet column it came from, so one shared formula across N line-tabs is N entries by construction :: spec:379 ("rule from a sheet formula | `{record.key}__{column.key}`"), :383 (scripts, by contrast: "identical bodies under one identifier are one rule with several sources"), :410-419 (QF-15 natural key = (kind, key, canonical(scope))), :439-449 (QF-4: "A value that genuinely differs per branch is t
- [high/spec] Mirror tabs are mandated as first-class record entries :: spec:1424-1426 (obl. 2 "a one-formula `IMPORT_FROM_SHEET` tab gets `role: mirror`, `mirror_of` and no `fields[]`"), :907-909 ("A hidden one-formula `IMPORT_FROM_SHEET` tab is a record with `role: mirror` … so a source→mirror→report chain collapses on read"), :2112 (Appendix A: "112 hidden mirror tab
- [medium/spec] Cell comments are mandated to become constant rules or notes — the source of the worthless notes :: spec:1432 (obl. 2 "per cell comment a constant rule or note with `source.type: comment`"), :2117 (Appendix A: "81 warehouse cell comments carrying yield decompositions | `rule` / constant / `note` | clean"), §8 rule 13 :1086 ("None of the above → `note`"). Store: 2 notes carry a `comment` source.
- [medium/spec] Cosmetic conditional formats are mandated to become flag rules plus a threshold constant :: spec:1097-1101 (§8 rule 5: "Is a threshold that exists only as a colour → **`rule`** whose output is a flag, with the threshold as a constant rule (in this estate every conditional-format threshold is a sign test at 0 or a text match, so the constant is usually `0` or an enum member)"), :1431 (obl. 
- [medium/spec] One constant rule per formula literal :: spec:380 ("constant from a formula literal | `{record.key}__{column.key}__{binding}` … one constant per formula **group**, never per cell"), :981 ("A constant read from a formula literal is its own rule, one per formula group, keyed by QF-32"), §8 rule 8 :1082 ("Is a value stated singly — a literal 
- [high/spec] No usefulness / consumer gate at write time; the only consumer test is a post-hoc audit report :: spec:1298 (`audit` reports "constants no rule consumes and no record field derives" — a report, and §12's preamble :1281 says the reporting verbs "write nothing"), §8 :1087-1101 has 13 branches and no reject branch, §11 :1220-1270 has no drop action, QF-9 :735-739 keeps `note` deliberately open.
- [high/spec] Readiness and coverage are measured in workbooks read, which rewards volume :: spec:1300 (`check` … "report manifest workbooks that no non-stub `record` cites (the coverage denominator: \"read\")"), :1331-1336 (QF-44: "A scope is ready to hand over when … `check` reports full manifest coverage, and every non-retired entry is green"), :1612 (UI coverage line «۱۹ از ۲۸ کاربرگ خو
- [high/spec] `statement` has no register rule and no prohibition on locators, so colloquial and cell-citing statements are spec-conformant :: spec:538-546 ("a Persian sentence or short paragraph in the agent's own words … It is distinct from `accounts[].statement`, which holds *verbatim quotes*") — no register, length or content constraint. QF-42 :1683-1694 ("Nothing served is a bare key … a reviewer never reads `prod_61__ing_22`") govern
- [medium/spec] QF-17 freezes prose fields, so a bad statement can never be repaired by a re-run :: spec:1223-1229 ("*Prose fields* (`statement`, `grain`, `method`, `exceptions`, `reason`, `why`, `fields[].description`, `issues[].description`): filled once … never rewritten by a later run — a second run's different wording is discarded — and changed only through `edit-fact`").
- [high/engine] Read-before-mint plus delta-wide temp ids block per-unit parallel extraction as specified :: spec:397-409 (QF-34: "The agent receives the current `facts/.index.json` and the entries in its department's and the universal scope, and must reuse an existing key when the referent is the same"), :1291 (`apply` … "publish one delta-wide temp→real map to `{run_dir}/id-map.json`"), :410 (QF-15: "Two
- [high/engine] apply/validate are whole-delta, all-or-nothing: one bad entry blocks the entire run :: spec:1281 ("deterministic, `DATA_ROOT`-relative, exit 2 on a failed precondition with nothing written"), :1291 ("precondition pass over the whole delta"), :1382-1384 (Stage 4: "on failure re-dispatch the agent with the stderr appended and re-validate; after two failed attempts STOP" — the re-dispatc
- [medium/validator] Payload enums of §7 are unenforced by the schema; an out-of-vocabulary value reached the store :: /home/lili/Desktop/DriveD/work/Moshtaghi/Inja food/process/process dev/code-repo/schemas/facts.schema.json — the only enums are source[].type, accounts[].status, issues[].kind, issues[].fix.op, kind, status and field_status values; `record.role`, `record.medium`, `record.cadence`, `item.category`, `
- [high/harness] The spec's own anti-explosion acceptance fixtures were never built; the first real run was the first test :: spec:2003-2010 ("Classification fixture for the agent: … `Mavade Avalie!پیتزا ایتالیایی` must yield one reference record with its cells as rows, not 300 constants; `Salon - Chalebagh` must yield between 3 and 5 rules … not 574") and :2011-2035 (cooking acceptance fixture). The reference PDF exists a
- [medium/spec] QF-12's port criterion mandates the date-conversion plumbing the user calls non-quantitative :: spec:1055-1062 ("The criterion is \"any function appearing in a cited `expr` or its transitive `calls[]`\", which today means the whole Jalali conversion family in both directions, `GET_ROW_BY_PERSIAN_DATE`, and `getValueById`"), :1387-1390 (bootstrap seeds "the Jalali conversion family, the unit ta
- [medium/spec] The `note` kind is an open escape hatch with no bar and only post-hoc promotion :: spec:735-739 (QF-9: "`note` exists because the next department may bring a shape the survey missed; a sentence claiming the taxonomy is closed would later be cited to force a new shape into an ill-fitting kind"), :1069-1080 (QF-13: the audit reports "recurring note shapes" for human approval, then `
- [medium/agent-prompt] One agent prompt carries nine obligations spanning five input media plus the whole classification rule, and the spec explicitly refuses to split it :: spec:1355 (QF-38 table: "**`quantify`** agent (modes `manifest`, `full`, `targeted`); its obligations (QF-19) are one page and live in `agents/quantify.md` itself — the split that justified a separate 588-line skill for `extract` does not arise"), :1415-1418 ("whose prompt is already 17 KB and deleg

## details
## (1) The stated PURPOSE of facts — quotes

**The ERP is the named consumer** (§1 "The problem", lines 84-86):

> "It is **input to a later stage** — an ERP will be built from these processes with Claude Code's help — so formulas must be stored unambiguously for a machine, not merely legibly for a human."

**Write-once so no future reader repeats the work** (§1, lines 118-120) — the sentence the user's "cell refs defeat the purpose" complaint maps onto exactly:

> "Reconstruction is real work. **It must happen once and be saved, not repeated by every future reader.** That is what this design stores."

**Meaning here, history in the files** (§2 QF-1, lines 126-133):

> "**QF-1. The test is whether it changes every night.** Stored: what a column *means*, its unit, who fills it in, when, and how a number is computed from other numbers. Not stored in the fact files: a number that changes — the nightly observations. … "35 kg of cheese on 16 Azar 1404" stays in `Pitza.xlsx`, which is kept verbatim on the server (§3) so the ERP can read history from the files and *meaning* from here."

**The dependency graph is the ERP's inheritance** (QF-10, lines 912-916):

> "`Gozaresh markazi` holds almost no data of its own; it pulls from the station, warehouse, sales and ingredient workbooks through `IMPORT_FROM_SHEET`. That dependency graph *is* the data flow and is the single most useful thing the ERP builder inherits."

**Exact-reproduction contract** (QF-12, line 1055): "`port: true` marks a function the ERP must reproduce exactly".

**Rows are read straight out of the store by the ERP** (§9, line 1174): "The ERP reads the rows from `records.json`; `merge facts export --record <key>` emits a CSV of them on demand as a derived view that is never committed."

**Human consumer = a Panel reviewer closing gaps** (QF-22, lines 1505-1509):

> "Its own top-level section, spanning departments … The reviewer is a person closing data gaps, not a person reading one department's diagram; attaching facts only to nodes would make every unlinked fact invisible. The section is **Panel-only**."

**Handover** (QF-44, lines 1331-1338): readiness = `check` reports full manifest coverage + every non-retired entry green for a `confirm` holder; the artefact is a git tag over `facts/`, `attachments/sheets/` and the run dirs.

**Absent from the spec: a dev-loop consumer.** No section names Claude Code (or any agent) reading `facts/` *instead of* the sheets during ordinary development; §1's "with Claude Code's help" is about building the ERP later. The nearest thing to a dev-loop is QF-34 (the `quantify` agent itself reads `.index.json` for read-before-mint) and QF-39's reverse index in the UI. This absence matters for the redesign: the "make sheet-reading unnecessary" test the user applies is implied by line 120 but is never written as a rule, a schema constraint, or a test.

---

## (2) Every QF-N invariant, and whether it conflicts with the new feedback

Feedback codes: **F1** mirrors must not be entries · **F2** one shared parametric rule instead of per-line copies · **F3** no cell refs in statements · **F4** no cosmetic cf rules · **F5** no comment-notes · **F6** no date plumbing · **F7** formal register · **F8** only data with a consumer.
Verdicts: **CONFLICT** = the spec mandates what the user rejects · **ENABLES** = permits/creates pressure without mandating · **NEUTRAL** · **SUPPORTS**.

| QF | line | One-line meaning | Verdict |
|---|---|---|---|
| QF-1 | 126 | Definition vs nightly observation is the boundary test | ENABLES F6, F8 — "changes every night" admits date plumbing and an end-of-night stock *definition*; it is a recency test, not a value test |
| QF-2 | 306 | Facts global, one file per kind, dept as tag, `merge` sole writer | NEUTRAL (blocks parallel apply — see §18 ceiling) |
| QF-3 | 156 | Estate in one folder; manifest judgement columns confirmed at Gate M | NEUTRAL — the manifest is the natural home for a per-workbook usefulness/priority column |
| QF-4 | 439 | `scope` = departments + branches; a per-branch difference is **two entries**; twins linked by `template_of`; a third axis is encoded **in the key** | **CONFLICT F2** — mandates copies, forbids a shared entry with an `applies_to` list; "Adding it to `scope` later would be a key change" |
| QF-5 | 547 | `source[]` is a list with typed locators + hash | SUPPORTS F3 (locators have a home) but never forbids repeating them in prose |
| QF-6 | 564 | Epistemic status per field; `null` leaf = unknown; open account = disputed; `field_status` sparse map | NEUTRAL; ENABLES F8 mildly (mandates writing `null`-valued entries for missing dimensions, §2:144-151) |
| QF-7 | 628 | Run directory is the provenance; field-path grammar | NEUTRAL |
| QF-8 | 645 | A fact links to a process only via a node that names it | NEUTRAL — but line 1463: "An entry that no node names has no process link, and that is the normal case for most sheet-derived entries" = most entries have no known consumer, and that is declared normal |
| QF-9 | 735 | Five kinds; `note` is a deliberate open escape hatch | **CONFLICT F5/F8** — "a sentence claiming the taxonomy is closed would later be cited to force a new shape into an ill-fitting kind" |
| QF-10 | 912 | Excel-built-from-Excel is a first-class relation | **CONFLICT F1** (as implemented through §7's mirror record) |
| QF-11 | 921 | History defects → `issues[]` | NEUTRAL |
| QF-12 | 1055 | `port: true` + `edge_cases[]` for anything transitively called | **CONFLICT F6** — "the whole Jalali conversion family in both directions" |
| QF-13 | 1075 | The facts audit owns note promotion | ENABLES F5 — cleanup is post-hoc and human-gated, not a write-time bar |
| QF-14 | 1087 | 13-branch classification rule, first match wins | **CONFLICT F4** (rule 5), **F5** (rule 13), **F8** (rule 8); SUPPORTS F1 partly (rule 6 = one reference record, "never one constant per cell") |
| QF-15 | 410 | Natural key = (kind, key, canonical(scope)) among open entries | **CONFLICT F2** — identity includes scope, so a branch-shared rule cannot be one entry |
| QF-16 | 421 | Why keys are not display names | NEUTRAL |
| QF-17 | 1220 | Write ladder per leaf; prose fields filled once, "a second run's different wording is discarded" | **CONFLICT F7** — no re-run can fix a colloquial statement; only `edit-fact` |
| QF-18 | 1344 | Withdrawn (v1 tied facts to voice runs) | n/a |
| QF-19 | 1415 | The `quantify` agent: one page, nine obligations, full/targeted/manifest | **CONFLICT F1, F4, F5, F8** (obl. 2 mandates mirrors, cf flags, comment entries, per-literal constants) and the core orchestration conflict |
| QF-20 | 1478 | Stubs (record stub, workbook stub) | ENABLES F8 — identity-only entries; audit reports stale ones after 3 runs/30 days |
| QF-21 | 1303 | One `F-` prefix, five digits, global ledger | NEUTRAL |
| QF-22 | 1505 | Facts get their own Panel section spanning departments | NEUTRAL |
| QF-23 | 1520 | Panel-only visibility; capability-gated | NEUTRAL |
| QF-24 | 1538 | One confirmation tick per entry, fingerprint over the whole entry | ENABLES F8 pain — every junk entry costs one human tick and any later write invalidates it |
| QF-25 | 1592 | Two confirmation states; red counts; red blocks the tick | NEUTRAL |
| QF-26 | 1647 | Six visibility switches, default shown | NEUTRAL |
| QF-27 | 1571 | `_target_scope` loads the fact to derive the gate | NEUTRAL |
| QF-28 | 221 | `.xlsx` gitignored; dumps/manifest/scripts committed | NEUTRAL |
| QF-29 | 236 | Re-export in place; hash + sheetId drift reporting | NEUTRAL |
| QF-30 | 243 | `extract-attachment` becomes a dispatcher; images/PDF via Vertex; agent sees description **and** image | NEUTRAL (adds context cost to the single dispatch) |
| QF-31 | 330 | Keep files readable: originals out of line, index for listing, 2 MB/file ceiling | NEUTRAL — sizes the *store*, never the agent's output |
| QF-32 | 360 | The key table (the identity grammar) | **CONFLICT F2** (`rule from a sheet formula` = `{record.key}__{column.key}`) and **F8** (`constant from a formula literal … one constant per formula group`) |
| QF-33 | 430 | Branch/department registries are authoritative | NEUTRAL — supplies the vocabulary a future `applies_to` list would use |
| QF-34 | 397 | Read before mint; keys immutable; agent gets the index + in-scope entries | ENABLES the context blow-up; **blocks naive parallelism** |
| QF-35 | 686 | Lifecycle: valid_from/to, supersedes, retired | NEUTRAL |
| QF-36 | 694 | `issues[]` on the envelope, anchored by date not row | NEUTRAL |
| QF-37 | 707 | One reference notation `{ref, field?, row?}` | NEUTRAL — but temp ids are delta-scoped, so per-unit deltas cannot cross-reference |
| QF-38 | 1349 | Two playbooks, one agent, three modes; explicitly refuses a skill split | **CONFLICT** with any redesign that adds an orchestration layer |
| QF-39 | 1620 | Evidence is downloaded, never rendered; reverse index; dispute resolution | NEUTRAL |
| QF-40 | 1180 | Units are a `record` (`native`/`config`), written before anything citing a unit | NEUTRAL (a hard bootstrap ordering constraint for parallel runs) |
| QF-41 | 1205 | One stored date type: Latin-digit Jalali | NEUTRAL (distinct from F6, which is about *date plumbing facts*) |
| QF-42 | 1663 | LTR islands, Persian labels, "nothing served is a bare key" | SUPPORTS F3 **in the UI only** — it never constrains the stored `statement` |
| QF-43 | 450 | Scope assignment; empty scope only where no branch/dept referent | **CONFLICT F2** — a run "may **create** entries scoped to its own department or to none"; there is no shared-across-lines scope |
| QF-44 | 1331 | Readiness = full manifest coverage + everything green | **CONFLICT F8** — the success metric is workbooks read |
| QF-45 | 348 | `schema_version` + named migrations, refuse-on-higher | NEUTRAL |

---

## (3) §13 pipeline, QF-19's nine obligations, and the one-pass assumption

### §13 `quantify` playbook stage table (verbatim)

> | # | stage | what happens | turn ends |
> |---|---|---|---|
> | 0 | resume | read `runs/facts/{dept}/{stamp}/meta.json`; route to the first incomplete stage | — |
> | M | manifest checkpoint (STOP — only when a workbook's row is missing or unconfirmed) | `dump-workbook --init-manifest` (mechanical columns; structure-only dump); `Task: quantify` (manifest) writes `{run_dir}/manifest-proposal.json` — per workbook `departments`, `branches`, `reference_tabs`, a reason each, `?` where undecided; Persian list of the rows, one line each; a correction re-dispatches the agent; on «تأیید» the playbook writes the manifest with `confirmed: true` and reruns `dump-workbook --manifest` so the confirmed reference tabs gain their `rows.tsv` | yes |
> | — | resolve the set | manifest rows for this department; `departments/{dept}/attachments/*`; shared `NAMED_FUNCTIONS.md` and the `.gs` files the manifest pairs with those workbooks; then **ask which recordings**: list `meetings/transcripts/{dept}-*.txt` ∪ `meetings/audio/{dept}-*` without a matching transcript (the glob pair `process-voice` resolves), with a marker for ones an earlier facts run consumed; the user names dates, or none | — |
> | A | set checkpoint (STOP) | Persian list of every input with its state (dumped / described / transcript approved / raw / missing) | yes |
> | 1 | transcribe missing | `transcribe` and the per-file verbatim gate exactly as `process-voice` Stage 1; skipped when no recording was chosen | — |
> | 2 | prepare inputs | `dump-workbook --manifest` over the whole manifest (idempotent, cached — the estate is one graph); `extract-attachment {dept}` and `extract-attachment --path attachments/sheets`; `skipped` lines relayed in Persian, exit 3 continues | — |
> | 3 | `Task: quantify` (full) | inputs: department, run_dir, transcript paths, dump paths, image descriptions and image paths, script paths, the department's `processes/*.json` (for QF-8's anchors), `facts/.index.json` and the entries in the department's and universal scope; output: `facts-delta.json` and a Persian summary (counts per kind, every `unknown`/`disputed`, stubs, supersessions) | — |
> | 4 | `validate facts-delta` | schema and content checks; on failure re-dispatch the agent with the stderr appended and re-validate; after two failed attempts STOP and report in Persian with the delta path, as `process-voice` bounds `classify` | — |
> | B | facts checkpoint (STOP) | Persian: new / updated / superseded per kind; every `unknown` and `disputed` with its accounts; stubs about to be written; a correction re-dispatches the agent only | yes |
> | 5 | `merge facts apply` | as §12 | — |
> | 6 | finish + commit | `meta.json` (recordings, attachments, workbooks consumed, ids created); `git -C <data-repo> add departments runs facts attachments && git commit` — the allowlist, never `git add -A` (`departments` because the field-material `.text/` caches are tracked) | — |
> | 7 | report | Persian open-work delta, counted in field paths («۳۸ سلول بی‌پاسخ، ۲ مورد متعارض»), with the exact `merge facts resolve …` commands, account ids included | — |
> | C | audit review (STOP, per item) | `merge facts audit` presented item by item for approval, as `process-voice` Stage 10 presents consolidation; approved items run `resolve`/`retire`/`promote`, or a one-entry `apply` re-pointing a process link to its heir, under this run's directory | yes |

Bootstrap paragraph (lines 1386-1394, verbatim):

> "**Bootstrap order** — an efficiency for everything except the `units` record, which is a correctness prerequisite: `apply` resolves unit symbols against the store, not against the delta under application, so the `units` record is written in a run of its own before any entry that cites a unit. Then the universal seeds under `management` (QF-43), then station and warehouse workbooks, then sales and ingredients, then the report workbooks, so cross-workbook references resolve to real records and few stubs are left to fill. The whole estate is on disk from day one, so a run for any department can read the dump of a workbook it does not own to derive a key — it may not create facts scoped to that department (QF-43)."

### QF-19's nine obligations (verbatim, lines 1415-1470)

> "**QF-19. The `quantify` agent.** A separate agent, not an extension of `extract`, whose prompt is already 17 KB and delegates to a 588-line skill. `model: claude-opus-5[1m]`, `tools: Read, Glob, Write` — no Bash, no ids, no hashing. It inherits the non-negotiables: fill-empty, no fabrication, cite every source, IDs only from `allocate-id`. Its obligations in full mode:
>
> 1. Load the index and the in-scope entries; build the map of keys and titles it must reuse (QF-34). Assign scope by QF-43.
> 2. Walk each workbook dump: per non-empty tab one `record` (key from the tab per QF-32, `role` from shape; a one-formula `IMPORT_FROM_SHEET` tab gets `role: mirror`, `mirror_of` and no `fields[]`; a BOM or dictionary tab gets `role: reference` and its `rows.tsv` cells as `rows[]`; an empty tab yields nothing); per formula group one `rule` keyed by output, `original` verbatim, `expr` in the FEEL subset with named functions inlined and `calls[]` to their rule keys, and each literal it consumes as one constant rule per group, keyed by QF-32; per validation a `constraints.enum`; per conditional-format rule a flag rule with its threshold constant; per cell comment a constant rule or note with `source.type: comment`; per `#N`/`##N` code found in a header or in the row-label column of a BOM tab an item; per `IMPORT_FROM_SHEET` a `mirror_of` and the rule that performs the pull — never a `foreignKeys` member, which QF-9 gives a mirror no `fields[]` to build one from. `foreignKeys` is for a tab that joins another table on named columns, and every member carries both of its sides.
> 3. Walk each `.gs` paired with the department's workbooks: one `rule lang: gs` per function, `port` by the QF-12 criterion with `edge_cases[]`.
> 4. Walk each described image and view it: one `record medium: paper` per blank master (sections, `rows[]` with per-row unit, header fields, signature bands); a photograph with handwriting is a values artefact and yields no record.
> 5. Read each chosen transcript in full and take every quantitative passage: measurements, constants (value or range, unit, `per`, `of`, `valid_from`), rules (`text` / `feel` / `table`), `item.tracked` exceptions; a value that belongs to an existing table cell is a source or account on that cell, not a new constant; a stated change is a successor with `supersedes`; competing statements are `accounts[]`; a habit is `informal`; a hedged value is `unknown` with the candidates as accounts.
> 6. Classify with §8 in order; write `null` for a needed value nobody gave and a `field_status` line for a value it inferred or heard as a habit (QF-6); cite every source with its locator; roles, never names.
> 7. Cross-check before writing: units agree on every reference edge or the edge names a `via`; every `{ref}` resolves to a temp or real id. It records the numbers as stated; arithmetic consistency is the audit's job (§12), not the agent's.
> 8. Anchor to processes only by evidence (QF-8): read the department's process files, and give an entry a `processes[]` link only when a node's label or description names the entry's referent, citing that node as a `process` source with its quote. An entry that no node names has no process link, and that is the normal case for most sheet-derived entries.
> 9. Write `facts-delta.json` — temp ids `T-1…`, `{ref}` envelopes, a `key` on every entry — and return only the path and the Persian summary."

### Every place the spec assumes ONE agent reads EVERYTHING in one pass

1. Stage 3 (line 1379) — a single `Task: quantify` (full) whose inputs are *all* transcripts, *all* dump paths, *all* image descriptions and paths, *all* script paths, the department's processes, the index and the in-scope entries; whose output is one `facts-delta.json`.
2. Obligations 2-5 — "Walk each workbook dump", "Walk each `.gs`", "Walk each described image and view it", "Read each chosen transcript **in full** and take every quantitative passage".
3. Obligation 9 — "Write `facts-delta.json` … and **return only the path** and the Persian summary" (one file, one turn).
4. Stage 2 (line 1377) — "`dump-workbook --manifest` **over the whole manifest** (idempotent, cached — **the estate is one graph**)".
5. §3 (lines 181-183) — "The estate is one graph, not 28 departmental files … Filing by department was a category error".
6. §13 bootstrap (line 1392) — "The whole estate is on disk from day one, so a run for any department can read the dump of a workbook it does not own to derive a key".
7. QF-34 (line 397) — "The agent receives the current `facts/.index.json` and the entries in its department's and the universal scope, and must reuse an existing key when the referent is the same".
8. QF-38 (line 1355) — "its obligations (QF-19) are one page and live in `agents/quantify.md` itself — **the split that justified a separate 588-line skill for `extract` does not arise**".
9. Stage 4 (line 1382) — failure handling is "re-dispatch the agent with the stderr appended and re-validate", i.e. regenerate the *whole* delta; "after two failed attempts STOP".
10. Gate B (line 1381) — one Persian checkpoint over the whole delta; "a correction re-dispatches the agent only" (no partial accept).
11. §12 `apply` (line 1291) — "precondition pass over **the whole delta**"; §12 preamble (line 1281) — "exit 2 on a failed precondition with **nothing written**".

### Sizing / chunking / parallelism / output limits / incremental writing / per-workbook units / planning

Exhaustive grep over the 2,396 lines:

| concept | occurrences |
|---|---|
| token / output limit / context window / budget / cost | **none** (the three "token" hits are `validate` tokenising `expr` (:1036, :1309) and an export filename token (:1660)) |
| chunk / batch / parallel / concurrency-of-work | **none** (the two "concurren" hits are the *store* file-lock ceiling, :325 and :2059) |
| incremental writing / streaming / partial delta | **none** — obligation 9 is one file at the end |
| per-workbook unit of work | only in **manifest mode** (:1372, :1472: "per workbook `departments`, `branches` and `reference_tabs`") and in the *dump* layout (:161, :2187). Never as an extraction unit |
| sizing | :51 and :1134 ("no size threshold" — about reference tables), :344 (2 MB per *store file*), :1553 ("stated so the planner sizes it" — about the ui-backend router). Never about the agent's job |
| planning step | **none**. Gate M is a judgement checkpoint over manifest columns; Stage 0's resume is "route to the first incomplete **stage**" |
| retry bound | one: "after two failed attempts STOP" (:1383) |

The only quantities the spec ever measures are store-side: ~1.1 MB of raw formula text, ~163 KB deduplicated, ~100 KB of BOM cells, a 2 MB per-file ceiling (QF-31, :330-347) — and 5,466 formula cells / 316 tabs / 292 validations / 50 cf rules / ~102 comments / 151 codes in Appendix A (:2094-2098). Those numbers are exactly the input size of Stage 3 and are never converted into a work plan.

---

## (4) §7 / §8 / §9 — the sentences that mandate the junk

**`fields[]` (per-tab column model).** §7 record, required `medium`, `role`, `location` (:747-750). Column rules (:860-890): "`header_fields[].key` and `fields[].key` share one namespace and must be disjoint … Every member of `primaryKey` and `foreignKeys[].fields` must be declared, every `rows[].section` must name a declared `sections[].key`, every other member of a row object must be a declared `fields[].key`, and **on a `role: reference` record every declared field that is not `derived` is present on every open row — `null` where the source cell is empty**." Obligation 2: "per non-empty tab one `record`".

**`rows[]` (two uses in one field).** :884-889: "`rows[]` is one field for two uses: a log's fixed rows carry a key, a title and whatever the form prints per row; a reference table's rows carry a value for each declared column, and **each cell is a leaf with its own state** — `null` when unknown, an open account when disputed, a `field_status` line when inferred (`data/rows/prod_61__ing_1/grams`)."

**Mirrors.** §7 (:907-910): "A hidden one-formula `IMPORT_FROM_SHEET` tab is a record with `role: mirror`, `mirror_of: {ref}` and no `fields[]`, so a source→mirror→report chain collapses on read; a tab with no cells produces no record." §9 (:1159-1163): "What the describing record adds that a bare table cannot carry: `mirror_of` on **every cached copy** — the BOM exists once in `Mavade Avalie` and three more times as `Table_Ingredients_*` mirrors … so exactly one table is authoritative and mirrors carry no rows". QF-10 (:912-919) makes the pull chain "first-class". Appendix A (:2112): "112 hidden mirror tabs | `record role: mirror` | clean | `mirror_of`; empty tabs produce nothing". Obligation 2 mandates it per tab. **Store: 70 mirror records of 156.**

**Reference rows (the anti-explosion rule that *did* work).** §9 (:1128-1140): "The BOM in `Mavade Avalie` is 12 tabs and ~1,200 cells of definitions. They are not 1,200 entries: the **shape of the source decides**. Where the estate presents definitions as a table, the fact is one `record` with `role: reference` and the table is its `rows[]` (§7); where a value is stated singly, it is a constant rule (§8). There is no size threshold". §8 rule 6 (:1076-1079): "Is presented **as a table** in its source … → a **`record`** with `role: reference` and the table in `rows[]` (§9), **never one constant per cell**."

**Constants per literal.** QF-32 (:380): "constant from a formula literal | `{record.key}__{column.key}__{binding}`, where `binding` is the `LET` or `definedName` identifier lower-cased (`gozaresh_cb__pizza__deviation_tol__tolerance_per_food_gr`), else `…__c{n}` numbering the group's literals left to right — **one constant per formula group, never per cell**: the ~1,720 Salon copies of one formula yield one rule and one constant per literal, and the same literal in two groups is two constants unless read-before-mint (QF-34) recognises one referent". §7 (:981-982): "A constant read from a formula literal is its own rule, one per formula group, keyed by QF-32." §8 rule 8 (:1082): "Is a value stated singly — a literal in a formula, a number in a sentence → **`rule` with no inputs** (a constant)." Obligation 2: "each literal it consumes as one constant rule per group".

**`bindings`.** The word appears twice. QF-32 (:380) — `binding` is the `LET`/`definedName` identifier that names a literal, and it is a **key segment**, i.e. the literal's identity. QF-10 (:918-919) — "the sheet name is a caller-local `LET` binding". So a `LET` binding inside a report formula is promoted to a store-level named constant with its own `F-` id and its own confirmation tick.

**Conditional-format flags.** §8 rule 5 (:1097-1101): "Is a threshold that exists only as a colour → **`rule`** whose output is a flag, with the threshold as a constant rule (**in this estate every conditional-format threshold is a sign test at 0 or a text match, so the constant is usually `0` or an enum member**)." Obligation 2: "per conditional-format rule a flag rule with its threshold constant". Appendix A (:2114): "thresholds that exist only as a colour (50 cfRules: sign tests at 0, «کسری», delivery-time bands) | `rule` (flag) + constant | clean | §8 rule 5; `source.type: cf`". **Store: 20 rules carry a `cf` source.**

**Comments.** Obligation 2 (:1432): "per cell comment a constant rule or note with `source.type: comment`". Appendix A (:2117): "81 warehouse cell comments carrying yield decompositions | `rule` / constant / `note` | clean". §7 shows the intended good case — the butchery-yield comment becoming one multi-output rule (:985-1002) — but the obligation is stated per comment, unconditionally, and §8 rule 13 (:1086) catches the remainder as `note`.

**Validations.** Obligation 2: "per validation a `constraints.enum`"; §8 rule 4 (:1073-1074): "Is a controlled vocabulary for a column → **`record.fields[].constraints.enum`** on that record, **not a fact of its own**" — a genuine anti-explosion rule, unlike rules 5, 8 and 13.

---

## (5) §18 deliberate ceilings and §0 v2 changes — what the authors already knew was weak

### §18, verbatim (lines 2054-2085)

> "Marked with `ponytail:` comments at the point of implementation, or, where there is no code site, in the file named.
> - Five shared files, no lock; shard by key hash if concurrency becomes real (QF-2) — `merge/facts.py`.
> - Persian text is compared byte-wise everywhere — no NFC, ZWNJ, ی/ي or digit folding, by decision. Keys are ASCII so identity is unaffected; what is affected is the `note` statement hash (a re-worded sentence is a new note), QF-17's `title` equality (a re-typed title reads as a dispute; prose fields are exempt by §11) and title search in `edit-fact` and the UI (a variant spelling misses). The audit's look-alike report is the backstop — `merge/facts.py` and the data section's search.
> - Constant-rule keys are minted; the audit's look-alike report is the backstop (QF-15) — `merge/facts.py`.
> - A process link whose cited node is gone is reported, never auto-repaired and never dropped (QF-8) — `merge/facts.py`.
> - Inventory movement is a record-level field and places are items, not a kind — revisit when the ERP names its inventory atom — `merge/facts.py`.
> - Facts are not in the reader view in v1: a `view`-only holder gets a uniform 404 on every facts route (QF-23) — `routers/facts.py`.
> - No canvas badge for facts: `src/flow/**` is frozen and shared with the PDF export; the reverse index serves the need — `docs/runbooks/07-facts.md`.
> - Facts are not in the department PDF export — `exports.py`.
> - Facts are not a comment target; FR-K1 stands — `docs/runbooks/07-facts.md`.
> - No per-gap question or addressee fields on an entry; an `unknown` field's question is its title and path, found through the list's «وضعیت تأیید» filter — the data section's list screen.
> - The raw-JSON view is read-only; editing an unknown `data` key goes through `edit-fact` — the data section's screen file.
> - `revert` refuses when a later run touched the same paths rather than attempting a three-way merge — `merge/facts.py`."

**Every ceiling is store-, engine- or UI-side. Not one names the extraction run, the agent, output size, run duration or entry quality.** Two are load-bearing for the redesign: "five shared files, no lock" (blocks parallel `apply`) and "constant-rule keys are minted; the audit's look-alike report is the backstop" (the spec knew per-literal constants would collide/duplicate and chose a post-hoc report).

### §0 — what v2 already admitted (lines 15-66)

> "v1 was reviewed against the engine, the ui-backend, the UI, the runtime playbooks and all 28 exported workbooks. The review confirmed the epistemic core … and found the design weak on three axes it did not model: **identity** (every key was a Persian display string), **time** (nothing could be superseded, retired or undone) and **machine consumability** (`feel` unpinned, units free text, references in four notations). **It also found the pipeline section written against an idealised runtime.**"

That last sentence is the whole of what v2 says about the pipeline — and v2's remedy was QF-38/QF-19 (a dedicated playbook and agent), not a runtime model. The other v2 admissions relevant to this postmortem:

- "**Five kinds, not six.** A parameter is a rule with no inputs; the `parameter` kind is merged into `rule` (§7). A table of definitions is a `record` whose rows are inside it — no CSV side files, no size threshold; the shape of the source decides (§9)." (:49-52) — the only granularity fight the authors picked, and they won it for tables and lost it for formulas.
- "Withdrawn: QF-18 ("bot runs only"), the `quantitative` segment label, filing workbooks per department, `consolidate` as the owner of note promotion, the `parameter` kind, `facts/tables/*.csv`, per-field confirmation." (:63-65)
- "The workbooks live in **one** folder … Filing by department was a category error — v1's table covered 16 of 28 workbooks and mis-filed the three most definitional ones." (:37-40, :183-186) — the decision that makes a department-scoped run read the whole estate.

---

## (6) Sections the redesign must change

### (a) Engine-generated record skeletons from `sheets.json`

| § / QF | change |
|---|---|
| §13 stage table (:1371-1391) | new stage between 2 and 3: `dump-workbook` (or a new verb) emits skeleton records; Stage 3's input becomes skeletons + dumps, not dumps alone |
| QF-19 obl. 2 (:1423-1436) | delete "per non-empty tab one `record` (key from the tab per QF-32, `role` from shape…)"; the agent reviews/annotates a generated skeleton instead of authoring it |
| QF-32 key table (:369-371) | the `sheet record` row moves from agent-minted to engine-derived; the "else minted once by the agent (`pizza` for «پیتزا»)" branch needs an engine-side transliteration or a `manifest`-supplied name (Gate M column) |
| §7 record payload (:747-911) | `fields[]`, `location`, `header_fields[]`, `primaryKey` become engine outputs; `grain`, `role`, `refItems`, `cadence`, `filled_by` stay human/agent judgement — the split must be written down |
| §12 `apply` (:1291) | must accept a skeleton whose prose fields are empty without failing §11's fill-empty ladder; QF-6's "`null` = unknown vs absent = N/A" needs a third state for "not yet reviewed" or skeletons will all read red |
| QF-1 (:126) / QF-44 (:1331) | a skeleton is not a fact; coverage and readiness must not count skeletons as "read" |
| Appendix C (:2185-2213) | `sheets.json` must carry enough (header row, types, hidden, merged bands, code hits) to build a skeleton — it already carries "the first ≤ 5 rows verbatim plus a `header_row` index" |
| §17 (:1876-1896) | new `dump-workbook`/skeleton tests |

### (b) Shared parametric rules with an `applies_to` list

| § / QF | change |
|---|---|
| QF-32 (:379-380) | **the core change**: `rule from a sheet formula | {record.key}__{column.key}` must become a content-derived key (normalised `expr` hash + semantic name), so eight identical line formulas mint one key. Mirror the script row's existing wording: "identical bodies under one identifier are one rule with several sources" |
| QF-4 (:439-449) | "A value that genuinely differs per branch is two entries" must be re-scoped to *values*, not *formulas*; the "third axis … encoded in the key" paragraph must be replaced by a real axis, since it explicitly warns "Adding it to `scope` later would be a key change" |
| QF-15 (:410-419) | natural key includes `canonical(scope)`; either scope carries multiple branches for a shared rule, or `applies_to` sits outside the key |
| §7 rule payload (:966-1054) | new `applies_to: [{ref}|{ref, field}]` (records/columns the rule instantiates over); `template_of`/`divergence` (:1053) become the *exception* path for genuine drift, not the normal path |
| QF-43 (:450-465) | "A run may **create** entries scoped to its own department or to none" must admit a rule shared across departments/branches without an empty scope |
| §11 (:1240-1258) | `applies_to` is a new keyed-collection field with its own dedup key; a second run over another line **appends a member** instead of minting a second entry — this is the write-rule that kills the duplication |
| §12 `audit` (:1298) | replace "instances whose `expr` differs from their `template_of`" with a report on `applies_to` members whose source formula diverges |
| §9 `reconciled_against` (:1163-1172) | pairs currently point at a per-column constant; with shared rules the constant may be per-`applies_to` member |
| QF-19 obl. 2 | "per formula group one `rule` keyed by output" → "per distinct normalised formula one rule, with an `applies_to` member per group" |
| §17 (:2003-2010) | the classification fixture already states the target ("`Salon - Chalebagh` must yield between 3 and 5 rules … not 574") — extend it to the tomato/pizza line case |

### (c) Mirrors dropped

| § / QF | change |
|---|---|
| §7 (:907-910) | delete "A hidden one-formula `IMPORT_FROM_SHEET` tab is a record with `role: mirror`…"; a mirror becomes an edge on the source record (e.g. `mirrored_at: [{spreadsheetId, sheet}]`) or nothing |
| §9 (:1159-1163) | "`mirror_of` on **every cached copy**" → one authoritative record naming its copies |
| QF-10 (:912-919) | keep the claim that the pull graph matters, but express it once per pull rule (`foreignKeys`/the rule that performs the pull), not per mirror tab |
| QF-19 obl. 2 (:1424-1426, :1434-1436) | drop the mirror clause and the "per `IMPORT_FROM_SHEET` a `mirror_of` **and** the rule that performs the pull" pair |
| §7 record `role` enum (:858) | `mirror` leaves the enum → Appendix D label (:2271) and the QF-42 label-coverage test change |
| Appendix A (:2112) | the "112 hidden mirror tabs → clean" row is rewritten |
| §12 `audit`, QF-37 | edges that pointed at mirror records must resolve to the source; existing 70 mirror entries need a retire/merge migration (QF-35, QF-45 migration note) |
| QF-44 / `check` (:1300) | coverage counted "workbooks that no non-stub `record` cites" — with mirrors gone, a workbook that is *only* mirrored needs another way to count as read |

### (d) A usefulness gate

| § / QF | change |
|---|---|
| §8 QF-14 (:1087-1105) | the 13-branch ladder needs a **rule 0**: a test the candidate must pass before any kind is assigned (does a named consumer exist — a rule, an ERP dimension, a person's decision?). Rules 5 (cf), 8 (single literal) and 13 (note) must become conditional on it |
| §7 `note` / QF-9 (:735-739, :1069-1080) | the escape hatch needs a bar; QF-13's post-hoc promotion becomes a fallback, not the only filter |
| §2 QF-1 (:126-142) | the boundary test ("changes every night") must be joined by a value test; §2 is where the redesign should state that a fact must make sheet-reading unnecessary (line 120's promise) |
| §12 `apply` (:1291) | either a precondition (reject a kind with no consumer and no explicit `keep` reason) or a warning count in the run report; `audit`'s "constants no rule consumes" (:1298) becomes a write-time check |
| QF-44 (:1331-1338) | readiness must stop being coverage-shaped; `check`'s "coverage denominator: read" (:1300) is the metric to replace |
| §14 QF-25 / Appendix D | a "no consumer" row class if entries are kept and flagged rather than dropped |
| §18 | new ceiling entry: what the gate deliberately lets through |

### (e) Formal-register statements

| § / QF | change |
|---|---|
| §6 (:538-546) | `statement`'s definition must gain a register rule and a locator ban: no cell addresses, tab names, file names or keys in `statement` (they live in `source[]` per QF-5) — and no transcript phrasing (that is `accounts[].statement`) |
| §11 QF-17 (:1223-1229) | "filled once … a second run's different wording is discarded" must admit a re-write path, or the 292 offending statements can only be fixed one at a time through `edit-fact` |
| QF-42 (:1683-1694) | extend "Nothing served is a bare key" from rendering to *storage*, so `validate` can enforce it |
| §12 `validate facts`/`facts-delta` content pass (:1306-1320) | add a statement lint (regex for `!A1`-style refs, `.xlsx`, «سلول»/«تب» + a spoken-register heuristic) — cheap and deterministic |
| QF-19 obl. 5-6 (:1445-1455) | the agent's transcript obligation must say the quote goes in `accounts[]` and the statement is written in the register of a definition |
| Appendix D | «بیان» card heading already exists (:2385); no label change needed |

### (f) Parallel per-unit extraction with per-unit validation

| § / QF | change |
|---|---|
| §13 stage table (:1371-1391) | Stage 3 splits into a **plan** step (units of work: workbook, tab group, script, image, transcript — with sizes) + N parallel dispatches + a merge; Stage 4 validates **per unit**; Gate B presents per unit; Stage 0's resume becomes unit-level, not stage-level |
| QF-38 (:1349-1358) | the "one agent, one page of obligations, the split … does not arise" position is the explicit blocker; either revise it or state the exception |
| QF-19 (:1415-1476) | obligations must be re-scoped from "walk each X" to "walk this unit"; a fourth mode (e.g. `unit`) beside `manifest`/`full`/`targeted`; the `tools` line (`Read, Glob, Write` — no Bash) must be reconsidered if a unit is to self-check |
| QF-34 (:397-409) | read-before-mint across concurrent units: either the engine resolves keys after the fact (preferred — it already re-derives measurement and row keys, :1291) or units get disjoint key namespaces by construction |
| QF-37 (:707-732) + `apply` (:1291) | temp ids are delta-scoped ("publish **one delta-wide** temp→real map"); cross-unit references need either stable natural keys instead of `T-` ids, or a run-wide id map across unit deltas |
| §12 preamble (:1281) + `apply` | per-unit `apply` means N writes per run; today "exit 2 … with nothing written" over the whole delta. §18's "five shared files, no lock" (:2059) must be revisited — the shard-by-key-hash upgrade path is already named |
| QF-2 (:306-329) | one writer, five shared files: either serialise `apply` behind the parallel extraction (simplest, and enough — extraction is the slow part) or shard |
| QF-40 (:1180-1204) + bootstrap (:1386-1394) | the `units` record and universal seeds are hard ordering constraints ahead of any parallel fan-out |
| QF-7 (:628-644) | run directory shape must hold per-unit deltas and id-maps; `facts-run-meta.schema.json` (:1497-1501) gains a units array; `revert` (:1294) currently reads "the run's `facts-delta.json`" (singular) |
| §17 (:1876-2050) | new tests: two units minting the same key resolve to one entry; a failing unit does not block the others; a resumed run re-runs only incomplete units |

### Cross-cutting (all six)

- **§16 Files touched** (:1764-1871) — every list of new/changed files needs the new engine verb(s), the schema changes (`applies_to`, `role` enum without `mirror`, statement lint), the playbook restructure and the missing agent-eval harness.
- **§17 Testing** (:1873-2050) — the two fixtures that would have caught this (§17's classification fixture and the cooking acceptance fixture at `tests/fixtures/facts/kitchen-quantitative-report.pdf`) exist only as prose; nothing in the repo reads them (only `ui/design/mock/facts/generate_mock.py:52` mentions the PDF). The redesign needs them as a runnable pre-flight over one workbook before any full run.
- **`schemas/facts.schema.json`** — payload enums (`record.role`, `record.medium`, `record.cadence`, `item.category`, `fields[].type`, `measurement.quantity`, `outputs[].nature`, `rule.lang`) are declared in §7 prose and absent from the schema; `role: "checklist"` is in the store today, and Appendix D's label-coverage test (which "reads every `enum` and `const` in `facts.schema.json`") is vacuous for payloads as a result.

### Store snapshot used as cross-check (data-repo/facts, 2026-09-06)

items 139 · records 156 · measurements 13 · rules 156 · notes 22 = 486 entries.
record roles: mirror 70, log 58, reference 18, report 8, config 1, **checklist 1 (not in §7's enum)**.
rules with a `cf` source: 20. Rules with no inputs (constants): 17. Notes by source type: voice 28, comment 2, sheet 2, process 1.
Statements naming a cell address, «سلول», «تب» or a workbook filename: **292** across rules+records+notes.