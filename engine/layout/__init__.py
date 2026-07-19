import heapq
import re
from collections import defaultdict


def _id_key(nid):
    # natural sort: "n002" < "n010"; ids were allocated in narrative order,
    # so this is the sequence a human expects on the canvas
    return [(0, int(t)) if t.isdigit() else (1, t)
            for t in re.split(r"(\d+)", nid)]


def topo_order(nodes, edges):
    ids = [n["id"] for n in nodes]
    order_ids = sorted(ids, key=_id_key)
    rank = {i: k for k, i in enumerate(order_ids)}
    succ = defaultdict(list)
    indeg = {i: 0 for i in ids}
    for e in edges:
        if e["from"] in indeg and e["to"] in indeg:
            succ[e["from"]].append(e["to"])
            indeg[e["to"]] += 1
    ready = [rank[i] for i in ids if indeg[i] == 0]
    heapq.heapify(ready)  # lowest node id first => narrative-order tiebreak
    out, seen = [], set()
    while ready:
        nid = order_ids[heapq.heappop(ready)]
        if nid in seen:
            continue
        seen.add(nid)
        out.append(nid)
        for t in succ[nid]:
            indeg[t] -= 1
            if indeg[t] == 0:
                heapq.heappush(ready, rank[t])
    for i in order_ids:  # cycle leftovers, narrative order
        if i not in seen:
            out.append(i)
    return out

# Layered ("Sugiyama") layout with serpentine band wrap (ARD Section 9, FR-D9):
# x = longest-path depth from the flow's sources ("layer", one column each),
# y = branch lane. The pipeline is: (1) break rework loops so we layer a DAG,
# (2) assign layers by longest path, (3) reduce edge crossings by ordering nodes
# within each layer toward their neighbours' average lane, (4) pack lanes with a
# fixed gap so a junction's branches spread symmetrically (one up, one down).
# Flows deeper than MAX_COLS wrap into a new band of lanes below, alternating
# direction (band 1 left->right, band 2 right->left, ...) so the chart never
# exceeds the page width.
SX, SY = 40, 90     # canvas origin
GX, GY = 260, 175   # column / lane pitch (activity card is 170px wide)
MAX_COLS = 5        # columns per band; deeper flows wrap (page-width cap)

# Approximate rendered sizes (w, h) used to center small nodes within their
# column so edges land near card middles. Activity cards
# (ui/src/flow/nodes/ActivityNode.tsx) are w-[170px]; junctions 44x44 pills;
# start/end small pills. Rough is fine: ARD Section 9 calls automatic layout
# a "good starting point", not pixel-perfect.
_SIZES = {"activity": (170, 76), "junction": (44, 44), "start": (90, 36), "end": (90, 36)}


def _center(ntype):
    w, h = _SIZES.get(ntype, _SIZES["activity"])
    return (_SIZES["activity"][0] - w) // 2, (_SIZES["activity"][1] - h) // 2


def _dag_edges(nodes, edges):
    """Edges with rework back-edges removed (Sugiyama step 1: cycle removal).

    A single back-edge (e.g. a "send it back for re-review" loop) makes the
    whole flow cyclic; layering a cycle collapses every downstream node onto a
    couple of columns. We drop back-edges *for placement only* (the UI still
    draws them). Classification is a deterministic DFS in node-id order, so the
    same edge is always the one treated as the loop-closer.
    """
    ids = {n["id"] for n in nodes}
    succ = defaultdict(list)
    indeg = {i: 0 for i in ids}
    for e in edges:
        if e["from"] in ids and e["to"] in ids:
            succ[e["from"]].append(e["to"])
            indeg[e["to"]] += 1
    # Root the DFS at real sources (in-degree 0) first, then any remaining
    # (cycle-only) nodes, all in id order. Rooting at a source means the edge we
    # classify as the loop-closer is the one pointing *against* the flow (the
    # rework "send it back" edge) rather than the junction's real feeder.
    roots = sorted((i for i in ids if indeg[i] == 0), key=_id_key) \
        + sorted((i for i in ids if indeg[i] != 0), key=_id_key)
    state = {}  # unvisited (absent) -> 1 on-stack -> 2 done
    back = set()
    for root in roots:
        if root in state:
            continue
        stack = [(root, iter(sorted(set(succ[root]), key=_id_key)))]
        state[root] = 1
        while stack:
            u, it = stack[-1]
            for v in it:
                if state.get(v) == 1:          # v is an ancestor -> back-edge
                    back.add((u, v))
                elif v not in state:
                    state[v] = 1
                    stack.append((v, iter(sorted(set(succ[v]), key=_id_key))))
                    break
            else:
                state[u] = 2
                stack.pop()
    return [e for e in edges
            if e["from"] in ids and e["to"] in ids
            and (e["from"], e["to"]) not in back]


def _pack(ids, desired, lane):
    """Place ``ids`` at their ``desired`` lanes, then spread any that sit closer
    than one lane apart while keeping the group centred on its mean desire.

    Two siblings that both want their parent's lane end up at parent-0.5 and
    parent+0.5 — a symmetric one-up/one-down split. Three end up at -1, 0, +1."""
    ordered = sorted(ids, key=lambda i: (desired[i], _id_key(i)))
    placed, last = {}, None
    for nid in ordered:
        r = desired[nid]
        if last is not None and r < last + 1.0:
            r = last + 1.0
        placed[nid] = r
        last = r
    shift = (sum(desired[i] for i in ids) - sum(placed[i] for i in ids)) / len(ids)
    for nid in ids:
        lane[nid] = placed[nid] + shift


