"""The one filter (spec §11 test 8, D17, D18, D55, D56).

Every field the policy can hide is asserted in **both** directions against the
**same populated document**: hidden by default, and shown to an editor. A test
that asserts a field is absent proves nothing unless the field was there to
begin with, and a test that asserts an editor still sees it proves nothing
unless it is the same document.
"""
import copy
import json
import pathlib

import pytest
from inja_ui_backend import visibility
from inja_ui_backend.store import policy

SCHEMAS = pathlib.Path(__file__).resolve().parents[2] / "schemas"

#: Every switchable field carries a distinct ASCII sentinel, so a failure names
#: what leaked at a glance and none of them can be a substring of anything else.
SENTINELS = {
    "process_summary": "SUMMARYTEXT",
    "process_idef0": "IDEF0TEXT",
    "process_kpis": "KPITEXT",
    "node_description": "DESCTEXT",
    "node_actor": "ACTORTEXT",
    "node_icom": "ICOMTEXT",
}


def _doc() -> dict:
    """A process with every policed field genuinely populated.

    Every one of the six switches, every never-shown field, and a node whose
    `subprocess` points out of the department. A document with an empty
    `idef0` or no `pending` cannot tell a working filter from an absent one.

    `tombstoned` and `superseded_by` are here for the same reason, and it is not
    decoration: the top-level key set is pinned as a **set equality**, and a set
    equality constrains only the keys the fixture actually carries. Absent from
    here, a filter that copied both straight through would pass every assertion
    in this file.
    """
    return {
        "id": "dining-001", "department": "dining", "name": "پذیرایی",
        "summary": SENTINELS["process_summary"],
        "source": {"type": "voice", "ref": "meetings/SOURCEREF.m4a",
                   "run": "runs/chat/SOURCERUN"},
        "parent": {"process": "cooking-777", "node": "cooking-777-n010"},
        "created_at": "2026-07-06T10:00:00Z", "updated_at": "2026-07-06T10:00:00Z",
        "idef0": {"inputs": [SENTINELS["process_idef0"]], "controls": [],
                  "outputs": [], "mechanisms": []},
        "kpis": [{"name": SENTINELS["process_kpis"], "target": "۵"}],
        "nodes": [
            {"id": "dining-001-n010", "type": "activity", "label": "خوش‌آمدگویی",
             "description": SENTINELS["node_description"],
             "actor": SENTINELS["node_actor"],
             "icom": {"inputs": [SENTINELS["node_icom"]], "controls": [],
                      "outputs": [], "mechanisms": []},
             "subprocess": "cooking-888",
             "position": {"x": 160, "y": 90}, "layout": "auto",
             "source": {"created_by": "runs/NODESOURCE", "touched_by": ["ui-edit"]}},
            {"id": "dining-001-n020", "type": "activity", "label": "تسویه",
             "description": "شرح", "actor": "صندوق-دار",
             "icom": {"inputs": [], "controls": [], "outputs": [], "mechanisms": []},
             "subprocess": "dining-002",
             "position": {"x": 300, "y": 90}, "layout": "auto",
             "source": {"created_by": "runs/x", "touched_by": []}},
        ],
        "edges": [{"from": "dining-001-n010", "to": "dining-001-n020", "label": "بعد"}],
        "pending": [{"node": "dining-001-n010", "field": "actor",
                     "current": SENTINELS["node_actor"], "proposed": "PENDINGVALUE",
                     "source": "runs/PENDINGRUN", "status": "open"}],
        "tombstoned": False, "superseded_by": ["dining-009"],
    }


def _doc_with_a_local_parent() -> dict:
    """`_doc()`, but parented **inside** the caller's own department.

    `_doc()`'s parent is a `cooking` one, so on its own it proves only the
    withholding half of the link rule: every mutant of the `parent` test that
    still blanks something passes against it. A process the caller may see the
    parent of is what makes "kept" an assertion rather than a hope — and the
    failure it guards is not a blank screen. `Disclosure.restore` puts back only
    the links it would itself have hidden, so a `parent` this filter withholds
    from an Editor of its own department is a `parent: null` written to disk by
    their next Save.

    `node` is a node id, and `storage.dept_of` of one names no department — so
    the two halves of a `parent` are *not* interchangeable here even when the
    parent is local, which is what makes reading the wrong half detectable.
    """
    doc = _doc()
    doc["parent"] = {"process": "dining-002", "node": "dining-002-n010"}
    return doc


