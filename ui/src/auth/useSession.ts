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
    // D43/D81: the heartbeat. Every signed-in request extends the session's
    // activity interval on the server, and this is the request that keeps
    // arriving while someone is here. TanStack pauses an interval refetch
    // while the tab is hidden (`refetchIntervalInBackground` defaults to
    // false) — which is the whole honesty rule: a screen left open in a back
    // office stops counting. Also picks up a permission change within a minute.
    refetchInterval: 60_000,
  })
}
