# Shamsi date in voice names — Design

| | |
|---|---|
| **Date** | 2026-07-10 |
| **Status** | Approved; implementing |
| **Scope** | Upload bot voice-name date → Shamsi (Jalali); docs/examples updated |

## Goal

The meeting date embedded in a voice basename (`{depts}-{date}`) should be a **Shamsi**
(Jalali) date, not Gregorian — matching how the analyst thinks about meeting dates.

## Decision

- **Format in the filename:** Shamsi calendar, **Latin digits, `YYYY-MM-DD` structure**
  → e.g. `cooking-1405-04-19`. ASCII, sortable, glob/git-safe; structurally identical to
  the old Gregorian token, so the `-02` collision suffix and every opaque downstream
  consumer keep working unchanged.
- **Input & validation:** accept the date in **Persian or Latin digits**, with `/` or `-`
  separators (`۱۴۰۵/۰۴/۱۹` or `1405-04-19`); validate it is a real Jalali date (correct
  month lengths + leap years) with **`jdatetime`**; normalize to canonical Latin
  `YYYY-MM-DD`. No calendar conversion — we store the validated Shamsi date as typed.
- **Out of scope:** machine timestamps `created_at`/`updated_at`/`started_at`/`finished_at`
  stay Gregorian ISO‑8601 UTC (schema-pinned machine fields).

## The one functional change

`upload-bot/upload_bot/naming.py::normalize_date(raw) -> str`:

1. Normalize Persian digits → Latin and `/` → `-`.
2. Split into `y, m, d` (ints).
3. Validate via `jdatetime.date(y, m, d)` (raises `ValueError` on an impossible date).
4. Return `f"{y:04d}-{m:02d}-{d:02d}"`.

`jdatetime` is imported lazily inside the function (matches the existing `VertexTranscriber`
lazy-import pattern) so the rest of `naming.py` and the wider test suite stay importable
without the dependency installed. `jdatetime` is added to `upload-bot/pyproject.toml`
dependencies. `voice_basename` is **unchanged** — it already treats the date as an opaque
token.

Supporting edits: the `v_date` prompt example (`handlers.py`) and the `normalize_date`
error message become Shamsi; `config/upload-bot.env.example` unaffected.

## Downstream — no logic changes

The voice basename flows opaquely into `source.ref`/`source.run`, `runs/{voice}/`,
`meetings/audio/{voice}.ogg`, `meetings/transcripts/{voice}.txt`, and the `classify`
agent's `voice` field. None of them parse the date, so no code changes there.

## Docs & examples

Update to a Shamsi example (`…-1405-04-19`): ARD §4.2 (naming spec), the upload-bot
prompt/README, the naming unit tests, and the **illustrative** examples in the data-repo
skills/agents (`classify.md`, `process-voice/SKILL.md`).

**Preserved as-is:** factual references to the real recorded test voice `dining-2026-05-06`
(the actual `meetings/audio/dining-2026-05-06.m4a` + transcript that Phases 3/4/5 test
against). Renaming those would be false and would break real tests. No data migration:
the change is forward-only; existing Gregorian-named data and new Shamsi-named data
coexist because the basename is opaque.

## Testing

`test_naming.py`: valid Shamsi → canonical Latin; Persian-digit input; `/` separator;
impossible date rejected (`1405-12-30` in a non-leap year); a real leap day accepted
(`1403-12-30`, a Jalali leap year); `voice_basename` collision (`-02`/`-03`) still works
with a Shamsi base. Verification requires `jdatetime` in the venv
(`uv pip install --python .venv/bin/python jdatetime`), then `make test`.

## Non-goals

No Gregorian↔Shamsi conversion; no change to stored timestamps; no UI work (the Jalali
*display* in the UI is a separate, already-planned Phase-6 concern); no renaming of
existing data.
