import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { Dialog, Sheet } from './Overlay'

function Harness({ onClose }: { onClose: () => void }) {
  return (
    <Dialog open onClose={onClose} title="حذف فرآیند">
      <button>تأیید</button>
      <button>انصراف</button>
    </Dialog>
  )
}

function SheetHarness({ onClose }: { onClose: () => void }) {
  return (
    <Sheet open onClose={onClose} title="فیلترها">
      <button>اعمال</button>
      <button>پاک‌کردن</button>
    </Sheet>
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

  it('wraps Shift+Tab from the first focusable to the last, not out of the dialog', async () => {
    render(<Harness onClose={() => {}} />)
    const close = screen.getByRole('button', { name: 'بستن' })
    const cancel = screen.getByRole('button', { name: 'انصراف' })
    expect(close).toHaveFocus()    // initial focus lands here
    await userEvent.tab({ shift: true })
    expect(cancel).toHaveFocus()
  })

  it('recaptures focus that left the trap entirely, e.g. via a click on non-focusable chrome', async () => {
    // A real page has focusable content behind the scrim; without that, Tab landing
    // on the close button proves nothing — it could just be the only candidate.
    const background = document.createElement('button')
    background.textContent = 'پس‌زمینه'
    document.body.appendChild(background)

    render(<Harness onClose={() => {}} />)
    // Clicking the <h2> title (not focusable) is how a real browser blurs to <body>.
    await userEvent.click(screen.getByText('حذف فرآیند'))
    expect(screen.getByRole('dialog')).not.toContainElement(document.activeElement as HTMLElement)

    await userEvent.tab()
    expect(screen.getByRole('button', { name: 'بستن' })).toHaveFocus()
    expect(background).not.toHaveFocus()

    background.remove()
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

  it('does not throw restoring focus when the trigger element is gone', () => {
    // The common case for a delete confirmation: the trigger is the row being deleted.
    const trigger = document.createElement('button')
    document.body.appendChild(trigger)
    trigger.focus()
    const { unmount } = render(<Harness onClose={() => {}} />)
    trigger.remove()
    expect(() => unmount()).not.toThrow()
  })

  it('renders as a bottom sheet below the md breakpoint', () => {
    render(<Harness onClose={() => {}} />)
    // F5: one component, switched by breakpoint — never a per-screen variant.
    expect(screen.getByRole('dialog').className).toMatch(/rounded-t-panel/)
    expect(screen.getByRole('dialog').className).toMatch(/md:rounded-panel/)
  })

  it('locks page scroll while open and releases it once closed', () => {
    const { unmount } = render(<Harness onClose={() => {}} />)
    expect(document.body.style.overflow).toBe('hidden')
    unmount()
    expect(document.body.style.overflow).not.toBe('hidden')
  })

  it('lets only the topmost overlay respond to Escape when stacked', async () => {
    const closeOuter = vi.fn()
    const closeInner = vi.fn()
    render(
      <>
        <Dialog open onClose={closeOuter} title="بیرونی">
          <button>خارجی</button>
        </Dialog>
        <Dialog open onClose={closeInner} title="داخلی">
          <button>داخلی</button>
        </Dialog>
      </>,
    )
    await userEvent.keyboard('{Escape}')
    expect(closeInner).toHaveBeenCalledOnce()
    expect(closeOuter).not.toHaveBeenCalled()
  })
})

describe('Sheet', () => {
  it('exposes itself as a dialog with an accessible name', () => {
    render(<SheetHarness onClose={() => {}} />)
    expect(screen.getByRole('dialog', { name: 'فیلترها' })).toBeInTheDocument()
  })

  it('closes on Escape', async () => {
    const onClose = vi.fn()
    render(<SheetHarness onClose={onClose} />)
    await userEvent.keyboard('{Escape}')
    expect(onClose).toHaveBeenCalledOnce()
  })

  it('anchors to the inline start above the breakpoint, using logical properties', () => {
    render(<SheetHarness onClose={() => {}} />)
    const className = screen.getByRole('dialog').className
    expect(className).toMatch(/md:me-auto/)
    expect(className).toMatch(/md:ms-0/)
  })
})

describe('Dialog vs Sheet — the two presentations cannot collapse into each other', () => {
  it("the Dialog is centred and width-capped, not anchored like the Sheet's drawer", () => {
    render(<Harness onClose={() => {}} />)
    const className = screen.getByRole('dialog').className
    expect(className).toMatch(/md:max-w-\[560px\]/)
    expect(className).not.toMatch(/md:w-\[var\(--width-drawer\)\]/)
    expect(className).not.toMatch(/md:me-auto/)
  })

  it("the Sheet is a fixed-width drawer anchored inline-start, not the Dialog's centred cap", () => {
    render(<SheetHarness onClose={() => {}} />)
    const className = screen.getByRole('dialog').className
    expect(className).toMatch(/md:w-\[var\(--width-drawer\)\]/)
    expect(className).not.toMatch(/md:max-w-\[560px\]/)
  })
})
