import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { SearchField } from './SearchField'
import { Tabs } from './Tabs'
import { Accordion } from './Accordion'
import { Menu } from './Menu'
import { Dialog } from './Overlay'

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

describe('Tabs', () => {
  const items = [{ id: 'a', label: 'همه' }, { id: 'b', label: 'باز' }]
  it('exposes a tablist with the active tab selected', () => {
    render(<Tabs items={items} value="a" onChange={() => {}} />)
    expect(screen.getByRole('tablist')).toBeInTheDocument()
    expect(screen.getByRole('tab', { name: 'همه' })).toHaveAttribute('aria-selected', 'true')
    expect(screen.getByRole('tab', { name: 'باز' })).toHaveAttribute('aria-selected', 'false')
  })
  it('reports a change', async () => {
    const onChange = vi.fn()
    render(<Tabs items={items} value="a" onChange={onChange} />)
    await userEvent.click(screen.getByRole('tab', { name: 'باز' }))
    expect(onChange).toHaveBeenCalledWith('b')
  })
})

describe('Accordion', () => {
  it('uses a button header with aria-expanded', async () => {
    render(<Accordion title="سرپرست سالن"><p>محتوا</p></Accordion>)
    const header = screen.getByRole('button', { name: 'سرپرست سالن' })
    expect(header).toHaveAttribute('aria-expanded', 'false')
    // A closed accordion must not just say it's closed — the panel content
    // itself must be absent, or a panel that always renders would still pass.
    expect(screen.queryByText('محتوا')).not.toBeInTheDocument()
    await userEvent.click(header)
    expect(header).toHaveAttribute('aria-expanded', 'true')
    expect(screen.getByText('محتوا')).toBeInTheDocument()
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
