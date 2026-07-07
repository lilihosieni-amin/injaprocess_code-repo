from allocate_id import next_box_id, next_junction_id, next_process_id
from engine_common import validate
from layout import full_relayout


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
    process["edges"] = _map_edges(candidate["edges"], keymap)
    full_relayout(process)
    validate("process.schema.json", process)
    return process
