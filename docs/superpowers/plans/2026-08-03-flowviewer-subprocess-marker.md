# Flow Viewer Subprocess Marker Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Show a small `زیرفرآیند` pill in the flowchart export's on-screen flow viewer header when the process on the canvas is a subprocess.

**Architecture:** One conditional `<span>` in `FlowViewer.tsx`'s header, driven by `proc.parent`. `proc` is already `trail[trail.length - 1]`, so the pill tracks the process on the canvas with no new state. The test fixture is corrected first, because it currently claims every process is top-level.

**Tech Stack:** React 18 + TypeScript, Tailwind (arbitrary values), Vitest + @testing-library/react, run from `ui/`.

**Spec:** `docs/superpowers/specs/2026-08-03-flowviewer-subprocess-marker-design.md`

## Global Constraints

- Persian copy is exactly `زیرفرآیند` — the bare word, no parent name, no parent id.
- Nothing renders when `proc.parent` is `null`. There is no `فرآیند` counterpart pill.
- Pill colours are `#B4690E` text on `#FBEEDC` background, as Tailwind arbitrary values — never `var(--warn)`. `FlowViewer` is mounted outside `.doc-root` and styles its frame with hex literals; `parity.test.tsx` guards that boundary.
- The pill goes *inside* the existing `flex items-center gap-1.5 ... flex-wrap min-w-0` group, after the process name. Not as a new sibling in the header row — the wrap is what keeps the close button on the row on a phone.
- Do not touch `Document.tsx`, `ProcessSheets.tsx`, or anything under `ui/export/steps/`.
- All commands run from the `ui/` directory.

---

### Task 1: The `زیرفرآیند` pill in the flow viewer header

**Files:**
- Modify: `ui/export/flowchart/FlowViewer.tsx:22-28` (fixture is in the test file; here the header at `:89-91`)
- Test: `ui/export/flowchart/FlowViewer.test.tsx:22-28` (fixture) and `:153` (new tests)

**Interfaces:**
- Consumes: `ReadableProcess.parent`, typed `{ process: string; node: string } | null` (`ui/src/api/types.ts:36`). Already in scope as `proc.parent`.
- Produces: nothing. No exported symbol changes; this is leaf UI.

---

- [ ] **Step 1: Make the test fixture tell the truth about `dining-002`**

`mk()` hardcodes `parent: null` for every process, but the fixture's `dining-001-n001` opens `dining-002` — so `dining-002` *is* a subprocess and the fixture says otherwise. Add a fifth parameter and pass the real parent.

In `ui/export/flowchart/FlowViewer.test.tsx`, replace lines 22-28:

```tsx
const mk = (
  id: string,
  name: string,
  nodes: ProcNode[],
  pending: Pending[] = [],
  parent: { process: string; node: string } | null = null,
) => ({
  id, department: 'dining', name, summary: '',
  source: { type: 'manual', ref: null, run: null }, parent,
  created_at: '', updated_at: '',
  idef0: { inputs: [], controls: [], outputs: [], mechanisms: [] },
  kpis: [], nodes, edges: [], pending,
})
```

Then replace line 45 — the `dining-002` entry inside `PAYLOAD.processes` — with:

```tsx
    // dining-001-n001 opens this process, so it is a subprocess and its recorded
    // parent says so. The fixture used to claim `parent: null` here, which made a
    // subprocess marker untestable.
    mk('dining-002', 'ثبت سفارش', [act('dining-002-n001', 'انتخاب غذا'), junc('dining-002-j1')], [],
      { process: 'dining-001', node: 'dining-001-n001' }),
```

- [ ] **Step 2: Write the three failing tests**

Append these inside the `describe('FlowViewer', ...)` block in `ui/export/flowchart/FlowViewer.test.tsx`, after the `'steps to the next process and closes'` test (before the closing `})` at line 154):

