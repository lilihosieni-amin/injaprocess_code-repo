import { describe, it, expect, vi } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import { RecordCard } from './RecordCard'
import { bundleOf } from './fixture'
import type { FactBundle } from '../../api/types'

/**
 * The record kind — and the three conformance notes that land on it.
 *
 * The payloads are trimmed out of `ui/design/mock/facts/api/entries.json`:
 * `F-00011`, the paper form whose four numeric columns carry `unit: null` and
 * whose `row_no` carries no `unit` key at all, and `F-00014`, the BOM whose
 * `refItems` cells hold item keys and whose `grams` column is red twice over.
 */

/** F-00011 — `medium: paper`, `role: log`; rows are printed items, not data.
 *  `fields` is overridable for the one test that needs `F-00012`'s `unit`-keyed
 *  column, which is what `hasGrid` is about. */
const PAPER = (
  over: Partial<FactBundle> = {}, fields?: Record<string, unknown>[],
): FactBundle => bundleOf('record', {
  medium: 'paper', role: 'log',
  location: { path: 'departments/cooking/attachments/photo_2026-08-29_14-23-51.jpg' },
  grain: 'هر ردیف یک قلم، هر برگ یک شیفت',
  cadence: 'nightly',
  blank_master: true,
  day_boundary: '01:15',
  approved_by: 'انبار دار',
  header_fields: [{ key: 'date', title: 'تاریخ' }],
  signatures: [{ role: 'مسئول واحد', row_range: '1-5' }],
  primaryKey: ['date', 'item'],
  fields: fields ?? [
    // No `unit` key at all — "not applicable", and NOT red (note 3).
    { key: 'row_no', title: 'ردیف', type: 'integer' },
    // Present and `null` — «بی‌پاسخ», and red (note 3).
    { key: 'start_stock', title: 'مانده اول شب', type: 'number', unit: null, filled_by: 'مسئول واحد' },
  ],
  rows: [
    { key: 'burger', title: 'برگر' },
    { key: 'bacon', title: 'بیکن ورقه ای', retired: true },
    // `F-00012`'s `staff_sugar`, verbatim: a long-form weekday, and a `unit`
    // with no `unit_raw` beside it.
    { key: 'staff_sugar', title: 'قند پرسنلی', unit: 'pack', when: 'thursday' },
  ],
}, {
  red_paths: { unknown: ['data/fields/start_stock/unit'], disputed: [] },
  row_titles: { burger: 'برگر', bacon: 'بیکن ورقه ای' },
  ...over,
})

/** F-00014 — `role: reference`; the rows carry cells, so this one is a grid. */
const BOM = (over: Partial<FactBundle> = {}): FactBundle => bundleOf('record', {
  medium: 'sheet', role: 'reference',
  location: { spreadsheetId: '15M2ovUmQ7kX3nR9pLwT2aB8cD4eF6gH1', sheet: 'پیتزا ایتالیایی' },
  grain: 'هر ردیف یک (محصول، ماده)',
  primaryKey: ['product', 'ingredient'],
  fields: [
    { key: 'ingredient', title: 'ماده اولیه', type: 'string', refItems: { namespace: '##' } },
    { key: 'grams', title: 'گرم', type: 'number', unit: 'g' },
  ],
  rows: [
    { key: 'prod_61__ing_1', ingredient: 'ing_1', grams: 250 },
    { key: 'prod_61__ing_41', ingredient: 'ing_41', grams: null },
  ],
}, {
  red_paths: {
    unknown: ['data/rows/prod_61__ing_41/grams'],
    disputed: ['data/rows/prod_61__ing_1/grams'],
  },
  row_titles: {
    prod_61__ing_1: 'اینجا پیتزا — پنیر پیتزا',
    prod_61__ing_41: 'اینجا پیتزا — قارچ',
  },
  resolved: {
    ing_1: { kind: 'item', title: 'پنیر پیتزا', code: '##1' },
    ing_41: { kind: 'item', title: 'قارچ', code: '##41' },
  },
  ...over,
})

const draw = (bundle: FactBundle) =>
  render(<RecordCard bundle={bundle} onOpen={vi.fn()} />)

