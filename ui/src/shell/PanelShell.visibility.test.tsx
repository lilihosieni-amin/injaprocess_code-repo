import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { PanelShell } from './PanelShell'
import type { SessionDescriptor } from '../auth/session'

const BASE: SessionDescriptor = {
  username: '09120000000', displayName: 'و', role: 'editor',
  capabilities: [], scopes: ['*'], supervisor: null, canSupervise: false,
  pendingApprovals: 0,
}

function mount(session: SessionDescriptor) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter><PanelShell session={session} /></MemoryRouter>
    </QueryClientProvider>,
  )
}

describe('the policy entry in the panel header', () => {
  it('is drawn for a holder of set_visibility', () => {
    mount({ ...BASE, capabilities: ['view', 'edit', 'set_visibility'] })
    expect(screen.getByRole('link', { name: 'نمایش محتوا' })).toBeInTheDocument()
  })

  it('points at the policy screen', () => {
    // The name alone would pass for a link pointing anywhere at all, and the
    // route it must reach is the one thing about this entry that is not visible
    // on screen.
    mount({ ...BASE, capabilities: ['view', 'edit', 'set_visibility'] })
    expect(screen.getByRole('link', { name: 'نمایش محتوا' }))
      .toHaveAttribute('href', '/visibility')
  })

  it('is drawn for a holder of set_visibility who cannot edit', () => {
    // The other half of the pair below. Without this, a gate spelled
    // `can(edit) && can(set_visibility)` — or one that simply sits inside the
    // existing `canEdit` block, which is the likeliest way to write it by
    // accident — passes every other test in this file.
    mount({ ...BASE, capabilities: ['view', 'set_visibility'] })
    expect(screen.getByRole('link', { name: 'نمایش محتوا' })).toBeInTheDocument()
  })

  it('is not drawn for an editor who does not hold set_visibility', () => {
    // **The fixture that makes the pair non-vacuous.** The auditor case below
    // holds neither `edit` nor `set_visibility`, so it cannot tell the two
    // apart: a gate rewritten to `can(session, 'edit')` passes it, and passed it
    // when that was planted. This one holds `edit`, `confirm` and `view_audit`
    // and not `set_visibility` — every panel capability but the one that governs
    // this entry — so only a gate naming `set_visibility` survives both.
    mount({ ...BASE, capabilities: ['view', 'edit', 'confirm', 'view_audit'] })
    expect(screen.queryByRole('link', { name: 'نمایش محتوا' })).toBeNull()
  })

  it('is not drawn for a panel user who holds view_audit but not set_visibility', () => {
    // An auditor, deliberately: they reach the panel shell (selectShell counts
    // view_audit) and hold no set_visibility, so a check of "is this a panel
    // user?" would draw them a control the server answers 403 to. A Reader could
    // not tell those two mistakes apart — they never see this shell at all.
    mount({ ...BASE, capabilities: ['view', 'view_audit'] })
    expect(screen.queryByRole('link', { name: 'نمایش محتوا' })).toBeNull()
  })
})
