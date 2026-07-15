import re

from allocate_id import next_box_id, next_junction_id, next_process_id
from engine_common import is_empty, validate
from layout import full_relayout, local_relayout, topo_order


def _new_node(cand_node, nid, run):
    if cand_node["type"] == "activity":
        return {"id": nid, "type": "activity", "label": cand_node["label"],
                "description": cand_node["description"], "actor": cand_node["actor"],
                "icom": cand_node["icom"], "subprocess": None,
                "position": {"x": 0, "y": 0}, "layout": "auto",
                "source": {"created_by": run, "touched_by": []}}
    return {"id": nid, "type": "junction", "junctionType": cand_node["junctionType"],
            "direction": cand_node["direction"], "position": {"x": 0, "y": 0},
            "layout": "auto"}


def _alloc(process, cand_node):
    if cand_node["type"] == "activity":
        return next_box_id(process)
    return next_junction_id(process)


def _map_edges(edges, keymap):
    out = []
    for e in edges:
        ne = {"from": keymap.get(e["from"], e["from"]),
              "to": keymap.get(e["to"], e["to"])}
        if e.get("label"):
            ne["label"] = e["label"]
        out.append(ne)
    return out


def _voice_ref(run):
    # robust voice basename from a run path: strip a trailing attempt-NN if present
    # (a re-run's run_dir is runs/<voice>/attempt-NN — the last component is NOT the voice)
    parts = run.rstrip("/").split("/")
    if re.fullmatch(r"attempt-\d{2,}", parts[-1]) and len(parts) >= 2:
        return parts[-2]
    return parts[-1]


def _build_process(cand, dept, pid, run, now, parent, source_type):
    process = {"id": pid, "department": dept, "name": cand["process_name"],
               "summary": cand["summary"],
               "source": {"type": source_type, "ref": _voice_ref(run), "run": run},
               "parent": parent, "created_at": now, "updated_at": now,
               "idef0": cand["idef0"], "kpis": cand["kpis"],
               "nodes": [], "edges": [], "pending": []}
    keymap = {}
    for cn in cand["nodes"]:
        nid = _alloc(process, cn)
        keymap[cn["key"]] = nid
        process["nodes"].append(_new_node(cn, nid, run))
    keys = set(keymap)
    for e in cand["edges"]:
        if e["from"] not in keys or e["to"] not in keys:
            raise ValueError(f"candidate edge references unknown node key: {e}")
    process["edges"] = _map_edges(cand["edges"], keymap)
    full_relayout(process)
    return process, keymap


def _sync_icom(parent_node, child_idef0, run):
    # the box boundary IS its sub-process: child idef0 is authoritative (always wins)
    parent_node["icom"] = child_idef0
    _touch(parent_node, run)


def _attach_subprocesses(parent, keymap, entries, run, now, root, ref_field):
    children = []
    dept = parent["department"]
    byid = {n["id"]: n for n in parent["nodes"]}
    for ent in entries:
        ref = ent[ref_field]
        node_id = keymap.get(ref, ref)              # temp key -> real id, or an already-real id
        node = byid.get(node_id)
        if node is None or node.get("type") != "activity":
            raise ValueError(f"subprocess parent '{ref}' is not an activity node in {parent['id']}")
        if node.get("subprocess") is not None:
            raise ValueError(
                f"node {node_id} already has subprocess {node['subprocess']}; duplicate"
            )
        child_pid = next_process_id(
            dept, root, reserved={parent["id"]} | {c["id"] for c in children}
        )
        child, _ = _build_process(ent["process"], dept, child_pid, run, now,
                                  parent={"process": parent["id"], "node": node_id},
                                  source_type="auto")
        node["subprocess"] = child_pid
        _sync_icom(node, child["idef0"], run)
        children.append(child)
    return children


