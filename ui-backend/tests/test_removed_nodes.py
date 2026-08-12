"""A soft-deleted node is withheld from a non-editor, and so are its edges (D56).

Deleting a node in the editing app is a **soft** delete: the node stays in the
JSON carrying `removed: true`, so a later `merge` can tell «never existed» from
«taken out» (`ui/src/lib/counts.ts` says so in as many words). Every reader that
shows a process to a human then drops it — `ui/src/flow/adapt.ts` filters on
`removed` before it builds the canvas, `counts.ts` before it counts.

That filter is **in the browser**, and the node reached it in full: its label,
its description and its actor were on the wire. D56's Whole-records row is
*"absent from the response body, filtered in the query. Never client-side"*, and
a step somebody deleted is exactly a whole record. So it is dropped here, before
the body is built, and `ui/src/flow/**` — which is frozen and cannot be
changed — goes on filtering a list that no longer has anything to filter.

**And the edges that name it go with it.** An edge whose endpoint is not in
`nodes` is a dangling edge: `toFlowEdges` maps every edge to a `source`/`target`
pair with no guard, and @xyflow draws nothing for a pair it cannot resolve. A
broken diagram is the failure the whole blank-versus-drop question exists to
avoid, so the two halves are one change and this file asserts them together.

The editor's copy is untouched, node and edges both — they are the person the
soft delete is *for*, and `removed` stays in `PUBLIC_NODE_KEYS` besides, because
a live node still carries `removed: false` and the frozen client still reads it.
"""
from __future__ import annotations

import copy
import itertools
import json
import time

import pytest
from fastapi.testclient import TestClient
from inja_ui_backend import db, seed, visibility
from inja_ui_backend.app import create_app
from inja_ui_backend.auth import hash_password
from inja_ui_backend.fingerprint import fingerprint
from inja_ui_backend.store import confirmations, policy, users
from inja_ui_backend.tests_helpers import cfg_for

PW = "test-password"
BASE = "https://testserver"
MINE = "dining"
PID = "dining-001"
_seq = itertools.count()

#: The three strings a soft-deleted step carries, ASCII so a failure names what
#: leaked. `REMOVEDDESC` is the one that matters most: `node_description` is one
#: of the two fields D17 shows by *default*, so nothing else in the filter would
#: ever have withheld it.
GONE_TOKENS = ("REMOVEDLABEL", "REMOVEDACTOR", "REMOVEDDESC")


def _node(nid: str, tag: str, **extra) -> dict:
    """One activity node whose every readable string carries `tag`, so a leak
    names both the node it came from and the field that let it out."""
    return {"id": nid, "type": "activity", "label": f"{tag}LABEL",
            "description": f"{tag}DESC", "actor": f"{tag}ACTOR",
            "subprocess": None,
            "icom": {"inputs": [], "controls": [], "outputs": [],
                     "mechanisms": []},
            "position": {"x": 60, "y": 60}, "layout": "auto",
            "source": {"created_by": "ui", "touched_by": []}, **extra}


def _doc() -> dict:
    """One live step, one soft-deleted step, and a graph that must survive it.

    `start → KEPT → REMOVED → end` plus `KEPT → end`: taking the soft-deleted
    node out leaves a path the reader can still walk, so a test asserting the
    canvas is coherent is asserting something other than "the canvas is empty".
    """
    return {
        "id": PID, "department": MINE, "name": "پذیرایی", "summary": "خلاصه",
        "source": {"type": "manual", "ref": None, "run": None}, "parent": None,
        "created_at": "2026-07-06T10:00:00Z",
        "updated_at": "2026-07-06T10:00:00Z",
        "idef0": {"inputs": [], "controls": [], "outputs": [],
                  "mechanisms": []},
        "kpis": [],
        "nodes": [
            {"id": "start", "type": "start", "label": "شروع",
             "position": {"x": 10, "y": 60}, "layout": "auto"},
            _node(f"{PID}-n010", "KEPT", removed=False),
            _node(f"{PID}-n020", "REMOVED", removed=True),
            {"id": "end", "type": "end", "label": "پایان",
             "position": {"x": 400, "y": 60}, "layout": "auto"},
        ],
        "edges": [
            {"from": "start", "to": f"{PID}-n010", "label": ""},
            {"from": f"{PID}-n010", "to": f"{PID}-n020", "label": ""},
            {"from": f"{PID}-n020", "to": "end", "label": ""},
            {"from": f"{PID}-n010", "to": "end", "label": "ادامه"},
        ],
        "pending": [],
    }


def _defaults() -> dict:
    return dict(policy.DEFAULTS)


def _sees(_ref) -> bool:
    return True


