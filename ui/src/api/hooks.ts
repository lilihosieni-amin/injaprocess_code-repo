import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { fetchJson } from './client'
import type { Branch, Confirmation, Department, DepartmentOrder, ExportKind, ExportResult, FactBundle, FactsListResponse, Me, Overview, PendingItem, PolicyField, Process, VisibilityPolicy } from './types'

export const useDepartments = (opts?: { enabled?: boolean }) =>
  useQuery({
    queryKey: ['departments'],
    queryFn: () => fetchJson<Department[]>('/api/departments'),
    // Optional, and defaulted so every existing caller is unchanged. R48's
    // reader flow bar needs the department's NAME — the one thing the process
    // document does not carry, since `Process.department` is its code — and it
    // needs it on one surface only, so it says so rather than asking for a
    // department list on the panel's flowchart as well.
    enabled: opts?.enabled ?? true,
  })

export const useProcesses = (code: string, opts?: { enabled?: boolean }) =>
  useQuery({
    queryKey: ['processes', code],
    queryFn: () => fetchJson<Process[]>(`/api/departments/${code}/processes`),
    enabled: opts?.enabled ?? true,
  })

export const useOverview = (code: string) =>
  useQuery({ queryKey: ['overview', code], queryFn: () => fetchJson<Overview>(`/api/departments/${code}/overview`) })

export const useProcess = (pid: string, opts?: { enabled?: boolean }) =>
  useQuery({
    queryKey: ['process', pid],
    queryFn: () => fetchJson<Process>(`/api/processes/${pid}`),
    enabled: opts?.enabled ?? true,
  })

// GET /api/auth/me has no hook here: it is the session descriptor, and it lives
// with the thing that reads it (`src/auth/useSession.ts`) rather than among the
// document hooks.
export function useLogin() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (body: { username: string; password: string }) =>
      fetchJson<Me>('/api/auth/login', { method: 'POST', body: JSON.stringify(body) }),
    // Remove, not invalidate. The key useSession holds may still carry the
    // PREVIOUS occupant's descriptor — cached before the 401 that sent them to
    // sign-in. invalidateQueries keeps that data and refetches behind it, so the
    // next person's first paint is the last person's name and the last person's
    // shell until the round-trip lands. Removing it makes the query pending
    // instead, which renders nothing and is the honest answer.
    onSuccess: () => qc.removeQueries({ queryKey: ['session'] }),
  })
}

export function useLogout() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: () => fetchJson<{ ok: boolean }>('/api/auth/logout', { method: 'POST' }),
    onSuccess: () => qc.clear(),
  })
}

/**
 * Change **your own** password (D7, D15, D58) — `POST /api/auth/password`.
 *
 * Not `POST /api/users/{id}/password`, which is a different endpoint under a
 * different rule: that one is an administrator setting *somebody else's* value,
 * it takes no `current` because the actor does not know it, and it revokes every
 * session the target holds. This one re-verifies the caller's current password
 * and keeps the calling session alive while ending all the others — which is why
 * `current` is a field at all when the caller already holds a cookie: a session
 * left open on a shared back-office screen is exactly what this endpoint exists
 * to be able to end, and without the check whoever walks up to that screen locks
 * the owner out instead.
 *
 * 204, so there is nothing to read back — and **nothing to invalidate either**.
 * The session descriptor `GET /api/auth/me` returns carries a name, a role,
 * capabilities and scopes, and a password change moves none of them; the sibling
 * sessions this write destroys belong to other browsers, which this cache has
 * never held. Clearing the cache here — the shape `useLogout` above takes — would
 * empty the screen behind a successful change and look exactly like being signed
 * out, which is the one thing the endpoint promises does not happen.
 */
export function useChangeOwnPassword() {
  return useMutation({
    mutationFn: (body: { current: string; next: string }) =>
      fetchJson<void>('/api/auth/password', { method: 'POST', body: JSON.stringify(body) }),
  })
}

