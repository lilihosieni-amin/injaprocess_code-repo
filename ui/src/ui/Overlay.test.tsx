import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import postcss from 'postcss'
import tailwind from 'tailwindcss'
import config from '../../tailwind.config.js'
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

  it('renders as a bottom sheet below the design’s breakpoint', () => {
    render(<Harness onClose={() => {}} />)
    // F5: one component, switched by breakpoint — never a per-screen variant.
    // The breakpoint moved from Tailwind's md (768px) to the design's own 760px
    // (§5.2 / R7), and the box is radiused on all four corners above it rather
    // than only on top, so the two classes this asserted no longer exist. What
    // the rule IS, in computed values at both widths, is pinned in P3 below.
    expect(screen.getByRole('dialog').className).toMatch(/\brounded-panel\b/)
    expect(screen.getByRole('dialog').className).toMatch(/\bmax760:rounded-b-none\b/)
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
    // 560px was never one of the design's five widths; the standard dialog is
    // 520px (§3.3). The five are pinned by computed value in P3 below.
    expect(className).toMatch(/\bmax-w-dialog\b/)
    expect(className).not.toMatch(/md:w-\[var\(--width-drawer\)\]/)
    expect(className).not.toMatch(/md:me-auto/)
  })

  it("the Sheet is a fixed-width drawer anchored inline-start, not the Dialog's centred cap", () => {
    render(<SheetHarness onClose={() => {}} />)
    const className = screen.getByRole('dialog').className
    expect(className).toMatch(/md:w-\[var\(--width-drawer\)\]/)
    expect(className).not.toMatch(/\bmax-w-dialog\b/)
  })
})

/* -------------------------------------------------------------------------
   P3 — the dialog primitive, measured against the design rather than against
   its own class string.

   `paint()` compiles the box's OWN rendered classes through the real theme, so
   an invented utility contributes nothing and a class that loses the cascade
   never shows up in the winning value. jsdom would report neither.
   ------------------------------------------------------------------------- */

type Painted = { state: string; media: string; decls: string }

async function paint(classNames: string): Promise<Painted[]> {
  const classes = [...new Set(classNames.split(/\s+/).filter(Boolean))]
  const result = await postcss([
    tailwind({ ...config, content: [{ raw: classes.join(' '), extension: 'html' }] }),
  ]).process('@tailwind utilities;', { from: undefined })
  const out: Painted[] = []
  result.root.walkRules((rule) => {
    if (!rule.nodes || rule.nodes.length === 0) return
    const media =
      rule.parent && 'name' in rule.parent ? String((rule.parent as { params: string }).params) : ''
    const decls = rule.nodes
      .filter((n) => n.type === 'decl')
      .map((n) => `${(n as unknown as { prop: string }).prop}: ${(n as unknown as { value: string }).value}`)
      .join('; ')
    for (const sel of rule.selectors) {
      const m = /^\.((?:\\.|[^\s.:>~+,(){}[\]])+)(.*)$/.exec(sel)
      if (m) out.push({ state: m[2], media, decls })
    }
  })
  return out
}

/** The last declaration of `prop` in emitted order — how the cascade resolves it. */
function winner(painted: Painted[], prop: string, state = '', media = ''): string {
  let value = ''
  for (const p of painted) {
    if (p.state !== state || p.media !== media) continue
    for (const d of p.decls.split('; ')) {
      const [name, ...rest] = d.split(': ')
      if (name === prop) value = rest.join(': ')
    }
  }
  return value
}

const PHONE = '(max-width: 760px)'

