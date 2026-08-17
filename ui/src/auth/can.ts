import { useCallback } from 'react'
import type { Capability, SessionDescriptor } from './session'

/**
 * The scope grammar (spec D10), the twin of the server's `scopes.SCOPE_RE`:
 *
 *     *  ⊃  dept:{code}  ⊃  dept:{code}/report:{kind}
 *
 * No `m` flag, so `$` is the end of the string and not the end of a line.
 */
const SCOPE_RE = /^(?:\*|dept:[a-z]+(?:\/report:[a-z]+)?)$/

/**
 * Does `scope` cover `target`? The twin of the server's `scopes.contains`.
 *
 * Anything the grammar refuses answers `false`, `*` holders included — exactly
 * as the server does, and for the reason it gives: a malformed argument names
 * no resource, so there is nothing to reach and nothing to refuse. Without the
 * gate `scopeContains('*', <anything at all>)` was `true` where the server said
 * `false`, which made this twin strictly the more permissive of the two. That
 * is cosmetic-only by construction — every endpoint re-derives permission, and
 * this decides what to draw (D48) — but a twin that answers a question the
 * original refuses is a twin that will be trusted for the wrong one.
 */
export function scopeContains(scope: string, target: string): boolean {
  if (!SCOPE_RE.test(scope) || !SCOPE_RE.test(target)) return false
  if (scope === '*') return true
  if (target === '*') return false
  if (scope === target) return true
  return target.startsWith(`${scope}/report:`)
}

/**
 * What the server would answer this session on the administration surface, and
 * `undefined` when it would serve them — **the client twin of `access.requires`,
 * including its order** (D56).
 *
 * Scope is checked before capability, and the split is the whole point:
 *
 *   404  the caller is not scoped `*`. User administration is not scoped to a
 *        department (D11), so it is not a thing they may learn exists here, and
 *        the answer is deliberately indistinguishable from a typo.
 *   403  the caller holds `*` and not the capability. They can see the surface
 *        and merely may not act.
 *
 * Collapsing the two into one message undoes the existence rule on the screen
 * after the server took trouble to keep it on the wire. In one function because
 * the header and two screens ask it and three copies would drift; `undefined`
 * rather than a bool because the caller has to render *which* refusal, not
 * merely that there was one.
 *
 * It lives here rather than beside the `/api/users` hooks because it reads
 * nothing but the session — no fetch, no query, no cache — and a layout that
 * gates a nav entry on it should not have to import a data module to do so.
 *
 * Cosmetic, like `useCan` below: the endpoints re-derive both halves and answer
 * the same two codes regardless (D48).
 */
export function administrationRefusal(
  session: SessionDescriptor | undefined,
): 403 | 404 | undefined {
  if (!session) return undefined
  if (!session.scopes.some((held) => scopeContains(held, '*'))) return 404
  if (!session.capabilities.includes('manage_users')) return 403
  return undefined
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
