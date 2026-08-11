import { useCallback } from 'react'
import type { Capability, SessionDescriptor } from './session'

/** Does `scope` cover `target`? The twin of the server's scopes.contains. */
export function scopeContains(scope: string, target: string): boolean {
  if (scope === '*') return true
  if (target === '*') return false
  if (scope === target) return true
  return target.startsWith(`${scope}/report:`)
}

/**
 * Decides what to DRAW and nothing else (spec D48). Every endpoint re-derives
 * permission from the session row, so a wrong answer here is a cosmetic bug and
 * never a security one — which is the only reason it is safe to have at all.
 *
 * Takes the descriptor rather than fetching it, so the answer is a pure function
 * of the session a screen already holds. `undefined` is accepted because that is
 * what `useSession().data` is until GET /api/auth/me lands, and every capability
 * answers `false` in that window: nobody has yet said what this person may do,
 * and drawing nothing is the honest answer as well as the fail-closed one. In
 * the app proper the window is empty — RequireAuth has already resolved the
 * query these screens read from cache — so this costs no flicker.
 */
export function useCan(session: SessionDescriptor | undefined) {
  return useCallback(
    (capability: Capability, target?: string): boolean => {
      if (!session) return false
      if (!session.capabilities.includes(capability)) return false
      if (target === undefined) return true
      return session.scopes.some((s) => scopeContains(s, target))
    },
    [session],
  )
}
