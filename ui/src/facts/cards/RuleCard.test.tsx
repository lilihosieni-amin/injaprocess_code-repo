import { describe, it, expect, vi } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { RuleCard, RuleValueCards } from './RuleCard'
import { bundleOf } from './fixture'
import type { FactBundle } from '../../api/types'

/**
 * The rule kind — the constant, the formula, the decision table, «نام تابع»
 * with the owner's «متن اصلی» block under it, the template row, the calls, the
 * inputs/outputs pair and the edge cases.
 *
 * Payloads trimmed from `ui/design/mock/facts/api/entries.json`: `F-00026` (the
 * constant), `F-00030` (the disputed `feel` rule), `F-00032` (a decision table),
 * `F-00036` (a `gs` script with an identifier and edge cases).
 */

/** F-00026 — `inputs: []`, so the header chip calls it «مقدار ثابت». */
const CONSTANT = (over: Partial<FactBundle> = {}) => bundleOf('rule', {
  inputs: [],
  outputs: [{
    key: 'tolerance_g', title: 'تلورانس (گرم)', unit: 'g', unit_title: 'گرم',
    per: 'unit_sold', nature: 'limit', value: 5,
    writes_to: { ref: 'F-00016', field: 'tolerance' },
  }],
}, { resolved: { 'F-00016': { kind: 'record', title: 'گزارش مرکزی — پیتزا' } }, ...over })

/** The same shape with a `null` value — «؟» in `--conflict` (:4842). */
const UNANSWERED = bundleOf('rule', {
  inputs: [],
  outputs: [{ key: 'threshold', title: 'آستانه', unit: 'pcs', value: null, nature: 'limit' }],
})

/** F-00030 — three inputs, an expression, and the «متن اصلی» the owner approved. */
const FORMULA = bundleOf('rule', {
  lang: 'feel',
  expr: 'declared_use = start + received - end',
  original_ref: 'facts/originals/F-00030.txt',
  inputs: [
    { key: 'start', title: 'موجودی اول شب', unit: 'kg', unit_title: 'کیلوگرم',
      from: { ref: 'F-00016', field: 'start_stock' } },
    { key: 'received', title: 'دریافت از انبار', from: 'operator' },
  ],
  outputs: [{ key: 'declared_use', title: 'مصرف اعلامی', unit: 'kg', unit_title: 'کیلوگرم',
    nature: 'observed', share: 0.25, writes_to: { ref: 'F-00016', field: 'declared_use' } }],
  calls: [{ ref: 'F-00031' }],
  template_of: { ref: 'F-00038' },
  divergence: 'drift',
  edge_cases: [{ input: 'start = 0', expected: '0', why: 'شب اول' }],
}, {
  resolved: {
    'F-00016': { kind: 'record', title: 'گزارش مرکزی — پیتزا' },
    'F-00031': { kind: 'rule', title: 'مصرف استاندارد پیتزا' },
    'F-00038': { kind: 'rule', title: 'مصرف اعلامی (ناهارخوران)' },
  },
})

/** F-00032 — a `table` rule; the cells are Persian and the default is a band. */
const TABLE = bundleOf('rule', {
  lang: 'table',
  inputs: [{ key: 'weekday', title: 'روز هفته' }],
  outputs: [{ key: 'coefficient', title: 'ضریب' }],
  table: {
    inputs: ['weekday'], outputs: ['coefficient'], hit: 'first', aggregate: 'sum',
    // `F-00032`'s own rows — the estate stores the SHORT weekday spelling.
    rows: [
      { when: { weekday: 'thu' }, then: { coefficient: 1.2 } },
      { when: { weekday: 'wed' }, then: { coefficient: 1.1 } },
    ],
    default: { coefficient: 1, par: 40 },
  },
})

