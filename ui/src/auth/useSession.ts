import { useQuery } from '@tanstack/react-query'
import { fetchJson } from '../api/client'
import type { SessionDescriptor } from './session'

/** The real GET /api/auth/me (spec D47). Replaces F's placeholder descriptor. */
export function useSession() {
  return useQuery<SessionDescriptor>({
    queryKey: ['session'],
    queryFn: () => fetchJson<SessionDescriptor>('/api/auth/me'),
    retry: false,
    staleTime: 30_000,
  })
}
