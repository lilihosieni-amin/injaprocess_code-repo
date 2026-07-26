import { describe, it, expect } from 'vitest'
import { createSeededClient } from './seed'
import type { ExportPayload } from './payload'

const PAYLOAD = {
  dept: { department: 'dining', name: 'سالن', description: '', sub_units: [], personnel: [], updated_at: '' },
  processes: [{ id: 'dining-001', department: 'dining', name: 'p', nodes: [], edges: [], pending: [] }],
  generated_at: '',
} as unknown as ExportPayload

describe('createSeededClient', () => {
  it('serves the payload from cache under the app’s query keys', () => {
    const qc = createSeededClient(PAYLOAD)
    expect(qc.getQueryData(['overview', 'dining'])).toEqual(PAYLOAD.dept)
    expect(qc.getQueryData(['processes', 'dining'])).toEqual(PAYLOAD.processes)
    expect(qc.getQueryData(['process', 'dining-001'])).toEqual(PAYLOAD.processes[0])
  })

  it('refuses to fetch — an export has no backend', async () => {
    const qc = createSeededClient(PAYLOAD)
    await expect(qc.fetchQuery({ queryKey: ['anything'] })).rejects.toThrow(/offline/i)
  })
})
