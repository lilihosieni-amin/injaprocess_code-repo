import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { fetchJson } from './client'
import type { Confirmation, Department, DepartmentOrder, ExportKind, ExportResult, Me, Overview, PendingItem, Process } from './types'

export const useDepartments = () =>
  useQuery({ queryKey: ['departments'], queryFn: () => fetchJson<Department[]>('/api/departments') })

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

export function usePutProcess(pid: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (doc: Process) => fetchJson<Process>(`/api/processes/${pid}`, { method: 'PUT', body: JSON.stringify(doc) }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['process', pid] })
      qc.invalidateQueries({ queryKey: ['processes'] })
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
    },
  })
}

export function usePutOverview(code: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (doc: Overview) => fetchJson<Overview>(`/api/departments/${code}/overview`, { method: 'PUT', body: JSON.stringify(doc) }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['overview', code] }),
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

export function useCreateExport(code: string) {
  // No invalidation: an export reads the department, it changes nothing.
  return useMutation({
    mutationFn: (kind: ExportKind) =>
      fetchJson<ExportResult>(`/api/departments/${code}/exports/${kind}`, { method: 'POST' }),
  })
}
