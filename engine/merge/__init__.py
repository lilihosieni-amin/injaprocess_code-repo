from allocate_id import next_box_id, next_junction_id, next_process_id
from engine_common import is_empty, validate
from layout import full_relayout, local_relayout, topo_order


def _new_node(cand_node, nid, run):
    if cand_node["type"] == "activity":
        return {"id": nid, "type": "activity", "label": cand_node["label"],
                "description": cand_node["description"], "actor": cand_node["actor"],
                "icom": cand_node["icom"], "subprocess": cand_node["subprocess"],
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


def merge_new(candidate, dept, run, now, root=None):
    validate("candidate.schema.json", candidate)
    pid = next_process_id(dept, root)
    process = {"id": pid, "department": dept, "name": candidate["process_name"],
               "summary": candidate["summary"],
               "source": {"type": "voice", "ref": run.split("/")[-1], "run": run},
               "parent": None, "created_at": now, "updated_at": now,
               "idef0": candidate["idef0"], "kpis": candidate["kpis"],
               "nodes": [], "edges": [], "pending": []}
    keymap = {}
    for cn in candidate["nodes"]:
        nid = _alloc(process, cn)            # sees nodes appended so far -> n001, n002...
        keymap[cn["key"]] = nid
        process["nodes"].append(_new_node(cn, nid, run))
    # Referential-integrity guard: every edge endpoint must be a candidate node key
    keys = set(keymap)
    for e in candidate["edges"]:
        if e["from"] not in keys or e["to"] not in keys:
            raise ValueError(f"candidate edge references unknown node key: {e}")
    process["edges"] = _map_edges(candidate["edges"], keymap)
    full_relayout(process)
    validate("process.schema.json", process)
    return process


def _touch(node, run):
    if "source" in node:
        tb = node["source"].setdefault("touched_by", [])
        if run not in tb:
            tb.append(run)


def apply_delta(process, delta, run, now):
    validate("delta.schema.json", delta)
    keymap, new_ids = {}, []
    for an in delta["add_nodes"]:
        nid = next_box_id(process) if an["type"] == "activity" \
            else next_junction_id(process)
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
    for fr in delta["flag_removed"]:
        n = byid.get(fr["id"])
        if n is not None:
            n["removed"] = True
            _touch(n, run)

    if new_ids:
        order = topo_order(process["nodes"], process["edges"])
        local_relayout(process, min(order.index(i) for i in new_ids))
    process["updated_at"] = now
    validate("process.schema.json", process)
    return process


def resolve_pending(process, index, decision, now):
    row = process["pending"][index]
    if row["status"] != "open":
        raise ValueError(f"pending row {index} already {row['status']}")
    if decision == "accept":
        byid = {n["id"]: n for n in process["nodes"]}
        node = byid.get(row["node"])
        if node is not None:
            node[row["field"]] = row["proposed"]
        row["status"] = "accepted"
    elif decision == "reject":
        row["status"] = "rejected"
    else:
        raise ValueError("decision must be 'accept' or 'reject'")
    process["updated_at"] = now
    validate("process.schema.json", process)
    return process
