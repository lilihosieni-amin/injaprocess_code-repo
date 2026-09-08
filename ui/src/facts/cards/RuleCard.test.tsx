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

/** The same shape with a `null` value — «؟» in `--conflict` (:4845-4846). */
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

/** One rule across two branches and two columns — QF-47's whole point: sixty
 *  bindings are one entry, and the tolerance that differs per binding is a
 *  parameter, not a second rule. */
const BOUND = bundleOf('rule', {
  inputs: [{ key: 'tolerance_gr', title: 'تلورانس', from: { param: 'tolerancePerFoodGr' } }],
  outputs: [{ key: 'enheraf', title: 'انحراف' }],
  expr: 'enheraf = masraf_vaqei - tolerance_gr',
  applies_to: [
    { key: 'pitza__s0__j__r6', record: { ref: 'F-00300', field: 'c_j' },
      variant: 0, range: 'J6:J15',
      params: { tolerancePerFoodGr: 5, table_1: { ref: 'F-00300' } } },
    { key: 'farangi__s0__j__r6', record: { ref: 'F-00301', field: 'c_j' },
      variant: 0, range: 'J6:J14', params: { tolerancePerKilogramGr: 140 } },
  ],
}, {
  resolved: {
    'F-00300': { kind: 'record', title: 'گزارش شبانه پیتزا' },
    'F-00301': { kind: 'record', title: 'گزارش شبانه فرنگی' },
  },
  binding_labels: {
    pitza__s0__j__r6: { workbook: 'Gozaresh markazi', sheet: 'پیتزا', branch: 'چاله‌باغ' },
    farangi__s0__j__r6: { workbook: 'Gozaresh naharkhoran', sheet: 'فرنگی', branch: 'ناهارخوران' },
  },
})

/** The same binding shape, read from the input's side — QF-47's parameter is a
 *  name until the first binding says what it stands for (§3.7). */
const PARAMS = bundleOf('rule', {
  inputs: [
    { key: 'stock', title: 'موجودی', from: { param: 'ref_1' } },
    { key: 'tolerance_gr', title: 'تلورانس', from: { param: 'ref_2' } },
    { key: 'spare', title: 'یدکی', from: { param: 'ref_9' } },
  ],
  outputs: [{ key: 'enheraf', title: 'انحراف' }],
  applies_to: [
    { key: 'pitza__s0__j__r6', record: { ref: 'F-00300', field: 'c_j' }, range: 'J6:J15',
      params: { ref_1: { ref: 'F-00149', field: 'daryaft_az_anbar' }, ref_2: 75 } },
  ],
}, {
  resolved: {
    'F-00300': { kind: 'record', title: 'گزارش شبانه پیتزا' },
    'F-00149': { kind: 'record', title: 'کاردکس انبار',
      fields: { daryaft_az_anbar: 'دریافت از انبار' } },
  },
})

