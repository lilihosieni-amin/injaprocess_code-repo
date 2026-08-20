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

  it('anchors to the inline end above the breakpoint, using logical properties', async () => {
    // Was `className.toMatch(/md:me-auto/)`, twice — a string match that says
    // nothing about WHICH breakpoint, which is precisely how the sheet kept
    // Tailwind's md (768) while the scrim beside it moved to the design's 760
    // and nothing went red. Read out of the compiled sheet instead.
    //
    // **Owner ruling R45 — the END, and this pair used to say start.** Both
    // spellings are legal logical properties and both compile; only one of them
    // puts the box on the edge the deliverables draw every off-canvas panel on
    // (`left:0` at `Inja Panel.dc.html:804`, `:900`, `:1965`, `:1998` and four
    // more in the reader), which is also the edge the shells put the control
    // that opens it on. Which side a margin resolves to is not something jsdom
    // can be asked, so `e2e/panel-shell.spec.ts` measures the box against the
    // window and against the trigger; this pins the declaration that gets it
    // there so a silent swap back cannot pass here.
    const { container } = render(<SheetHarness onClose={() => {}} />)
    const box = await paint(container.querySelector('[role="dialog"]')!.className)
    expect(winner(box, 'margin-inline-start')).toBe('auto')
    expect(winner(box, 'margin-inline-end')).toBe('0px')
  })

  it('is a drawer above the design’s breakpoint and a bottom sheet at or below it — one number, not two', async () => {
    // F6 — the seven-pixel band. The box was keyed on `md:` (768) and the scrim
    // on `max760:` (760), so at 761–767 the nav sheet drew as a centred rounded
    // card 716px wide inside a padded scrim: neither drawer nor bottom sheet.
    // Measured in Chrome at 760 / 764 / 768 before the fix; asserted here as
    // the rule rather than the three samples.
    const { container } = render(<SheetHarness onClose={() => {}} />)
    const scrim = await paint((container.firstElementChild as HTMLElement).className)
    const box = await paint(container.querySelector('[role="dialog"]')!.className)

    // Above: an inline-start drawer, --width-drawer wide and full height.
    expect(winner(box, 'max-width')).toBe('var(--width-drawer)')
    expect(winner(box, 'height')).toBe('100%')
    expect(winner(scrim, 'align-items')).toBe('center')

    // At or below 760 — the SAME number the scrim uses, in the same query.
    expect(winner(box, 'max-width', '', PHONE)).toBe('100%')
    expect(winner(box, 'height', '', PHONE)).toBe('auto')
    expect(winner(box, 'max-height', '', PHONE)).toBe('88vh')
    expect(winner(scrim, 'align-items', '', PHONE)).toBe('flex-end')
    expect(winner(scrim, 'padding', '', PHONE)).toBe('0px')

    // …and NOTHING on this box is keyed on Tailwind's md any more. This is the
    // assertion the band could not survive: it is a claim about the absence of
    // a second breakpoint, which no class-name match can make.
    for (const prop of ['max-width', 'height', 'max-height', 'margin-inline-end', 'margin-inline-start']) {
      expect(winner(box, prop, '', MD), prop).toBe('')
    }
  })

  it('rounds its top corners at owner ruling R35’s 22px — not the modal’s 20, not the dialog’s 24', async () => {
    // R35 («do like design»): §5.2 gives the drawer-as-bottom-sheet
    // `border-radius: 22px 22px 0 0`, and the radius ladder
    // (6·7·9·10·11·12·13·14·16·18·20·24) had no 22 rung, so it drew 24.
    // `--radius-sheet` is that rung; the MODAL's sheet is `--radius-card-lg`'s
    // 20 and must not move onto it.
    const { container } = render(<SheetHarness onClose={() => {}} />)
    const box = await paint(container.querySelector('[role="dialog"]')!.className)

    // Above the breakpoint the dialog shorthand stands, on all four corners.
    expect(winner(box, 'border-radius')).toBe('var(--radius-panel)')
    expect(winner(box, 'border-top-left-radius')).toBe('')

    // At or below it the sheet's rung has to BEAT that shorthand inside the
    // media query — which `toHaveClass` cannot see, and is exactly why
    // `40ddb17`'s regression test for the modal's 20 was written this way.
    expect(winner(box, 'border-top-left-radius', '', PHONE)).toBe('var(--radius-sheet)')
    expect(winner(box, 'border-top-right-radius', '', PHONE)).toBe('var(--radius-sheet)')
    expect(winner(box, 'border-bottom-left-radius', '', PHONE)).toBe('0px')
    expect(winner(box, 'border-bottom-right-radius', '', PHONE)).toBe('0px')
  })
})