def _ids(doc: dict) -> list[str]:
    return [n["id"] for n in doc["nodes"]]


def _pairs(doc: dict) -> list[tuple[str, str]]:
    return [(e["from"], e["to"]) for e in doc["edges"]]


def _text(doc: dict) -> str:
    return json.dumps(doc, ensure_ascii=False)


# --------------------------------------------------------------------------
# The filter itself
# --------------------------------------------------------------------------

def test_a_reader_is_not_sent_a_soft_deleted_node_at_all():
    out = visibility.filtered(_doc(), policy=_defaults(), sees=_sees,
                              editor=False)
    assert _ids(out) == ["start", f"{PID}-n010", "end"]
    leaked = [t for t in GONE_TOKENS if t in _text(out)]
    assert leaked == [], (
        f"a soft-deleted step's own content reached a reader: {leaked} — it was"
        f" being dropped in the browser, which is the shape D56 refuses")


def test_the_edges_that_name_a_soft_deleted_node_go_with_it():
    """A dangling edge is a broken diagram, not a smaller one.

    `ui/src/flow/adapt.ts` maps every edge to a `source`/`target` pair with no
    guard and @xyflow resolves nothing for an endpoint that is not a node, so
    dropping the node and keeping its edges trades a disclosure for a rendering
    bug. Both directions of the reference are checked — an edge *into* the node
    and an edge *out of* it — because a filter that looked at one end only would
    pass half of this.
    """
    out = visibility.filtered(_doc(), policy=_defaults(), sees=_sees,
                              editor=False)
    assert _pairs(out) == [("start", f"{PID}-n010"),
                           (f"{PID}-n010", "end")]


def test_every_edge_a_reader_receives_has_both_endpoints_on_the_canvas():
    """The property the test above is one instance of, asserted as a property.

    Pinned separately so that a future filter which drops some other node — for
    any reason at all — cannot leave the diagram dangling without failing here.
    """
    out = visibility.filtered(_doc(), policy=_defaults(), sees=_sees,
                              editor=False)
    ids = set(_ids(out))
    dangling = [(f, t) for f, t in _pairs(out) if f not in ids or t not in ids]
    assert dangling == [], (
        f"these edges name a node the reader was not sent: {dangling} — the"
        f" canvas renders an incomplete graph rather than a smaller one")
    # …and the reader is not simply looking at an empty diagram.
    assert _pairs(out), "every edge was dropped: a filter with nothing left to test"


def test_the_editor_keeps_the_soft_deleted_node_and_every_edge():
    """The pairing, and it is the whole reason the delete is soft.

    Without it, every assertion above is satisfied by a filter that dropped the
    node for everybody — which would take the record away from the person `merge`
    keeps it for and make «never existed» indistinguishable from «taken out».
    """
    out = visibility.filtered(_doc(), policy=_defaults(), sees=_sees,
                              editor=True)
    assert _ids(out) == ["start", f"{PID}-n010", f"{PID}-n020", "end"]
    assert len(out["edges"]) == 4
    for token in GONE_TOKENS:
        assert token in _text(out), (
            f"{token} was withheld from an editor: the soft delete is kept for"
            f" them, and a filter applied to everybody is not a filter")


def test_a_live_node_keeps_its_removed_flag_and_its_edges():
    """`removed: false` is not `removed`, and neither is an absent key.

    A truthiness test written as `"removed" in n` would empty the canvas of every
    node the editing app has ever touched, and one written against the string
    `"false"` would empty it of all of them. Both are here.
    """
    doc = _doc()
    doc["nodes"] = [n for n in doc["nodes"] if not n.get("removed")]
    doc["edges"] = [e for e in doc["edges"]
                    if f"{PID}-n020" not in (e["from"], e["to"])]
    doc["nodes"].append(_node(f"{PID}-n030", "NOFLAG"))   # no `removed` key
    doc["edges"].append({"from": f"{PID}-n010", "to": f"{PID}-n030", "label": ""})

    out = visibility.filtered(doc, policy=_defaults(), sees=_sees, editor=False)
    assert _ids(out) == ["start", f"{PID}-n010", "end", f"{PID}-n030"]
    kept = next(n for n in out["nodes"] if n["id"] == f"{PID}-n010")
    assert kept["removed"] is False, (
        "`removed` left the node: `ui/src/flow/adapt.ts` is frozen and reads it")
    assert len(out["edges"]) == 3


def test_dropping_a_node_does_not_touch_the_stored_document():
    """The stored document is what the writers and the export read."""
    doc = _doc()
    before = copy.deepcopy(doc)
    visibility.filtered(doc, policy=_defaults(), sees=_sees, editor=False)
    visibility.filtered(doc, policy=_defaults(), sees=_sees, editor=True)
    assert doc == before


