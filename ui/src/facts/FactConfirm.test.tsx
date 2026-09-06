import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { FactConfirm } from './FactConfirm'
import { bundleOf } from './cards/fixture'
import { ApiError } from '../api/client'
import type { FactBundle } from '../api/types'

const setC = vi.fn()
const revokeC = vi.fn()
vi.mock('../api/hooks', () => ({
  useSetFactConfirmation: () => setC(),
  useRevokeFactConfirmation: () => revokeC(),
}))

const set = { mutate: vi.fn(), isPending: false, error: null as unknown, variables: undefined }
const revoke = { mutate: vi.fn(), isPending: false, error: null as unknown }

beforeEach(() => {
  set.mutate = vi.fn(); set.error = null; set.variables = undefined
  revoke.mutate = vi.fn(); revoke.error = null
  setC.mockReturnValue(set)
  revokeC.mockReturnValue(revoke)
})

const entry = (over: Partial<FactBundle> = {}, entryOver = {}) =>
  bundleOf('rule', { inputs: [], outputs: [] }, over, entryOver)

describe('the confirm tick', () => {
  it('offers the act, and writes the fingerprint the server served', async () => {
    const user = userEvent.setup()
    render(<FactConfirm bundle={entry()} />)
    await user.click(screen.getByRole('button', { name: 'تأیید این مورد' }))
    expect(screen.getByRole('dialog', { name: 'کل این داده تأیید شود؟' })).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'تأیید می‌کنم' }))
    // QF-24 — the client computes no print; it echoes the one it was shown.
    expect(set.mutate).toHaveBeenCalledWith(
      { fingerprint: 'sha256:abc' }, expect.anything(),
    )
  })

  it('says «تأییدشده» when the stored mark is for these bytes, and offers to withdraw', async () => {
    const user = userEvent.setup()
    render(<FactConfirm bundle={entry({
      confirmation: { confirmed: true, can_confirm: true, fingerprint: 'sha256:abc' },
    })} />)
    await user.click(screen.getByRole('button', { name: 'تأییدشده' }))
    expect(screen.getByRole('dialog', { name: 'تأیید این داده برداشته شود؟' })).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'برداشتن تأیید' }))
    expect(revoke.mutate).toHaveBeenCalled()
  })

  it('offers the live tick on a red entry, like any other', async () => {
    // **Owner ruling, 2026-09-06**, overturning QF-25: «each of the
    // quantitative items should be confirmable, regardless of whether it has
    // an issue or not.» The disabled «قابل تأیید نیست» control the design
    // draws (`sfCanTick`, :5062) is gone with the rule it drew, and a red
    // entry now takes the same road as a green one, dialog included.
    const user = userEvent.setup()
    render(<FactConfirm bundle={entry({
      confirmation: { confirmed: false, can_confirm: true, fingerprint: 'sha256:abc' },
    }, { status: 'disputed' })} />)
    expect(screen.queryByText('قابل تأیید نیست')).toBeNull()
    await user.click(screen.getByRole('button', { name: 'تأیید این مورد' }))
    expect(screen.getByRole('dialog', { name: 'کل این داده تأیید شود؟' })).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'تأیید می‌کنم' }))
    expect(set.mutate).toHaveBeenCalled()
  })

  it('offers it for `unknown` too — red was both halves', () => {
    render(<FactConfirm bundle={entry({
      confirmation: { confirmed: false, can_confirm: true, fingerprint: 'sha256:abc' },
    }, { status: 'unknown' })} />)
    expect(screen.getByRole('button', { name: 'تأیید این مورد' })).toBeEnabled()
  })

  it('still draws nothing when the SERVER says this caller may not confirm', () => {
    // The half that survives: `can_confirm: false` no longer means "red", it
    // means out of scope (QF-27) — and that is still no control at all. A fix
    // that simply ignored `can_confirm` to let red through would draw a tick
    // the endpoint refuses.
    const { container } = render(<FactConfirm bundle={entry({
      confirmation: { confirmed: false, can_confirm: false, fingerprint: 'sha256:abc' },
    }, { status: 'disputed' })} />)
    expect(container).toBeEmptyDOMElement()
  })

  it('draws no control at all when the caller may not confirm this entry', () => {
    // A universal entry and a reviewer holding no `*` — QF-27. R5: never draw a
    // control you would refuse, and Appendix D says «no control, no label».
    const { container } = render(<FactConfirm bundle={entry({
      confirmation: { confirmed: false, can_confirm: false, fingerprint: 'sha256:abc' },
    })} />)
    expect(container).toBeEmptyDOMElement()
  })

  it('draws no control on a retired entry, and none on a stub', () => {
    const retired = render(<FactConfirm bundle={entry({}, { retired: true })} />)
    expect(retired.container).toBeEmptyDOMElement()
    const stub = render(
      <FactConfirm bundle={bundleOf('rule', { inputs: [], outputs: [], stub: true })} />,
    )
    expect(stub.container).toBeEmptyDOMElement()
  })

  it('says the document moved when the print is refused, and does not say «try again»', async () => {
    const user = userEvent.setup()
    set.error = new ApiError(409, 'CONFLICT', 'x')
    set.variables = { fingerprint: 'sha256:abc' } as never
    render(<FactConfirm bundle={entry()} />)
    await user.click(screen.getByRole('button', { name: 'تأیید این مورد' }))
    expect(screen.getByTestId('dialog-alert')).toHaveTextContent(/تغییر کرده/)
  })
})
