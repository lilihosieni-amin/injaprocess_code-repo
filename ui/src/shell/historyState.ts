import { useEffect, useState } from 'react'
import { useLocation, useNavigationType } from 'react-router-dom'

/**
 * What each history entry's screen had in each of its slots.
 *
 * Keyed the way `scroll.ts` keys its offsets — `location.key` and nothing else —
 * and a module-level `Map` for the same reason: React Router mints fresh keys
 * for a fresh history stack, so a persisted entry could never be matched again
 * and would only accumulate.
 */
const SAVED = new Map<string, unknown>()

/**
 * State that comes back when the person does — **owner report, 2026-09-06:**
 * *"when we go back to the quantitative data page… any filters we had applied
 * before should still be in place."*
 *
 * ## Why the screen cannot just hold it
 *
 * Opening an entry unmounts the list, and `useState` dies with the mount. Every
 * filtered screen in this app has that defect today: `FactsList` and `Users`
 * hold `q` and `filters` in local state, which is the same shape and the same
 * loss — the report named the facts list because that is the screen with an
 * entry to open.
 *
 * ## Why keyed by the history entry, not by the screen
 *
 * This is the ruling `scroll.ts` already carries, applied to the other half of
 * the same screen. Its note records that `ProcessList` once kept its offset in
 * `sessionStorage` keyed by department and that it was deleted for exactly this:
 * *"keyed by department it restored the same offset whichever way you arrived,
 * including on a fresh visit from the department list, and it had no idea what
 * 'back' meant."* A filter restored on a fresh visit from the tray is that bug
 * with a search box: the person asks for «داده‌های کمّی» and is handed a list
 * that is silently hiding most of it, with no memory of having narrowed it.
 *
 * So: seeded from the map **only on a POP**, which is the same signal
 * `useScrollMemory` restores on, and by the same reasoning — a POP is the person
 * returning to an entry they have already been on, and it is the one navigation
 * where restoring is what they asked for. A PUSH or a REPLACE starts at
 * `initial`.
 *
 * ## Slots
 *
 * One screen keeps several of these — the facts list has a search and four
 * dropdowns — so the cell is `key` plus a caller-chosen slot name. Two hooks
 * with the same slot on one screen would share a cell, which is why the name is
 * a required argument rather than derived from anything implicit.
 */
/**
 * Empty the map — **for tests**, and called from `src/test/setup.ts` beside
 * `cleanup()`.
 *
 * Not a nicety. This map outlives a test the way any module state does, and
 * `MemoryRouter`'s first render reports `POP` with the fixed key `default`, so
 * every test mounts on the same cell: without this, a filter set in one case is
 * restored into the next and the suite becomes order-dependent. It cost 17
 * failures across `users.test.tsx` and `FactsList.test.tsx` to find, all of them
 * "expected 2 rows, got 1".
 *
 * A real session never hits that: a cold load starts with this map empty, and
 * every other entry has a key of its own.
 */
export function resetHistoryState(): void {
  SAVED.clear()
}

export function useHistoryState<T>(slot: string, initial: T): [T, (next: T) => void] {
  const { key } = useLocation()
  const navigationType = useNavigationType()
  const cell = `${key}:${slot}`

  // The initialiser runs once per mount, which is the only moment the answer can
  // differ: after that this is ordinary state and the effect below keeps the map
  // level with it.
  const [value, setValue] = useState<T>(() =>
    navigationType === 'POP' && SAVED.has(cell) ? (SAVED.get(cell) as T) : initial,
  )

  useEffect(() => { SAVED.set(cell, value) }, [cell, value])

  return [value, setValue]
}