def test_a_process_with_no_edges_key_does_not_grow_one():
    """The top-level whitelist decides which keys exist; this filter does not.

    A half-written document that carries no `edges` must come out carrying none,
    or `PUBLIC_PROCESS_KEYS`'s pin stops meaning what it says.
    """
    doc = _doc()
    del doc["edges"]
    out = visibility.filtered(doc, policy=_defaults(), sees=_sees, editor=False)
    assert "edges" not in out
    assert _ids(out) == ["start", f"{PID}-n010", "end"]


# --------------------------------------------------------------------------
# …and over HTTP, which is where the reader actually is
# --------------------------------------------------------------------------

def _overview() -> dict:
    return {"department": MINE, "name": "سالن", "description": "شرح",
            "sub_units": [], "personnel": [],
            "updated_at": "2026-07-06T10:00:00Z"}


@pytest.fixture
def corpus(data_root):
    (data_root / "departments" / MINE / "processes" / f"{PID}.json").write_text(
        json.dumps(_doc(), ensure_ascii=False), encoding="utf-8")
    (data_root / "departments" / MINE / "overview.json").write_text(
        json.dumps(_overview(), ensure_ascii=False), encoding="utf-8")
    return data_root


def _client_as(data_root, tmp_path, role):
    """A signed-in client scoped to `MINE`, over a corpus that is **confirmed**.

    Confirmed because D22 would otherwise answer this reader 404 and the
    assertions below would be about an empty body rather than about a node.
    """
    n = next(_seq)
    username = f"0914{n:07d}"
    cfg = cfg_for(data_root, tmp_path / f"removed-{n}.db")
    conn = db.connect(cfg.app_db)
    try:
        db.migrate(conn)
        seed.seed(conn, editor_username="09190000000", editor_display_name="e",
                  editor_password_hash=hash_password(PW))
        rid = conn.execute("SELECT id FROM roles WHERE name = ?",
                           (role,)).fetchone()[0]
        uid = users.create(conn, username=username, display_name="u",
                           password_hash=hash_password(PW), role_id=rid)
        conn.execute("INSERT INTO user_scopes (user_id, scope) VALUES (?, ?)",
                     (uid, f"dept:{MINE}"))
        for target, rel in ((PID, f"processes/{PID}.json"),
                            (MINE, "overview.json")):
            path = data_root / "departments" / MINE / rel
            confirmations.set_confirmation(
                conn, target=target,
                fingerprint=fingerprint(json.loads(
                    path.read_text(encoding="utf-8"))),
                by="09190000000", at=int(time.time()))
    finally:
        conn.close()
    client = TestClient(create_app(cfg), base_url=BASE)
    assert client.post("/api/auth/login",
                       json={"username": username, "password": PW}).status_code == 200
    return client


def _both_boundaries(client) -> dict[str, dict]:
    """The two routes that serve a process document, keyed so a failure names
    which of them disagreed — the door and the window."""
    one = client.get(f"/api/processes/{PID}")
    assert one.status_code == 200, one.text
    listed = client.get(f"/api/departments/{MINE}/processes")
    assert listed.status_code == 200, listed.text
    rows = [p for p in listed.json() if p["id"] == PID]
    assert len(rows) == 1, listed.text[:200]
    return {"GET /api/processes/{pid}": one.json(),
            "GET /api/departments/{code}/processes": rows[0]}


def test_neither_document_endpoint_sends_a_reader_a_soft_deleted_step(corpus,
                                                                      tmp_path):
    """Both, because a rule applied to one of them is the door shut and the
    window open — which is exactly how the tombstone finding arrived."""
    reader = _client_as(corpus, tmp_path, "reader")
    for route, doc in _both_boundaries(reader).items():
        assert _ids(doc) == ["start", f"{PID}-n010", "end"], f"{route}: {_ids(doc)}"
        assert _pairs(doc) == [("start", f"{PID}-n010"), (f"{PID}-n010", "end")], (
            f"{route} left an edge naming a node it did not send: {_pairs(doc)}")
        leaked = [t for t in GONE_TOKENS if t in _text(doc)]
        assert leaked == [], f"{route} leaked {leaked}"


def test_the_editors_two_endpoints_still_carry_it(corpus, tmp_path):
    editor = _client_as(corpus, tmp_path, "editor")
    for route, doc in _both_boundaries(editor).items():
        assert f"{PID}-n020" in _ids(doc), f"{route} dropped it for the editor"
        assert len(doc["edges"]) == 4, f"{route}: {_pairs(doc)}"
