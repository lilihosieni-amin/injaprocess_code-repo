# Subprocess-Linked Node Styling Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give a flowchart activity node that links to a subprocess a distinct lavender card (#F3EEFC) and a green "click to enter" badge, so it stands out from ordinary nodes.

**Architecture:** Purely presentational. The `data.hasSub` flag is already computed in `ui/src/flow/adapt.ts:41` (`n.type === 'activity' && n.subprocess != null`) and passed to `ActivityNode`. We only branch the card's background/border and recolour the existing subprocess badge based on that flag. No data, schema, or backend change; navigation behaviour is untouched (it lives in `FlowScreen.onNodeClick`).

**Tech Stack:** React + TypeScript + @xyflow/react + Tailwind, Vitest + Testing Library.

## Global Constraints

- Subprocess-linked card background is exactly **`#F3EEFC`** (inline Tailwind `bg-[#F3EEFC]`), border is the existing **`line`** token (`#E3D8F5`).
- Non-subprocess nodes stay unchanged: `bg-white border-warm`.
- Subprocess badge uses the app green pill: **`text-green bg-[#E4F6EC]`** (matches `chip-output`), with a leading `‹` chevron. Badge text stays «زیرفرآیند — برای ورود کلیک کنید».
- The `highlighted` violet ring (`ring-2 ring-violet ring-offset-2 ring-offset-bg`) and `shadow-card` are preserved in both branches.
- Only `ActivityNode` changes — no edits to Start/End/Junction node components.

---

### Task 1: Recolour subprocess-linked ActivityNode

**Files:**
- Modify: `ui/src/flow/nodes/ActivityNode.tsx` (card container line 9; badge block lines 31-33)
- Test: `ui/src/flow/nodes/nodes.test.tsx`

**Interfaces:**
- Consumes: `data.hasSub: boolean` and `data.highlighted?: boolean` from `FlowNodeData` (already passed in by `adapt.ts`; no signature change).
- Produces: nothing new — same component contract.

- [ ] **Step 1: Write the failing tests**

Add these two tests inside the `describe('custom nodes', ...)` block in `ui/src/flow/nodes/nodes.test.tsx` (the `act` fixture at the top of the file already has `subprocess: 'cooking-014'`):

```tsx
  it('ActivityNode with a subprocess uses the lavender card and a green (not red) sub badge', () => {
    const { container } = wrap(<ActivityNode id="cooking-001-n010" data={{ node: act, conflicts: 0, hasSub: true }} selected={false} type="activity" dragging={false} zIndex={0} isConnectable positionAbsoluteX={0} positionAbsoluteY={0} deletable draggable selectable /> as never)
    const card = container.querySelector('div[dir="rtl"]') as HTMLElement
    expect(card.className).toContain('bg-[#F3EEFC]')
    expect(card.className).not.toContain('bg-white')
    const badge = screen.getByText(/زیرفرآیند/)
    expect(badge.className).toContain('text-green')
    expect(badge.className).not.toContain('text-conflict')
  })
  it('ActivityNode without a subprocess uses a white card and shows no sub badge', () => {
    const { container } = wrap(<ActivityNode id="cooking-001-n010" data={{ node: act, conflicts: 0, hasSub: false }} selected={false} type="activity" dragging={false} zIndex={0} isConnectable positionAbsoluteX={0} positionAbsoluteY={0} deletable draggable selectable /> as never)
    const card = container.querySelector('div[dir="rtl"]') as HTMLElement
    expect(card.className).toContain('bg-white')
    expect(card.className).not.toContain('bg-[#F3EEFC]')
    expect(screen.queryByText(/زیرفرآیند/)).toBeNull()
  })
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `cd ui && npm test -- --run src/flow/nodes/nodes.test.tsx`
Expected: the two new tests FAIL — the card currently always has `bg-white` (never `bg-[#F3EEFC]`), and the badge currently has `text-conflict`, not `text-green`.

- [ ] **Step 3: Branch the card background/border on `data.hasSub`**

In `ui/src/flow/nodes/ActivityNode.tsx`, replace the opening card `<div>` (line 9):

```tsx
    <div dir="rtl" className={`relative bg-white border border-warm rounded-xl shadow-card px-3 py-2 w-[170px] text-center transition-shadow ${data.highlighted ? 'ring-2 ring-violet ring-offset-2 ring-offset-bg' : ''}`}>
```

with:

```tsx
    <div dir="rtl" className={`relative border rounded-xl shadow-card px-3 py-2 w-[170px] text-center transition-shadow ${data.hasSub ? 'bg-[#F3EEFC] border-line' : 'bg-white border-warm'} ${data.highlighted ? 'ring-2 ring-violet ring-offset-2 ring-offset-bg' : ''}`}>
```

- [ ] **Step 4: Recolour the subprocess badge and add the chevron**

In the same file, replace the badge block (lines 31-33):

```tsx
      {data.hasSub && (
        <div className="flex items-center justify-center gap-1 mt-1.5 text-[9px] text-conflict bg-[#FFE9E7] px-2 py-0.5 rounded-full font-semibold">زیرفرآیند — برای ورود کلیک کنید</div>
      )}
```

with:

```tsx
      {data.hasSub && (
        <div className="flex items-center justify-center gap-1 mt-1.5 text-[9px] text-green bg-[#E4F6EC] px-2 py-0.5 rounded-full font-semibold">
          <span aria-hidden dir="ltr" className="text-[10px] leading-none">‹</span>
          زیرفرآیند — برای ورود کلیک کنید
        </div>
      )}
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `cd ui && npm test -- --run src/flow/nodes/nodes.test.tsx`
Expected: PASS — all node tests green, including the two new ones and the existing `hasSub: true` / highlight-ring tests (the ring branch is unchanged).

- [ ] **Step 6: Run the full UI suite + build**

Run: `cd ui && npm test -- --run && npm run build`
Expected: all Vitest suites pass and the Vite build succeeds (no regressions in `FlowScreen`/adapt tests).

- [ ] **Step 7: Commit**

```bash
git add ui/src/flow/nodes/ActivityNode.tsx ui/src/flow/nodes/nodes.test.tsx
git commit -m "feat(ui): distinct lavender card + green badge for subprocess-linked nodes"
```

---

## Self-Review

**Spec coverage:**
- Card background `#F3EEFC` + `line` border on `hasSub` → Step 3. ✓
- Non-subprocess node unchanged (`bg-white border-warm`) → Step 3 (else branch) + Step 1 second test. ✓
- Badge green (`text-green bg-[#E4F6EC]`) + `‹` chevron, text unchanged → Step 4. ✓
- `highlighted` ring + `shadow-card` preserved → Step 3 (both retained). ✓
- Driven by existing `data.hasSub`, no data/schema/backend change → Architecture + no other files touched. ✓
- Only `ActivityNode` changes → Files list. ✓
- Tests for with/without subprocess → Step 1. ✓

**Placeholder scan:** No TBD/TODO; every code step shows the full before/after. ✓

**Type consistency:** No signature changes; `data.hasSub` / `data.highlighted` used exactly as the existing component and `FlowNodeData` already define them. Test props mirror the existing tests' prop set verbatim. ✓

**Note:** This is a CSS-class change with no TypeScript type change, so `tsc` is not a gate here; the class-string assertions in Step 1 are the behavioural check. A quick visual confirmation in the running app (a subprocess node renders lavender with a green badge) is worthwhile but not required by the plan.