def _sees_dining(ref) -> bool:
    """The link predicate for a caller who may view `dining` and nothing else."""
    return isinstance(ref, str) and ref.rsplit("-", 1)[0] == "dining"


def _text(doc) -> str:
    return json.dumps(doc, ensure_ascii=False)


def _default():
    return dict(policy.DEFAULTS)


# --- the riskiest first: a filter that stops filtering ---

@pytest.mark.parametrize("field", ["process_summary", "process_idef0",
                                   "process_kpis", "node_icom"])
def test_a_field_hidden_by_default_is_not_in_the_body(field):
    out = visibility.filtered(_doc(), policy=_default(), sees=_sees_dining,
                              editor=False)
    assert SENTINELS[field] not in _text(out), field


@pytest.mark.parametrize("field", ["node_description", "node_actor"])
def test_a_field_visible_by_default_is_in_the_body(field):
    """The other direction, and it is not decoration: a filter that blanked
    everything would satisfy every assertion above while taking the flowchart's
    words away from the people it is for."""
    out = visibility.filtered(_doc(), policy=_default(), sees=_sees_dining,
                              editor=False)
    assert SENTINELS[field] in _text(out), field


@pytest.mark.parametrize("field", list(SENTINELS))
def test_every_switch_moves_its_own_field_and_nobody_elses(field):
    """One switch, one field. The same document each way, so 'absent' and
    'present' are about the switch rather than about the fixture."""
    doc = _doc()
    off = visibility.filtered(doc, policy={**_default(), field: False},
                              sees=_sees_dining, editor=False)
    on = visibility.filtered(doc, policy={**_default(), field: True},
                             sees=_sees_dining, editor=False)
    assert SENTINELS[field] not in _text(off), f"{field} survived being switched off"
    assert SENTINELS[field] in _text(on), f"{field} did not appear when switched on"
    for other, token in SENTINELS.items():
        if other == field:
            continue
        assert (token in _text(off)) == (token in _text(on)), (
            f"switching {field} moved {other}")


@pytest.mark.parametrize("field", list(SENTINELS))
def test_an_editor_sees_every_field_whatever_the_policy_says(field):
    """The policy governs non-editors (D17's column is headed 'Non-editor
    default'). The same document, the strictest policy, `editor=True`."""
    doc = _doc()
    out = visibility.filtered(doc, policy={f: False for f in policy.FIELDS},
                              sees=_sees_dining, editor=True)
    assert SENTINELS[field] in _text(out), field


def test_the_never_shown_block_is_gone_for_a_non_editor():
    out = visibility.filtered(_doc(), policy=_default(), sees=_sees_dining,
                              editor=False)
    text = _text(out)
    for token in ("SOURCEREF", "SOURCERUN", "NODESOURCE", "ui-edit",
                  "PENDINGVALUE", "PENDINGRUN", "2026-07-06T10:00:00Z"):
        assert token not in text, token


def test_the_top_level_key_set_is_pinned_as_an_equality():
    """An equality, not a list of `not in`s: the interesting failure is a field
    nobody thought to name — one added to `process.schema.json` next month and
    copied straight into every reader's body. This fails on that too, and the fix
    is to decide, here, whether a reader may have it."""
    out = visibility.filtered(_doc(), policy=_default(), sees=_sees_dining,
                              editor=False)
    assert set(out) == {"id", "department", "name", "parent", "edges",
                        "summary", "idef0", "kpis", "nodes", "pending"}
    assert set(out) == set(visibility.PUBLIC_PROCESS_KEYS)


