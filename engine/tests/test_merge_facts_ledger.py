"""`facts/.confirmations.json` — who wrote a row, when it is pruned, and how a
revert forgets one (v3.7 §3)."""

from facts_helpers import (_root, _seed_units, _const_delta, _write, _run_dir,
                           _meta)
from merge_facts import KIND_FILES, load_store
from merge_facts.apply import apply
from merge_facts.revert import revert
from merge_facts import verbs
from merge_facts.verbs import edit, retire
from merge_facts import ledger


def _rows(root):
    return ledger.load(root)["entries"]


def _rule(root):
    return [x for x in load_store(root)["rule"]["entries"] if x["key"] == "tol"][0]


def test_edit_always_records_the_chat_actor(tmp_path):
    root = _root(tmp_path); _seed_units(root)
    apply(root, _write(root, "d1.json", _const_delta(5)), _run_dir(root, "1"))
    e = _rule(root)
    run = _run_dir(root, "2"); _meta(run)
    edit(root, e["id"], _write(root, "p.json", {"schema_version": 1, "ops": [
        {"op": "set", "path": "statement", "value": "حد مجاز انحراف"}]}), run)
    e2 = _rule(root)
    row = _rows(root)[e["id"]]
    assert row["updated_at"] == e2["updated_at"] and row["by"] == "owner"
    assert row["run"] == "runs/facts/cooking/2"
    from engine_common import validate
    validate("facts-confirmations.schema.json", ledger.load(root))


def test_apply_records_only_under_a_chat_origin(tmp_path):
    root = _root(tmp_path); _seed_units(root)
    run = _run_dir(root, "1")                       # no meta.json: a pipeline run
    apply(root, _write(root, "d1.json", _const_delta(5)), run)
    assert _rows(root) == {}
    run2 = _run_dir(root, "2"); _meta(run2)
    apply(root, _write(root, "d2.json", _const_delta(5, key="b")), run2)
    b = [x for x in load_store(root)["rule"]["entries"] if x["key"] == "b"][0]
    assert _rows(root) == {b["id"]: {"updated_at": b["updated_at"], "by": "owner",
                                     "run": "runs/facts/cooking/2",
                                     "at": _rows(root)[b["id"]]["at"]}}
    run3 = _run_dir(root, "3"); _meta(run3, origin="pipeline")
    apply(root, _write(root, "d3.json", _const_delta(5, key="c")), run3)
    assert set(_rows(root)) == {b["id"]}


def test_retire_under_chat_origin_records_and_a_later_write_prunes(tmp_path, monkeypatch):
    root = _root(tmp_path); _seed_units(root)
    apply(root, _write(root, "d1.json", _const_delta(5)), _run_dir(root, "1"))
    e = _rule(root)
    run = _run_dir(root, "2"); _meta(run)
    # A fixed stamp for the vouched write: `updated_at` has second resolution,
    # so the later write below has to land at a different second to move it.
    monkeypatch.setattr(verbs, "_now", lambda: "2020-01-01T00:00:00Z")
    retire(root, e["id"], None, run)
    assert _rows(root)[e["id"]]["updated_at"] == "2020-01-01T00:00:00Z"
    assert _rows(root)[e["id"]]["by"] == "owner"
    monkeypatch.undo()
    # Any later engine write to the entry moves the stamp out from under the
    # row — here a UI run (no `meta.json`) re-dating the closure, which records
    # nothing itself and prunes on the way out.
    retire(root, e["id"], None, _run_dir(root, "3"))
    assert _rows(root) == {}


def test_revert_forgets_the_runs_rows(tmp_path):
    root = _root(tmp_path); _seed_units(root)
    apply(root, _write(root, "d1.json", _const_delta(5)), _run_dir(root, "1"))
    e = _rule(root)
    run = _run_dir(root, "2"); _meta(run)
    edit(root, e["id"], _write(root, "p.json", {"schema_version": 1, "ops": [
        {"op": "set", "path": "statement", "value": "حد مجاز انحراف"}]}), run)
    revert(root, run)
    assert _rows(root) == {}


def test_a_missing_ledger_reads_empty_and_a_stale_row_is_pruned_on_save(tmp_path):
    root = _root(tmp_path); _seed_units(root)
    assert ledger.load(root) == {"schema_version": 1, "entries": {}}
    apply(root, _write(root, "d1.json", _const_delta(5)), _run_dir(root, "1"))
    e = _rule(root)
    doc = ledger.load(root)
    doc["entries"][e["id"]] = {"updated_at": "2000-01-01T00:00:00Z", "by": "x",
                               "run": "runs/facts/cooking/0", "at": "2000-01-01T00:00:00Z"}
    doc["entries"]["F-09999"] = dict(doc["entries"][e["id"]])
    ledger.save(root, doc)
    from merge_facts import save_store
    save_store(root, load_store(root))
    assert _rows(root) == {}


def test_the_lock_is_a_sidecar_the_store_never_names(tmp_path):
    root = _root(tmp_path); _seed_units(root)
    apply(root, _write(root, "d1.json", _const_delta(5)), _run_dir(root, "1"))
    e = _rule(root)
    run = _run_dir(root, "2"); _meta(run)
    retire(root, e["id"], None, run)
    # the row is written, and the lock the ui-backend's revoke takes too is
    # there beside it under `facts/` — the file name is the contract
    assert _rows(root)[e["id"]]["by"] == "owner"
    assert (root / "facts" / ledger.LOCK).is_file()
    # …and neither it nor the ledger is store content: the five files and the
    # rebuilt index are written by name and name nothing else
    store_text = "".join((root / "facts" / n).read_text(encoding="utf-8")
                         for n in [*KIND_FILES.values(), ".index.json"])
    assert ".confirmations" not in store_text