/** An input row, by the `title` the card puts the key on (`InputRow`). */
const inputRow = (container: HTMLElement, key: string) =>
  container.querySelector(`[title="${key}"]`)!.parentElement as HTMLElement

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
    // :4847 — `keyFa(o.per)` with `KEY_FA` deleted by note 2 leaves the stored
    // key, and a key is an island like every other key on this screen.
    const basis = screen.getByText('unit_sold')
    expect(basis).toHaveAttribute('dir', 'ltr')
  })

  it('paints a `null` value «؟» in the conflict ink (:4846)', () => {
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

  it('shows the served file’s text, in a box that scrolls rather than grows', async () => {
    // **Owner request, 2026-09-06:** «in section متن اصلی i want to show the
    // file data there. th box wit fix hight and scollable».
    //
    // Until the route served it there was nothing to show: QF-31 moves a
    // delta's verbatim `data.original` into `facts/originals/` and leaves an
    // `original_ref` behind, so every entry in a real store carries the path
    // and none carries the text. The panel drew the path — the name of a file
    // and none of its contents.
    const user = userEvent.setup()
    const text = '=MINUS(SUM(F6,E6),G6)\n=IF(H6>0, H6*I6, 0)'
    const { container } = render(
      <RuleCard bundle={{ ...FORMULA, original: text }} onOpen={vi.fn()} />)
    await user.click(screen.getByRole('button', { name: 'متن اصلی' }))

    // A cap and a scroller, not a card that grows to whatever the file is —
    // `--height-popover` is this app's existing scroll cap. Queried by that
    // class rather than a `data-testid`, because the box is a `Mono` and
    // widening its props to carry one would be production API for a test.
    const box = container.querySelector('.max-h-popover')
    expect(box).toHaveTextContent('=MINUS(SUM(F6,E6),G6)')
    expect(box!.className).toContain('overflow-auto')
    // The path stays under it: the text answers "what does it say", the path
    // answers "which file", and the reviewer is owed both.
    expect(screen.getByText('facts/originals/F-00030.txt')).toBeInTheDocument()
  })

  it('draws the path alone when the file behind it could not be read', async () => {
    // `original: null` is an entry with no original AND an `original_ref` that
    // names nothing readable — the route does not distinguish them, and neither
    // does this. What must not happen is an empty box implying an empty file.
    const user = userEvent.setup()
    const { container } = render(<RuleCard bundle={FORMULA} onOpen={vi.fn()} />)
    await user.click(screen.getByRole('button', { name: 'متن اصلی' }))
    expect(container.querySelector('.max-h-popover')).toBeNull()
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

  it('draws «محل اجرا» — one row per binding, with its numeric parameters', () => {
    render(<RuleCard bundle={BOUND} onOpen={vi.fn()} />)
    const table = screen.getByRole('table', { name: 'محل اجرا' })
    expect(within(table).getByText('Gozaresh markazi')).toBeInTheDocument()
    expect(within(table).getByText('پیتزا')).toBeInTheDocument()
    expect(within(table).getByText('چاله‌باغ')).toBeInTheDocument()
    expect(within(table).getByText('J6:J15')).toBeInTheDocument()
    // That column shows `range` — an A1 span, not a count of rows, so «ردیف‌ها»
    // named a column it does not draw.
    expect(within(table).getByText('محدوده')).toBeInTheDocument()
    expect(within(table).queryByText('ردیف‌ها')).toBeNull()
    // A number is an LTR island beside its parameter name (QF-42).
    expect(within(table).getByText(/tolerancePerFoodGr/)).toHaveAttribute('dir', 'ltr')
    expect(within(table).getByText(/140/)).toBeInTheDocument()
  })

  it('renders a `{ref}` parameter as the record’s Persian title, never a table name', () => {
    // §2.5 — `gate-b.md` renders a ref-valued parameter as the referenced
    // record's title or omits it, and the panel keeps the same rule: a
    // `Table_*` string is exactly what the style card refuses to show a reader.
    render(<RuleCard bundle={BOUND} onOpen={vi.fn()} />)
    const table = screen.getByRole('table', { name: 'محل اجرا' })
    expect(within(table).getByText(/گزارش شبانه پیتزا/)).toBeInTheDocument()
    expect(within(table).queryByText(/table_1/)).toBeNull()
  })

  it('names the column a parameter reads, through the first binding (§3.7)', async () => {
    const user = userEvent.setup()
    const onOpen = vi.fn()
    const { container } = render(<RuleCard bundle={PARAMS} onOpen={onOpen} />)
    const row = inputRow(container, 'stock')
    // The binding maps `ref_1` to a `{ref, field}`, so the row reads exactly as
    // a direct edge does — the record's own title, and it opens.
    expect(within(row).queryByText('ref_1')).toBeNull()
    await user.click(
      within(row).getByRole('button', { name: 'کاردکس انبار — دریافت از انبار' }))
    expect(onOpen).toHaveBeenCalledWith('F-00149')
  })

  it('writes a numeric parameter as «name = value»', () => {
    const { container } = render(<RuleCard bundle={PARAMS} onOpen={vi.fn()} />)
    expect(within(inputRow(container, 'tolerance_gr')).getByText('ref_2 = 75'))
      .toBeInTheDocument()
  })

  it('keeps the raw name for a parameter no binding maps', () => {
    const { container } = render(<RuleCard bundle={PARAMS} onOpen={vi.fn()} />)
    expect(within(inputRow(container, 'spare')).getByText('ref_9')).toBeInTheDocument()
  })

  it('draws no «محل اجرا» for a rule that is bound to nothing', () => {
    render(<RuleCard bundle={FORMULA} onOpen={vi.fn()} />)
    expect(screen.queryByRole('table', { name: 'محل اجرا' })).toBeNull()
  })
})
