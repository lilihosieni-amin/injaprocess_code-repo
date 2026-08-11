"""What does and does not invalidate a confirmation (spec §11 test 15, D21)."""
import copy
import json

from inja_ui_backend.fingerprint import EXCLUDED, canonical, canonical_json, fingerprint


def _doc() -> dict:
    """A process with every field D21 mentions actually populated.

    Populated on purpose. A stub with `source: {}` and no `pending` cannot tell a
    working exclusion list from a missing one — every assertion below would pass
    against a `fingerprint` that hashed the whole document.
    """
    return {
        "id": "dining-001", "department": "dining", "name": "پذیرایی از مهمان",
        "summary": "خلاصهٔ داخلی",
        "source": {"type": "voice", "ref": "meetings/a.m4a", "run": "runs/chat/1"},
        "parent": None,
        "created_at": "2026-07-06T10:00:00Z", "updated_at": "2026-07-06T10:00:00Z",
        "idef0": {"inputs": ["سفارش"], "controls": [], "outputs": [], "mechanisms": []},
        "kpis": [{"name": "زمان انتظار", "target": "۵ دقیقه"}],
        "nodes": [
            {"id": "dining-001-n010", "type": "activity", "label": "خوش‌آمدگویی",
             "description": "توضیح", "actor": "میزبان",
             "icom": {"inputs": [], "controls": [], "outputs": [], "mechanisms": []},
             "subprocess": None, "position": {"x": 160, "y": 90}, "layout": "auto",
             "source": {"created_by": "runs/chat/1", "touched_by": []}},
        ],
        "edges": [{"from": "dining-001-n010", "to": "end", "label": ""}],
        "pending": [{"node": "dining-001-n010", "field": "actor", "current": "میزبان",
                     "proposed": "پیشخدمت", "source": "runs/chat/2", "status": "open"}],
    }


# --- the riskiest half first: a fingerprint that does not change when it must ---

def test_moving_a_node_changes_the_fingerprint():
    """D21 names this one explicitly: the diagram's appearance is part of the
    document, so a re-layout un-confirms the process."""
    a = _doc()
    b = copy.deepcopy(a)
    b["nodes"][0]["position"] = {"x": 161, "y": 90}
    assert fingerprint(a) != fingerprint(b)


def test_editing_a_node_label_changes_the_fingerprint():
    a = _doc()
    b = copy.deepcopy(a)
    b["nodes"][0]["label"] = "خوش‌آمدگویی و راهنمایی"
    assert fingerprint(a) != fingerprint(b)


def test_editing_a_policy_hidden_field_still_changes_the_fingerprint():
    """The fingerprint is **independent of the visibility policy**.

    D21's four exclusions are fixed. `summary`, `idef0`, `kpis` and a node's
    `icom` are hidden from a non-editor *by default* — but they are switchable
    (D17), and a fingerprint that skipped whatever the policy currently hides
    would (a) mean every confirmation in the system changes meaning when a switch
    is flipped, and (b) let an Editor's edit to a hidden summary keep a
    confirmation that no longer describes the document.
    """
    for field, value in (("summary", "خلاصهٔ تازه"),
                         ("kpis", [{"name": "دیگر"}])):
        a = _doc()
        b = copy.deepcopy(a)
        b[field] = value
        assert fingerprint(a) != fingerprint(b), field
    a = _doc()
    b = copy.deepcopy(a)
    b["nodes"][0]["icom"] = {"inputs": ["ورودی"], "controls": [], "outputs": [],
                             "mechanisms": []}
    assert fingerprint(a) != fingerprint(b)


def test_a_new_node_changes_the_fingerprint():
    a = _doc()
    b = copy.deepcopy(a)
    b["nodes"].append({"id": "dining-001-n020", "type": "activity", "label": "تسویه",
                       "description": "", "actor": "", "subprocess": None,
                       "icom": {"inputs": [], "controls": [], "outputs": [],
                                "mechanisms": []},
                       "position": {"x": 300, "y": 90}, "layout": "auto",
                       "source": {"created_by": "ui", "touched_by": []}})
    assert fingerprint(a) != fingerprint(b)


