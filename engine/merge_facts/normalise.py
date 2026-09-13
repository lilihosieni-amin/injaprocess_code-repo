"""The REPAIR tier (spec 2026-09-13-facts-gate-tiers §4): one pass every gate
runs on an entry before it judges it — the unit gate after materialising, the
assembly, `apply`, `edit` and `validate facts-delta --store`. A repair changes
the entry in place without changing its meaning and may report NOTEs. The order
is fixed: the store's repairs, then the content pass's, each in list order —
with the content pass's key rename (B4/B6) also run first, so the schema
repair already sees a spaced column and its row cells under one repaired name
instead of moving the cells into `extra`."""
from merge_facts import content, preconditions
from merge_facts.tiers import coerce


def normalise_entry(entry, ctx):
    out = []
    for fn in ([content.repair_keys] + list(preconditions.STORE_REPAIRS)
               + list(content.CONTENT_REPAIRS)):
        out += coerce(fn(entry, ctx) or [])
    return out