def test_a_missing_top_level_key_is_dropped_not_nulled():
    """The mutant this pins: `{k: doc.get(k) for k in PUBLIC_PROCESS_KEYS}`
    passes every other test in this file, because `filtered` is never otherwise
    called with a document that has holes in it — `_doc()` is complete end to
    end. A half-built process (the extraction pipeline can write one before
    every field lands) must ship without a key it does not have, not with the
    key present and `None`: `ui/src/screens/Summary.tsx` indexes
    `proc.idef0.controls` and maps `proc.kpis` with no guard, so `idef0: None`
    or `kpis: None` is a TypeError a missing key is not.

    `nodes` and `pending` are excluded from the missing set on purpose:
    `_public_process` writes both unconditionally (its own comments explain
    why), so their presence here is not what this test is about.
    """
    doc = {"id": "dining-001", "department": "dining", "name": "پذیرایی"}
    out = visibility.filtered(doc, policy=_default(), sees=_sees_dining,
                              editor=False)
    assert set(out) == {"id", "department", "name", "nodes", "pending"}
    for key in ("summary", "idef0", "kpis", "parent", "edges"):
        assert key not in out, key


def test_the_tombstone_pair_is_dropped_for_a_non_editor():
    """`tombstoned` and `superseded_by` are the belt to Task 7's braces.

    Task 7 keeps a tombstoned process out of a non-editor's query in the first
    place; this keeps the two keys out of any body that reaches them anyway —
    through a direct link, a stale client, or a route that forgets. Named here
    rather than left to the key-set equality alone because the equality is only
    as strong as the fixture: these two are in `_doc()` precisely so that both
    tests are about a document that genuinely carried them.

    `superseded_by` names other process ids — the successor a reader was not
    told about — so its *value* must be gone from the body too, not merely its
    key from the top level.
    """
    doc = _doc()
    assert doc["tombstoned"] is False and doc["superseded_by"] == ["dining-009"]

    out = visibility.filtered(doc, policy={f: True for f in policy.FIELDS},
                              sees=_sees_dining, editor=False)
    assert "tombstoned" not in out
    assert "superseded_by" not in out
    assert "dining-009" not in _text(out)

    # The other direction, same document: an editor's copy *is* the document.
    ed = visibility.filtered(doc, policy={f: False for f in policy.FIELDS},
                             sees=_sees_dining, editor=True)
    assert ed["tombstoned"] is False
    assert ed["superseded_by"] == ["dining-009"]


def test_a_hidden_field_is_blanked_and_never_dropped():
    """`ui/src/screens/Summary.tsx` dereferences `proc.idef0.controls` and
    `proc.kpis.map` with no guard, and `ui/src/flow/DetailDrawer.tsx` — which is
    off-limits to this plan — dereferences a node's `description`, `actor`,
    `icom` and `source`. Dropping any of them turns a reader's click into a
    TypeError inside a document already handed out; blanking cannot."""
    out = visibility.filtered(_doc(), policy={f: False for f in policy.FIELDS},
                              sees=_sees_dining, editor=False)
    assert out["summary"] == ""
    assert out["kpis"] == []
    assert out["idef0"] == {"inputs": [], "controls": [], "outputs": [],
                            "mechanisms": []}
    assert out["pending"] == []
    node = out["nodes"][0]
    assert node["description"] == "" and node["actor"] == ""
    assert node["icom"] == {"inputs": [], "controls": [], "outputs": [],
                            "mechanisms": []}
    assert node["source"] == {"created_by": "", "touched_by": []}


def test_a_nodes_geometry_and_identity_always_survive():
    """What the filter must never take: the diagram itself."""
    out = visibility.filtered(_doc(), policy={f: False for f in policy.FIELDS},
                              sees=_sees_dining, editor=False)
    node = out["nodes"][0]
    assert node["id"] == "dining-001-n010"
    assert node["type"] == "activity"
    assert node["label"] == "خوش‌آمدگویی"
    assert node["position"] == {"x": 160, "y": 90}
    assert node["layout"] == "auto"
    assert out["edges"] == [{"from": "dining-001-n010", "to": "dining-001-n020",
                             "label": "بعد"}]


