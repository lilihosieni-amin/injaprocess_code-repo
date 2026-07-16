# Subprocess-linked node styling — design

**Date:** 2026-07-16
**Status:** Approved (brainstorming)

## Problem

In the flowchart editor, an activity node that links to a subprocess looks the
same as any other node except for a small badge. The badge is styled **red**
(`text-conflict bg-#FFE9E7`), which reads as a conflict/error rather than a
clickable "enter the subprocess" affordance. We want subprocess-linked nodes to
stand out with a distinct card colour (**#F3EEFC**, lavender) and a green badge,
matching the reference mockup.

## Decisions

- **Card colour:** `#F3EEFC` background with the `line` (`#E3D8F5`) violet-tinted
  border when the node links to a subprocess; white/`warm` border otherwise.
- **Badge colour:** the app's green pill (`text-green` `#1F8A5B` on `bg-#E4F6EC`,
  matching the existing `chip-output` style), with a leading `‹` chevron.
- **Driven by the existing `data.hasSub` flag** — no data/schema/backend change.

## Scope

One component: `ui/src/flow/nodes/ActivityNode.tsx`. The `hasSub` flag is already
computed in `ui/src/flow/adapt.ts:41` as
`n.type === 'activity' && n.subprocess != null`, so the feature is purely
presentational.

## Changes

### 1. Card background + border — `ActivityNode.tsx` (card container)

When `data.hasSub` is true, the card uses `bg-[#F3EEFC] border-line` instead of
the default `bg-white border-warm`. Everything else on the container is
preserved unchanged in both branches: `shadow-card`, the rounded/padding
classes, and the `highlighted` violet ring
(`ring-2 ring-violet ring-offset-2 ring-offset-bg`). Non-subprocess nodes are
visually unchanged (white card, warm border).

### 2. Subprocess badge → green — `ActivityNode.tsx` (badge block)

The existing `data.hasSub` badge changes from red
(`text-conflict bg-[#FFE9E7]`) to green (`text-green bg-[#E4F6EC]`), and gains a
leading `‹` chevron so it reads as a click-to-enter affordance. Badge text is
unchanged: «زیرفرآیند — برای ورود کلیک کنید». The navigation behaviour is
untouched — it already lives in `FlowScreen.onNodeClick` (navigates to
`/processes/{subprocess}/flow`).

### 3. Tests — `ui/src/flow/nodes/nodes.test.tsx`

Extend the existing node tests:
- A node **with** a subprocess renders the `bg-[#F3EEFC]` card and the green
  badge (assert on the badge text «زیرفرآیند — برای ورود کلیک کنید» and its green
  class / absence of the red class).
- A node **without** a subprocess renders a white card and no subprocess badge.

## Out of scope (YAGNI)

- No new Tailwind colour token — use the exact `#F3EEFC` inline plus the existing
  `green`, `line`, and `#E4F6EC` values.
- No change to Start/End/Junction node components.
- No data-model, schema, or backend change; navigation behaviour unchanged.
