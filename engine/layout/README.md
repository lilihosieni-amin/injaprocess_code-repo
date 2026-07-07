# layout (deterministic CLI — to be implemented)

Serpentine (boustrophedon) layout, LLM-free (ARD §9, FR-D9/D10):

- Horizontal LTR; row 1 left→right, row 2 right→left, one step down between rows.
- Input: topological order; rows fill up to page width then wrap.
- `layout: manual` nodes are never moved.
