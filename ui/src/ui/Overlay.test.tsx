import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { Dialog } from './Overlay'

function Harness({ onClose }: { onClose: () => void }) {
  return (
    <Dialog open onClose={onClose} title="حذف فرآیند">
      <button>تأیید</button>
      <button>انصراف</button>
    </Dialog>
  )
}

describe('Overlay', () => {
  it('exposes itself as a dialog with an accessible name', () => {
    render(<Harness onClose={() => {}} />)
    expect(screen.getByRole('dialog', { name: 'حذف فرآیند' })).toBeInTheDocument()
  })

  it('closes on Escape', async () => {
    const onClose = vi.fn()
    render(<Harness onClose={onClose} />)
    await userEvent.keyboard('{Escape}')
    expect(onClose).toHaveBeenCalledOnce()
  })

  it('moves focus into the dialog when it opens', async () => {
    render(<Harness onClose={() => {}} />)
    // The close button is first in DOM order and takes initial focus.
    expect(screen.getByRole('button', { name: 'بستن' })).toHaveFocus()
  })

  it('traps Tab inside the dialog', async () => {
    render(<Harness onClose={() => {}} />)
    const close = screen.getByRole('button', { name: 'بستن' })
    const confirm = screen.getByRole('button', { name: 'تأیید' })
    const cancel = screen.getByRole('button', { name: 'انصراف' })
    await userEvent.tab()
    expect(confirm).toHaveFocus()
    await userEvent.tab()
    expect(cancel).toHaveFocus()
    await userEvent.tab()          // wraps rather than escaping to the page
    expect(close).toHaveFocus()
  })

  it('restores focus to whatever was focused before it opened', () => {
    const trigger = document.createElement('button')
    document.body.appendChild(trigger)
    trigger.focus()
    const { unmount } = render(<Harness onClose={() => {}} />)
    expect(trigger).not.toHaveFocus()      // focus moved into the dialog
    unmount()
    expect(trigger).toHaveFocus()          // and came back
    trigger.remove()
  })

  it('renders as a bottom sheet below the md breakpoint', () => {
    render(<Harness onClose={() => {}} />)
    // F5: one component, switched by breakpoint — never a per-screen variant.
    expect(screen.getByRole('dialog').className).toMatch(/rounded-t-panel/)
    expect(screen.getByRole('dialog').className).toMatch(/md:rounded-panel/)
  })
})
