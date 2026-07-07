import heapq
from collections import defaultdict


def topo_order(nodes, edges):
    ids = [n["id"] for n in nodes]
    idx = {i: k for k, i in enumerate(ids)}
    succ = defaultdict(list)
    indeg = {i: 0 for i in ids}
    for e in edges:
        if e["from"] in indeg and e["to"] in indeg:
            succ[e["from"]].append(e["to"])
            indeg[e["to"]] += 1
    ready = [idx[i] for i in ids if indeg[i] == 0]
    heapq.heapify(ready)  # smallest input-index first => stable tiebreak
    out, seen = [], set()
    while ready:
        nid = ids[heapq.heappop(ready)]
        if nid in seen:
            continue
        seen.add(nid)
        out.append(nid)
        for t in succ[nid]:
            indeg[t] -= 1
            if indeg[t] == 0:
                heapq.heappush(ready, idx[t])
    for i in ids:  # cycle leftovers, original order
        if i not in seen:
            out.append(i)
    return out

PER_ROW = 4
SX, SY, GX, GY = 40, 90, 210, 175


def cell(k):
    row, col = divmod(k, PER_ROW)
    if row % 2 == 1:
        col = PER_ROW - 1 - col
    return {"x": SX + col * GX, "y": SY + row * GY}


def full_relayout(process):
    order = topo_order(process["nodes"], process["edges"])
    byid = {n["id"]: n for n in process["nodes"]}
    for k, nid in enumerate(order):
        n = byid[nid]
        n["position"] = cell(k)
        n["layout"] = "auto"


def local_relayout(process, from_index=0):
    order = topo_order(process["nodes"], process["edges"])
    byid = {n["id"]: n for n in process["nodes"]}
    for k in range(from_index, len(order)):
        n = byid[order[k]]
        if n.get("layout") == "manual":
            continue
        n["position"] = cell(k)