/**
 * **Every write that can move a fingerprint invalidates `['confirmations']`.**
 *
 * `fingerprint.EXCLUDED` is only `{updated_at, source, pending, tombstoned}`, so
 * a changed description, a renamed process or a moved node all move the hash and
 * the server reports `confirmed: false` from that instant — a save silently
 * un-confirms, which is the whole reason a fingerprint is stored instead of a
 * boolean (D20). `['confirmations', code]` is the only thing that carries that
 * state, and the observer stays mounted across the save: without this the editor
 * is told the page is still vouched for at the very moment every reader has just
 * lost it, which is the one thing the mark exists to say.
 *
 * The **prefix** key rather than `['confirmations', code]`, everywhere the
 * department is not already in hand: `usePutProcess` and `useResolvePending` are
 * given a pid, and `useDeleteProcess`'s dereference sweep rewrites `subprocess`
 * and `parent` links in **other** departments' documents
 * (`routers/processes.delete_process`), moving fingerprints the caller's own
 * department code could never name.
 */
export function usePutProcess(pid: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (doc: Process) => fetchJson<Process>(`/api/processes/${pid}`, { method: 'PUT', body: JSON.stringify(doc) }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['process', pid] })
      qc.invalidateQueries({ queryKey: ['processes'] })
      qc.invalidateQueries({ queryKey: ['confirmations'] })
    },
  })
}

export function useRelayout(pid: string) {
  return useMutation({
    mutationFn: (doc: Process) => fetchJson<Process>(`/api/processes/${pid}/relayout`, { method: 'POST', body: JSON.stringify(doc) }),
  })
}

export function useResolvePending(pid: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ index, decision }: { index: number; decision: 'accept' | 'reject' }) =>
      fetchJson<Process>(`/api/processes/${pid}/pending/${index}`, { method: 'POST', body: JSON.stringify({ decision }) }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['process', pid] })
      qc.invalidateQueries({ queryKey: ['pending'] })
      // `pending` is excluded from the fingerprint but an **accepted** conflict
      // writes its content into the document, which is not.
      qc.invalidateQueries({ queryKey: ['confirmations'] })
    },
  })
}

export function useCreateProcess() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (body: { department: string; name?: string; parent?: { process: string; node: string } }) =>
      fetchJson<Process>('/api/processes', { method: 'POST', body: JSON.stringify(body) }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['processes'] })
      qc.invalidateQueries({ queryKey: ['next-id'] })
      // Not a moved fingerprint but a new confirmable target: a process created
      // while the list is open has no row in the cached listing, so its mark
      // would draw nothing at all until something else happened to refresh it.
      qc.invalidateQueries({ queryKey: ['confirmations'] })
    },
  })
}

export function usePutOverview(code: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (doc: Overview) => fetchJson<Overview>(`/api/departments/${code}/overview`, { method: 'PUT', body: JSON.stringify(doc) }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['overview', code] })
      // The department document is a confirmable target in its own right, and
      // this is the one write path that already knows which department it is.
      qc.invalidateQueries({ queryKey: ['confirmations', code] })
    },
  })
}

export function useDeleteProcess() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (pid: string) => fetchJson<{ deleted: string }>(`/api/processes/${pid}`, { method: 'DELETE' }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['processes'] })
      qc.invalidateQueries({ queryKey: ['departments'] })
      qc.invalidateQueries({ queryKey: ['next-id'] })
      // Two reasons, and the second is the one that is easy to miss: the deleted
      // process leaves the listing, and the dereference sweep rewrites every
      // document that linked to it — in any department — moving those documents'
      // fingerprints and un-confirming them.
      qc.invalidateQueries({ queryKey: ['confirmations'] })
    },
  })
}

export const useNextId = (code: string) =>
  useQuery({ queryKey: ['next-id', code], queryFn: () => fetchJson<{ next_id: string }>(`/api/departments/${code}/next-id`) })

export const usePending = (opts?: { enabled?: boolean }) =>
  useQuery({
    queryKey: ['pending'],
    queryFn: () => fetchJson<PendingItem[]>('/api/pending'),
    enabled: opts?.enabled ?? true,
  })

export function useResolveInboxPending() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ pid, index, decision }: { pid: string; index: number; decision: 'accept' | 'reject' }) =>
      fetchJson<Process>(`/api/processes/${pid}/pending/${index}`, { method: 'POST', body: JSON.stringify({ decision }) }),
    onSuccess: (_r, v) => {
      qc.invalidateQueries({ queryKey: ['pending'] })
      qc.invalidateQueries({ queryKey: ['process', v.pid] })
      // Same endpoint as `useResolvePending`, so the same rule: an accepted
      // conflict writes content, and content is what the fingerprint is over.
      qc.invalidateQueries({ queryKey: ['confirmations'] })
    },
  })
}

