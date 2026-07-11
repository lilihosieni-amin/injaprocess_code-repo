# Spike Findings — @xyflow/react interaction proof

**Date:** 2026-07-11  
**Branch:** phase-6-ui-canvas  
**@xyflow/react version:** 12.11.2

## Interaction checklist

| # | Item | Result | Notes |
|---|------|--------|-------|
| 1 | Custom activity nodes render with RTL content on LTR canvas | **PASS (headless)** | Verified by smoke test: `findByText('فعالیت ۱')` finds the node text; node has `dir="rtl"` on content div inside LTR `data-testid="spike-canvas"`. |
| 2 | Pan (drag background), zoom (wheel), fit (Controls button) | **PENDING human sign-off (interactive)** | jsdom has no real layout engine. Requires browser run. |
| 3 | Drag a node to reposition | **PENDING human sign-off (interactive)** | Requires browser drag interaction. |
| 4 | Drag from coral source handle to target handle creates new edge (onConnect fires) | **PENDING human sign-off (interactive)** | onConnect handler is wired (`addEdge` + state update). Requires browser pointer events. |
| 5 | Edge shows its label ("نمونه") | **PASS (headless)** | Verified by smoke test: `getByText('نمونه')` finds the SVG edge label after node measurement completes. |
| 6 | No console errors; RTL page chrome unaffected | **PASS (headless)** | Smoke test passes clean with 0 errors. The `setup.ts` mock additions did not break any of the 29 existing tests (13 test files). |

## Mock workarounds needed for jsdom

Four jsdom gaps required shims in `ui/src/test/reactflow-mock.ts` (added to `installReactFlowMocks()`):

1. **`ResizeObserver`** — shimmed to fire the callback asynchronously (`Promise.resolve()`) on `observe()` so ReactFlow's `useResizeObserver` triggers `updateNodeInternals` after effects settle.
2. **`HTMLElement.offsetWidth` / `offsetHeight`** — jsdom always returns 0; shimmed to return `100`/`40` so `getDimensions()` in `updateNodeInternals` sees non-zero values and proceeds to set `handleBounds`.
3. **`DOMMatrixReadOnly`** — shimmed with `m22 = 1` so the viewport zoom calculation doesn't throw.
4. **`SVGElement.getBBox`** — shimmed to return `{ width: 40, height: 14 }` so `EdgeText` can compute its label bounding box without crashing.

Without all four, either edges don't render (items 1–3) or the test throws (`getBBox is not a function`).

## Decision

**Headless: RF mounts with custom nodes + edge label + onConnect handler wired. Interactive drag/pan/zoom PENDING human sign-off before Milestone 2.**
