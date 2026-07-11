# Layered Flowchart Layout Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the serpentine auto-layout with a layered left-to-right layout (x = graph depth, y = branch lane) whose free ordering choices follow node-id sequence, so flowcharts read left→right with branches fanning out at junctions.

**Architecture:** All changes live in `engine/layout/__init__.py` (pure stdlib, deterministic — ARD INV-1 / §7). The public surface consumed by `merge`, the `layout` CLI, and the ui-backend relayout endpoint stays identical: `topo_order(nodes, edges)`, `full_relayout(process)`, `local_relayout(process, from_index)`. The serpentine `cell(k)` helper is replaced by a new `grid_positions(nodes, edges)` that computes all coordinates from the graph. Docs (`ARD.md` §9) are updated to match.

**Tech Stack:** Python 3.12, stdlib only (`heapq`, `re`, `collections`), pytest. Test runner: root `make test` (creates `./.venv`, runs `pytest -q` over engine + ui-backend).

## Global Constraints

- Engine CLIs must stay deterministic and LLM-free (ARD INV-1, §7): no randomness, no wall-clock, no new dependencies.
- Function signatures `topo_order(nodes, edges)`, `full_relayout(process)`, `local_relayout(process, from_index=0)` must not change — `engine/merge/__init__.py:5,63,158-159`, `engine/layout/cli.py`, and the ui-backend relayout endpoint depend on them.
- `layout: "manual"` nodes are never moved by `local_relayout`; `full_relayout` repositions everything and sets `layout: "auto"` (ARD §6.4).
- Never write to `data-repo` in this plan. Verification runs only on `/tmp` copies.
- Work on a feature branch: `git checkout -b feat/layout-layered` (from the current `phase-6-ui-canvas-revision` branch; engine files are untouched there).
- Layout constants: origin `SX=40, SY=90`; column pitch `GX=260`; lane pitch `GY=175`. Approximate node sizes for centering: activity `(170, 76)`, junction `(44, 44)`, start/end `(90, 36)`.

## File Structure

| File | Action | Responsibility |
|---|---|---|
| `engine/layout/__init__.py` | rewrite | `_id_key` natural-id sort; `topo_order` (id-order tiebreak); `grid_positions` (layered x/y); `full_relayout` / `local_relayout` (same contracts) |
| `engine/tests/test_layout_topo.py` | modify | tiebreak tests now expect node-id order |
| `engine/tests/test_layout_layered.py` | create | behavior tests for the layered grid |
| `engine/tests/test_layout_serpentine.py` | delete | superseded by test_layout_layered.py |
| `engine/tests/test_merge_layout.py` | modify | replace removed `cell()` with `grid_positions()` |
| `ARD.md` | modify | §9 algorithm text (lines ~429-435) + CLI table row (line ~421) |

---

### Task 1: Narrative-order tiebreak in `topo_order`

Whenever several nodes are ready at once (multiple sources, parallel branches), `topo_order` currently breaks ties by *position in the JSON nodes array*. Change the tiebreak to natural node-id order (`n002` before `n010`), which is the narrative sequence the ids were allocated in.

**Files:**
- Modify: `engine/layout/__init__.py:1-30`
- Test: `engine/tests/test_layout_topo.py`

**Interfaces:**
- Consumes: nothing new.
- Produces: `_id_key(nid: str) -> list` (module-private natural-sort key, reused by Task 2); `topo_order(nodes: list[dict], edges: list[dict]) -> list[str]` — same signature, ties now broken by `_id_key`.

- [ ] **Step 1: Update the tiebreak tests**

Replace `test_deterministic_tiebreak_uses_input_order` in `engine/tests/test_layout_topo.py` and add a numeric-order test, so the whole file reads:

