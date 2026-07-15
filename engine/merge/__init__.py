import re

from allocate_id import next_box_id, next_junction_id, next_process_id
from engine_common import is_empty, read_json, validate
from layout import full_relayout, local_relayout, topo_order


def _proc_file(pid, root=None):
    from engine_common import data_root
    base = root or data_root()
    dept = pid.rsplit("-", 1)[0]
    return base / "departments" / dept / "processes" / f"{pid}.json"


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


def restructure(plan, run, now, root=None):
    validate("restructure.schema.json", plan)
    dept = plan["department"]
    heirs, alloc = [], set()
    # 1) build every heir with a fresh, ledger-durable pid
    for h in plan["heirs"]:
        pid = next_process_id(dept, root, reserved=alloc)
        alloc.add(pid)
        heir, keymap = _build_process(h["candidate"], dept, pid, run, now,
                                      parent=None, source_type="voice")
        heirs.append({"process": heir, "keymap": keymap, "spec": h})
    heir_pids = [h["process"]["id"] for h in heirs]

    # 2) tombstone every superseded original with the heirs that supersede it
    superseders = {}  # pid -> [heir ids]
    for h in heirs:
        for sup in h["spec"]["supersedes"]:
            superseders.setdefault(sup, []).append(h["process"]["id"])
    tombstoned = []
    for pid, heir_ids in superseders.items():
        path = _proc_file(pid, root)
        if not path.is_file():
            raise ValueError(f"restructure supersedes missing process {pid}")
        orig = read_json(path)
        tombstone(orig, heir_ids, now)
        tombstoned.append(orig)

    # 3) HIERARCHY REDIRECT (design §4.5)
    known = set(heir_pids) | set(superseders)          # in-plan pids
    tomb_by_id = {t["id"]: t for t in tombstoned}
    heir_by_id = {h["process"]["id"]: h["process"] for h in heirs}  # in-memory heirs
    extra = {}                                         # neighbours mutated in place

    def _load(pid):
        if pid in heir_by_id:
            return heir_by_id[pid]
        if pid in tomb_by_id:
            return tomb_by_id[pid]
        if pid in extra:
            return extra[pid]
        path = _proc_file(pid, root)
        if not path.is_file():
            raise ValueError(f"restructure references missing process {pid}")
        obj = read_json(path)
        extra[pid] = obj
        return obj

    def _is_ancestor(anc_pid, node_pid):
        # walk node_pid's parent chain; True if anc_pid is reached (would form a cycle)
        seen, cur = set(), node_pid
        while cur is not None and cur not in seen:
            seen.add(cur)
            if cur == anc_pid:
                return True
            obj = _load(cur) if cur != anc_pid else None
            par = (obj or {}).get("parent")
            cur = par["process"] if par else None
        return False

    # 3a) a superseded process that IS a child: retarget its parent box to the heir.
    #     Runs first so each heir inherits the parent chain of the box it replaces —
    #     the declared-link cycle check (3b) can then see the full ancestry.
    for pid, heir_ids in superseders.items():
        orig = tomb_by_id[pid]
        par = orig.get("parent")
        if not par:
            continue
        if len(heir_ids) != 1:
            raise ValueError(
                f"cannot retarget parent of {pid}: it is superseded by "
                f"{heir_ids} (expected exactly one heir)")
        heir_id = heir_ids[0]
        parent_proc = _load(par["process"])           # raises + names if dangling
        pbyid = {n["id"]: n for n in parent_proc["nodes"]}
        pnode = pbyid.get(par["node"])
        if pnode is not None and pnode.get("subprocess") == pid:
            pnode["subprocess"] = heir_id
            heir = next(x["process"] for x in heirs if x["process"]["id"] == heir_id)
            heir["parent"] = {"process": parent_proc["id"], "node": pnode["id"]}
            _sync_icom(pnode, heir["idef0"], run)

    # 3b) declared subprocess_links: heir temp box adopts an existing child pid
    for h in heirs:
        heir, keymap = h["process"], h["keymap"]
        byid = {n["id"]: n for n in heir["nodes"]}
        for link in h["spec"]["subprocess_links"]:
            node_id = keymap.get(link["parent_key"], link["parent_key"])
            node = byid.get(node_id)
            if node is None or node.get("type") != "activity":
                raise ValueError(
                    f"subprocess_links parent_key '{link['parent_key']}' is not an "
                    f"activity node in heir {heir['id']}")
            child = _load(link["child"])              # raises + names if dangling
            if _is_ancestor(child["id"], heir["id"]):
                raise ValueError(
                    f"subprocess_links would create a cycle: {child['id']} is an "
                    f"ancestor of heir {heir['id']}")
            node["subprocess"] = child["id"]
            child["parent"] = {"process": heir["id"], "node": node_id}
            _sync_icom(node, child["idef0"], run)

    # neighbours we touched but did not tombstone travel back with the heirs
    side_effects = [o for pid, o in extra.items() if pid not in tomb_by_id]

    result_heirs = [h["process"] for h in heirs] + side_effects
    for p in result_heirs:
        validate("process.schema.json", p)
    for t in tombstoned:
        validate("process.schema.json", t)
    return result_heirs, tombstoned