describe('the rule’s value cards', () => {
  it('draws the constant as one big number with its unit, nature and «به ازای هر»', () => {
    render(<RuleValueCards bundle={CONSTANT()} onOpen={vi.fn()} />)
    expect(screen.getByText('تلورانس (گرم)')).toBeInTheDocument()
    // QF-42 — a value is an LTR island in Latin digits.
    const value = screen.getByText('5')
    expect(value).toHaveAttribute('dir', 'ltr')
    expect(screen.getByText('گرم')).toBeInTheDocument()
    expect(screen.getByText('حد مجاز')).toBeInTheDocument()
    expect(screen.getByText(/به ازای هر/)).toBeInTheDocument()
  })

  it('paints a `null` value «؟» in the conflict ink (:4843)', () => {
    render(<RuleValueCards bundle={UNANSWERED} onOpen={vi.fn()} />)
    const value = screen.getByText('؟')
    expect(value.className).toContain('text-conflict')
  })

  it('draws the formula as an LTR mono island', () => {
    render(<RuleValueCards bundle={FORMULA} onOpen={vi.fn()} />)
    const expr = screen.getByText('declared_use = start + received - end')
    expect(expr).toHaveAttribute('dir', 'ltr')
  })

  it('draws the decision table with Persian heads, its hit rule and its default', () => {
    render(<RuleValueCards bundle={TABLE} onOpen={vi.fn()} />)
    expect(screen.getByText('جدول تصمیم')).toBeInTheDocument()
    expect(screen.getByText('اولین سطر')).toBeInTheDocument()
    expect(screen.getByText('جمع')).toBeInTheDocument()
    const table = screen.getByRole('table', { name: 'جدول تصمیم' })
    // The heads are the rule's own `inputs[].title` / `outputs[].title` — never
    // a `KEY_FA` dictionary (note 2).
    expect(within(table).getByText('روز هفته')).toBeInTheDocument()
    expect(within(table).getByText('ضریب')).toBeInTheDocument()
    expect(screen.getByText('در غیر این صورت')).toBeInTheDocument()
  })

  it('writes a weekday cell in Persian — the store holds «thu», the screen shows «پنجشنبه»', () => {
    render(<RuleValueCards bundle={TABLE} onOpen={vi.fn()} />)
    const table = screen.getByRole('table', { name: 'جدول تصمیم' })
    // `WD_FA` (`Inja Panel.dc.html:4691`), which note 9 moves into
    // `factsLabels.ts`. Without it a Persian-only screen ships «thu».
    expect(within(table).getByText('پنجشنبه')).toBeInTheDocument()
    expect(within(table).getByText('چهارشنبه')).toBeInTheDocument()
    expect(table).not.toHaveTextContent('thu')
    expect(table).not.toHaveTextContent('wed')
    // …and a number is untouched: it is an LTR island in Latin digits (QF-42).
    expect(within(table).getByText('1.2')).toHaveAttribute('dir', 'ltr')
  })

  it('joins the default band with the design’s own separator (:4862)', () => {
    render(<RuleValueCards bundle={TABLE} onOpen={vi.fn()} />)
    expect(screen.getByText('coefficient = 1، par = 40')).toBeInTheDocument()
  })
})

describe('the rule card', () => {
  it('keeps «متن اصلی» collapsed and closed until it is asked for', async () => {
    const user = userEvent.setup()
    render(<RuleCard bundle={FORMULA} onOpen={vi.fn()} />)
    const disclosure = screen.getByRole('button', { name: 'متن اصلی' })
    expect(disclosure).toHaveAttribute('aria-expanded', 'false')
    expect(screen.queryByText('facts/originals/F-00030.txt')).toBeNull()
    await user.click(disclosure)
    expect(disclosure).toHaveAttribute('aria-expanded', 'true')
    expect(screen.getByText('facts/originals/F-00030.txt')).toBeInTheDocument()
  })

  it('draws the inputs and outputs from the served titles, with their unit titles', () => {
    render(<RuleCard bundle={FORMULA} onOpen={vi.fn()} />)
    expect(screen.getByText('چه چیزهایی لازم دارد')).toBeInTheDocument()
    expect(screen.getByText('چه چیزی می‌سازد')).toBeInTheDocument()
    expect(screen.getByText('موجودی اول شب')).toBeInTheDocument()
    // `from: 'operator'` is one of the two string literals, not a `{ref}`.
    expect(screen.getByText('انتخاب اپراتور')).toBeInTheDocument()
    // The share is a percentage of the input (:1318).
    expect(screen.getByText(/۲۵٪/)).toBeInTheDocument()
  })

  it('opens a `{ref}` edge through the id the bundle resolved', async () => {
    const user = userEvent.setup()
    const onOpen = vi.fn()
    render(<RuleCard bundle={FORMULA} onOpen={onOpen} />)
    await user.click(screen.getAllByRole('button', { name: 'گزارش مرکزی — پیتزا' })[0])
    expect(onOpen).toHaveBeenCalledWith('F-00016')
  })

  it('colours a drifted template row `--conflict` and names the template', () => {
    render(<RuleCard bundle={FORMULA} onOpen={vi.fn()} />)
    const divergence = screen.getByText('انحراف از الگو')
    expect(divergence.className).toContain('text-conflict')
    expect(screen.getByRole('button', { name: 'مصرف اعلامی (ناهارخوران)' })).toBeInTheDocument()
  })

  it('draws the calls as chips and the edge cases as a table', () => {
    render(<RuleCard bundle={FORMULA} onOpen={vi.fn()} />)
    expect(screen.getByText('فراخوانی‌ها')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /مصرف استاندارد پیتزا/ })).toBeInTheDocument()
    const edges = screen.getByRole('table', { name: 'موارد خاص' })
    expect(within(edges).getByText('شب اول')).toBeInTheDocument()
  })

  it('draws nothing for a kind that is not a rule', () => {
    const { container } = render(
      <RuleCard bundle={bundleOf('note', {})} onOpen={vi.fn()} />,
    )
    expect(container).toBeEmptyDOMElement()
  })
})