```python
from layout import topo_order


def test_linear_order():
    nodes = [{"id": "start"}, {"id": "a"}, {"id": "b"}, {"id": "end"}]
    edges = [{"from": "start", "to": "a"}, {"from": "a", "to": "b"},
             {"from": "b", "to": "end"}]
    assert topo_order(nodes, edges) == ["start", "a", "b", "end"]


def test_branch_keeps_predecessors_before_successors():
    nodes = [{"id": "s"}, {"id": "j"}, {"id": "x"}, {"id": "y"}, {"id": "e"}]
    edges = [{"from": "s", "to": "j"}, {"from": "j", "to": "x"},
             {"from": "j", "to": "y"}, {"from": "x", "to": "e"},
             {"from": "y", "to": "e"}]
    order = topo_order(nodes, edges)
    assert order.index("j") < order.index("x") < order.index("e")
    assert order.index("j") < order.index("y") < order.index("e")


def test_deterministic_tiebreak_uses_id_order():
    nodes = [{"id": "b"}, {"id": "a"}]  # two roots, scrambled array order
    assert topo_order(nodes, []) == ["a", "b"]


def test_tiebreak_is_numeric_not_lexicographic():
    nodes = [{"id": "n010"}, {"id": "n002"}]  # lexicographic would keep n010 first
    assert topo_order(nodes, []) == ["n002", "n010"]


def test_edges_beat_id_order():
    # a late-allocated id spliced mid-flow: edges decide the order, not the id.
    # n008 must NOT be pushed after n003 just because 8 > 3.
    nodes = [{"id": "n002"}, {"id": "n003"}, {"id": "n008"}]
    edges = [{"from": "n002", "to": "n008"}, {"from": "n008", "to": "n003"}]
    assert topo_order(nodes, edges) == ["n002", "n008", "n003"]


def test_cycle_nodes_appended_not_dropped():
    nodes = [{"id": "a"}, {"id": "b"}]
    edges = [{"from": "a", "to": "b"}, {"from": "b", "to": "a"}]
    assert sorted(topo_order(nodes, edges)) == ["a", "b"]
```

- [ ] **Step 2: Run tests to verify the new ones fail**

Run (repo root): `.venv/bin/pytest engine/tests/test_layout_topo.py -q`
Expected: 2 FAIL (`test_deterministic_tiebreak_uses_id_order` gets `["b", "a"]`, `test_tiebreak_is_numeric_not_lexicographic` gets `["n010", "n002"]`), 4 pass (`test_edges_beat_id_order` already passes: readiness is edge-driven in the old code too — it pins the invariant against regressions).

- [ ] **Step 3: Implement the id-order tiebreak**

In `engine/layout/__init__.py`, add `import re` below `import heapq`, add `_id_key`, and rewrite `topo_order` (the serpentine code below it is untouched in this task):

```python
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
```

- [ ] **Step 4: Run the topo tests — all pass**

Run: `.venv/bin/pytest engine/tests/test_layout_topo.py -q`
Expected: 6 passed.

- [ ] **Step 5: Run the full suite (merge/serpentine tests must still pass — they derive expectations from `topo_order`, so they follow the new order)**

Run: `make test`
Expected: all passed, 0 failed.

- [ ] **Step 6: Commit**

```bash
git add engine/layout/__init__.py engine/tests/test_layout_topo.py
git commit -m "fix(layout): break topo-order ties by node-id sequence, not array position"
```

---

### Task 2: Layered grid replaces the serpentine

