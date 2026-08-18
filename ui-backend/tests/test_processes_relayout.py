import logging

from inja_ui_backend.tests_helpers import signed_in_client


def _c(data_root):
    # A real sign-in against a seeded Editor. `signed_in_client` uses
    # `https://testserver`, which is load-bearing: the session cookie is `Secure`
    # and the real cookie jar behind `TestClient` will not send one over `http://`.
    c, _ = signed_in_client(data_root, data_root.parent / "app.db")
    return c


def test_relayout_returns_doc_without_persisting(data_root):
    c = _c(data_root)
    doc = c.get("/api/processes/cooking-001").json()
    on_disk_before = c.get("/api/processes/cooking-001").json()
    r = c.post("/api/processes/cooking-001/relayout", json=doc)
    assert r.status_code == 200
    out = r.json()
    assert len(out["nodes"]) == len(doc["nodes"])
    # unchanged on disk (compute-only)
    assert c.get("/api/processes/cooking-001").json() == on_disk_before


def test_relayout_with_unsaved_temp_node_does_not_422(data_root):
    c = _c(data_root)
    doc = c.get("/api/processes/cooking-001").json()
    on_disk_before = c.get("/api/processes/cooking-001").json()
    doc["nodes"].append({
        "id": "tmp-Z", "type": "activity", "label": "z", "description": "",
        "actor": "", "subprocess": None,
        "icom": {"inputs": [], "controls": [], "outputs": [], "mechanisms": []},
        "position": {"x": 0, "y": 0}, "layout": "manual",
        "source": {"created_by": "ui-edit", "touched_by": ["ui-edit"]}})
    doc["edges"].append({"from": "cooking-001-n010", "to": "tmp-Z", "label": ""})
    r = c.post("/api/processes/cooking-001/relayout", json=doc)
    assert r.status_code == 200                     # temp id realized before layout, not 422
    out = r.json()
    assert not any(n["id"] == "tmp-Z" for n in out["nodes"])   # got a real allocate-id id
    assert not any(e["to"] == "tmp-Z" for e in out["edges"])
    assert c.get("/api/processes/cooking-001").json() == on_disk_before  # still no persistence


# --------------------------------------------------------------------------
# What a failed layout tells the caller
# --------------------------------------------------------------------------

def _doc_the_layout_cli_refuses(c):
    """`cooking-001` with one node type the schema does not have.

    The failure has to come from the **layout CLI**, not from anything in
    `ui-backend`, because the leak under test is that CLI's stderr. A node type
    of `not-a-type` survives `allocate_new_node_ids` untouched — it is a real
    node with a real id, so nothing renames it — and then fails
    `validate("process.schema.json", …)` at the last line of `engine/layout/cli.py`,
    which is where the traceback is born.

    Asserted rather than assumed: `test_relayout_returns_doc_without_persisting`
    above shows the unmodified document answers 200, so a 200 here would mean the
    mutation stopped reaching the CLI and the test had quietly stopped testing.
    """
    doc = c.get("/api/processes/cooking-001").json()
    doc["nodes"][0]["type"] = "not-a-type"
    return doc


def test_a_failed_relayout_tells_the_caller_nothing_about_the_server(data_root, caplog):
    """The 422 body used to be `EngineError.message`, which is the CLI's stderr —
    a full Python traceback.

    Served to any Editor, it named `<venv>/bin/layout`, the absolute path of every
    module on the way down (`engine/layout/cli.py`, `engine_common/__init__.py`),
    their line numbers, and the exception class. `tests/test_body_scan.py` records
    this as a live finding and keeps `sys.prefix` and the data root as sentinels
    for exactly this class of leak; those two sentinels are what this asserts on,
    plus the traceback's own vocabulary.

    What the caller gets instead is one bounded sentence. The detail is not
    thrown away — it goes to the log, where the operator who can act on it is —
    and the second half of this test is what stops the "fix" being a silent
    `except: pass`.
    """
    import sys

    c = _c(data_root)
    with caplog.at_level(logging.WARNING):
        r = c.post("/api/processes/cooking-001/relayout",
                   json=_doc_the_layout_cli_refuses(c))

    assert r.status_code == 422, r.text
    body = r.text
    for leak, what in ((sys.prefix, "the server's Python environment"),
                       (str(data_root), "the server's data root"),
                       ("Traceback", "a Python traceback"),
                       ("File \"", "a source file path"),
                       ("engine", "the engine package's layout on disk"),
                       ("/tmp", "the scratch file the document was written to")):
        assert leak not in body, (
            f"the 422 body carries {what}: {leak!r}")
    # …and it is a real message, not an empty string that happens to contain none
    # of the above. Persian, like every other client-facing string here.
    detail = r.json()["detail"]
    assert isinstance(detail, str) and detail and not detail.isascii(), detail

    # The operator still gets the whole of it. Without this half, deleting the
    # detail entirely passes every assertion above.
    logged = "\n".join(rec.getMessage() for rec in caplog.records
                       if rec.name == "inja_ui_backend.routers.processes")
    assert "not valid under any of the given schemas" in logged, (
        "the layout CLI's own diagnosis reached neither the caller nor the log,"
        f" so it is simply gone: {logged!r}")
    assert "cooking-001" in logged, "the log line does not say which process failed"
