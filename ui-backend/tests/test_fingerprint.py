"""What does and does not invalidate a confirmation (spec §11 test 15, D21)."""
import copy
import json
import unicodedata

from inja_ui_backend.fingerprint import EXCLUDED, canonical, canonical_json, fingerprint


def _doc() -> dict:
    """A process carrying **every** property `schemas/process.schema.json` defines.

    Populated on purpose. A stub with `source: {}` and no `pending` cannot tell a
    working exclusion list from a missing one — every assertion below would pass
    against a `fingerprint` that hashed the whole document.

    Complete on purpose, which is a second and separate thing. The two sweeps
    below claim to cover *every* hashed key, but they read their key set from
    this document, so any property missing here is one the sweeps skip while
    the assertion message says they did not. It used to omit `superseded_by`
    (present in 31 of the 80 live files), `removed` (14 files) and junction
    nodes entirely (71 files) — so dropping `junctionType` from the hash passed
    the whole suite, and a junction flipped from AND to XOR kept its
    confirmation while drawing a different flowchart.

    All three node kinds the schema defines are here — `activityNode`,
    `terminalNode`, `junctionNode` — each with its optional properties filled in.
    """
    return {
        "id": "dining-001", "department": "dining", "name": "پذیرایی از مهمان",
        "summary": "خلاصهٔ داخلی",
        "source": {"type": "voice", "ref": "meetings/a.m4a", "run": "runs/chat/1"},
        "parent": {"process": "dining-000", "node": "dining-000-n020"},
        "created_at": "2026-07-06T10:00:00Z", "updated_at": "2026-07-06T10:00:00Z",
        "idef0": {"inputs": ["سفارش"], "controls": [], "outputs": [], "mechanisms": []},
        "kpis": [{"name": "زمان انتظار", "definition": "از ورود تا نشستن",
                  "target": "۵ دقیقه", "unit": "دقیقه"}],
        "nodes": [
            {"id": "dining-001-n010", "type": "activity", "label": "خوش‌آمدگویی",
             "description": "توضیح", "actor": "میزبان",
             "icom": {"inputs": [], "controls": [], "outputs": [], "mechanisms": []},
             "subprocess": None, "position": {"x": 160, "y": 90}, "layout": "auto",
             "removed": False,
             "source": {"created_by": "runs/chat/1", "touched_by": []}},
            {"id": "start", "type": "start", "label": "شروع",
             "position": {"x": 0, "y": 90}, "layout": "auto", "removed": False},
            {"id": "dining-001-j1", "type": "junction", "junctionType": "AND",
             "direction": "split", "position": {"x": 320, "y": 90},
             "layout": "auto", "removed": False},
        ],
        "edges": [{"from": "start", "to": "dining-001-n010", "label": ""},
                  {"from": "dining-001-n010", "to": "dining-001-j1", "label": "تأیید"},
                  {"from": "dining-001-j1", "to": "end", "label": ""}],
        "pending": [{"node": "dining-001-n010", "field": "actor", "current": "میزبان",
                     "proposed": "پیشخدمت", "source": "runs/chat/2", "status": "open"}],
        "tombstoned": False,
        "superseded_by": ["dining-005"],
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

    The sweep is only as wide as `_doc()`, which is why `_doc()` now carries
    every property the schema defines. `superseded_by` used to be absent from
    it, so dropping `superseded_by` inside `canonical` passed this test while
    a process that had just been superseded — 31 of the 80 live files carry the
    key — kept a confirmation that no longer described it.
    """
    base = _doc()
    variants = {
        "id": "dining-002",
        "department": "cashier",
        "name": "پذیرایی از مهمان ویژه",
        "summary": "خلاصهٔ دیگر",
        "parent": {"process": "dining-000", "node": "dining-000-n030"},
        "created_at": "2026-07-07T10:00:00Z",
        "idef0": {"inputs": ["سفارش"], "controls": ["دستورالعمل"], "outputs": [],
                  "mechanisms": []},
        "kpis": [],
        "nodes": [],
        "edges": [{"from": "dining-001-n010", "to": "end", "label": "پس از تأیید"}],
        "superseded_by": ["dining-005", "dining-009"],
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

    **One sweep per node kind**, because the schema's `node` is a `oneOf` and the
    three kinds do not share a key set. Sweeping only the activity node — which
    is what this test used to do — left `junctionType` and `direction` untested
    even though 71 of the 80 live files contain junctions, so dropping
    `junctionType` inside `canonical` passed the whole suite while a junction
    flipped from AND to XOR kept its confirmation and drew a different
    flowchart. `removed` was in the same blind spot.

    `terminalNode` appears once rather than twice: the schema pins its `id` and
    `type` to `start`/`end`, and both spellings have the identical key set, so
    the `end` form is exercised as this sweep's variant value instead.

    Each variant differs from its node in exactly the one named key — asserted
    below before it is used — and in nothing else. A variant only has to *differ*;
    it need not leave the document schema-valid, which is why `type` is varied
    to another kind's constant.
    """
    base = _doc()
    variants_by_kind = {
        "activity": {
            "id": "dining-001-n020",
            "type": "junction",
            "label": "خوش‌آمدگویی و راهنمایی",
            "description": "توضیح تازه",
            "actor": "پیشخدمت",
            "icom": {"inputs": ["ورودی"], "controls": [], "outputs": [],
                     "mechanisms": []},
            "subprocess": "dining-004",
            "position": {"x": 161, "y": 90},
            "layout": "manual",
            "removed": True,
        },
        "start": {
            "id": "end",
            "type": "end",
            "label": "آغاز",
            "position": {"x": 1, "y": 90},
            "layout": "manual",
            "removed": True,
        },
        "junction": {
            "id": "dining-001-j2",
            "type": "activity",
            "junctionType": "XOR",
            "direction": "join",
            "position": {"x": 321, "y": 90},
            "layout": "manual",
            "removed": True,
        },
    }
    assert {n["type"] for n in base["nodes"]} == set(variants_by_kind), \
        "every node kind the schema defines is present in _doc()"
    for index, node in enumerate(base["nodes"]):
        kind = node["type"]
        variants = variants_by_kind[kind]
        assert set(variants) == set(node) - EXCLUDED, \
            f"every hashed key of a {kind} node is covered"
        for field, value in variants.items():
            assert node[field] != value, (kind, field)  # the variant is a change
            b = copy.deepcopy(base)
            b["nodes"][index][field] = value
            assert fingerprint(base) != fingerprint(b), (kind, field)


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
    assert a["tombstoned"] != b["tombstoned"]   # the flag really did flip
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
    # …and all four really were there to lose: `_doc()` carries every property
    # the schema defines, `tombstoned` included.
    assert set(full) - set(stripped) == set(EXCLUDED)
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


def test_a_number_hashes_the_same_whichever_python_type_it_arrived_as():
    """JSON has one number type. Python has two, and `json.dumps` writes them
    differently — `90` against `90.0` — so without a rule the *same JSON number*
    hashes two ways depending on nothing the document says. 183 integral-valued
    floats sit in 28 of the 80 live process files.

    The path that makes this bite: the UI's Save posts node positions back from
    the browser, where `JSON.stringify` emits `90` for `90.0`; `save.py`'s change
    detector then sees no change (`90 == 90.0` in Python) while the file is
    rewritten with `90`. An editor saves with no visible edit and voids their own
    confirmation, which hides the process from every non-editor.
    """
    assert fingerprint({"x": 90}) == fingerprint({"x": 90.0})
    a, b = _doc(), _doc()
    b["nodes"][0]["position"] = {"x": 160.0, "y": 90.0}
    # `==` cannot see this difference — that is the whole trap — so compare text.
    assert (json.dumps(a["nodes"][0]["position"])
            != json.dumps(b["nodes"][0]["position"]))
    assert fingerprint(a) == fingerprint(b)
    # A non-integral float is left exactly as it is, and is still its own number.
    assert canonical(160.5) == 160.5
    assert fingerprint({"x": 160.5}) != fingerprint({"x": 160})


def test_a_boolean_is_not_narrowed_into_a_number():
    """`bool` is a subclass of `int` in Python, so the narrowing above has to
    step around it. `True` folded to `1` would make a node's `removed: true` and
    a `removed: 1` hash alike — and, worse, invites the same mistake in the
    other direction the next time this function grows a numeric branch."""
    assert canonical(True) is True
    assert canonical(False) is False
    assert fingerprint({"removed": True}) != fingerprint({"removed": 1})
    assert fingerprint({"removed": False}) != fingerprint({"removed": 0})


def test_the_digest_itself_is_pinned():
    """The one literal in this file that a second program has to reproduce.

    Every other hash assertion here compares one fingerprint to another, which
    is blind to any change that moves *all* of them together. Each of these is
    perfectly self-consistent inside this process and each makes `engine/`'s
    `merge` disagree with every confirmation in the database:

    * `.encode("utf-8")` → `.encode("utf-16")`
    * `sha256(...).hexdigest()` → `sha512(...).hexdigest()[:64]`
    * a version tag prefixed to the canonical text before hashing

    So the digest is pinned, not just the text that feeds it. The input below is
    deliberately small and deliberately awkward: keys out of order, a nested dict
    also out of order, an excluded key one level down, Persian that
    `ensure_ascii=True` would escape, and a `90.0` that must come out as `90`.

    This hex string is the cross-program contract. Changing it re-confirms
    nothing — it silently un-confirms every process in the system, and an
    unconfirmed process is invisible to every non-editor. If a change here is
    genuinely intended, every stored confirmation has to be re-issued with it.
    """
    doc = {"name": "\u0686\u0627\u06cc", "created_at": "2026-07-06T10:00:00Z",
           "node": {"y": 90.0, "x": 160, "source": {"created_by": "ui"}},
           "updated_at": "2026-08-11T09:00:00Z"}
    assert canonical_json(doc) == ('{"created_at":"2026-07-06T10:00:00Z",'
                                   '"name":"\u0686\u0627\u06cc",'
                                   '"node":{"x":160,"y":90}}')
    assert fingerprint(doc) == \
        "9d06585b56a094ba9da2f939afa1c7e05f2ed35092d1aaa6dfdd48d026435e01"


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


def test_normalisation_is_nfc_and_not_nfkc():
    """NFC, which D21 names — not NFKC, which is one keystroke away and wrong.

    NFKC folds *compatibility* characters into their base letters, and Arabic
    presentation forms and ligatures are exactly that. U+FEF5, ARABIC LIGATURE
    LAM WITH ALEF WITH MADDA ABOVE ISOLATED FORM, is realistic in pasted Persian:
    it is what falls out of copy-paste from a PDF or an older Windows document.
    Under NFKC it becomes U+0644 U+0622 and the two spellings hash alike — so an
    Editor retyping a ligature as two letters, a change any reader can see in the
    rendered flowchart, would keep the confirmation. Under NFC they are two
    strings and the confirmation drops, which is the specified behaviour.

    Written as escapes so no editor can silently normalise the file into
    agreement with whichever implementation it is testing.
    """
    ligature = "\ufef5"                  # the one-codepoint ligature
    spelled_out = "\u0644\u0622"         # LAM + ALEF WITH MADDA ABOVE
    # The two normal forms really do differ for this character.
    assert unicodedata.normalize("NFC", ligature) != \
        unicodedata.normalize("NFKC", ligature)
    assert unicodedata.normalize("NFC", ligature) == ligature
    assert unicodedata.normalize("NFKC", ligature) == spelled_out

    assert canonical(ligature) == ligature      # NFC leaves it alone
    a, b = _doc(), _doc()
    a["name"], b["name"] = ligature, spelled_out
    assert fingerprint(a) != fingerprint(b)


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