def build_new(candidate, dept, run, now, root=None):
    validate("candidate.schema.json", candidate)
    pid = next_process_id(dept, root)
    parent, keymap = _build_process(candidate, dept, pid, run, now,
                                    parent=None, source_type="voice")
    children = _attach_subprocesses(parent, keymap, candidate.get("subprocesses", []),
                                    run, now, root, "parent_key")
    validate("process.schema.json", parent)
    for c in children:
        validate("process.schema.json", c)
    return parent, children


def merge_new(candidate, dept, run, now, root=None):
    return build_new(candidate, dept, run, now, root)[0]


def _touch(node, run):
    if "source" in node:
        tb = node["source"].setdefault("touched_by", [])
        if run not in tb:
            tb.append(run)


def build_update(process, delta, run, now, root=None):
    validate("delta.schema.json", delta)
    keymap, new_ids = {}, []
    for an in delta["add_nodes"]:
        nid = next_box_id(process) if an["type"] == "activity" else next_junction_id(process)
        keymap[an["key"]] = nid
        new_ids.append(nid)
        process["nodes"].append(_new_node(an, nid, run))
    valid_ep = set(keymap) | {n["id"] for n in process["nodes"]}
    for e in delta["add_edges"]:
        if e["from"] not in valid_ep or e["to"] not in valid_ep:
            raise ValueError(f"delta edge references unknown node: {e}")
    process["edges"].extend(_map_edges(delta["add_edges"], keymap))
    byid = {n["id"]: n for n in process["nodes"]}
    for en in delta["enrich_nodes"]:
        n = byid.get(en["id"])
        if n is None:
            continue
        for field, val in en["set"].items():
            cur = n.get(field)
            if is_empty(cur):
                n[field] = val
                _touch(n, run)
            elif cur != val:
                process["pending"].append(
                    {"node": en["id"], "field": field, "current": cur,
                     "proposed": val, "source": run, "status": "open"})
    for rn in delta.get("revise_nodes", []):
        n = byid.get(rn["id"])
        if n is None:
            continue
        for field, val in rn["set"].items():
            n[field] = val
        _touch(n, run)
    removed_any_edge = False
    drop = {(e["from"], e["to"]) for e in delta.get("remove_edges", [])}
    if drop:
        kept = [e for e in process["edges"] if (e["from"], e["to"]) not in drop]
        removed_any_edge = len(kept) != len(process["edges"])
        process["edges"] = kept
    for fr in delta["flag_removed"]:
        n = byid.get(fr["id"])
        if n is not None:
            n["removed"] = True
            _touch(n, run)
    children = _attach_subprocesses(process, keymap, delta.get("add_subprocesses", []),
                                    run, now, root, "parent")
    if new_ids:
        order = topo_order(process["nodes"], process["edges"])
        local_relayout(process, min(order.index(i) for i in new_ids))
    elif removed_any_edge:
        local_relayout(process, 0)      # re-flow; manual positions are preserved
    process["updated_at"] = now
    validate("process.schema.json", process)
    for c in children:
        validate("process.schema.json", c)
    return process, children


def apply_delta(process, delta, run, now, root=None):
    return build_update(process, delta, run, now, root)[0]


def resolve_pending(process, index, decision, now):
    row = process["pending"][index]
    if row["status"] != "open":
        raise ValueError(f"pending row {index} already {row['status']}")
    if decision == "accept":
        byid = {n["id"]: n for n in process["nodes"]}
        node = byid.get(row["node"])
        if node is None:
            raise ValueError(f"pending row {index} targets unknown node {row['node']}")
        node[row["field"]] = row["proposed"]
        row["status"] = "accepted"
    elif decision == "reject":
        row["status"] = "rejected"
    else:
        raise ValueError("decision must be 'accept' or 'reject'")
    process["updated_at"] = now
    validate("process.schema.json", process)
    return process


def tombstone(process, heir_ids, now):
    process["tombstoned"] = True
    process["superseded_by"] = list(heir_ids)
    process["updated_at"] = now
    validate("process.schema.json", process)
    return process


def remove_process(process, now):
    return tombstone(process, [], now)
