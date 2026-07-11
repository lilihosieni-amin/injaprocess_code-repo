import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { fetchJson } from './client'
import type { Department, Me, Overview, PendingItem, Process } from './types'

export const useDepartments = () =>
  useQuery({ queryKey: ['departments'], queryFn: () => fetchJson<Department[]>('/api/departments') })

export const useProcesses = (code: string) =>
  useQuery({ queryKey: ['processes', code], queryFn: () => fetchJson<Process[]>(`/api/departments/${code}/processes`) })

export const useOverview = (code: string) =>
  useQuery({ queryKey: ['overview', code], queryFn: () => fetchJson<Overview>(`/api/departments/${code}/overview`) })

export const useProcess = (pid: string, opts?: { enabled?: boolean }) =>
  useQuery({
    queryKey: ['process', pid],
    queryFn: () => fetchJson<Process>(`/api/processes/${pid}`),
    enabled: opts?.enabled ?? true,
  })

export const useMe = () =>
  useQuery({ queryKey: ['me'], queryFn: () => fetchJson<Me>('/api/auth/me'), retry: false })

export function useLogin() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (body: { username: string; password: string }) =>
      fetchJson<Me>('/api/auth/login', { method: 'POST', body: JSON.stringify(body) }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['me'] }),
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

export const usePending = () =>
  useQuery({ queryKey: ['pending'], queryFn: () => fetchJson<PendingItem[]>('/api/pending') })

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
