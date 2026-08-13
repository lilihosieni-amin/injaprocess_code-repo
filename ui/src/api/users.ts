import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { fetchJson } from './client'
import { scopeContains } from '../auth/can'
import type { Capability, Scope, SessionDescriptor } from '../auth/session'

/**
 * A supervisor as they appear on somebody else's record (`routers/users._brief`).
 *
 * `disabled` travels with the name because D14 refuses to repoint subordinates
 * when a supervisor is disabled — the gap is surfaced instead — and a screen
 * cannot surface what the payload does not carry.
 */
export interface SupervisorBrief {
  id: number
  username: string
  displayName: string
  disabled: boolean
}

/**
 * One account exactly as `routers/users._user` reports it — **the whole payload
 * and nothing beyond it**.
 *
 * That projection is an allow-list built a named field at a time, precisely
 * because `users` rows are read with `SELECT *` and carry `password_hash`. This
 * type is the client half of the same promise: every field here is one the
 * server actually sends, and nothing here invites a screen to render a field it
 * does not. `test_users_api.py` scans every body for the stored hash; adding a
 * property here that the server does not send would be the way to make that
 * scan irrelevant.
 *
 * `role` is `string | null` because `_user` answers `None` for a role row that
 * is not there — unreachable under a `NOT NULL REFERENCES` column, and reported
 * rather than 500'd.
 *
 * `createdAt` is **unix seconds** (`users.created_at` is `INTEGER DEFAULT
 * (unixepoch())`), not the ISO string every timestamp in `api/types.ts` is.
 */
export interface AdminUser {
  id: number
  username: string
  displayName: string
  roleId: number
  role: string | null
  capabilities: Capability[]
  scopes: Scope[]
  supervisor: SupervisorBrief | null
  canSupervise: boolean
  disabled: boolean
  createdAt: number
}

/**
 * Every account, ordered by username. Unfiltered by the server, which is not an
 * oversight: the surface is gated on `manage_users` at `*`, so everybody who
 * reaches it reaches every department already.
 *
 * `enabled` is what stops a caller who may not be here from firing a request the
 * server will refuse — a 403 (or a 404) in the console on every load, and one
 * `access.denied` record per page view when D42's recording arrives. The server
 * decides; this decides what to ask for.
 */
export const useUsers = (opts?: { enabled?: boolean }) =>
  useQuery({
    queryKey: ['users'],
    queryFn: () => fetchJson<AdminUser[]>('/api/users'),
    enabled: opts?.enabled ?? true,
  })

/** One account. Same gate, same reason. */
export const useUser = (id: string, opts?: { enabled?: boolean }) =>
  useQuery({
    queryKey: ['users', id],
    queryFn: () => fetchJson<AdminUser>(`/api/users/${id}`),
    enabled: opts?.enabled ?? true,
  })

/**
 * Disable or re-enable one account (D14) — **one mutation for both directions**,
 * because the server has one endpoint for both and one rule governing both:
 * re-enabling restores capabilities, so whoever may not disable an Editor may
 * not re-enable one either.
 *
 * The response is the account as it now stands, and it is deliberately *not*
 * written into the cache with `setQueryData`: the list carries this row too, and
 * a detail screen that patched only its own key would leave «فعال» on the row
 * behind it. `['users']` is a **prefix** — it invalidates the listing and every
 * detail at once — so both surfaces re-read, and the screen shows what the
 * database holds rather than what the click intended.
 */
export function useSetUserDisabled(id: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (disabled: boolean) =>
      fetchJson<AdminUser>(`/api/users/${id}/disabled`,
        { method: 'POST', body: JSON.stringify({ disabled }) }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['users'] }) },
  })
}

/**
 * Set somebody else's password directly (D15).
 *
 * No token, no expiring link, no round trip: the administrator chooses the value
 * and tells the person. This deployment is fed by Telegram and has no channel to
 * deliver a link over.
 *
 * 204, so there is nothing to read back — and nothing to invalidate either: the
 * account's every rendered field is unchanged by this write. What it *does*
 * change is invisible here, and the screen has to say it in words: every session
 * that account held is revoked in the same transaction.
 */
export function useSetUserPassword(id: string) {
  return useMutation({
    mutationFn: (password: string) =>
      fetchJson<void>(`/api/users/${id}/password`,
        { method: 'POST', body: JSON.stringify({ password }) }),
  })
}

/**
 * Would the server let this session act on this account? The client twin of
 * `delegation.may_modify` and `may_disable`, and — like `scopeContains` — it
 * **decides only what to DRAW** (D48). Every endpoint re-derives the whole rule
 * from the session row and refuses regardless, so a wrong answer here is a
 * cosmetic bug and never a security one. That is the only reason it may exist.
 *
 * Three of the server's four clauses, in its order:
 *
 *   - `SELF_EDIT` — nobody edits their own record (D13). Compared on `username`,
 *     which is the only identifier the session descriptor carries; it is unique
 *     across the table (including disabled accounts, D57) and canonical on both
 *     sides, since the server stores `normalise_phone` output and `/api/auth/me`
 *     echoes the stored value.
 *   - `NOT_A_SUBSET` — an administrator hands out less than they hold, so the
 *     target's capabilities must be a **strict** subset of the actor's; `⊆` is
 *     the rule only for a holder of `manage_peers`, which is what makes "may
 *     appoint an equal" one bit in one role rather than a rank comparison.
 *   - `SCOPE_NOT_COVERED` — every scope of theirs inside some scope of the
 *     actor's, decided by `scopeContains` and by nothing else.
 *
 * The fourth, `LAST_EDITOR`, is **not** here and cannot be: it counts active
 * `edit`-conferring accounts across the installation, which a detail screen has
 * never read. So a refusal can still arrive at a control this function drew, and
 * the screen has to render the server's sentence rather than assume it predicted
 * every answer.
 *
 * The scope clause looks vacuous — this surface is reachable only by a `*`
 * holder, and `*` covers everything — and it is not. `scopeContains` answers
 * `false` for a **malformed** target even to a `*` holder, and `user_scopes.scope`
 * is `TEXT NOT NULL` with no CHECK, so `''` is storable today. An account
 * carrying a scope row the grammar refuses is therefore covered by nothing and
 * is not modifiable from here — which is exactly what the server answers, and
 * for the reason `delegation.may_delegate` states in as many words: such an
 * entry "is covered by nothing … so it comes back SCOPE_NOT_COVERED rather than
 * being conferred unchecked". That is the fixture that kills a `return true`
 * here («an account whose stored scope the grammar refuses…» in
 * `users.test.tsx`); without it the clause has no input that separates it from
 * its absence.
 */
export function mayManage(session: SessionDescriptor | undefined,
                          user: AdminUser): boolean {
  if (!session) return false
  if (!session.capabilities.includes('manage_users')) return false
  if (session.username === user.username) return false

  const mine = new Set<string>(session.capabilities)
  const theirs = new Set<string>(user.capabilities)
  for (const capability of theirs) if (!mine.has(capability)) return false
  // `⊆` plus equal cardinality is equality, which is the one case the two
  // readings of the rule differ on — and the only case `manage_peers` decides.
  if (!mine.has('manage_peers') && theirs.size === mine.size) return false

  // `any` over the actor's scopes, never `all`: a person's scopes are a union,
  // so a holder of two departments reaches into either. And the arguments are
  // (holder, wanted) in that order — reversed, an administrator of one report
  // would reach the whole department.
  return user.scopes.every((wanted) => session.scopes.some((held) => scopeContains(held, wanted)))
}
