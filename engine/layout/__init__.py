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

# Layered layout with serpentine band wrap (ARD Section 9, FR-D9):
# x = longest-path depth from the flow's sources ("layer", one column each),
# y = branch lane. A node inherits its predecessors' mean lane; when a column
# collides (e.g. two branches of a junction), the later-id sibling is pushed
# to the lane below. Flows deeper than MAX_COLS wrap into a new band of lanes
# below, alternating direction (band 1 left->right, band 2 right->left, ...)
# so the chart never exceeds the page width.
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


def grid_positions(nodes, edges):
    """Deterministic {node_id: {"x", "y"}} for the layered layout."""
    order = topo_order(nodes, edges)
    known = set(order)
    preds = defaultdict(list)
    for e in edges:
        if e["from"] in known and e["to"] in known:
            preds[e["to"]].append(e["from"])

    layer = {}  # longest path from a source
    for nid in order:
        layer[nid] = max((layer[p] + 1 for p in preds[nid] if p in layer), default=0)
    by_layer = defaultdict(list)
    for nid in order:
        by_layer[layer[nid]].append(nid)

    row = {}
    for lv in sorted(by_layer):
        # a node wants the mean lane of its predecessors (0 for sources);
        # collisions within a column push later-id siblings to lanes below
        desired = {}
        for nid in by_layer[lv]:
            lanes = [row[p] for p in preds[nid] if p in row]
            desired[nid] = sum(lanes) / len(lanes) if lanes else 0.0
        used = set()
        for nid in sorted(by_layer[lv], key=lambda i: (desired[i], _id_key(i))):
            r = round(desired[nid])
            while r in used:
                r += 1
            row[nid] = r
            used.add(r)

    # serpentine band wrap: band b starts below the previous band's lanes;
    # odd bands run right-to-left so the wrap connector stays short
    band_top, top = {}, 0
    for nid in order:
        b = layer[nid] // MAX_COLS
        band_top.setdefault(b, None)
    for b in sorted(band_top):
        band_top[b] = top
        lanes = max(row[nid] for nid in order if layer[nid] // MAX_COLS == b) + 1
        top += lanes * GY

    ntype = {n["id"]: n.get("type") for n in nodes}
    out = {}
    for nid in order:
        dx, dy = _center(ntype.get(nid))
        b, col = divmod(layer[nid], MAX_COLS)
        if b % 2 == 1:
            col = MAX_COLS - 1 - col
        out[nid] = {"x": SX + col * GX + dx,
                    "y": SY + band_top[b] + row[nid] * GY + dy}
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
