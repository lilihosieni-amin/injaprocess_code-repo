import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { PanelShell } from './PanelShell'
import type { SessionDescriptor } from '../auth/session'

const BASE: SessionDescriptor = {
  username: '09120000000', displayName: 'و', role: 'editor',
  capabilities: [], scopes: ['*'], supervisor: null, canSupervise: false,
  pendingApprovals: 0,
}

afterEach(() => vi.restoreAllMocks())

/**
 * `initialEntries` is not decoration. §6.0 draws the top bar on the home screen
 * and the crumb strip on every other, and this entry lives in the top bar's
 * «مدیریت» menu — so a router that starts at `/` (the default) renders the crumb
 * strip, there is no menu to open, and all five tests below go red for a reason
 * that has nothing to do with the capability they are about.
 *
 * The fetch stub is the shell's two reads: it calls `useDepartments` for the
 * crumb trail's Persian names now, as well as `usePending`.
 */
function mount(session: SessionDescriptor) {
  vi.spyOn(globalThis, 'fetch').mockImplementation(() =>
    Promise.resolve(new Response('[]', { status: 200, headers: { 'Content-Type': 'application/json' } })),
  )
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter initialEntries={['/departments']}><PanelShell session={session} /></MemoryRouter>
    </QueryClientProvider>,
  )
}

/** The entry is one click in now — §6.0 puts it in the «مدیریت» popover. */
async function openAdmin() {
  await userEvent.click(screen.getByRole('button', { name: /مدیریت/ }))
}

/**
 * A `menuitem`, not a `link`: the entry is still an `<a href>` and still
 * announces its route, and `role="menuitem"` is what puts it in the menu the
 * trigger says it opens. Matched by pattern rather than by exact name because
 * the row carries a second line — the hint §6.0 gives every entry — and the
 * accessible name is both lines run together.
 */
const policy = () => screen.queryByRole('menuitem', { name: /سیاست نمایش محتوا/ })

describe('the policy entry in the panel header', () => {
  it('is drawn for a holder of set_visibility', async () => {
    mount({ ...BASE, capabilities: ['view', 'edit', 'set_visibility'] })
    await openAdmin()
    expect(policy()).toBeInTheDocument()
  })

  it('points at the policy screen', async () => {
    // The name alone would pass for a link pointing anywhere at all, and the
    // route it must reach is the one thing about this entry that is not visible
    // on screen.
    mount({ ...BASE, capabilities: ['view', 'edit', 'set_visibility'] })
    await openAdmin()
    expect(policy()).toHaveAttribute('href', '/visibility')
  })

  it('is drawn for a holder of set_visibility who cannot edit', async () => {
    // The other half of the pair below. Without this, a gate spelled
    // `can(edit) && can(set_visibility)` — or one that simply sits inside the
    // existing `canEdit` block, which is the likeliest way to write it by
    // accident — passes every other test in this file.
    mount({ ...BASE, capabilities: ['view', 'set_visibility'] })
    await openAdmin()
    expect(policy()).toBeInTheDocument()
  })

  it('is not drawn for an editor who does not hold set_visibility', async () => {
    // **The fixture that makes the pair non-vacuous.** The auditor case below
    // holds neither `edit` nor `set_visibility`, so it cannot tell the two
    // apart: a gate rewritten to `can(session, 'edit')` passes it, and passed it
    // when that was planted. This one holds `edit`, `confirm` and `view_audit`
    // and not `set_visibility` — every panel capability but the one that governs
    // this entry — so only a gate naming `set_visibility` survives both.
    mount({ ...BASE, capabilities: ['view', 'edit', 'confirm', 'view_audit'] })
    await openAdmin()
    // …and the menu it is absent from is on screen, which is the difference
    // between "this entry is gated" and "nothing rendered at all".
    expect(screen.getByRole('menu')).toBeInTheDocument()
    expect(policy()).toBeNull()
  })

  it('is not drawn for a panel user who holds view_audit but not set_visibility', async () => {
    // An auditor, deliberately: they reach the panel shell (selectShell counts
    // view_audit) and hold no set_visibility, so a check of "is this a panel
    // user?" would draw them a control the server answers 403 to. A Reader could
    // not tell those two mistakes apart — they never see this shell at all.
    mount({ ...BASE, capabilities: ['view', 'view_audit'] })
    await openAdmin()
    expect(screen.getByRole('menu')).toBeInTheDocument()
    expect(policy()).toBeNull()
  })
})
