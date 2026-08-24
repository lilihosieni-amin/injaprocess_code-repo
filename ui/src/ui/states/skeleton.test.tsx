import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import { ScreenSkeleton } from './index'
import { Overview } from '../../screens/Overview'
import { Summary } from '../../screens/Summary'
import { Steps } from '../../screens/Steps'
import { Visibility } from '../../screens/Visibility'
import { UserDetail } from '../../screens/UserDetail'
import { renderAt } from '../../test/utils'
import type { SessionDescriptor } from '../../auth/session'

afterEach(() => vi.restoreAllMocks())

/**
 * **What a screen shows while it is still arriving** — owner ruling: *"i want to
 * add load status for page that makes time like process list.or departmant
 * details page.actually i want Skeleton Loading for each page."*
 *
 * Six screens answered `<div className="flex-1 bg-ink" />` — a violet
 * rectangle, indistinguishable from a screen that had finished and had nothing
 * on it. `ProcessList` was the seventh and worse than blank; its own suite
 * carries that case, because what it used to draw was the empty STATE.
 */
const ADMIN: SessionDescriptor = {
  username: '09120000001', displayName: 'مدیر', role: 'admin',
  capabilities: ['view', 'comment', 'export_pdf', 'manage_users', 'set_visibility'],
  scopes: ['*'], supervisor: null, canSupervise: false, pendingApprovals: 0,
}

/** A request that never settles, so the screen stays in the state under test. */
function hang() {
  return vi.spyOn(globalThis, 'fetch').mockImplementation(() => new Promise<Response>(() => {}))
}

describe('ScreenSkeleton', () => {
  it('announces the wait to somebody who cannot see the pulse', () => {
    // The half of "loading state" a shimmer alone never gives: `role="status"`
    // with a Persian name, so a screen reader is told, and `aria-busy` so
    // assistive technology knows the region is not final.
    render(<ScreenSkeleton column="list" />)
    const status = screen.getByRole('status', { name: 'در حال بارگذاری' })
    expect(status).toHaveAttribute('aria-busy', 'true')
  })

  it('stands in the screen’s own shell, so nothing moves when the content lands', () => {
    // The same field, the same gutters, the same `[data-r-pad]` scroll box §8's
    // direction rules are addressed to. A spinner centred in an empty page
    // would reflow the whole screen at the moment the data arrived.
    render(<ScreenSkeleton column="summary" />)
    const root = screen.getByTestId('screen-skeleton')
    expect(root).toHaveAttribute('data-r-pad')
    expect(root.className).toContain('bg-ink')
    expect(root.className).toContain('overflow-auto')
    expect(root.firstElementChild!.className).toContain('max-w-summary')
  })

  it('draws the number of cards it was asked for, and a title above them', () => {
    render(<ScreenSkeleton column="list" cards={5} />)
    // Two header blocks — a title and a lead — then the cards.
    expect(document.querySelectorAll('.animate-pulse')).toHaveLength(7)
  })

  it('drops the lead line for a screen that has none', () => {
    render(<ScreenSkeleton column="access" cards={1} lead={false} />)
    expect(document.querySelectorAll('.animate-pulse')).toHaveLength(2)
  })

  it('is dimmed, or five white blocks read as a screen that finished empty', () => {
    // `--tile-v2` on the violet field is very nearly the white card each block
    // stands in for. The opacity is what makes it a ghost of that card, and it
    // multiplies with `animate-pulse` rather than replacing it — the weight says
    // "not content", the shimmer says "still coming".
    render(<ScreenSkeleton column="list" />)
    expect(screen.getByRole('status').className).toContain('opacity-40')
  })
})

describe('every screen that used to go blank now shows one', () => {
  const cases: [string, () => void][] = [
    ['overview', () => renderAt('/departments/:code/overview', <Overview />, '/departments/cooking/overview', ADMIN)],
    ['summary', () => renderAt('/processes/:pid', <Summary />, '/processes/cooking-001', ADMIN)],
    ['steps', () => renderAt('/processes/:pid/steps', <Steps />, '/processes/cooking-001/steps', ADMIN)],
    ['visibility', () => renderAt('/visibility', <Visibility />, '/visibility', ADMIN)],
    ['user detail', () => renderAt('/users/:id', <UserDetail />, '/users/7', ADMIN)],
  ]
  for (const [name, mount] of cases) {
    it(`— ${name}`, async () => {
      hang()
      mount()
      expect(await screen.findByTestId('screen-skeleton')).toBeInTheDocument()
      // …and never the bare violet box that stood here, which is the thing this
      // whole ruling is about: a screen that has finished and a screen that has
      // not looked identical.
      expect(screen.queryByRole('status', { name: 'در حال بارگذاری' })).toBeInTheDocument()
    })
  }
})
