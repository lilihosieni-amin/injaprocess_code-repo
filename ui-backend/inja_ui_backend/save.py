from __future__ import annotations

import datetime

from . import engine, ids, storage


def _now() -> str:
    return datetime.datetime.now(datetime.timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")


def _is_new_node(node: dict) -> bool:
    nid, ntype = node["id"], node.get("type")
    if ids.is_terminal_id(nid):
        return False
    if ntype == "junction":
        return not ids.is_real_junction_id(nid)
    return not ids.is_real_activity_id(nid)


def allocate_new_node_ids(cfg, doc: dict) -> tuple[dict, dict]:
    """Replace temp-keyed node ids with real allocate-id ids (feed-forward) and
    rewrite edges. Returns (new_doc, remap). Only calls allocate-id; writes nothing."""
    remap: dict[str, str] = {}
    working = {**doc, "nodes": []}
    resolved = []
    raw_nodes = doc.get("nodes", [])
    if not isinstance(raw_nodes, list):
        return doc, remap
    for node in raw_nodes:
        if _is_new_node(node):
            if node.get("type") == "junction":
                new_id = engine.allocate_junction_id(cfg, working)
            else:
                new_id = engine.allocate_box_id(cfg, working)
            remap[node["id"]] = new_id
            node = {**node, "id": new_id}
        resolved.append(node)
        working["nodes"] = resolved  # next allocation sees the id we just assigned
    new_doc = {**doc, "nodes": resolved}
    if remap:
        new_doc["edges"] = [{**e, "from": remap.get(e["from"], e["from"]),
                             "to": remap.get(e["to"], e["to"])}
                            for e in doc.get("edges", [])]
    return new_doc, remap


def prepare_save(cfg, pid: str, incoming: dict, on_disk: dict | None) -> dict:
    doc = dict(incoming)
    doc["id"] = pid
    doc["department"] = storage.dept_of(pid)

    # 1) allocate real ids for temp nodes + rewrite edges
    doc, remap = allocate_new_node_ids(cfg, doc)
    new_ids = set(remap.values())

    nodes = doc.get("nodes") if isinstance(doc.get("nodes"), list) else []

    # 2) trust the incoming layout; force "manual" ONLY on newly-created nodes.
    #    (No position-diff heuristic: a full relayout returns layout:"auto", and
    #    inferring "manual" from a move would freeze every node against future merges.)
    for node in nodes:
        if node["id"] in new_ids:
            node["layout"] = "manual"

    # 3) provenance
    doc["updated_at"] = _now()
    doc["created_at"] = (on_disk or {}).get("created_at", doc.get("created_at", doc["updated_at"]))
    disk_nodes = {n["id"]: n for n in (on_disk or {}).get("nodes", [])}
    for node in nodes:
        if node.get("type") != "activity":
            continue
        changed = node["id"] in new_ids or disk_nodes.get(node["id"]) != node
        if changed:
            src = node.setdefault("source", {"created_by": "ui-edit", "touched_by": []})
            tb = src.setdefault("touched_by", [])
            if "ui-edit" not in tb:
                tb.append("ui-edit")
    return doc