describe('P3 — Overlay is as capable as the dialog the design draws', () => {
  it('carries a subtitle, an icon and a footer', () => {
    render(
      <Dialog open onClose={() => {}} title="کاربر جدید"
        subtitle="حساب تازه‌ای بسازید"
        icon={<svg data-testid="dlg-icon" />}
        footer={<button>ذخیره</button>}
      >
        <p>بدنه</p>
      </Dialog>,
    )
    expect(screen.getByText('حساب تازه‌ای بسازید')).toBeTruthy()
    expect(screen.getByTestId('dlg-icon')).toBeTruthy()
    expect(screen.getByRole('button', { name: 'ذخیره' })).toBeTruthy()
    expect(screen.getByText('بدنه')).toBeTruthy()
  })

  it('draws none of the four when the caller passes none', () => {
    // The other half of the test above: a header that always rendered a
    // subtitle node, or a footer bar with nothing in it, would pass it.
    const { container } = render(
      <Dialog open onClose={() => {}} title="ت"><p>ب</p></Dialog>,
    )
    expect(container.querySelectorAll('p')).toHaveLength(1)
    expect(container.querySelector('[class*="mt-s10"]')).toBeNull()
  })

  it('takes one of the five widths the design uses, 520px by default', async () => {
    const { container, rerender } = render(
      <Dialog open onClose={() => {}} title="ت"><p>ب</p></Dialog>,
    )
    const box = () => container.querySelector('[role="dialog"]')!.className
    expect(winner(await paint(box()), 'max-width')).toBe('var(--width-dialog)')

    for (const [width, token] of [
      ['wide', 'var(--width-dialog-wide)'], ['lg', 'var(--width-dialog-lg)'],
      ['md', 'var(--width-dialog)'], ['sm', 'var(--width-dialog-sm)'],
      ['xs', 'var(--width-dialog-xs)'],
    ] as const) {
      rerender(<Dialog open onClose={() => {}} title="ت" width={width}><p>ب</p></Dialog>)
      expect(winner(await paint(box()), 'max-width'), width).toBe(token)
    }
  })

  it('blurs the scrim only when asked — the export dialog is the one case', async () => {
    const { container, rerender } = render(
      <Dialog open onClose={() => {}} title="ت"><p>ب</p></Dialog>,
    )
    const scrim = () => (container.firstElementChild as HTMLElement).className
    expect(winner(await paint(scrim()), '--tw-backdrop-blur')).toBe('')

    rerender(<Dialog open onClose={() => {}} title="ت" blurScrim><p>ب</p></Dialog>)
    expect(winner(await paint(scrim()), '--tw-backdrop-blur')).toBe('blur(3px)')
    // §4.5 — the scrim itself is unchanged by the blur.
    expect(winner(await paint(scrim()), 'background-color')).toBe('var(--scrim)')
  })

  it('is the design’s dialog: 24px radius, 26px interior, the two-layer shadow', async () => {
    const { container } = render(
      <Dialog open onClose={() => {}} title="ت"><p>ب</p></Dialog>,
    )
    const p = await paint(container.querySelector('[role="dialog"]')!.className)
    expect(winner(p, 'border-radius')).toBe('var(--radius-panel)')   // L-04 — 24px, always
    expect(winner(p, 'padding')).toBe('var(--space-11)')             // 26px
    expect(winner(p, '--tw-shadow-colored')).toBe('var(--shadow-modal)')
    expect(winner(p, 'border-color')).toBe('var(--border-card)')
    // …and the scrim's own inset around it.
    const scrim = await paint((container.firstElementChild as HTMLElement).className)
    expect(winner(scrim, 'padding')).toBe('var(--pad-modal)')
  })

  it('becomes a bottom sheet at the design’s breakpoint, not Tailwind’s md', async () => {
    const { container } = render(
      <Dialog open onClose={() => {}} title="ت"><p>ب</p></Dialog>,
    )
    const scrim = await paint((container.firstElementChild as HTMLElement).className)
    const box = await paint(container.querySelector('[role="dialog"]')!.className)

    // Above the breakpoint: centred, inset, radiused on all four corners.
    expect(winner(scrim, 'align-items')).toBe('center')
    expect(winner(scrim, 'padding')).toBe('var(--pad-modal)')
    expect(winner(box, 'border-bottom-left-radius')).toBe('')

    // At or below 760px — the design's number, not Tailwind's md (768px).
    expect(winner(scrim, 'align-items', '', PHONE)).toBe('flex-end')
    expect(winner(scrim, 'padding', '', PHONE)).toBe('0px')
    expect(winner(box, 'border-bottom-left-radius', '', PHONE)).toBe('0px')
    expect(winner(box, 'border-bottom-right-radius', '', PHONE)).toBe('0px')
    expect(winner(box, 'max-width', '', PHONE)).toBe('100%')
  })

  it('titles at 18px/800 — one dialog title size (ledger L-16)', async () => {
    render(<Dialog open onClose={() => {}} title="کاربر جدید"><p>ب</p></Dialog>)
    const h = screen.getByRole('heading', { name: 'کاربر جدید' })
    const p = await paint(h.className)
    expect(winner(p, 'font-size')).toBe('var(--fs-dialog)')
    expect(winner(p, 'font-weight')).toBe('var(--fw-extrabold)')
  })

  it('gives the subtitle the design’s 12.5px sub-copy line, not the body one', async () => {
    render(
      <Dialog open onClose={() => {}} title="ت" subtitle="زیرنویس"><p>ب</p></Dialog>,
    )
    const p = await paint(screen.getByText('زیرنویس').className)
    expect(winner(p, 'font-size')).toBe('var(--fs-sm2)')
    expect(winner(p, 'line-height')).toBe('var(--lh-sub)')   // 1.8, ledger L-17
    expect(winner(p, 'color')).toBe('var(--text-muted)')
  })

  it('draws the close control the ledger decided, not IconButton’s default skin', async () => {
    // L-23 — --tile-v2 behind a --text-muted glyph at --radius-sm. Passing those
    // three through IconButton's `className` would NOT produce them: Tailwind's
    // emitted order, not the class string's, decides between two utilities on
    // one property, and `bg-transparent`, `text-violet` and `rounded-control`
    // all sort after the three that would have to beat them. Asserted as the
    // WINNING value, which is the only assertion that can tell the two apart.
    render(<Dialog open onClose={() => {}} title="ت"><p>ب</p></Dialog>)
    const close = screen.getByRole('button', { name: 'بستن' })
    const p = await paint(close.className)
    expect(winner(p, 'background-color')).toBe('var(--tile-v2)')
    expect(winner(p, 'color')).toBe('var(--text-muted)')
    expect(winner(p, 'border-radius')).toBe('var(--radius-sm)')
  })

  it('pins each footer child to an equal share, so no caller re-invents the pair', async () => {
    const { container } = render(
      <Dialog open onClose={() => {}} title="ت" footer={<><button>الف</button><button>ب</button></>}>
        <p>بدنه</p>
      </Dialog>,
    )
    const bar = container.querySelector('[class*="mt-s10"]')!
    const p = await paint(bar.className)
    expect(winner(p, 'gap')).toBe('var(--space-5)')          // 10px
    expect(winner(p, 'flex', '>*')).toBe('1 1 0%')
  })
})
