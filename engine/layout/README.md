# layout (deterministic CLI — implemented)

Console command: `layout` → `layout.cli:main`


Layered layout with serpentine band wrap, LLM-free (ARD §9, FR-D9/D10):

- Horizontal; x = longest-path depth (one column per depth), y = branch lane.
- Edges dominate placement; node-id sequence only breaks genuine ties
  (multiple sources, siblings in one column).
- Flows deeper than MAX_COLS (5) columns wrap into a new band of lanes below;
  bands alternate direction (serpentine) so charts never exceed page width.
- Junction/start/end nodes get a centering nudge toward the column middle.
- `layout: manual` nodes are never moved by local re-layout.