def test_every_field_outside_the_four_changes_the_fingerprint():
    """The exclusion list in the other direction: **over**-exclusion.

    A fifth key quietly added to `EXCLUDED` makes confirmations stick when they
    should not, and no test that only varies `updated_at` or `position` would
    notice. `created_at` is the trap: it looks like a timestamp, but only the
    four named in D21 are excluded, and a document whose creation date changed
    is a different document.

    Each variant differs from `_doc()` in exactly the one named key — asserted
    below before it is used — and in nothing else.
    """
    base = _doc()
    variants = {
        "id": "dining-002",
        "department": "cashier",
        "name": "پذیرایی از مهمان ویژه",
        "summary": "خلاصهٔ دیگر",
        "parent": "dining-000",
        "created_at": "2026-07-07T10:00:00Z",
        "idef0": {"inputs": ["سفارش"], "controls": ["دستورالعمل"], "outputs": [],
                  "mechanisms": []},
        "kpis": [],
        "nodes": [],
        "edges": [{"from": "dining-001-n010", "to": "end", "label": "پس از تأیید"}],
    }
    assert set(variants) == set(base) - EXCLUDED, "every hashed key is covered"
    for field, value in variants.items():
        assert base[field] != value, field      # the variant really is a change
        b = copy.deepcopy(base)
        b[field] = value
        assert fingerprint(base) != fingerprint(b), field


def test_every_node_field_outside_the_four_changes_the_fingerprint():
    """The same sweep one level down, where over-exclusion is likeliest.

    `layout` sits next to `position` in every node and would be the easy thing to
    drop along with it — and a node whose `layout` flipped to `manual` is a
    diagram that will lay itself out differently, which is exactly what D21 says
    a confirmation must not survive. `id`, `type`, `actor`, `description` and
    `subprocess` are here for the same reason: nothing else in the suite varies
    them, so excluding one would go unnoticed.

    Each variant differs from `_doc()`'s node in exactly the one named key —
    asserted below before it is used — and in nothing else.
    """
    base = _doc()
    node = base["nodes"][0]
    variants = {
        "id": "dining-001-n020",
        "type": "decision",
        "label": "خوش‌آمدگویی و راهنمایی",
        "description": "توضیح تازه",
        "actor": "پیشخدمت",
        "icom": {"inputs": ["ورودی"], "controls": [], "outputs": [],
                 "mechanisms": []},
        "subprocess": "dining-004",
        "position": {"x": 161, "y": 90},
        "layout": "manual",
    }
    assert set(variants) == set(node) - EXCLUDED, "every hashed node key is covered"
    for field, value in variants.items():
        assert node[field] != value, field      # the variant really is a change
        b = copy.deepcopy(base)
        b["nodes"][0][field] = value
        assert fingerprint(base) != fingerprint(b), field


# --- the other half: a fingerprint that changes when it must not ---

def test_a_pipeline_run_touching_provenance_does_not_change_it():
    """ARD §5.3 appends to `source.touched_by` for processes a run decided were
    **unchanged**. Counted, every voice run would un-confirm the entire
    department including the processes it deliberately left alone."""
    a = _doc()
    b = copy.deepcopy(a)
    b["source"]["run"] = "runs/chat/20260811-090000"
    b["source"]["touched_by"] = ["merge"]
    b["nodes"][0]["source"]["touched_by"] = ["merge"]
    b["updated_at"] = "2026-08-11T09:00:00Z"
    assert fingerprint(a) == fingerprint(b)


def test_resolving_a_pending_conflict_does_not_change_it():
    """Accepting or rejecting a proposal changes no visible byte of the
    flowchart. `pending` is on D17's never-shown list, so it is outside the
    fingerprint and outside what a confirmation vouches for."""
    a = _doc()
    b = copy.deepcopy(a)
    b["pending"][0]["status"] = "rejected"
    assert fingerprint(a) == fingerprint(b)
    c = copy.deepcopy(a)
    c["pending"] = []
    assert fingerprint(a) == fingerprint(c)


def test_tombstoning_does_not_change_it():
    a = _doc()
    b = copy.deepcopy(a)
    b["tombstoned"] = True
    assert fingerprint(a) == fingerprint(b)


def test_an_absent_excluded_key_hashes_like_a_present_one():
    """Absence and emptiness must agree, or two writers disagree over nothing.

    `tombstoned` is optional in the schema, and the department overview (D20's
    other target) carries neither `pending` nor `source` at all. A fingerprint
    that distinguished "key missing" from "key present but excluded" would make
    a confirmation depend on which optional keys the last writer happened to
    emit — the raw-bytes failure D21 exists to avoid, one level up.
    """
    full = _doc()
    stripped = {k: v for k, v in full.items() if k not in EXCLUDED}
    assert set(full) - set(stripped) == {"updated_at", "source", "pending"}
    assert fingerprint(full) == fingerprint(stripped)


