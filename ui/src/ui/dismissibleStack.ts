// I7 — a module-level stack of every open DISMISSIBLE — Overlay *and* Menu
// alike — so Escape always answers only the topmost regardless of which
// component owns it. Previously Overlay kept its own private stack and Menu
// listened for Escape unconditionally on `document`, so a Menu opened inside a
// Dialog closed both on one Escape — the Escape that should have stopped at the
// menu took the Dialog underneath it down too.
//
// Kept in its own file (rather than living directly in Overlay.tsx, which is
// where it's exported from) so react-refresh's only-export-components rule
// doesn't flag Overlay.tsx for exporting non-component values alongside
// Dialog/Sheet.
let dismissibles: symbol[] = []

export function pushDismissible(id: symbol): void {
  dismissibles = [...dismissibles, id]
}

export function popDismissible(id: symbol): void {
  dismissibles = dismissibles.filter((x) => x !== id)
}

export function isTopDismissible(id: symbol): boolean {
  return dismissibles[dismissibles.length - 1] === id
}
