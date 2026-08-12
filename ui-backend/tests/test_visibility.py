"""The one filter (spec §11 test 8, D17, D18, D55, D56).

Every field the policy can hide is asserted in **both** directions against the
**same populated document**: hidden by default, and shown to an editor. A test
that asserts a field is absent proves nothing unless the field was there to
begin with, and a test that asserts an editor still sees it proves nothing
unless it is the same document.
"""
import copy

import pytest
from inja_ui_backend import visibility
from inja_ui_backend.store import policy

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
    }


def _sees_dining(ref) -> bool:
    """The link predicate for a caller who may view `dining` and nothing else."""
    return isinstance(ref, str) and ref.rsplit("-", 1)[0] == "dining"


def _text(doc) -> str:
    import json
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
    presence of a link."""
    for editor in (False, True):
        out = visibility.filtered(_doc(), policy=_default(), sees=_sees_dining,
                                  editor=editor)
        assert out["parent"] is None, editor
        assert out["nodes"][0]["subprocess"] is None, editor
        assert out["nodes"][1]["subprocess"] == "dining-002", editor


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
    a filter that added them would produce a document the validator refuses."""
    doc = _doc()
    doc["nodes"].append({"id": "j1", "type": "junction", "junctionType": "XOR",
                         "direction": "split", "position": {"x": 9, "y": 9},
                         "layout": "auto"})
    out = visibility.filtered(doc, policy={f: False for f in policy.FIELDS},
                              sees=_sees_dining, editor=False)
    assert out["nodes"][-1] == {"id": "j1", "type": "junction",
                                "junctionType": "XOR", "direction": "split",
                                "position": {"x": 9, "y": 9}, "layout": "auto"}


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
    """`updated_at` is the one key it removes, and a document that never had one
    must come back whole rather than short a key or raising."""
    ov = {"department": "dining", "name": "سالن"}
    assert visibility.public_overview(ov, editor=False) == ov
    assert visibility.public_overview({}, editor=False) == {}


def test_the_overview_is_shown_in_full_minus_its_timestamp():
    """D55 — no per-field switches and no policy table for the overview.
    `updated_at` goes because it is bookkeeping (D17), and nothing else does."""
    ov = {"department": "dining", "name": "سالن", "description": "شرح واحد",
          "sub_units": [{"name": "واحد یک", "description": "شرح"}],
          "personnel": [{"role": "میزبان", "duties": ["راهنمایی"],
                         "kpi": ["رضایت مهمان"]}],
          "updated_at": "2026-07-06T10:00:00Z"}
    out = visibility.public_overview(ov, editor=False)
    assert set(out) == {"department", "name", "description", "sub_units",
                        "personnel"}
    # Personnel KPIs are D55's, not D17's: they are shown, and the day they are
    # not, that is a new row in policy.FIELDS rather than a new mechanism here.
    assert out["personnel"][0]["kpi"] == ["رضایت مهمان"]
    assert visibility.public_overview(ov, editor=True) == ov


def test_the_overview_filter_does_not_mutate_its_argument():
    ov = {"department": "dining", "name": "سالن", "description": "",
          "sub_units": [], "personnel": [], "updated_at": "2026-07-06T10:00:00Z"}
    visibility.public_overview(ov, editor=False)
    assert "updated_at" in ov