describe('the record card', () => {
  it('paints «واحد ثبت نشده» on a present-and-null unit and NOT on an omitted one', () => {
    draw(PAPER())
    // `start_stock` carries `unit: null` and is in `red_paths.unknown`.
    const missing = screen.getByText('واحد ثبت نشده')
    expect(missing).toBeInTheDocument()
    // `row_no` is an integer column with no `unit` key. The design paints it red
    // too (`sfRecFields`, :4978), which is exactly what note 3 corrects: an
    // omitted unit is "not applicable". There is one red pill on this card.
    expect(screen.getAllByText('واحد ثبت نشده')).toHaveLength(1)
  })

  it('reads red from `red_paths` and never from the payload', () => {
    // The same entry with the path withdrawn: the column still has `unit: null`
    // and the pill is gone, because the server decides and this screen asks.
    draw(PAPER({ red_paths: { unknown: [], disputed: [] } }))
    expect(screen.queryByText('واحد ثبت نشده')).toBeNull()
  })

  it('shows a refItems cell as its resolved title, with the key as the tooltip', () => {
    draw(BOM())
    const cell = screen.getByTitle('ing_1')
    expect(cell).toHaveTextContent('پنیر پیتزا ##1')
    // The stored key is a tooltip and never the cell's own text (note 2).
    expect(cell.textContent).not.toContain('ing_1')
  })

  it('colours a disputed cell and an unknown cell differently', () => {
    draw(BOM())
    const grid = screen.getByRole('table', { name: /ردیف/ })
    const rows = within(grid).getAllByRole('row')
    // Head, then one row per data row; two cells each, because `primaryKey`
    // composes the row key and the key column is therefore not drawn.
    const disputed = within(rows[1]).getAllByRole('cell')[1]
    const unknown = within(rows[2]).getAllByRole('cell')[1]
    expect(disputed.className).toContain('bg-tile-c')
    expect(unknown.className).toContain('bg-tile-warn')
  })

  it('hides the row-key column when `primaryKey` composes it', () => {
    draw(BOM())
    expect(screen.queryByText('کلید ردیف')).toBeNull()
  })

  it('draws the printed-rows card for a form whose rows carry no cells', () => {
    draw(PAPER())
    expect(screen.getByText('قلم‌های چاپ‌شده روی فرم')).toBeInTheDocument()
    expect(screen.getByText('برگر')).toBeInTheDocument()
    // A retired printed row says so (:1413).
    expect(screen.getByText('دیگر استفاده نمی‌شود')).toBeInTheDocument()
  })

  it('keeps the spreadsheet id out of the «محل» row — note 6', () => {
    draw(BOM())
    const location = screen.getByText('محل').parentElement!
    expect(location).toHaveTextContent('پیتزا ایتالیایی')
    expect(location.textContent).not.toContain('15M2ovUmQ7kX3nR9pLwT2aB8cD4eF6gH1')
  })

  it('writes a printed row’s day in Persian — «thursday» is not a Persian word', () => {
    draw(PAPER())
    // The design's inline `WD` (`Inja Panel.dc.html:4928`), which note 9 moves
    // into `factsLabels.ts` beside the decision table's short spelling.
    expect(screen.getByText('فقط پنجشنبه‌ها پر می‌شود')).toBeInTheDocument()
    expect(screen.queryByText(/thursday/)).toBeNull()
  })

  it('draws a printed row’s unit once when the source wrote no word for it', () => {
    draw(PAPER())
    // `unit: 'pack'` with no `unit_raw`: the phrase and the symbol are the same
    // string, and the design draws both (:1420-1421). One is enough.
    expect(screen.getAllByText('pack')).toHaveLength(1)
  })

  it('reads a paper form with a column keyed `unit` as a form, not a grid', () => {
    // **A deliberate divergence from `recHasGrid` (:4667), and `F-00012` is the
    // entry it is about.** Its columns include one keyed `unit` and its printed
    // rows each carry a bookkeeping `unit`; the design's `recFieldKeys` disjunct
    // fires on that coincidence of names and turns the form into a grid of
    // mostly-«؟» cells, suppressing the printed-rows card entirely.
    draw(PAPER({}, [
      { key: 'item', title: 'نام کالا', type: 'string' },
      { key: 'unit', title: 'واحد', type: 'string' },
    ]))
    expect(screen.getByText('قلم‌های چاپ‌شده روی فرم')).toBeInTheDocument()
    expect(screen.queryByRole('table', { name: /ردیف/ })).toBeNull()
  })

  it('says which rows a signature covers without a latin range operator', () => {
    draw(PAPER())
    expect(screen.getByText('ردیف ۱ تا ۵ را امضا می‌کند')).toBeInTheDocument()
  })

  it('draws the scheme’s «قالب» beside the location — `sfRecLocExtra`’s surviving half', () => {
    draw(bundleOf('record', {
      medium: 'external', role: 'log',
      location: { identifier_scheme: { authority: 'Sepidz', format: 'receipt number' } },
    }))
    const location = screen.getByText('محل').parentElement!
    expect(location).toHaveTextContent('Sepidz')
    expect(location).toHaveTextContent('قالب receipt number')
  })

  it('draws the structure card’s rows from the served payload', () => {
    draw(PAPER())
    expect(screen.getByText('ساختار و مکان جدول')).toBeInTheDocument()
    expect(screen.getByText('هر ردیف یک قلم، هر برگ یک شیفت')).toBeInTheDocument()
    expect(screen.getByText('هر شب')).toBeInTheDocument()
    expect(screen.getByText('انبار دار')).toBeInTheDocument()
    expect(screen.getByText('برگهٔ خالی برای پر کردن')).toBeInTheDocument()
  })
})
