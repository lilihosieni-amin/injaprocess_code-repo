import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { fetchJson } from './client'
import type { Department, Me, Overview, Process } from './types'

export const useDepartments = () =>
  useQuery({ queryKey: ['departments'], queryFn: () => fetchJson<Department[]>('/api/departments') })

export const useProcesses = (code: string) =>
  useQuery({ queryKey: ['processes', code], queryFn: () => fetchJson<Process[]>(`/api/departments/${code}/processes`) })

export const useOverview = (code: string) =>
  useQuery({ queryKey: ['overview', code], queryFn: () => fetchJson<Overview>(`/api/departments/${code}/overview`) })

export const useProcess = (pid: string) =>
  useQuery({ queryKey: ['process', pid], queryFn: () => fetchJson<Process>(`/api/processes/${pid}`) })

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
