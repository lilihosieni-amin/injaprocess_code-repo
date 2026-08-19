import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { SearchField } from './SearchField'
import { Accordion } from './Accordion'
import { ICONS } from './icons'
import { Menu } from './Menu'
import { Dialog } from './Overlay'
import { declarations, paint } from '../test/paint'

describe('SearchField', () => {
  it('binds a real label to the input', () => {
    // F11 — a placeholder is not a label.
    render(<SearchField label="جست‌وجوی فرآیند" value="" onChange={() => {}} />)
    expect(screen.getByLabelText('جست‌وجوی فرآیند')).toBeInTheDocument()
  })
  it('reports typing', async () => {
    const onChange = vi.fn()
    render(<SearchField label="جست‌وجو" value="" onChange={onChange} />)
    await userEvent.type(screen.getByLabelText('جست‌وجو'), 'س')
    expect(onChange).toHaveBeenCalledWith('س')
  })
})

/*
 * §6.4's disclosure — «نقش‌ها و شرح وظایف» on the department page.
 *
 * The design system's readme says the product has no Accordion. R1 records that
 * claim as false of the deliverables (two accordions, one of them fully drawn at
 * §6.4), so the primitive stays and this is the shape it is held to.
 *
 * Every box below is asserted by the DECLARATIONS its class string compiles to,
 * not by `toHaveClass`: jsdom paints nothing, so an invented name and a real one
 * are the same string to it. `paint`/`declarations` come from src/test/paint.ts
 * — imported, never copied.
 */
