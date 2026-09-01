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
    """`value` with the excluded keys gone, strings NFC-normalised and integral
    floats narrowed to `int`.

    Persian text arrives from three keyboards and two pipelines, so the same word
    can be stored composed or decomposed. NFC is applied to keys as well as
    values: a decomposed key would sort differently and hash differently while
    naming the same field.

    Dropping an excluded key is the same operation as never having had it, so a
    document that omits an optional `tombstoned` and one that carries it come out
    identical — an overview, which has no `source` or `pending` at all, hashes
    under exactly this rule too.

    **`90.0` is the same number as `90`.** JSON has one number type and Python
    has two, so the same JSON number reaches here as `int` or as `float`
    depending on nothing the document says — see `canonical_json` for the path
    that actually does this to node positions. Narrowing integral floats makes
    the two spellings hash alike. Non-integral floats are left as they are.
    """
    if isinstance(value, dict):
        # NFC on a *key* could in principle collapse two distinct keys into one
        # and silently drop the loser; unreachable while every schema key is
        # ASCII, and not worth code until a non-ASCII key exists.
        return {unicodedata.normalize("NFC", k): canonical(v)
                for k, v in value.items() if k not in EXCLUDED}
    if isinstance(value, list):
        return [canonical(v) for v in value]
    if isinstance(value, str):
        return unicodedata.normalize("NFC", value)
    if isinstance(value, bool):
        # Before the float branch and before anything numeric that may follow
        # it: `bool` is a subclass of `int` in Python, and `True` narrowed to
        # `1` would make a flipped `removed`/`tombstoned` flag hash like a count.
        return value
    if isinstance(value, float) and value.is_integer():
        return int(value)
    return value


def canonical_json(doc: dict) -> str:
    """The exact text that gets hashed. Public so a test can read it.

    `sort_keys` gives key order that no writer can influence; `separators`
    removes every insignificant space; `ensure_ascii=False` keeps Persian text as
    itself rather than as `\\uXXXX` escapes, so the hash is over the words and not
    over one library's escaping habits.

    Numbers need one canonicalisation of their own, done in `canonical`: an
    integral float is narrowed to `int`. `json.dumps` is deterministic for a
    given Python value, but it writes `90` and `90.0` differently while JSON
    calls them the same number, and which one a document arrives as is not
    something the document decides. A node position makes the round trip through
    the browser, where `JSON.stringify` emits `90` for `90.0`; the Save path's
    change detector then sees no change (`90 == 90.0` in Python) and writes the
    file back with `90`. Without the narrowing that is a saved edit nobody made
    that voids the editor's own confirmation. Non-integral floats need nothing:
    Python and JavaScript both emit the shortest text that round-trips a double,
    so they already agree.
    """
    return json.dumps(canonical(doc), sort_keys=True, separators=(",", ":"),
                      ensure_ascii=False)


def fingerprint(doc: dict) -> str:
    """SHA-256 of the canonical form — 64 lowercase hex characters."""
    return hashlib.sha256(canonical_json(doc).encode("utf-8")).hexdigest()


#: Excluded from the fact hash at the envelope's **top level only** — never
#: deep, unlike `EXCLUDED` above (spec QF-24). `updated_at` is the envelope's
#: own bookkeeping timestamp; a nested `updated_at` — a `data` key, a record
#: column genuinely named `updated_at` — is content and must change the
#: print. `source` is not excluded at all: on a process it is pipeline
#: provenance, but on a fact it is the account trail a reviewer is vouching
#: for, so it counts as content like everything else in the envelope.
FACT_EXCLUDED_TOP_LEVEL: tuple[str, ...] = ("updated_at",)


def _fact_value(value):
    """`canonical`'s NFC-normalisation and integral-float narrowing, with no
    key exclusion at any depth — `fact_canonical` applies the one top-level
    exclusion itself, once, before recursing into this."""
    if isinstance(value, dict):
        return {unicodedata.normalize("NFC", k): _fact_value(v)
                for k, v in value.items()}
    if isinstance(value, list):
        return [_fact_value(v) for v in value]
    if isinstance(value, str):
        return unicodedata.normalize("NFC", value)
    if isinstance(value, bool):
        return value
    if isinstance(value, float) and value.is_integer():
        return int(value)
    return value


def fact_canonical(doc: dict) -> dict:
    """`doc` with its top-level `updated_at` gone and nothing else excluded.

    A separate function from `canonical` rather than a shared one taking a
    parametrised exclusion set: `canonical`'s exclusion is deep by design
    (D21), and every caller of it today is the process path this task must
    leave untouched. A shared implementation is one future edit away from
    quietly making a fact's exclusion deep too — un-confirming every entry
    that ever gets a `data` key or a record column named `source` or
    `updated_at`. Two short functions that cannot drift into each other's
    behaviour is the safer shape.
    """
    return {unicodedata.normalize("NFC", k): _fact_value(v)
            for k, v in doc.items() if k not in FACT_EXCLUDED_TOP_LEVEL}


def fact_canonical_json(doc: dict) -> str:
    """The exact text a fact's fingerprint hashes. Public so a test can read
    it, exactly like `canonical_json`."""
    return json.dumps(fact_canonical(doc), sort_keys=True, separators=(",", ":"),
                      ensure_ascii=False)


def fact_fingerprint(doc: dict) -> str:
    """SHA-256 of the fact canonical form — 64 lowercase hex characters
    (QF-24)."""
    return hashlib.sha256(fact_canonical_json(doc).encode("utf-8")).hexdigest()