```tsx
  // `ActivityNode` prints «زیرفرآیند — برای ورود کلیک کنید» on every node that opens
  // one, and dining-001-n001 is such a node on the dining-001 canvas. Every assertion
  // below therefore matches the header pill's text EXACTLY — a /زیرفرآیند/ regex would
  // find the node's call to action instead, and the negative cases could never fail.
  it('leaves the header unmarked for a top-level process', async () => {
    renderViewer()
    await screen.findByText('پذیرایی')
    expect(screen.queryByText('زیرفرآیند')).not.toBeInTheDocument()
  })

  it('marks the header of a process that is a subprocess', async () => {
    renderViewer('dining-002')
    await screen.findByText('ثبت سفارش')
    expect(screen.getByText('زیرفرآیند')).toBeInTheDocument()
  })

  // The pill reads the process on the canvas — the tail of `trail` — and not the
  // one the viewer was opened at. Walking in and back out is the only thing that
  // tells those two apart.
  it('marks and unmarks as the reader walks in and back out', async () => {
    renderViewer()
    await screen.findByText('پذیرایی')
    expect(screen.queryByText('زیرفرآیند')).not.toBeInTheDocument()

    fireEvent.click(screen.getByText('خوشامدگویی'))
    await screen.findByText('ثبت سفارش')
    expect(screen.getByText('زیرفرآیند')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'پذیرایی' }))
    await screen.findByText('پذیرایی')
    expect(screen.queryByText('زیرفرآیند')).not.toBeInTheDocument()
  })
```

- [ ] **Step 3: Run the new tests and confirm two of them fail**

Run from `ui/`:

```bash
npm test -- export/flowchart/FlowViewer.test.tsx
```

Expected: `leaves the header unmarked for a top-level process` **passes** — it is a regression guard, and there is nothing to render yet, so it is green from the start. The other two **fail** with:

```
TestingLibraryElementError: Unable to find an element with the text: زیرفرآیند
```

If instead a test fails because it found the node's `زیرفرآیند — برای ورود کلیک کنید`, an assertion was written with a regex — go back to Step 2 and use the exact string.

- [ ] **Step 4: Render the pill**

In `ui/export/flowchart/FlowViewer.tsx`, replace lines 89-90:

```tsx
          <IdBadge tone="violet">{proc.id}</IdBadge>
          <span className="font-bold text-[15px] max-[560px]:text-[13.5px] text-ink">{proc.name}</span>
```

with:

```tsx
          <IdBadge tone="violet">{proc.id}</IdBadge>
          <span className="font-bold text-[15px] max-[560px]:text-[13.5px] text-ink">{proc.name}</span>
          {/* Only when the process IS one — a «فرآیند» pill on every other page is
              noise in a viewer that shows one process at a time.

              `deriveTag` in `src/lib/format` looks like the helper for this and is
              not: it falls through to «باطل‌شده», «دارای KPI» and a conflict count,
              none of which a document's reader is shown.

              `proc` is the tail of `trail`, so this follows the canvas rather than
              the process the viewer was opened at. The amber is the editor's own
              subprocess pill (`ReorderModal.tsx:89`, `Departments.tsx:61`), so the
              document and the app say it the same way. `shrink-0` keeps a long
              process name from squeezing it; the group wraps, so on a phone this
              drops to a second line instead of pushing the close button off. */}
          {proc.parent && (
            <span className="text-[11px] font-semibold text-[#B4690E] bg-[#FBEEDC] px-2 py-[2px] rounded-full shrink-0">
              زیرفرآیند
            </span>
          )}
```

- [ ] **Step 5: Run the file's tests and confirm all pass**

Run from `ui/`:

```bash
npm test -- export/flowchart/FlowViewer.test.tsx
```

Expected: PASS, 10 tests (the 7 that were there plus the 3 new ones).

- [ ] **Step 6: Run the full suite and the linter**

The fixture now carries a non-null `parent` for `dining-002`, which `DetailDrawer` also receives via `process={proc}` — this step is what proves that changed nothing else.

Run from `ui/`:

```bash
npm test && npm run lint
```

Expected: all suites pass, no eslint errors. `parity.test.tsx`, `print-colour.test.ts` and `overflow.test.tsx` in particular must stay green — they pin the export's boundaries against the app and against the printed page.

- [ ] **Step 7: Commit**

```bash
git add ui/export/flowchart/FlowViewer.tsx ui/export/flowchart/FlowViewer.test.tsx
git commit -m "feat(export): the flow viewer says when the process on it is a subprocess"
```

---

## Notes on deviations from the spec

- The spec wrote the pill as `font-bold`. This plan uses `font-semibold` to match the app's two existing amber subprocess pills verbatim (`ReorderModal.tsx:89`, `Departments.tsx:61`), so the document and the editor render the same weight.
- The spec's test list did not anticipate the fixture correction in Step 1; it is a prerequisite, not added scope.
