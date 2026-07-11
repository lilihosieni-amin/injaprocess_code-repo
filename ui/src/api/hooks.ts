import { useQuery } from '@tanstack/react-query'
import { fetchJson } from './client'
import type { Department, Overview, Process } from './types'

export const useDepartments = () =>
  useQuery({ queryKey: ['departments'], queryFn: () => fetchJson<Department[]>('/api/departments') })

export const useProcesses = (code: string) =>
  useQuery({ queryKey: ['processes', code], queryFn: () => fetchJson<Process[]>(`/api/departments/${code}/processes`) })

export const useOverview = (code: string) =>
  useQuery({ queryKey: ['overview', code], queryFn: () => fetchJson<Overview>(`/api/departments/${code}/overview`) })

export const useProcess = (pid: string) =>
  useQuery({ queryKey: ['process', pid], queryFn: () => fetchJson<Process>(`/api/processes/${pid}`) })