export function useSaveOrder(code: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (body: DepartmentOrder) =>
      fetchJson<DepartmentOrder>(`/api/departments/${code}/order`, { method: 'PUT', body: JSON.stringify(body) }),
    // onSettled, not onSuccess: a 409 means the active set moved, so the list
    // must refresh on failure too
    onSettled: () => qc.invalidateQueries({ queryKey: ['processes', code] }),
  })
}

/**
 * Every confirmable target in one department, each with its **current**
 * fingerprint (D20).
 *
 * Gated on the capability by the caller: `GET /api/confirmations` requires
 * `confirm` on the department and 403s everyone else, so firing it anyway would
 * put a refusal in the console on every page load of every reader. That is the
 * only reason `enabled` exists here — the server decides, this decides what to
 * ask for.
 */
export const useConfirmations = (code: string, opts?: { enabled?: boolean }) =>
  useQuery({
    queryKey: ['confirmations', code],
    queryFn: () => fetchJson<Confirmation[]>(`/api/confirmations?department=${code}`),
    enabled: opts?.enabled ?? true,
  })

/**
 * Vouch for one target at the fingerprint the caller was shown.
 *
 * `code` is the department whose listing to refresh, and is **not** the target:
 * a process mark drawn on a department page confirms the process and refreshes
 * the department's list.
 */
export function useSetConfirmation(code: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ target, fingerprint }: { target: string; fingerprint: string }) =>
      fetchJson<Confirmation>(`/api/confirmations/${target}`,
        { method: 'POST', body: JSON.stringify({ fingerprint }) }),
    // The department board's counts move with a confirmation for every reader —
    // but only when one actually happened, so this key stays on success.
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['departments'] }) },
    // **onSettled, not onSuccess**, for the listing — the same rule
    // `useSaveOrder` follows and for the same reason. The list is what carries
    // every target's current fingerprint, and the one failure this endpoint has
    // is a 409: the document moved, so the fingerprint on screen is stale
    // *precisely* when the request failed. Refreshing only on success would
    // leave the editor re-submitting the bytes that were already refused, with
    // "look again" pointing at the same stale row forever.
    onSettled: () => { qc.invalidateQueries({ queryKey: ['confirmations', code] }) },
  })
}

/**
 * Withdraw the mark (D61). No fingerprint: withdrawing says *"whatever is there
 * is wrong"*, which does not depend on which version it was — and requiring one
 * would refuse the withdrawal exactly when the document has drifted, which is
 * when it is most likely to be needed.
 */
export function useRevokeConfirmation(code: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (target: string) =>
      fetchJson<Confirmation>(`/api/confirmations/${target}`, { method: 'DELETE' }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['confirmations', code] })
      qc.invalidateQueries({ queryKey: ['departments'] })
    },
  })
}

/**
 * The one global content-visibility policy (D16), and its version (D27).
 *
 * Gated on the capability by the caller, the same way `useConfirmations` is:
 * `GET /api/visibility` requires `set_visibility` at `*` and refuses everyone
 * else, because knowing that a field is hidden already tells a reader the field
 * exists (D56). The server decides; `enabled` only decides what to ask for.
 */
export const useVisibility = (opts?: { enabled?: boolean }) =>
  useQuery({
    queryKey: ['visibility'],
    queryFn: () => fetchJson<VisibilityPolicy>('/api/visibility'),
    enabled: opts?.enabled ?? true,
  })

/**
 * Move one switch. One field per request, because that is what the endpoint
 * takes and what D19's record is written against.
 *
 * The response is the **whole** resolved policy and the new version, so it is
 * written straight into the cache rather than invalidated: the screen the flip
 * was made on then shows the server's own answer without a second round-trip,
 * and — this is the part a previous task got wrong — without a manual reload.
 */
