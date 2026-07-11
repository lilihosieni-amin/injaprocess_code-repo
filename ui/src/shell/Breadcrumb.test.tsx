import { describe, it, expect, vi, afterEach } from 'vitest'
import { screen } from '@testing-library/react'
import { Breadcrumb } from './Breadcrumb'
import { renderAt } from '../test/utils'

afterEach(() => vi.restoreAllMocks())

describe('Breadcrumb', () => {
  it('derives Home → department → process from the route', async () => {
    vi.spyOn(globalThis, 'fetch').mockImplementation((input: RequestInfo | URL) => {
      const url = String(input)
      if (url.endsWith('/api/departments')) return Promise.resolve(new Response(JSON.stringify([{ code: 'cooking', name: 'پخت', count: 1 }]), { status: 200, headers: { 'Content-Type': 'application/json' } }))
      if (url.endsWith('/api/processes/cooking-001')) return Promise.resolve(new Response(JSON.stringify({ id: 'cooking-001', department: 'cooking', name: 'خرید', nodes: [], edges: [], kpis: [], pending: [], parent: null, idef0: { inputs: [], controls: [], outputs: [], mechanisms: [] } }), { status: 200, headers: { 'Content-Type': 'application/json' } }))
      return Promise.resolve(new Response('{}', { status: 200, headers: { 'Content-Type': 'application/json' } }))
    })
    renderAt('/processes/:pid', <Breadcrumb />, '/processes/cooking-001')
    expect(await screen.findByText('دپارتمان‌ها')).toBeInTheDocument()
    expect(await screen.findByText('پخت')).toBeInTheDocument()
    expect(await screen.findByText('خرید')).toBeInTheDocument()
  })

  it('does not fetch a process URL when there is no pid (non-process route)', async () => {
    const requestedUrls: string[] = []
    vi.spyOn(globalThis, 'fetch').mockImplementation((input: RequestInfo | URL) => {
      const url = String(input)
      requestedUrls.push(url)
      if (url.endsWith('/api/departments')) return Promise.resolve(new Response(JSON.stringify([{ code: 'cooking', name: 'پخت', count: 1 }]), { status: 200, headers: { 'Content-Type': 'application/json' } }))
      return Promise.resolve(new Response('{}', { status: 200, headers: { 'Content-Type': 'application/json' } }))
    })
    renderAt('/departments/:code', <Breadcrumb />, '/departments/cooking')
    expect(await screen.findByText('پخت')).toBeInTheDocument()
    const processUrls = requestedUrls.filter((u) => u.includes('/api/processes/'))
    expect(processUrls).toHaveLength(0)
  })
})