def grid_positions(nodes, edges):
    """Deterministic {node_id: {"x", "y"}} for the layered layout."""
    dedges = _dag_edges(nodes, edges)          # rework loops broken for placement
    all_ids = [n["id"] for n in nodes]
    idset = set(all_ids)
    ntype = {n["id"]: n.get("type") for n in nodes}

    # Isolated nodes (in no edge) don't belong in the flow: laying them out as
    # extra "sources" widens the first band and shoves the real flow down the
    # page. Park them in a column below everything instead.
    wired = set()
    for e in edges:
        if e["from"] in idset and e["to"] in idset:
            wired.add(e["from"])
            wired.add(e["to"])
    isolated = [i for i in all_ids if i not in wired]

    order = topo_order([n for n in nodes if n["id"] in wired], dedges)
    preds, succs = defaultdict(list), defaultdict(list)
    for e in dedges:
        if e["from"] in wired and e["to"] in wired:
            preds[e["to"]].append(e["from"])
            succs[e["from"]].append(e["to"])

    layer = {}  # longest path from a source
    for nid in order:
        layer[nid] = max((layer[p] + 1 for p in preds[nid] if p in layer), default=0)

    # Dummy nodes: an edge spanning more than one layer is routed through a chain
    # of placeholders, one per skipped layer. They claim lane space so a straight
    # bypass edge (e.g. junction -> junction over an optional step) no longer
    # runs through the real node sitting in that skipped layer.
    aug_preds, aug_succs = defaultdict(list), defaultdict(list)
    aug_layer = dict(layer)
    dummies = 0
    for e in sorted(dedges, key=lambda e: (layer.get(e["from"], 0),
                                           _id_key(e["from"]), _id_key(e["to"]))):
        u, v = e["from"], e["to"]
        if u not in layer or v not in layer:
            continue
        prev = u
        for lv in range(layer[u] + 1, layer[v]):     # nothing if span == 1
            d = f"__dummy{dummies}"
            dummies += 1
            aug_layer[d] = lv
            aug_succs[prev].append(d)
            aug_preds[d].append(prev)
            prev = d
        aug_succs[prev].append(v)
        aug_preds[v].append(prev)

    by_layer = defaultdict(list)
    for nid in sorted(aug_layer, key=_id_key):
        by_layer[aug_layer[nid]].append(nid)
    levels = sorted(by_layer)

    # Lane (y) assignment. First pass, left to right: each node aims for the mean
    # lane of its predecessors (sources keep their id-order lane). Then a few
    # up/down sweeps nudge every node toward its neighbours' average lane, which
    # reduces edge crossings; _pack keeps a one-lane gap so nothing overlaps.
    lane = {}
    for k, nid in enumerate(by_layer[0]):
        lane[nid] = float(k)
    for lv in levels[1:]:
        desired = {nid: sum(lane[p] for p in aug_preds[nid] if p in lane)
                        / max(1, len([p for p in aug_preds[nid] if p in lane]))
                   for nid in by_layer[lv]}
        _pack(by_layer[lv], desired, lane)
    for sweep in range(4):
        seq = levels if sweep % 2 == 0 else levels[::-1]
        for lv in seq:
            nbr = aug_preds if sweep % 2 == 0 else aug_succs
            desired = {}
            for nid in by_layer[lv]:
                near = [lane[x] for x in nbr[nid] if x in lane]
                desired[nid] = sum(near) / len(near) if near else lane[nid]
            _pack(by_layer[lv], desired, lane)

    # normalise each band's lanes to start at 0 so band heights stay correct and
    # the serpentine bands never overlap (a symmetric split can go negative)
    band_of = {nid: aug_layer[nid] // MAX_COLS for nid in aug_layer}
    bands = defaultdict(list)
    for nid in aug_layer:
        bands[band_of[nid]].append(nid)
    for members in bands.values():
        base = min(lane[nid] for nid in members)
        for nid in members:
            lane[nid] -= base

    # serpentine band wrap: band b starts below the previous band's lanes;
    # odd bands run right-to-left so the wrap connector stays short
    band_top, top = {}, 0
    for b in sorted(bands):
        band_top[b] = top
        top += (max(lane[nid] for nid in bands[b]) + 1) * GY

    out = {}
    for nid in order:                              # real flow nodes only (no dummies)
        dx, dy = _center(ntype.get(nid))
        b, col = divmod(layer[nid], MAX_COLS)
        if b % 2 == 1:
            col = MAX_COLS - 1 - col
        out[nid] = {"x": SX + col * GX + dx,
                    "y": SY + band_top[b] + lane[nid] * GY + dy}

    # park the isolated nodes in a column below the flow, in id order
    for k, nid in enumerate(sorted(isolated, key=_id_key)):
        dx, dy = _center(ntype.get(nid))
        out[nid] = {"x": SX + dx, "y": SY + top + k * GY + dy}
    return out


def full_relayout(process):
    pos = grid_positions(process["nodes"], process["edges"])
    for n in process["nodes"]:
        n["position"] = pos[n["id"]]
        n["layout"] = "auto"


def local_relayout(process, from_index=0):
    order = topo_order(process["nodes"], process["edges"])
    pos = grid_positions(process["nodes"], process["edges"])
    byid = {n["id"]: n for n in process["nodes"]}
    for k in range(from_index, len(order)):
        n = byid[order[k]]
        if n.get("layout") == "manual":
            continue
        n["position"] = pos[n["id"]]
