import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import { DeniedState, NotFoundState } from '../ui/states'
import { ApiError, refusalStatus } from '../api/client'
import { Summary } from './Summary'
import { Overview } from './Overview'
import { ProcessList } from './ProcessList'
import { renderAt } from '../test/utils'
import type { SessionDescriptor } from '../auth/session'

afterEach(() => vi.restoreAllMocks())

/** Every word that would turn a not-found screen into a denied one: each of them
 *  asserts, in some form, that something IS there and is being withheld. */
const DISCLOSING = /دسترسی|مدیر|اجازه|محدود|وجود|قابل مشاهده|سرپرست/

/** Everything the not-found screen is allowed to say, whole. See the pin below
 *  for why a list of forbidden words is not enough on its own. */
const NOT_FOUND_COPY = 'چیزی اینجا نیستنشانی را بررسی کنید یا به خانه برگردید.'

/** A plain reader of `cooking`. `displayName` deliberately avoids every word in
 *  DISCLOSING — «مدیر» is in that list, and a fixture named it would make the
 *  screen-level scans below fail (or, worse, pass for the wrong reason once the
 *  name stopped being rendered). */
const READER: SessionDescriptor = {
  username: '09120000001', displayName: 'کاربر', role: 'reader',
  capabilities: ['view', 'comment', 'export_pdf'], scopes: ['dept:cooking'],
  supervisor: null, canSupervise: false, pendingApprovals: 0,
}

/** Every request the screen makes answers with `status`. The body is the uniform
 *  one the server sends for a 404 (`NOT_FOUND`) — a screen that rendered the
 *  server's detail instead of its own copy would be caught by the scans below. */
function refuse(status: number, detail = 'NOT_FOUND') {
  return vi.spyOn(globalThis, 'fetch').mockResolvedValue(
    new Response(JSON.stringify({ detail }), { status, headers: { 'Content-Type': 'application/json' } }))
}

describe('refusal surfaces', () => {
  it('not-found says nothing about what might exist', () => {
    render(<NotFoundState />)
    const text = document.body.textContent ?? ''
    expect(text).not.toMatch(DISCLOSING)
  })

  it('says only the two things it is allowed to say', () => {
    // A list of forbidden words can always be walked around. «این بخش متعلق به
    // دپارتمان دیگری است» — "this section belongs to another department" —
    // contains not one word of DISCLOSING and is a 403 in disguise: it confirms
    // the department exists and is someone else's, which is precisely what the
    // uniform 404 was built to refuse. (Planted as a mutant; it survived every
    // other assertion in this file and in states.test.tsx.) So the copy is
    // pinned whole instead: any sentence added to this screen fails here first
    // and has to be argued for.
    render(<NotFoundState />)
    expect(document.body.textContent).toBe(NOT_FOUND_COPY)
  })

  it('denied names the action, not the resource', () => {
    render(<DeniedState />)
    expect(screen.getByText('اجازهٔ این کار را ندارید')).toBeInTheDocument()
  })
})

describe('a screen whose resource is out of scope', () => {
  it('renders not-found for a 404 on a process, and nothing that hints at a process', async () => {
    refuse(404)
    renderAt('/processes/:pid', <Summary />, '/processes/cashier-002', READER)
    expect(await screen.findByText('چیزی اینجا نیست')).toBeInTheDocument()
    expect(screen.queryByText('اجازهٔ این کار را ندارید')).not.toBeInTheDocument()
    // The hostile reading: nothing on this screen may distinguish "there is no
    // such process" from "there is one, and it is not yours". Pinned whole, so
    // it cannot grow a line about the id it was asked for, echo the server's
    // detail, or add a sentence explaining itself.
    expect(document.body.textContent).toBe(NOT_FOUND_COPY)
    expect(document.body.textContent ?? '').not.toMatch(DISCLOSING)
    expect(document.body.textContent ?? '').not.toMatch(/cashier-002|NOT_FOUND/)
  })

  it('renders not-found for a 404 on a department overview', async () => {
    refuse(404)
    renderAt('/departments/:code/overview', <Overview />, '/departments/cashier/overview', READER)
    expect(await screen.findByText('چیزی اینجا نیست')).toBeInTheDocument()
    expect(screen.queryByText('اجازهٔ این کار را ندارید')).not.toBeInTheDocument()
    expect(document.body.textContent ?? '').not.toMatch(DISCLOSING)
  })

  it('renders not-found for a 404 on a department process list', async () => {
    refuse(404)
    renderAt('/departments/:code', <ProcessList />, '/departments/cashier', READER)
    expect(await screen.findByText('چیزی اینجا نیست')).toBeInTheDocument()
    expect(screen.queryByText('اجازهٔ این کار را ندارید')).not.toBeInTheDocument()
    expect(document.body.textContent ?? '').not.toMatch(DISCLOSING)
  })

  it('gives a reader following a link to a tombstoned process the same screen as any other 404', async () => {
    // GET /api/processes/{pid} answers 404 for a tombstoned document to anyone
    // without `edit`, so the link from a heir list — or a bookmark — lands here.
    // It must be indistinguishable from a process that never existed: saying
    // «باطل شده» would confirm the id, which is what the 404 exists to refuse.
    refuse(404)
    renderAt('/processes/:pid', <Summary />, '/processes/cooking-002', READER)
    expect(await screen.findByText('چیزی اینجا نیست')).toBeInTheDocument()
    expect(document.body.textContent).toBe(NOT_FOUND_COPY)
    expect(document.body.textContent ?? '').not.toMatch(/باطل|جانشین/)
    expect(document.body.textContent ?? '').not.toMatch(DISCLOSING)
  })
})

describe('a failure that is not a refusal', () => {
  it('has no surface of its own — 5xx and network faults map to neither', () => {
    // Asserted on the mapping rather than through a screen: "the not-found text
    // is absent" is true of a screen that has not finished loading either, so a
    // rendered version of this test would pass without the branch ever running.
    //
    // A server fault or a dropped connection is not an answer about who this
    // person is. Showing «چیزی اینجا نیست» for one would assert something the UI
    // does not know, and would read as "your thing is gone" during an outage.
    expect(refusalStatus(new ApiError(404, 'NOT_FOUND'))).toBe(404)
    expect(refusalStatus(new ApiError(403, 'FORBIDDEN'))).toBe(403)
    expect(refusalStatus(new ApiError(503, 'unavailable'))).toBeUndefined()
    expect(refusalStatus(new ApiError(500, 'boom'))).toBeUndefined()
    expect(refusalStatus(new ApiError(401, 'expired'))).toBeUndefined()  // the shell redirects; no screen renders it
    expect(refusalStatus(new TypeError('Failed to fetch'))).toBeUndefined()
    expect(refusalStatus(null)).toBeUndefined()
  })
})

describe('a screen whose action is refused', () => {
  it('renders denied — not not-found — for a 403 on a process', async () => {
    refuse(403, 'FORBIDDEN')
    renderAt('/processes/:pid', <Summary />, '/processes/cooking-002', READER)
    expect(await screen.findByText('اجازهٔ این کار را ندارید')).toBeInTheDocument()
    expect(screen.queryByText('چیزی اینجا نیست')).not.toBeInTheDocument()
  })

  it('renders denied — not not-found — for a 403 on a department overview', async () => {
    refuse(403, 'FORBIDDEN')
    renderAt('/departments/:code/overview', <Overview />, '/departments/cooking/overview', READER)
    expect(await screen.findByText('اجازهٔ این کار را ندارید')).toBeInTheDocument()
    expect(screen.queryByText('چیزی اینجا نیست')).not.toBeInTheDocument()
  })
})