def test_a_cross_department_link_is_withheld_and_a_local_one_is_kept():
    """Both directions, because a filter that blanked *every* link would pass the
    first assertion while quietly taking the sub-process graph away from the
    people it is for. What is under test is the department an id names, never the
    presence of a link.

    Both halves of **both** keys: a `parent` and a `subprocess` are two separate
    lines of the rule, and a kept `subprocess` says nothing about a kept
    `parent`. The local-parent document is the one that fails when the `parent`
    line reads the wrong half of the record, or the whole record, or the right
    half of a mangled one — and the cost of that failure is an Editor's Save
    writing `parent: null` over a link they were never shown.
    """
    local = {"process": "dining-002", "node": "dining-002-n010"}
    for editor in (False, True):
        out = visibility.filtered(_doc(), policy=_default(), sees=_sees_dining,
                                  editor=editor)
        assert out["parent"] is None, editor
        assert out["nodes"][0]["subprocess"] is None, editor
        assert out["nodes"][1]["subprocess"] == "dining-002", editor

        kept = visibility.filtered(_doc_with_a_local_parent(),
                                   policy=_default(), sees=_sees_dining,
                                   editor=editor)
        assert kept["parent"] == local, editor
        assert kept["nodes"][1]["subprocess"] == "dining-002", editor


def test_the_link_rule_applies_to_an_editor_too():
    """An Editor of dining is not thereby an Editor of cooking. `editor` is the
    *field* stance and never the link stance — the two are separate questions and
    collapsing them is how a scope boundary leaks to the person most able to act
    on it."""
    out = visibility.filtered(_doc(), policy=_default(), sees=_sees_dining,
                              editor=True)
    assert "cooking-777" not in _text(out) and "cooking-888" not in _text(out)


def test_it_does_not_mutate_the_stored_document():
    """The stored document is what the writers and the export read; this shapes a
    copy on the way out."""
    doc = _doc()
    before = copy.deepcopy(doc)
    visibility.filtered(doc, policy=_default(), sees=_sees_dining, editor=False)
    visibility.filtered(doc, policy=_default(), sees=_sees_dining, editor=True)
    assert doc == before


def test_a_junction_or_terminal_node_survives_untouched():
    """`_public_node` must not invent `description`/`actor`/`icom` on a node type
    that has none — `process.schema.json` sets `additionalProperties: false`, so
    a filter that added them would produce a document the validator refuses.

    A junction **and** a terminal, as the name says, and each carrying every
    property its kind defines, `removed` included: between them they cover the
    three keys of `PUBLIC_NODE_KEYS` — `removed`, `junctionType`, `direction` —
    no activity node in `_doc()` exercises, so a whitelist that quietly lost one
    fails here rather than only in its own pin.
    """
    doc = _doc()
    doc["nodes"].append({"id": "dining-001-j1", "type": "junction",
                         "junctionType": "XOR", "direction": "split",
                         "position": {"x": 9, "y": 9}, "layout": "auto",
                         "removed": False})
    doc["nodes"].append({"id": "end", "type": "end", "label": "پایان",
                         "position": {"x": 400, "y": 90}, "layout": "manual",
                         "removed": False})
    out = visibility.filtered(doc, policy={f: False for f in policy.FIELDS},
                              sees=_sees_dining, editor=False)
    assert out["nodes"][-2] == {"id": "dining-001-j1", "type": "junction",
                                "junctionType": "XOR", "direction": "split",
                                "position": {"x": 9, "y": 9}, "layout": "auto",
                                "removed": False}
    assert out["nodes"][-1] == {"id": "end", "type": "end", "label": "پایان",
                                "position": {"x": 400, "y": 90},
                                "layout": "manual", "removed": False}