def test_key_order_and_indentation_do_not_change_it():
    """Why canonical rather than raw bytes (D21).

    Two programs write these files — `ui-backend`'s `storage.write_json_atomic`
    (indent 2) and the `merge` CLI in `engine/` — so hashing bytes would make a
    confirmation depend on which program last wrote the file, and any difference
    in indent or key order would silently un-confirm everything the pipeline
    touched. Round-tripping through two different serialisations is the check.
    """
    a = _doc()
    reversed_keys = dict(reversed(list(a.items())))
    dense = json.loads(json.dumps(reversed_keys, ensure_ascii=False,
                                  separators=(",", ":")))
    indented = json.loads(json.dumps(a, ensure_ascii=False, indent=4))
    assert fingerprint(a) == fingerprint(dense) == fingerprint(indented)


def test_the_canonical_text_is_pinned_so_two_writers_agree():
    """The serialisation is a contract, not an implementation detail.

    `ui-backend` and the `merge` CLI have to arrive at the same fingerprint
    independently, so every choice D21 names has to be pinned to exact text:
    keys sorted **at every depth**, no insignificant whitespace, Persian kept as
    itself rather than as `\\uXXXX` escapes. None of those is visible to a test
    that only ever compares two hashes produced by this same function — an
    `ensure_ascii=True` or a dropped `separators` is perfectly self-consistent
    and still wrong for the other writer.

    The input is deliberately out of key order, nests a dict that is also out of
    order, and hides an excluded key one level down.
    """
    doc = {"name": "چای", "created_at": "2026-07-06T10:00:00Z",
           "node": {"y": 90, "x": 160.5, "source": {"created_by": "ui"}},
           "updated_at": "2026-08-11T09:00:00Z"}
    assert canonical_json(doc) == ('{"created_at":"2026-07-06T10:00:00Z",'
                                   '"name":"چای",'
                                   '"node":{"x":160.5,"y":90}}')


def test_persian_text_is_nfc_normalised():
    """The same word, composed and decomposed, is the same content.

    U+0622 ARABIC LETTER ALEF WITH MADDA ABOVE, against its decomposition
    U+0627 + U+0653. Written as escapes so the file cannot be "fixed" by an
    editor silently normalising it — which is exactly what would make this test
    pass against an implementation that does no normalisation at all.
    """
    a = _doc()
    a["name"] = "\u0622\u0628"                  # composed
    b = copy.deepcopy(a)
    b["name"] = "\u0627\u0653\u0628"            # the same word, decomposed
    assert a["name"] != b["name"]       # the inputs really do differ
    assert fingerprint(a) == fingerprint(b)


def test_normalisation_reaches_keys_and_not_only_values():
    """A decomposed key sorts differently and hashes differently while naming
    the same field, so NFC has to be applied to keys too. Nothing in a process
    document has a Persian key today, which is precisely why a values-only
    implementation would go unnoticed."""
    composed, decomposed = "\u0622\u0628", "\u0627\u0653\u0628"
    assert composed != decomposed       # the inputs really do differ
    assert canonical({decomposed: 1}) == canonical({composed: 1}) == {composed: 1}


def test_the_canonical_form_carries_no_excluded_key_at_any_depth():
    assert EXCLUDED == {"updated_at", "source", "pending", "tombstoned"}
    text = canonical_json(_doc())
    for key in EXCLUDED:
        assert f'"{key}"' not in text, key
    # …and is not simply empty: the exclusion is a filter, not a bulldozer.
    assert '"nodes"' in text and '"position"' in text


def test_the_fingerprint_is_sixty_four_hex_characters_and_stable():
    a = fingerprint(_doc())
    assert a == fingerprint(_doc())
    assert len(a) == 64
    assert all(c in "0123456789abcdef" for c in a)


def test_it_does_not_mutate_its_argument():
    doc = _doc()
    before = json.dumps(doc, ensure_ascii=False, sort_keys=True)
    fingerprint(doc)
    assert json.dumps(doc, ensure_ascii=False, sort_keys=True) == before


def test_a_department_overview_fingerprints_too():
    """One function for both targets (D20): the overview is confirmed the same
    way, and its `updated_at` falls out under the same exclusion."""
    ov = {"department": "dining", "name": "سالن", "description": "شرح",
          "sub_units": [], "personnel": [{"role": "میزبان", "duties": ["راهنمایی"],
                                          "kpi": ["رضایت"]}],
          "updated_at": "2026-07-06T10:00:00Z"}
    other = dict(ov, updated_at="2026-08-11T09:00:00Z")
    assert fingerprint(ov) == fingerprint(other)
    changed = dict(ov, description="شرح تازه")
    assert fingerprint(ov) != fingerprint(changed)