describe('Accordion', () => {
  const items = [
    { key: 'a', title: 'سرآشپز', badge: '۳ وظیفه', body: <p>بدنه</p> },
    { key: 'b', title: 'کمک‌آشپز', badge: '۱ وظیفه', body: <p>بدنهٔ دو</p> },
  ]

  const head = (name: RegExp) => screen.getByRole('button', { name })

  it('opens and closes from the header, and says so to a screen reader', async () => {
    render(<Accordion items={items} />)
    const h = head(/سرآشپز/)
    expect(h).toHaveAttribute('aria-expanded', 'false')
    expect(screen.queryByText('بدنه')).not.toBeInTheDocument()
    await userEvent.click(h)
    expect(h).toHaveAttribute('aria-expanded', 'true')
    expect(screen.getByText('بدنه')).toBeInTheDocument()
    await userEvent.click(h)
    expect(h).toHaveAttribute('aria-expanded', 'false')
    expect(screen.queryByText('بدنه')).not.toBeInTheDocument()
  })

  it('names the panel it controls, and only while that panel exists', async () => {
    // `aria-controls` pointing at an id that is not in the document is a broken
    // reference, and the body is REMOVED when closed (the design's own
    // `<sc-if>`), so the attribute cannot be unconditional.
    render(<Accordion items={items} />)
    const h = head(/سرآشپز/)
    expect(h).not.toHaveAttribute('aria-controls')
    await userEvent.click(h)
    const panel = document.getElementById(h.getAttribute('aria-controls')!)
    expect(panel).not.toBeNull()
    expect(panel!.textContent).toContain('بدنه')
  })

  it('opens more than one at a time', async () => {
    // §6.4 does not make them exclusive, and a person comparing two roles has
    // to be able to see both.
    render(<Accordion items={items} />)
    await userEvent.click(head(/سرآشپز/))
    await userEvent.click(head(/کمک‌آشپز/))
    expect(screen.getByText('بدنه')).toBeInTheDocument()
    expect(screen.getByText('بدنهٔ دو')).toBeInTheDocument()
  })

  it('has exactly one control per item — the header', async () => {
    // The screen's hand-rolled version grew a second «بستن» button inside the
    // open body, so an item had two ways to close and a screen reader met a
    // control with no relationship to the region it closed.
    render(<Accordion items={items} />)
    await userEvent.click(head(/سرآشپز/))
    expect(screen.getAllByRole('button')).toHaveLength(2)
  })

  it('draws its chevron, not a character, and it is §6.4’s own two pictures', async () => {
    // `Inja Panel.dc.html:3501` binds `chevron: open ? 'M6 15l6-6 6 6' :
    // 'M15 18l-6-6 6-6'` — a `<` when collapsed and a `^` when open. Those are
    // ONE glyph and a quarter turn: rotating `chevronEnd`'s three points 90°
    // about the 24-box centre gives the open path exactly. So the closed glyph
    // is asserted by its `d`, and the open state by the rotation that produces
    // the other one.
    const { container } = render(<Accordion items={items} />)
    expect(container.textContent).not.toMatch(/[−+<>^]/)
    const chev = container.querySelector('svg')!
    expect(chev).toHaveAttribute('stroke-width', '2.4')
    expect(chev).toHaveAttribute('width', '17')
    expect(chev).toHaveAttribute('height', '17')
    // The path is the icon set's `chevronEnd`, read from the set rather than
    // transcribed: a `d` written out here would pass while the shared glyph
    // moved under it.
    const wanted = (ICONS.chevronEnd as { props: { d: string } }).props.d
    expect(chev.querySelector('path')!.getAttribute('d')).toBe(wanted)
  })

  it('turns that chevron a quarter turn on open, over --duration-chev', async () => {
    const { container } = render(<Accordion items={items} />)
    const turn = () => container.querySelector('svg')!.parentElement!
    // A SWAP, never an append: two rotation utilities on one element would be
    // resolved by Tailwind's output order and not by the class attribute's.
    const closed = await paint(turn().className)
    expect(declarations(closed)).toContain('--tw-rotate: 0deg')
    expect(declarations(closed)).toContain('transition-duration: var(--duration-chev)')
    expect(declarations(closed)).toContain('transition-timing-function: var(--ease-css)')
    expect(declarations(closed)).toContain('transition-property: transform')

    await userEvent.click(screen.getByRole('button', { name: /سرآشپز/ }))
    const open = await paint(turn().className)
    expect(declarations(open)).toContain('--tw-rotate: 90deg')
    expect(declarations(open)).toContain('transition-duration: var(--duration-chev)')
  })

  it('paints the item shell, the header and the body the way §6.4 draws them', async () => {
    const { container } = render(<Accordion items={items} />)
    const list = container.firstElementChild as HTMLElement
    const shell = list.firstElementChild as HTMLElement
    const header = shell.querySelector('button')!

    // `display:flex;flex-direction:column;gap:10px` around the items.
    expect([...declarations(await paint(list.className))].sort()).toEqual([
      'display: flex',
      'flex-direction: column',
      'gap: var(--space-5)',
    ])

    // `border:1px solid #EDE5F5;border-radius:14px;overflow:hidden`
    expect([...declarations(await paint(shell.className))].sort()).toEqual([
      'border-color: var(--border-current)',
      'border-radius: var(--radius-tile)',
      'border-width: 1px',
      'overflow: hidden',
    ])

    // `width:100%;display:flex;align-items:center;gap:12px;padding:14px 16px;
    //  border:0;background:#FBF9FE;cursor:pointer;text-align:start`
    // plus F11's 44px floor, which the design's own 49px header already clears.
    expect([...declarations(await paint(header.className))].sort()).toEqual([
      'align-items: center',
      'background-color: var(--surface-sub)',
      'border-width: 0px',
      'cursor: pointer',
      'display: flex',
      'gap: var(--space-6)',
      'min-height: var(--size-touch)',
      'padding-bottom: var(--space-7)',
      'padding-left: var(--space-8)',
      'padding-right: var(--space-8)',
      'padding-top: var(--space-7)',
      'text-align: start',
      'width: 100%',
    ])

    await userEvent.click(header)
    const body = shell.lastElementChild as HTMLElement
    // `padding:16px;background:#fff`
    expect([...declarations(await paint(body.className))].sort()).toEqual([
      'background-color: var(--card)',
      'padding: var(--space-8)',
    ])
  })

  it('paints the title and the duty-count badge', async () => {
    render(<Accordion items={items} />)
    const h = screen.getByRole('button', { name: /سرآشپز/ })
    const title = screen.getByText('سرآشپز')
    const badge = screen.getByText('۳ وظیفه')
    expect(h.contains(title)).toBe(true)
    expect(h.contains(badge)).toBe(true)

    // `flex:1;font-size:14px;font-weight:700;color:#2A1D5E`
    expect([...declarations(await paint(title.className))].sort()).toEqual([
      'color: var(--ink)',
      'flex: 1 1 0%',
      'font-size: var(--fs-body)',
      'font-weight: var(--fw-bold)',
      'min-width: 0px',
    ])

    // `font-size:11px;font-weight:600;color:#4A25A9;background:#F0E9FB;
    //  padding:3px 10px;border-radius:999px;flex:none` — the 3px normalised to
    // the ladder's 4, the same 1px call ledger P3-4 made for the department
    // card's chips. See the component for why it is not borrowed.
    expect([...declarations(await paint(badge.className))].sort()).toEqual([
      'background-color: var(--tile-v)',
      'border-radius: var(--radius-pill)',
      'color: var(--violet)',
      'flex: none',
      'font-size: var(--fs-xxs)',
      'font-weight: var(--fw-semibold)',
      'padding-bottom: var(--space-1)',
      'padding-left: var(--space-5)',
      'padding-right: var(--space-5)',
      'padding-top: var(--space-1)',
    ])
  })

  it('draws no badge slot at all when an item carries none', () => {
    render(<Accordion items={[{ key: 'a', title: 'سرآشپز', body: <p>بدنه</p> }]} />)
    // Not an empty pill: `badge?` is optional and an empty tinted box beside the
    // title reads as a count of nothing.
    expect(screen.getByRole('button', { name: 'سرآشپز' }).children).toHaveLength(2)
  })
})

describe('Menu', () => {
  it('opens, selects and closes on Escape', async () => {
    const onSelect = vi.fn()
    render(<Menu label="ابزارها" items={[{ id: 'del', label: 'حذف', onSelect }]} />)
    await userEvent.click(screen.getByRole('button', { name: 'ابزارها' }))
    await userEvent.click(screen.getByRole('menuitem', { name: 'حذف' }))
    expect(onSelect).toHaveBeenCalledOnce()

    await userEvent.click(screen.getByRole('button', { name: 'ابزارها' }))
    expect(screen.getByRole('menu')).toBeInTheDocument()
    await userEvent.keyboard('{Escape}')
    expect(screen.queryByRole('menu')).not.toBeInTheDocument()
  })

  it('closes only itself, not an enclosing dialog, on Escape (I7)', async () => {
    const onDialogClose = vi.fn()
    render(
      <Dialog open onClose={onDialogClose} title="پنجره">
        <Menu label="ابزارها" items={[{ id: 'del', label: 'حذف', onSelect: () => {} }]} />
      </Dialog>,
    )
    await userEvent.click(screen.getByRole('button', { name: 'ابزارها' }))
    expect(screen.getByRole('menu')).toBeInTheDocument()
    await userEvent.keyboard('{Escape}')
    expect(screen.queryByRole('menu')).not.toBeInTheDocument()
    expect(onDialogClose).not.toHaveBeenCalled()
  })
})
