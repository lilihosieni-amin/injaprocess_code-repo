# Subprocess marker in the flowchart export's flow viewer

**Date:** 2026-08-03
**Scope:** `ui/export/flowchart/FlowViewer.tsx`

## Problem

The flowchart export (`flowchart.html`) marks subprocesses in two of its three
surfaces. The third — the on-screen flow viewer, the full-screen page a reader
lands on after tapping a process in the table of contents — says nothing about
whether the process on the canvas is a top-level process or a subprocess.

| Surface | Marker today |
|---|---|
| Home / فهرست مطالب (`Document.tsx:201`) | subtitle: `۵ فعالیت · dining-003 · زیرفرآیند` |
| Print-only process sheet (`ProcessSheets.tsx:28`) | pill: `زیرفرآیند از dining-002` |
| **On-screen flow viewer** (`FlowViewer.tsx:89-90`) | **none** — id badge and process name only |

This is not a gap against the mockup: `ui/design/export/dining-export-v2.html`
has no such tag in its flow viewer header either. It is a new addition.

The omission bites hardest when a reader opens a subprocess **directly from the
table of contents**. The viewer's breadcrumb shows the route walked, so a trail
of length 1 renders no breadcrumb at all — and that is precisely the case where
nothing else on the page says the process is a subprocess.

Note also that the breadcrumb and `parent` answer different questions. The
breadcrumb is the route the reader took; `parent` is the recorded parent. One
subprocess called from two processes has one recorded parent and two possible
routes, so the breadcrumb can never substitute for the marker.

## Design

### What renders

In the header's wrap group, immediately after the process name
(`FlowViewer.tsx:90`), render a pill reading `زیرفرآیند` when `proc.parent` is
non-null.

Nothing renders for a top-level process. This departs deliberately from the
steps export, which tags every process either `فرآیند` or `زیرفرآیند`: that
export shows the two side by side in an index where the contrast carries
information, whereas the flow viewer shows one process at a time and a `فرآیند`
pill on every other page would be noise.

The pill is driven by `proc`, which is already `trail[trail.length - 1]` — the
process currently on the canvas. Walking into a subprocess therefore makes the
pill appear and backing out through the breadcrumb makes it disappear, with no
new state.

The pill shows the bare word. It does not resolve or display the parent's name
or id.

### Placement

DOM order inside the existing `flex items-center gap-1.5 ... flex-wrap min-w-0`
container becomes:

```
[ id badge ]  [ process name ]  [ زیرفرآیند pill ]
```

On screen (RTL) the pill sits at the far end of the group, left of the name,
reading as a trailing annotation on the title.

Placing it inside that container — rather than as a new sibling in the header
row — is what keeps the phone layout intact. The group already wraps, so on a
narrow screen the pill drops to a second line instead of pushing the close
button off the end of the row. The header's `max-[560px]:` variants are
untouched.

The pill carries `shrink-0` so it is never compressed to an ellipsis by a long
process name.

### Colour

Follows the two subprocess markers this codebase already has — the print sheet's
`.sub-badge` and the steps export's `.it.sub` — both of which are `var(--warn)`
on `var(--warn-s)`:

```
#B4690E text on #FBEEDC, 11px, font-bold, rounded-full, px-2 py-[2px], shrink-0
```

Written as Tailwind arbitrary values, not `var(--warn)`. The variable is defined
on `:root` in `doc-base.css` and would resolve here, but `FlowViewer` is
deliberately mounted outside `.doc-root` and styles its frame in Tailwind with
hex literals — `bg-[#D9CEF0]` and `text-[#cfc7e0]` are already in the file.
Reaching into the document stylesheet from the viewer would blur the boundary
`parity.test.tsx` exists to protect.

## Testing

Three tests in `ui/export/flowchart/FlowViewer.test.tsx`, written failing first.
The file already builds a two-process fixture in which `dining-002` is a
subprocess reached from `dining-001`.

1. A process with `parent: null` renders no `زیرفرآیند` text in the header.
2. A process whose `parent` is set renders it.
3. Walking in via a node click adds the pill, and backing out through the
   breadcrumb removes it — the case that proves the pill tracks the tail of
   `trail` rather than `startId`.

Unaffected existing suites:

- `parity.test.tsx` — pins that the export defines no node or edge component of
  its own and declares no inherited typography on `html`, `body` or `*`. This
  change touches only the viewer's own frame, which that file's own comment
  assigns to `FlowViewer`.
- `print-colour.test.ts` — the viewer is `print:hidden`, so it contributes
  nothing to the PDF.

## Out of scope

- The table of contents subtitle (`Document.tsx:201`) and the print sheet badge
  (`ProcessSheets.tsx:28`) already mark subprocesses and are unchanged.
- The steps export (`steps.html`) already tags every process and is unchanged.
- Resolving or displaying the parent process's name or id in the viewer.