def test_a_node_key_nobody_whitelisted_is_not_on_the_wire():
    """The node is a whitelist, not a blacklist — the departure from the brief
    the project owner asked for, and this is the test that says so.

    A blacklist copies the node and blanks the names it knows, so a key nobody
    has heard of ships in full. That is not hypothetical: nothing revalidates a
    stored document on read, the extraction pipeline writes these files, and a
    field can be in a file before it is in `process.schema.json` — the node is
    where the per-step content lives, and Task 10 serves this same shape from an
    unauthenticated link. So the top level and the node are asserted together
    here: two whitelists or the promise is only half kept.
    """
    doc = _doc()
    doc["nodes"][0]["cost_per_unit"] = "NODESECRET"
    doc["margin"] = "PROCSECRET"

    out = visibility.filtered(doc, policy={f: False for f in policy.FIELDS},
                              sees=_sees_dining, editor=False)
    assert "cost_per_unit" not in out["nodes"][0]
    assert "margin" not in out
    assert "NODESECRET" not in _text(out) and "PROCSECRET" not in _text(out)

    # The same document, the other stance: an editor's copy is the document, so
    # this is the whitelist and not a filter that drops unknown keys for all.
    ed = visibility.filtered(doc, policy={f: False for f in policy.FIELDS},
                             sees=_sees_dining, editor=True)
    assert ed["nodes"][0]["cost_per_unit"] == "NODESECRET"
    assert ed["margin"] == "PROCSECRET"


def test_the_public_node_tuple_is_pinned_against_an_independent_literal():
    """Retyped here rather than compared with the module's own constant, for the
    reason the process tuple is: a key set that only checks itself agrees with
    itself whatever it gains or loses. Membership and count, not order."""
    expected = ["id", "type", "label", "description", "actor", "icom",
                "subprocess", "position", "layout", "source", "removed",
                "junctionType", "direction"]
    assert sorted(visibility.PUBLIC_NODE_KEYS) == sorted(expected)
    assert len(visibility.PUBLIC_NODE_KEYS) == len(expected)


def test_every_node_property_the_schema_defines_is_accounted_for():
    """Read off `schemas/process.schema.json`, so a schema addition fails a test
    instead of shipping.

    The whole point of a whitelist is that a new field arrives withheld — but
    withheld silently is its own failure: nobody notices the frontend has no
    data until a reader does. This is the notice. A node kind that gains a
    property fails here, and the fix is to decide, in `PUBLIC_NODE_KEYS`,
    whether a reader may have it and whether the policy blanks it.

    Both directions: a key the schema defines and the tuple omits is an unowned
    decision, and a key the tuple names and the schema does not is a typo that
    would silently whitelist nothing.
    """
    schema = json.loads((SCHEMAS / "process.schema.json").read_text(
        encoding="utf-8"))
    defs = schema["$defs"]
    kinds = [ref["$ref"].rsplit("/", 1)[1] for ref in defs["node"]["oneOf"]]
    assert {"activityNode", "terminalNode", "junctionNode"} <= set(kinds), kinds

    defined = {k for kind in kinds for k in defs[kind]["properties"]}
    whitelisted = set(visibility.PUBLIC_NODE_KEYS)
    assert not defined - whitelisted, (
        f"node properties nobody decided about: {sorted(defined - whitelisted)}")
    assert not whitelisted - defined, (
        f"whitelisted keys the schema does not define: "
        f"{sorted(whitelisted - defined)}")


def test_pending_and_a_nodes_provenance_are_unconditional_not_switchable():
    """The six switches are the whole of what a policy can turn back on.

    `pending` and a node's `source` sit in D17's never-shown block with no switch
    beside them, so the most permissive policy anyone could ever store must not
    bring them back: `set_visibility` is not a route to publishing a reviewer's
    unresolved disagreement or the run id of a meeting recording. Asserted under
    an all-`True` policy — under the default one, "absent" would be indis-
    tinguishable from a switch that happens to be off — and paired with the six
    sentinels being present, so this is about the *block* rather than about the
    filter being switched on at all.
    """
    out = visibility.filtered(_doc(), policy={f: True for f in policy.FIELDS},
                              sees=_sees_dining, editor=False)
    assert out["pending"] == []
    assert out["nodes"][0]["source"] == {"created_by": "", "touched_by": []}
    text = _text(out)
    for token in ("PENDINGVALUE", "PENDINGRUN", "NODESOURCE", "ui-edit",
                  "SOURCEREF", "SOURCERUN", "2026-07-06T10:00:00Z"):
        assert token not in text, token
    for field, token in SENTINELS.items():
        assert token in text, field