describe('Dialog vs Sheet — the two presentations cannot collapse into each other', () => {
  it("the Dialog is centred and width-capped, not anchored like the Sheet's drawer", async () => {
    const { container } = render(<Harness onClose={() => {}} />)
    // 560px was never one of the design's five widths; the standard dialog is
    // 520px (§3.3). Read as compiled values, not as class names: the pair this
    // replaces asserted `md:`-prefixed strings, so both halves went on passing
    // when the sheet's breakpoint was wrong.
    const box = await paint(container.querySelector('[role="dialog"]')!.className)
    expect(winner(box, 'max-width')).toBe('var(--width-dialog)')
    // The Sheet's anchor, absent. Read on the property the Sheet actually
    // writes since R45 — `margin-inline-start` — or this stops being the
    // contrast it is named for.
    expect(winner(box, 'margin-inline-start')).toBe('')
    expect(winner(box, 'height')).toBe('')
  })

  it("the Sheet is a fixed-width drawer anchored inline-end, not the Dialog's centred cap", async () => {
    const { container } = render(<SheetHarness onClose={() => {}} />)
    const box = await paint(container.querySelector('[role="dialog"]')!.className)
    expect(winner(box, 'max-width')).toBe('var(--width-drawer)')
    // R45 — the anchor is `margin-inline-start:auto`. The Dialog writes neither
    // margin at all, which is what keeps the two presentations apart here.
    expect(winner(box, 'margin-inline-start')).toBe('auto')
  })
})