Replace `cell(k)`/`PER_ROW` with `grid_positions(nodes, edges)`: x = longest-path depth (one column per depth), y = branch lane (inherit predecessors' mean lane; column collisions push later-id siblings to lanes below), small nodes centered within the column.

**Files:**
- Modify: `engine/layout/__init__.py` (everything below `topo_order`)
- Create: `engine/tests/test_layout_layered.py`
- Delete: `engine/tests/test_layout_serpentine.py`
- Modify: `engine/tests/test_merge_layout.py:4,16,29-32`

**Interfaces:**
- Consumes: `topo_order`, `_id_key` from Task 1.
- Produces: `grid_positions(nodes: list[dict], edges: list[dict]) -> dict[str, dict]` mapping node id → `{"x": int, "y": int}`; module constants `SX, SY, GX, GY`; `full_relayout(process) -> None` and `local_relayout(process, from_index=0) -> None` with unchanged semantics. `cell` and `PER_ROW` are **removed**.

- [ ] **Step 1: Write the failing tests**

Create `engine/tests/test_layout_layered.py`:

```python
import copy

from conftest import load_fixture
from layout import GX, SX, SY, full_relayout, grid_positions, local_relayout, topo_order


def _act(nid):
    return {"id": nid, "type": "activity"}


def _junc(nid):
    return {"id": nid, "type": "junction"}


def _chain_edges(ids):
    return [{"from": a, "to": b} for a, b in zip(ids, ids[1:])]


def test_linear_chain_is_one_left_to_right_lane():
    ids = ["a", "b", "c", "d", "e", "f"]          # longer than the old 4-per-row
    pos = grid_positions([_act(i) for i in ids], _chain_edges(ids))
    assert all(pos[i]["y"] == pos["a"]["y"] for i in ids)          # single lane
    xs = [pos[i]["x"] for i in ids]
    assert xs == sorted(xs) and len(set(xs)) == len(xs)            # strictly rightward
    assert xs[1] - xs[0] == GX                                     # column pitch


def test_branch_fans_out_vertically_after_junction():
    # a -> j -> (b | c), b -> d
    nodes = [_act("a"), _junc("j"), _act("b"), _act("c"), _act("d")]
    edges = _chain_edges(["a", "j"]) + [
        {"from": "j", "to": "b"}, {"from": "j", "to": "c"}, {"from": "b", "to": "d"},
    ]
    pos = grid_positions(nodes, edges)
    assert pos["b"]["x"] == pos["c"]["x"]          # siblings share a column
    assert pos["b"]["y"] != pos["c"]["y"]          # ...on different lanes
    assert pos["b"]["y"] == pos["a"]["y"]          # lower-id sibling keeps the main lane
    assert pos["d"]["y"] == pos["b"]["y"]          # chain continues on its lane
    assert pos["d"]["x"] > pos["b"]["x"]           # and keeps moving right


def test_feeder_source_sits_left_of_its_target_on_same_lane():
    # later-recorded feeder n007 -> n001 (the dining-006 shape)
    nodes = [_act("n001"), _act("n002"), _act("n007")]
    edges = [{"from": "n007", "to": "n001"}, {"from": "n001", "to": "n002"}]
    pos = grid_positions(nodes, edges)
    assert pos["n007"]["x"] < pos["n001"]["x"] < pos["n002"]["x"]
    assert pos["n007"]["y"] == pos["n001"]["y"] == pos["n002"]["y"]


def test_late_inserted_node_sits_between_its_edge_neighbors():
    # a node added later gets a high id (n008) but its edges splice it
    # mid-flow: n002 -> n008 -> n003. Edges drive placement; the id must
    # not banish it to the end of the chart.
    nodes = [_act("n001"), _act("n002"), _act("n003"), _act("n008")]
    edges = [{"from": "n001", "to": "n002"}, {"from": "n002", "to": "n008"},
             {"from": "n008", "to": "n003"}]
    pos = grid_positions(nodes, edges)
    assert pos["n002"]["x"] < pos["n008"]["x"] < pos["n003"]["x"]   # between, in x
    assert pos["n008"]["y"] == pos["n002"]["y"] == pos["n003"]["y"]  # same lane


def test_multiple_sources_take_lanes_in_id_order():
    nodes = [_act("n006"), _act("n001"), _act("n003")]   # scrambled array order
    pos = grid_positions(nodes, [])
    assert pos["n001"]["y"] < pos["n003"]["y"] < pos["n006"]["y"]
    assert pos["n001"]["x"] == pos["n003"]["x"] == pos["n006"]["x"]


def test_no_two_nodes_share_a_position():
    # the dining-012 shape that produced overlapping cards: a chain plus
    # two disconnected feeders converging on n001
    nodes = [_act(f"n00{k}") for k in range(1, 8)]
    edges = [{"from": "n002", "to": "n003"}, {"from": "n003", "to": "n004"},
             {"from": "n004", "to": "n005"}, {"from": "n006", "to": "n001"},
             {"from": "n007", "to": "n001"}]
    pos = grid_positions(nodes, edges)
    coords = [(p["x"], p["y"]) for p in pos.values()]
    assert len(set(coords)) == len(coords)


def test_junction_is_centered_within_its_column():
    # junctions are much smaller than activity cards; they get a centering nudge
    nodes = [_act("a"), _junc("j"), _act("b")]
    pos = grid_positions(nodes, _chain_edges(["a", "j", "b"]))
    assert SX + GX < pos["j"]["x"] < SX + 2 * GX    # nudged right, inside its column
    assert pos["j"]["y"] > pos["a"]["y"]            # nudged down toward card middle
    assert pos["j"]["y"] < pos["a"]["y"] + SY       # ...but nowhere near the next lane


def test_grid_positions_is_deterministic():
    nodes = [_act("a"), _junc("j"), _act("b"), _act("c")]
    edges = [{"from": "a", "to": "j"}, {"from": "j", "to": "b"}, {"from": "j", "to": "c"}]
    assert grid_positions(nodes, edges) == grid_positions(copy.deepcopy(nodes), copy.deepcopy(edges))


def test_full_relayout_positions_all_and_sets_auto():
    p = copy.deepcopy(load_fixture("process.cooking-001.json"))
    for n in p["nodes"]:            # dirty positions/layout
        n["position"] = {"x": -1, "y": -1}
    p["nodes"][3]["layout"] = "manual"
    full_relayout(p)
    assert all(n["position"] != {"x": -1, "y": -1} for n in p["nodes"])
    assert all(n["layout"] == "auto" for n in p["nodes"])  # full overrides manual


def test_local_relayout_preserves_upstream_and_manual():
    p = copy.deepcopy(load_fixture("process.cooking-001.json"))
    order = topo_order(p["nodes"], p["edges"])
    byid = {n["id"]: n for n in p["nodes"]}
    upstream_id = order[0]
    upstream_pos = dict(byid[upstream_id]["position"])
    # mark a downstream node manual; it must keep its position
    manual_id = order[-1]
    byid[manual_id]["layout"] = "manual"
    manual_pos = dict(byid[manual_id]["position"])
    local_relayout(p, from_index=1)
    assert byid[upstream_id]["position"] == upstream_pos   # upstream untouched
    assert byid[manual_id]["position"] == manual_pos       # manual untouched
```

- [ ] **Step 2: Run the new tests to verify they fail**

Run: `.venv/bin/pytest engine/tests/test_layout_layered.py -q`
Expected: collection error — `ImportError: cannot import name 'GX' from 'layout'` (or `grid_positions`).

- [ ] **Step 3: Implement the layered grid**

In `engine/layout/__init__.py`, delete everything below `topo_order` (`PER_ROW`, `SX, SY, GX, GY`, `cell`, `full_relayout`, `local_relayout`) and replace with:

```python
# Layered left-to-right layout (ARD Section 9): x = longest-path depth from
# the flow's sources ("layer", one column each), y = branch lane. A node
# inherits its predecessors' mean lane; when a column collides (e.g. two
# branches of a junction), the later-id sibling is pushed to the lane below.
SX, SY = 40, 90     # canvas origin
GX, GY = 260, 175   # column / lane pitch (activity card is 170px wide)

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

    ntype = {n["id"]: n.get("type") for n in nodes}
    out = {}
    for nid in order:
        dx, dy = _center(ntype.get(nid))
        out[nid] = {"x": SX + layer[nid] * GX + dx, "y": SY + row[nid] * GY + dy}
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
```

- [ ] **Step 4: Run the layered tests — all pass**

Run: `.venv/bin/pytest engine/tests/test_layout_layered.py -q`
Expected: 10 passed.

- [ ] **Step 5: Update `test_merge_layout.py` off the removed `cell()`**

Three edits in `engine/tests/test_merge_layout.py`:

Line 4: `from layout import cell, topo_order` → `from layout import grid_positions, topo_order`

Line 16 (comment): `# make everything auto so we can compare against a clean serpentine` → `# make everything auto so we can compare against a clean layered grid`

Lines 29-32:
```python
    # the appended node sits at the next serpentine cell
    order = topo_order(p["nodes"], p["edges"])
    tnode = next(n for n in p["nodes"] if n.get("label") == "z")
    assert tnode["position"] == cell(order.index(tnode["id"]))
```
→
```python
    # the appended node sits at its layered grid cell
    tnode = next(n for n in p["nodes"] if n.get("label") == "z")
    assert tnode["position"] == grid_positions(p["nodes"], p["edges"])[tnode["id"]]
```

- [ ] **Step 6: Delete the serpentine test file**

```bash
git rm engine/tests/test_layout_serpentine.py
```

- [ ] **Step 7: Run the full suite**

Run: `make test`
Expected: all passed (engine + ui-backend; the ui-backend relayout endpoint tests only assert status/persistence semantics, not coordinates).

- [ ] **Step 8: Commit**

```bash
git add engine/layout/__init__.py engine/tests/test_layout_layered.py engine/tests/test_merge_layout.py
git commit -m "feat(layout): layered left-to-right layout replaces serpentine grid"
```

---

### Task 3: Update ARD §9 to the layered algorithm

**Files:**
- Modify: `ARD.md:421` (CLI table row) and `ARD.md:429-435` (§9 body)

**Interfaces:**
- Consumes: terminology from Task 2 (layers, lanes, id-order ties).
- Produces: spec text later contributors will follow; no code.

- [ ] **Step 1: Replace the §9 body**

In `ARD.md`, replace:

```markdown
## 9. Layout Algorithm (FR-D9)

- Direction: horizontal, left-to-right (LTR).
- **Serpentine (boustrophedon):** row 1 left→right, row 2 right→left, and so on; the inter-row connector is just one step down.
- Input: the graph's topological order. Each row is filled up to the page width, then wraps.
- Branches (after a junction) are laid out near the junction; the automatic layout is a "good starting point," not perfect — and since position is saved and editable, the user tidies it with a few moves and it sticks.
- Deterministic and LLM-free; runs in `merge` (for nodes without a position, or an explicit `re-layout`).
```

with:

```markdown
## 9. Layout Algorithm (FR-D9)

- Direction: horizontal, left-to-right (LTR).
- **Layered:** x = the node's depth (longest path from the flow's sources), one column per depth; y = branch lane. A node inherits its predecessors' mean lane; when a column collides (e.g. the two branches of a junction), the later sibling is pushed to the lane below.
- **Edges always dominate placement**: a node sits after everything its incoming edges require and before everything its outgoing edges feed, regardless of its id (a late-allocated `n008` spliced in as `n002 → n008 → n003` lands between n002 and n003). Node-id sequence (`n001 < n002 < …`, numeric order — the narrative order ids were allocated in) only breaks genuine ties the edges leave ambiguous: multiple sources, siblings in one column. Never array position.
- Small node types (junction, start, end) are nudged toward the column/lane center so edges meet activity-card middles.
- Branches (after a junction) are laid out near the junction; the automatic layout is a "good starting point," not perfect — and since position is saved and editable, the user tidies it with a few moves and it sticks.
- Deterministic and LLM-free; runs in `merge` (for nodes without a position, or an explicit `re-layout`).
```

- [ ] **Step 2: Update the CLI table row**

In `ARD.md` line ~421, replace:

```markdown
| `layout` | deterministic serpentine layout (Section 9) |
```

with:

```markdown
| `layout` | deterministic layered layout (Section 9) |
```

- [ ] **Step 3: Sweep for leftover references**

Run: `grep -rn -i "serpentine\|boustrophedon" --include="*.md" --include="*.py" . | grep -v .venv | grep -v node_modules | grep -v docs/superpowers/plans`
Expected: no output. If any line appears (outside this plan file and git history), update its wording to "layered" the same way as above.

- [ ] **Step 4: Commit**

```bash
git add ARD.md
git commit -m "docs(ard): section 9 layout algorithm is layered LTR, not serpentine"
```

---

### Task 4: Verify against real data (read-only) and present to the user

**Files:**
- No repo files change. Works on `/tmp` copies of `data-repo` processes.

**Interfaces:**
- Consumes: the `layout` CLI (`engine/layout/cli.py`) with the Task 2 algorithm.
- Produces: a before/after position report for the user's approval. **Do not modify `data-repo`, do not commit anything here.**

- [ ] **Step 1: Run the new layout on copies of the three problem processes**

```bash
DATA="/home/lili/Desktop/DriveD/work/Moshtaghi/Inja food/process/process dev/data-repo/departments/dining/processes"
for p in dining-003 dining-006 dining-012; do
  cp "$DATA/$p.json" "/tmp/$p.json"
  (cd engine && SCHEMA_DIR="$(pwd)/../schemas" .venv/bin/python -c "
import sys; sys.argv=['layout','/tmp/$p.json','--full']
from layout.cli import main; sys.exit(main())")
done
```
Expected: exit 0 for all three (schema validation inside the CLI passes).

- [ ] **Step 2: Print the resulting canvas order and check it**

```bash
python3 - <<'EOF'
import json
for p in ["dining-003", "dining-006", "dining-012"]:
    d = json.load(open(f"/tmp/{p}.json"))
    print(f"\n=== {p}")
    for n in sorted(d["nodes"], key=lambda n: (n["position"]["x"], n["position"]["y"])):
        print(f'  {n["id"].split("-")[-1]:>5} x={n["position"]["x"]:>5} y={n["position"]["y"]:>5}')
    coords = [(n["position"]["x"], n["position"]["y"]) for n in d["nodes"]]
    assert len(set(coords)) == len(coords), "OVERLAP!"
EOF
```
Expected, concretely:
- `dining-003`: single lane `j2 → n001 → n002 → n003 → n004 → n005 → j1 → n006 → …` with x strictly increasing along the main chain; `n010` (VIP) one lane below `n001`'s column; `n007/n008/n009` on the second lane after `j1`; no overlaps.
- `dining-006`: `n007` in the leftmost column feeding `n001`, main chain on lane 0, `n005 → n006` on lane 1.
- `dining-012`: **no two nodes at the same coordinates** (the current file has `n005`/`n006` stacked at `(670, 265)`).

- [ ] **Step 3: Show the user and stop**

Present the three layouts (the printout above) and ask before: (a) merging the branch, (b) running re-layout on any real `data-repo` file, (c) optionally restoring the user's hand-tuned `dining-003` positions from the JSON they supplied in chat.

---

### Task 5 (added 2026-07-12 after user feedback): Serpentine band wrap

Long flows (e.g. dining-002, 39 nodes ≈ 25+ sequential layers) exceeded the page width — PRD FR-D9 requires wrapping. Fix: cap columns per band at `MAX_COLS = 5`; deeper flows wrap into a new band of lanes below; bands alternate direction (band 1 left→right, band 2 right→left — user-chosen true serpentine). Band height = number of lanes used in that band × `GY`.

- `engine/layout/__init__.py`: `MAX_COLS`, band_top accumulation, `divmod(layer, MAX_COLS)` + odd-band column reversal.
- `engine/tests/test_layout_layered.py`: chain test shortened to one band; new `test_long_chain_wraps_into_serpentine_bands` (12-step chain → 5/5/2 bands, reversed middle band, width cap assertion).
- ARD §9 + `engine/layout/README.md`: wrap bullet added.

---

## Self-Review (completed)

1. **Spec coverage:** layered x/y ✔ (Task 2), id-sequence ordering ✔ (Task 1, and Task 2 lane sort), junction centering ✔ (Task 2 `_center`), overlap bug ✔ (Task 2 `test_no_two_nodes_share_a_position`), ARD update ✔ (Task 3), verify on real files without touching data-repo ✔ (Task 4).
2. **Placeholder scan:** none — every code step carries full code; Task 3 Step 3's "update wording" is bounded by an exact grep with expected-empty output.
3. **Type consistency:** `grid_positions(nodes, edges) -> dict[str, {"x","y"}]` used identically in Tasks 2 (impl + tests) and the merge-test edit; `_id_key` defined in Task 1, consumed in Task 2; constants `SX, SY, GX, GY` defined in Task 2 and imported by its tests.