def test_an_editor_keeps_pending_and_provenance_because_they_are_theirs():
    """The other direction of the same block, and it is not symmetry for its own
    sake: `disclosure.redact` empties `pending` for exactly the caller who cannot
    edit the department, and `/api/pending` serves the rows to exactly the caller
    who can. An open proposal is work addressed to an Editor, and a filter that
    emptied it for everyone would leave nobody able to resolve one — which a
    "blank the never-shown block unconditionally" reading of D17 would do."""
    out = visibility.filtered(_doc(), policy={f: False for f in policy.FIELDS},
                              sees=_sees_dining, editor=True)
    assert out["pending"][0]["proposed"] == "PENDINGVALUE"
    assert out["nodes"][0]["source"] == {"created_by": "runs/NODESOURCE",
                                         "touched_by": ["ui-edit"]}
    # The whitelist is the non-editor's; an editor's copy is the document.
    assert out["source"]["ref"] == "meetings/SOURCEREF.m4a"
    assert out["created_at"] == "2026-07-06T10:00:00Z"


def test_the_public_key_tuple_is_pinned_against_an_independent_literal():
    """Written out here rather than compared with the module's own constant: a
    key set that only ever checks itself agrees with itself no matter what it
    gains or loses. Membership and count, not order — a reordering changes no
    body, and a duplicate would make `len` disagree."""
    expected = ["id", "department", "name", "parent", "edges",
                "summary", "idef0", "kpis", "nodes", "pending"]
    assert sorted(visibility.PUBLIC_PROCESS_KEYS) == sorted(expected)
    assert len(visibility.PUBLIC_PROCESS_KEYS) == len(expected)


@pytest.mark.parametrize("field", list(policy.FIELDS))
def test_a_policy_missing_a_switch_raises_rather_than_guessing(field):
    """The only two ways to read a switch that is not in the dict are "assume
    visible", which publishes the field the caller never decided to publish, and
    "assume hidden", which quietly withholds content and looks like a policy
    screen that does not work. Neither is a thing to do silently, and every
    caller of this module builds its dict from `store.policy.current`, which is
    keyed off `FIELDS` and therefore complete — so an absent key means a caller
    invented its own policy dict, and a `KeyError` in that caller's own test run
    is cheaper than either guess in production.
    """
    incomplete = {f: v for f, v in _default().items() if f != field}
    with pytest.raises(KeyError):
        visibility.filtered(_doc(), policy=incomplete, sees=_sees_dining,
                            editor=False)


def test_an_empty_policy_raises_and_an_editors_view_needs_no_policy_at_all():
    """`{}` is the degenerate case of the test above. The editor half states the
    other side of `filtered`'s contract in the strongest available form: the
    field rule is not consulted for an editor, so no switch is read and nothing
    can be missing."""
    with pytest.raises(KeyError):
        visibility.filtered(_doc(), policy={}, sees=_sees_dining, editor=False)
    out = visibility.filtered(_doc(), policy={}, sees=_sees_dining, editor=True)
    assert out["summary"] == SENTINELS["process_summary"]


def test_a_switch_nobody_declared_changes_nothing():
    """The vocabulary is `store.policy.FIELDS`'. A row left behind by a switch
    that no longer exists is already ignored by `policy.current`; if one ever
    reaches this far it must not become a field, and the whole body must be
    byte-for-byte what the same policy without it produces."""
    doc = _doc()
    plain = visibility.filtered(doc, policy=_default(), sees=_sees_dining,
                                editor=False)
    extra = visibility.filtered(doc, policy={**_default(), "node_kpis": True,
                                             "process_source": True},
                                sees=_sees_dining, editor=False)
    assert extra == plain


