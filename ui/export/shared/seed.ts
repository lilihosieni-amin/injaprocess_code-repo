import { QueryClient } from '@tanstack/react-query'
import type { ExportPayload } from './payload'

/** A react-query client that already knows everything, and can never fetch.
 *
 *  The export reuses app components (DetailDrawer calls useProcesses); from a
 *  file:// page a real fetch would fail noisily and pointlessly. Seeding the
 *  cache under the app's own query keys makes those components work unchanged,
 *  and the throwing default queryFn turns any key we forgot into a loud test
 *  failure rather than a silent spinner.
 */
export function createSeededClient(payload: ExportPayload): QueryClient {
  const qc = new QueryClient({
    defaultOptions: {
      queries: {
        retry: false,
        staleTime: Infinity,
        gcTime: Infinity,
        queryFn: async () => { throw new Error('export bundle is offline: no query may fetch') },
      },
    },
  })
  const code = payload.dept.department
  qc.setQueryData(['overview', code], payload.dept)
  qc.setQueryData(['processes', code], payload.processes)
  payload.processes.forEach((p) => qc.setQueryData(['process', p.id], p))
  return qc
}
