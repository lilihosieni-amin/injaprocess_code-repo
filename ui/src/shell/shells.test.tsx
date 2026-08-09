import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MemoryRouter, Routes, Route } from 'react-router-dom'
import { AppShell } from './AppShell'
import type { SessionDescriptor, Capability } from '../auth/session'

function session(capabilities: Capability[]): SessionDescriptor {
  return {
    username: '09123456789', displayName: 'سحر بیات', role: 'reader',
    capabilities, scopes: ['dept:dining'], supervisor: '09120000000',
    canSupervise: false, pendingApprovals: 0,
  }
}

function renderShell(caps: Capability[]) {
  return render(
    <MemoryRouter initialEntries={['/']}>
      <Routes>
        <Route element={<AppShell session={session(caps)} />}>
          <Route path="/" element={<p>محتوا</p>} />
        </Route>
      </Routes>
    </MemoryRouter>,
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

  it('gives every shell exactly one h1', () => {
    // F11 — one h1 per screen, in document order.
    const { container } = renderShell(['view'])
    expect(container.querySelectorAll('h1')).toHaveLength(1)
  })

  it('sets the document direction and language', () => {
    renderShell(['view'])
    expect(document.documentElement).toHaveAttribute('dir', 'rtl')
    expect(document.documentElement).toHaveAttribute('lang', 'fa')
  })
})