def test_links_only_leaves_a_document_without_links_alone():
    """The two keys this function acts on are both optional in practice — a
    process with no parent and a node with no `subprocess` are the common case,
    and `nodes` itself is absent from a half-built document. None of them may
    become an invented key or an exception."""
    assert visibility.links_only({"id": "dining-001"}, _sees_dining) == {
        "id": "dining-001"}
    bare = {"id": "dining-001", "parent": None,
            "nodes": [{"id": "dining-001-n010", "subprocess": None}]}
    assert visibility.links_only(bare, _sees_dining) == bare
    assert visibility.links_only({}, _sees_dining) == {}


def test_links_only_withholds_by_department_and_by_nothing_else():
    """Called directly, because `exports.py` (Task 10) reaches for it on its own:
    what it does must be pinned here rather than only through `filtered`."""
    doc = _doc()
    out = visibility.links_only(doc, _sees_dining)
    assert out["parent"] is None
    assert out["nodes"][0]["subprocess"] is None
    assert out["nodes"][1]["subprocess"] == "dining-002"
    # The other direction of the same key, against a document that has a parent
    # the caller may see: withholding *every* parent satisfies the line above.
    local = visibility.links_only(_doc_with_a_local_parent(), _sees_dining)
    assert local["parent"] == {"process": "dining-002",
                               "node": "dining-002-n010"}
    # Everything else is the document, untouched: this function is the link
    # rule and not a second field filter.
    assert out["summary"] == SENTINELS["process_summary"]
    assert out["nodes"][0]["source"] == {"created_by": "runs/NODESOURCE",
                                         "touched_by": ["ui-edit"]}
    # A predicate that sees everything withholds nothing.
    assert visibility.links_only(doc, lambda ref: True) == doc


def test_links_only_does_not_mutate_its_argument():
    doc = _doc()
    before = copy.deepcopy(doc)
    visibility.links_only(doc, _sees_dining)
    visibility.links_only(doc, lambda ref: False)
    assert doc == before


def test_the_overview_filter_survives_an_overview_without_a_timestamp():
    """This function drops nothing, so a document that never had `updated_at` —
    or has no keys at all — must come back whole rather than raising."""
    ov = {"department": "dining", "name": "سالن"}
    assert visibility.public_overview(ov, editor=False) == ov
    assert visibility.public_overview({}, editor=False) == {}


def test_the_overview_is_shown_in_full_including_its_timestamp():
    """D55 — no per-field switches and no policy table for the overview.

    The project owner's ruling: `updated_at` stays for a non-editor too. It is
    a last-updated date, not content — it says nothing about what the
    department does — and `ui/src/screens/Overview.tsx` dereferences it with
    no guard, so dropping it is a `NaN/NaN/NaN` on a non-editor's screen, not a
    withheld secret. `overview.schema.json` defines exactly these six
    properties, all required, all read by `Overview.tsx`, so nothing else is
    dropped either: a non-editor's copy is the whole document.
    """
    ov = {"department": "dining", "name": "سالن", "description": "شرح واحد",
          "sub_units": [{"name": "واحد یک", "description": "شرح"}],
          "personnel": [{"role": "میزبان", "duties": ["راهنمایی"],
                         "kpi": ["رضایت مهمان"]}],
          "updated_at": "2026-07-06T10:00:00Z"}
    out = visibility.public_overview(ov, editor=False)
    assert set(out) == {"department", "name", "description", "sub_units",
                        "personnel", "updated_at"}
    assert out["updated_at"] == "2026-07-06T10:00:00Z"
    # Personnel KPIs are D55's, not D17's: they are shown, and the day they are
    # not, that is a new row in policy.FIELDS rather than a new mechanism here.
    assert out["personnel"][0]["kpi"] == ["رضایت مهمان"]
    assert out == ov
    assert visibility.public_overview(ov, editor=True) == ov


def test_the_overview_filter_does_not_mutate_its_argument():
    ov = {"department": "dining", "name": "سالن", "description": "",
          "sub_units": [], "personnel": [], "updated_at": "2026-07-06T10:00:00Z"}
    visibility.public_overview(ov, editor=False)
    assert "updated_at" in ov