describe('L-42 / L-44 — the z ladder reaches the dialog primitive', () => {
  it('puts a dialog on --role-z-modal and a sheet on --role-z-drawer', async () => {
    // The scrim used to write `50 + depth * 10` inline. 50 is BELOW
    // `--role-z-chrome` (1020), so the panel's top bar, the FAB (1030) and every
    // popover (1000) painted above it and stayed hit-testable while
    // `aria-modal="true"` claimed the page behind was inert. Neither rung had a
    // component consumer at all — half the ladder was live and exactly the half
    // that lifts a modal above the rest was dead.
    const dialog = render(<Harness onClose={() => {}} />)
    const dialogScrim = dialog.container.firstElementChild as HTMLElement
    expect(winner(await paint(dialogScrim.className), 'z-index')).toBe('var(--role-z-modal)')
    // …written as a class, not as an inline number: an inline style would beat
    // the utility and leave the ladder named and never painted.
    expect(dialogScrim.style.zIndex).toBe('')
    dialog.unmount()

    const sheet = render(<SheetHarness onClose={() => {}} />)
    const sheetScrim = sheet.container.firstElementChild as HTMLElement
    expect(winner(await paint(sheetScrim.className), 'z-index')).toBe('var(--role-z-drawer)')
    expect(sheetScrim.style.zIndex).toBe('')
  })

  it('adds ONE per nesting level inside the rung’s own band, never ten across bands', () => {
    // L-42 — "Nesting adds 1 inside the rung's own band rather than 10 across
    // bands, so fifteen stacked overlays fit beneath the reserved 1070 where the
    // deliverables reach two." `50 + depth * 10` cleared `--role-z-dropdown`
    // (1000) only at depth 96.
    const { container } = render(
      <>
        <Dialog open onClose={() => {}} title="بیرونی"><button>خارجی</button></Dialog>
        <Dialog open onClose={() => {}} title="داخلی"><button>داخلی</button></Dialog>
      </>,
    )
    const scrims = Array.from(container.children) as HTMLElement[]
    expect(scrims).toHaveLength(2)
    expect(scrims[0].style.zIndex).toBe('')                            // depth 0 — the class
    expect(scrims[1].style.zIndex).toBe('calc(var(--role-z-modal) + 1)')
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
/** Tailwind's own `md`, which is 768 and is NOT this design's breakpoint. Named
 *  so the Sheet can assert that nothing of its shape is keyed on it. */
const MD = '(min-width: 768px)'

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

    // …and the two corners that are left SHRINK. §5.2's ≤760 block is
    // `[data-r-modalbox]{max-height:92vh; border-radius:20px 20px 0 0;
    // width:100%}` and both deliverables carry it verbatim
    // (`design/Inja Panel.dc.html:108`), so the sheet's top corners are the
    // 20px step and NOT the 24 the same box takes as a centred dialog. Flat at
    // the bottom is only half of the rule, and the half that was written: the
    // box drew `24px 24px 0 0` and `user-dialog.spec.ts` measured it in Chrome.
    //
    // Asserted through `paint()`/`winner()` and not as a class string, which is
    // the whole point of this block: `rounded-panel` sets all four corners and
    // this has to BEAT it inside the media query. `toHaveClass` would have been
    // green with the utility emitted before the shorthand and the corner still
    // at 24 — which is exactly how `FIELD_PAD_REVEAL`'s docstring describes the
    // `ps-*` / `px-*` race, one property along.
    expect(winner(box, 'border-top-left-radius', '', PHONE)).toBe('var(--radius-card-lg)')
    expect(winner(box, 'border-top-right-radius', '', PHONE)).toBe('var(--radius-card-lg)')
    // Above the breakpoint the same two corners are the shorthand's, untouched.
    expect(winner(box, 'border-top-left-radius')).toBe('')
    expect(winner(box, 'border-top-right-radius')).toBe('')
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

  it('sets the header row on the design’s scale, not Tailwind’s own', async () => {
    // §5.2 — 12px between the icon, the title block and the close control, and
    // 16px under the whole row. Unasserted until now: `gap-s6 mb-s8` could
    // become `gap-s14 mb-s1` — 4px of gap under a 38px gutter — with every
    // other test in this file green, because none of them reads this element.
    render(<Dialog open onClose={() => {}} title="کاربر جدید"><p>ب</p></Dialog>)
    const header = screen.getByRole('heading', { name: 'کاربر جدید' }).parentElement!.parentElement!
    const p = await paint(header.className)
    expect(winner(p, 'gap')).toBe('var(--space-6)')          // 12px
    expect(winner(p, 'margin-bottom')).toBe('var(--space-8)') // 16px
  })

  it('draws the close control the ledger decided, not IconButton’s default skin', async () => {
    // L-23 — --tile-v2 behind a --text-muted glyph at --radius-sm. Passing those
    // through IconButton's `className` would NOT produce them: Tailwind's
    // emitted order, not the class string's, decides between two utilities on
    // one property, and `bg-transparent` and `text-violet` both sort after the
    // two that would have to beat them (`rounded-control` does not — it sorts
    // BEFORE `rounded-tool`, so the radius is the one of the four that would
    // have survived). Asserted as the WINNING value, which is the only
    // assertion that can tell the two apart.
    render(<Dialog open onClose={() => {}} title="ت"><p>ب</p></Dialog>)
    const close = screen.getByRole('button', { name: 'بستن' })
    const p = await paint(close.className)
    expect(winner(p, 'background-color')).toBe('var(--tile-v2)')
    expect(winner(p, 'color')).toBe('var(--text-muted)')
    expect(winner(p, 'border-radius')).toBe('var(--radius-sm)')
  })

  it('draws the close control at the design’s 32px and grows the target, not the box', async () => {
    // The plan's one rule for every control on the design's 30/32/34/36/40/42
    // ladder: draw the design's size, expand the hit area with a transparent
    // `::before`, never inflate the drawn control to 44px. This shipped at
    // IconButton's `min-h-touch` — a 44x44 box, invisible while it was
    // transparent and a visible lilac tile the moment L-23's `bg-tile-v2`
    // landed on it.
    render(<Dialog open onClose={() => {}} title="ت"><p>ب</p></Dialog>)
    const p = await paint(screen.getByRole('button', { name: 'بستن' }).className)
    expect(winner(p, 'width')).toBe('var(--size-close)')     // 32px — L-23
    expect(winner(p, 'height')).toBe('var(--size-close)')
    // …and NOT inflated: min-height beats height, so a `min-h-touch` left on
    // this control would silently draw 44 while the two lines above still pass.
    expect(winner(p, 'min-width')).toBe('')
    expect(winner(p, 'min-height')).toBe('')
    // F11's 44px is the `::before`: 32 + 2x6. It paints nothing — no colour, no
    // border — so the design's box is what a person sees.
    expect(winner(p, 'position')).toBe('relative')
    expect(winner(p, 'position', '::before')).toBe('absolute')
    expect(winner(p, 'inset', '::before')).toBe('-6px')
    expect(winner(p, 'background-color', '::before')).toBe('')
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