export function useSetVisibilityField() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ field, visible }: { field: PolicyField; visible: boolean }) =>
      fetchJson<VisibilityPolicy>(`/api/visibility/${field}`,
        { method: 'PUT', body: JSON.stringify({ visible }) }),
    // Every document body in the app changes with the policy, so the whole cache
    // goes rather than one key: `process`, `processes` and the export URLs are
    // all downstream of it, and an invalidation list would be a list to forget
    // an entry from.
    onSuccess: (data) => {
      qc.setQueryData(['visibility'], data)
      qc.invalidateQueries({ queryKey: ['process'] })
      qc.invalidateQueries({ queryKey: ['processes'] })
    },
  })
}

export function useCreateExport(code: string) {
  // No invalidation: an export reads the department, it changes nothing.
  return useMutation({
    mutationFn: (kind: ExportKind) =>
      fetchJson<ExportResult>(`/api/departments/${code}/exports/${kind}`, { method: 'POST' }),
  })
}

// ─────────────────────────── quantitative facts (spec §14) ──────────────────

/**
 * Every entry this caller may be told exists, with the coverage count (QF-25).
 *
 * **One request for the whole section**, not one per department: the store
 * spans departments and the server filters per row, so there is no code to key
 * this by. Filtering, searching and the «وضعیت تأیید» dropdown all run over
 * this one answer client-side — which is what the design does (`shownFacts`,
 * `Inja Panel.dc.html:4646`), and what the route's own shape assumes.
 *
 * `coverage` rides along in the same body rather than in a second query. It is
 * a property of the estate and not of the list, but it is computed from the
 * same `load_all` the rows come from, and asking twice would read the store
 * twice to render one line.
 */
export const useFacts = (opts?: { enabled?: boolean }) =>
  useQuery({
    queryKey: ['facts'],
    queryFn: () => fetchJson<FactsListResponse>('/api/facts'),
    enabled: opts?.enabled ?? true,
  })

/**
 * One entry with every map a screen needs to render it without a bare key
 * (§17): `resolved`, `row_titles`, `path_labels`, plus `red_paths`, the
 * reverse index and the confirmation pair.
 *
 * `enabled` because the detail screen mounts from a route parameter, and a
 * screen with no id in hand must not fire `/api/facts/undefined` — which the
 * server would answer with the uniform 404 and put a refusal in the console.
 */
export const useFact = (fid: string, opts?: { enabled?: boolean }) =>
  useQuery({
    queryKey: ['fact', fid],
    queryFn: () => fetchJson<FactBundle>(`/api/facts/${fid}`),
    enabled: (opts?.enabled ?? true) && !!fid,
  })

/**
 * The registered branches (QF-4) — the «شعبه» filter's options.
 *
 * Its own query rather than a field on the list response: branches are estate
 * configuration, they change when the manifest does and not when a fact does,
 * and a resolve invalidating `['facts']` has no business re-reading them.
 */
export const useFactBranches = (opts?: { enabled?: boolean }) =>
  useQuery({
    queryKey: ['fact-branches'],
    queryFn: () => fetchJson<Branch[]>('/api/facts/branches'),
    enabled: opts?.enabled ?? true,
  })

/**
 * Settle one disputed field by choosing an account (QF-39).
 *
 * **Both keys, and `['facts']` is the half that is easy to miss.** A resolve
 * installs the chosen value, marks the losers `rejected` and re-derives the
 * entry's `status`, which moves that row's `red_counts` and `status` — and,
 * the entry having changed at all, its `fingerprint`, so `confirmed` moves with
 * it. The listing carries all four.
 *
 * **`onSettled`, not `onSuccess`**, the rule `useSaveOrder` and
 * `useSetConfirmation` already follow: the one failure this endpoint has is a
 * 422 from the engine — the account is not on that field, or not on that entry
 * — and the state that refused it is precisely the state on screen. Refreshing
 * only on success would leave the reviewer choosing the same stale account
 * forever.
 *
 * The route answers with the whole bundle re-read, re-gated and re-masked, so
 * `mutationFn` is typed with it — a caller may read the settled entry straight
 * out of the mutation result while the invalidated query is in flight.
 */
export function useResolveFact(fid: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ field, account }: { field: string; account: string }) =>
      fetchJson<FactBundle>(`/api/facts/${fid}/resolve`,
        { method: 'POST', body: JSON.stringify({ field, account }) }),
    onSettled: () => {
      qc.invalidateQueries({ queryKey: ['facts'] })
      qc.invalidateQueries({ queryKey: ['fact', fid] })
    },
  })
}
