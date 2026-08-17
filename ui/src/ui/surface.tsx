import { createContext, useContext, type ReactNode } from 'react'

/**
 * R3 — panel and reader are two surfaces at two scales, not two themes.
 *
 * The scale itself is CSS: `[data-surface='reader']` in src/styles/roles.css
 * redefines the thirteen role properties the ruling's table lists, so a
 * component names one value — `var(--role-tile)` — and gets 48px in the panel
 * and 54px in the reader without a prop and without a branch.
 *
 * Everything else is shared and is declared once, on `:root`: the violet field,
 * the two-layer card shadow, the card hairline, the -2px lift over .16s, the
 * coral focus border, the scrim and the 10px scrollbar. Nothing colour-,
 * shadow- or motion-shaped may be redeclared per surface.
 *
 * This context carries only what CSS cannot decide: which chrome the shell
 * draws (a breadcrumb strip or a back bar, and neither on the flow screen),
 * whether departments are a three-column grid or a single-column list, and R4's
 * rule that a reader reaching exactly one department lands on that department's
 * process list.
 *
 * The wrapper is `display: contents`, so it introduces no box and no layout —
 * it exists to put the attribute and the context on the same node, which is
 * what keeps them from disagreeing.
 *
 * Not to be confused with `data-shell`, which is F8's *type-density* switch and
 * already ships (src/styles/tokens.css, the `--fs-role-*` family). `data-surface`
 * is R3's *geometry* switch. Neither duplicates a declaration of the other;
 * Task 13 folds the two into one attribute once ReaderShell is rebuilt.
 */
export type Surface = 'panel' | 'reader'

// Panel is the default: anything rendered outside a provider (a test, an export
// document) is a panel-scale surface, which is also what src/styles/roles.css's
// :root block declares.
const SurfaceContext = createContext<Surface>('panel')

export function SurfaceProvider({ surface, children }: {
  surface: Surface
  children: ReactNode
}) {
  return (
    <SurfaceContext.Provider value={surface}>
      <div data-surface={surface} className="contents">{children}</div>
    </SurfaceContext.Provider>
  )
}

export function useSurface(): Surface {
  return useContext(SurfaceContext)
}
