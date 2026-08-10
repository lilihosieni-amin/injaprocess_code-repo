import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MemoryRouter, Routes, Route } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { AppShell } from './AppShell'
import type { SessionDescriptor, Capability } from '../auth/session'

afterEach(() => vi.restoreAllMocks())

function session(capabilities: Capability[]): SessionDescriptor {
  return {
    username: '09123456789', displayName: 'سحر بیات', role: 'reader',
    capabilities, scopes: ['dept:dining'], supervisor: '09120000000',
    canSupervise: false, pendingApprovals: 0,
  }
}

function renderShell(caps: Capability[]) {
  // C2 — the panel shell now calls usePending/useLogout, both real network
  // hooks, so every render here needs a QueryClient and a fetch stub.
  vi.spyOn(globalThis, 'fetch').mockImplementation(() =>
    Promise.resolve(new Response('[]', { status: 200, headers: { 'Content-Type': 'application/json' } })),
  )
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter initialEntries={['/']}>
        <Routes>
          <Route element={<AppShell session={session(caps)} />}>
            <Route path="/" element={<p>محتوا</p>} />
          </Route>
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  )
}

describe('AppShell', () => {
  it('marks the reader shell so density resolves', () => {
    const { container } = renderShell(['view', 'comment', 'export_pdf'])
    expect(container.querySelector('[data-shell="reader"]')).toBeInTheDocument()
  })

  it('marks the panel shell for anyone holding a panel capability', () => {
    const { container } = renderShell(['view', 'comment', 'edit'])
    expect(container.querySelector('[data-shell="panel"]')).toBeInTheDocument()
  })

  it('renders the routed content in either shell', () => {
    renderShell(['view'])
    expect(screen.getByText('محتوا')).toBeInTheDocument()
  })

  it('renders no h1 of its own', () => {
    // I6 — the brand is a div; the routed screen owns the page's one h1 (F11).
    const { container } = renderShell(['view'])
    expect(container.querySelectorAll('h1')).toHaveLength(0)
  })

  it('sets the document direction and language', () => {
    renderShell(['view'])
    expect(document.documentElement).toHaveAttribute('dir', 'rtl')
    expect(document.documentElement).toHaveAttribute('lang', 'fa')
  })

  it('gives the outlet a growing, unpadded flex column ancestor', () => {
    // C1 — jsdom does no layout, so height can't be observed directly. This
    // asserts the structural classes the flow canvas depends on to resolve a
    // real height instead: a direct flex-1/min-h-0 flex-column wrapper around
    // <Outlet/>, with no padding class (screens own their own padding).
    for (const caps of [['view', 'comment', 'export_pdf'], ['view', 'comment', 'edit']] as const) {
      const { unmount } = renderShell([...caps])
      const main = screen.getByText('محتوا').parentElement as HTMLElement
      expect(main.tagName).toBe('MAIN')
      expect(main.className).toMatch(/\bflex-1\b/)
      expect(main.className).toMatch(/\bmin-h-0\b/)
      expect(main.className).not.toMatch(/(^|\s)p[xytrbl]?-/)
      unmount()
    }
  })
})
