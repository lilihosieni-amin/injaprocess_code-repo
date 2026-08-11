"""The content fingerprint (spec D20, D21).

A confirmation is a fingerprint, never a boolean. A boolean would have to be
cleared correctly by all three write paths — the UI's Save, a chat edit via
Telegram, and a pipeline `merge` run — and missing one would leave the mark
vouching for something stale, which is the exact failure the mark exists to
prevent. A fingerprint self-invalidates for every path, including paths added
later, with no change to `merge` and no field on `process.json`.

**Canonical, not raw bytes.** Two programs write these files — `ui-backend`'s
`storage.write_json_atomic` (`indent=2`) and the `merge` CLI in `engine/` — so
hashing the file's bytes would make a confirmation depend on which program last
wrote it, and any difference in indent, key order or spacing would silently
un-confirm every process the pipeline touched.

**The four exclusions, and why the line is there.** A confirmation vouches for
what a *reader* sees, so it is invalidated by changes a reader could notice.
`updated_at`, `source` (including `touched_by`), `pending` and `tombstoned` are
D17's never-shown block: internal bookkeeping, not content. Without the
exclusions, ARD §5.3's `source.touched_by` record — added for processes a run
decided were **unchanged** — would un-confirm an entire department on every voice
run, and accepting a `pending` conflict would un-confirm a flowchart without
changing one visible byte of it. Both would be invisible to whoever was surprised
by them. `created_at` is *not* excluded: only these four are, and it is the one
that most looks like it belongs with them.

**It is independent of the visibility policy, and must stay so.** `summary`,
`idef0`, `kpis` and node `icom` are hidden from a non-editor by default but are
switchable (D17), so a fingerprint that skipped whatever is currently hidden
would change meaning the moment a switch moved — every confirmation in the
system, at once, for a change to no document.

**Node positions count**, so moving a node or running the re-layout un-confirms
the process: the diagram's appearance is part of the document.

Pure: no database, no filesystem, and nothing here mutates its argument.
"""
from __future__ import annotations

import hashlib
import json
import unicodedata

#: Excluded from the hash **at every depth**, not only at the top level.
#:
#: `source` appears twice in a process document — once for the process and once
#: per node — and both are provenance a pipeline run rewrites for documents it
#: left otherwise alone. One rule for the key wherever it occurs is also the
#: rule that cannot be got half right.
EXCLUDED: frozenset[str] = frozenset({"updated_at", "source", "pending",
                                      "tombstoned"})


def canonical(value):
    """`value` with the excluded keys gone and every string NFC-normalised.

    Persian text arrives from three keyboards and two pipelines, so the same word
    can be stored composed or decomposed. NFC is applied to keys as well as
    values: a decomposed key would sort differently and hash differently while
    naming the same field.

    Dropping an excluded key is the same operation as never having had it, so a
    document that omits an optional `tombstoned` and one that carries it come out
    identical — an overview, which has no `source` or `pending` at all, hashes
    under exactly this rule too.
    """
    if isinstance(value, dict):
        return {unicodedata.normalize("NFC", k): canonical(v)
                for k, v in value.items() if k not in EXCLUDED}
    if isinstance(value, list):
        return [canonical(v) for v in value]
    if isinstance(value, str):
        return unicodedata.normalize("NFC", value)
    return value


def canonical_json(doc: dict) -> str:
    """The exact text that gets hashed. Public so a test can read it.

    `sort_keys` gives key order that no writer can influence; `separators`
    removes every insignificant space; `ensure_ascii=False` keeps Persian text as
    itself rather than as `\\uXXXX` escapes, so the hash is over the words and not
    over one library's escaping habits.

    Numbers are left to `json.dumps`, which is deterministic for a given Python
    value — and both writers read the document back off disk before it ever
    reaches here, so an int stays an int and a float stays a float through the
    round trip.
    """
    return json.dumps(canonical(doc), sort_keys=True, separators=(",", ":"),
                      ensure_ascii=False)


def fingerprint(doc: dict) -> str:
    """SHA-256 of the canonical form — 64 lowercase hex characters."""
    return hashlib.sha256(canonical_json(doc).encode("utf-8")).hexdigest()
