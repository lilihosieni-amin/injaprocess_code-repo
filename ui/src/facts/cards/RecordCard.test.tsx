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
  over: Partial<FactBundle> = {},
  fields?: Record<string, unknown>[],
  rows?: Record<string, unknown>[],
): FactBundle => bundleOf('record', {
  medium: 'paper', role: 'log',
  // §3.3 — `medium: paper` closes `location` to where the forms are kept and
  // who holds them; a path is a sheet's shape, and the schema now refuses it.
  location: { kept_at: 'زونکن دفتر آشپزخانه', holder: 'سرآشپز' },
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
  rows: rows ?? [
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

/**
 * F-00017 — «واحدها», the units record. `hasGrid` reads it as a grid, and its
 * `dimension` column is the entry that proves the record grid needs `enumFa`
 * too: seven English words, on a Persian-only screen.
 */
const UNITS = bundleOf('record', {
  medium: 'native', role: 'config', location: {},
  fields: [
    { key: 'symbol', title: 'نماد', type: 'string' },
    { key: 'dimension', title: 'بُعد', type: 'string' },
    { key: 'unit_title', title: 'عنوان', type: 'string' },
  ],
  rows: [
    { key: 'g', symbol: 'g', dimension: 'mass', unit_title: 'گرم' },
    { key: 'ml', symbol: 'ml', dimension: 'volume', unit_title: 'میلی‌لیتر' },
    { key: 'carton', symbol: 'carton', dimension: 'pack', unit_title: 'کارتن' },
    { key: 'percent', symbol: 'percent', dimension: 'dimensionless', unit_title: 'درصد' },
  ],
})

/** A report template that sits in two workbooks and pulls one table in —
 *  QF-47's `instances[]` and QF-48's import edge, in one entry. */
const TEMPLATE = (over: Partial<FactBundle> = {}): FactBundle => bundleOf('record', {
  medium: 'sheet', role: 'report', location: {},
  fields: [{ key: 'c_j', title: 'انحراف', type: 'number', unit: 'kg' }],
  instances: [
    { key: 'gozaresh_markazi__s0', spreadsheetId: 'ID_CB', sheetId: 0,
      sheet: 'پیتزا', branch: 'chalebagh', hidden: false,
      imports: [{ key: 'im_1', source: { ref: 'F-00400' }, range: 'A:X' }] },
    { key: 'gozaresh_naharkhoran__s0', spreadsheetId: 'ID_NK', sheetId: 0,
      sheet: 'پیتزا', branch: 'naharkhoran', hidden: true,
      imports: [{ key: 'im_2', source: { spreadsheetId: 'ID_SRC', sheet: 'singlePizza' },
                  range: 'A:V' }] },
  ],
}, {
  resolved: { 'F-00400': { kind: 'record', title: 'دستور پیتزا تکی' } },
  workbook_titles: { ID_CB: 'Gozaresh markazi', ID_NK: 'Gozaresh naharkhoran',
                     ID_SRC: 'Mavade Avalie' },
  binding_labels: {
    gozaresh_markazi__s0: { workbook: 'Gozaresh markazi', sheet: 'پیتزا', branch: 'چاله‌باغ' },
    gozaresh_naharkhoran__s0: { workbook: 'Gozaresh naharkhoran', sheet: 'پیتزا',
                                branch: 'ناهارخوران' },
  },
  ...over,
}, {
  issues: [{ kind: 'column_shift', instance: 'gozaresh_naharkhoran__s0',
             description: 'ستون «مصرف واقعی» در این نسخه جا افتاده است.',
             affects: [{ ref: 'F-00014' }] }],
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
    // A retired printed row says so (:1412).
    expect(screen.getByText('دیگر استفاده نمی‌شود')).toBeInTheDocument()
  })

  it('keeps the spreadsheet id out of the «محل» row — note 6', () => {
    draw(BOM())
    const location = screen.getByText('محل').parentElement!
    expect(location).toHaveTextContent('پیتزا ایتالیایی')
    expect(location.textContent).not.toContain('15M2ovUmQ7kX3nR9pLwT2aB8cD4eF6gH1')
  })

  it('writes a grid cell’s enumerated value in Persian — `enumFa`’s second site', () => {
    draw(UNITS)
    const grid = screen.getByRole('table', { name: /ردیف/ })
    // :4912 — the design runs every non-numeric grid cell through `enumFa`, and
    // the units record is what that is for.
    for (const word of ['جرم', 'حجم', 'بسته', 'بی‌بعد']) {
      expect(within(grid).getByText(word), word).toBeInTheDocument()
    }
    for (const english of ['mass', 'volume', 'dimensionless']) {
      expect(grid, english).not.toHaveTextContent(english)
    }
  })

  it('writes a column’s allowed values in the same Persian its cells take', () => {
    // The fourth place a stored enumeration reaches this screen, found by the
    // sweep rather than by a finding: `F-00017`'s `dimension` column DECLARES
    // the seven words its cells hold. Nothing serves it today — that record has
    // cells, so it is drawn as a grid and never as a columns table — which is
    // why the class is pinned here instead of being left to a fourth round.
    draw(PAPER({}, [
      { key: 'dimension', title: 'بُعد', type: 'string',
        constraints: { enum: ['mass', 'volume'] } },
    ]))
    expect(screen.getByText(/مقادیر مجاز/)).toHaveTextContent('جرم · حجم')
  })

  it('keeps the stored value as a translated cell’s tooltip', () => {
    draw(UNITS)
    // :4914 — `title: (!isId && enumFa(raw) !== raw) ? raw : ''`. «بسته» has to
    // be able to say `pack`; a cell the maps do not touch carries no tooltip,
    // because its own text already IS the stored value.
    expect(screen.getByTitle('pack')).toHaveTextContent('بسته')
    expect(screen.getByTitle('mass')).toHaveTextContent('جرم')
    expect(screen.queryByTitle('گرم')).toBeNull()
  })

  it('leaves an id-shaped column latin — a symbol is a code, not a word', () => {
    draw(UNITS)
    // :4909 — `symbol`, `key`, `code` and `id` are machine identifiers, and
    // QF-42 makes them LTR islands. `pack` in a `dimension` cell is «بسته»;
    // `carton` in a `symbol` cell stays `carton`.
    // Twice: the row-key column (`primaryKey` is empty here, so it is drawn)
    // and the `symbol` cell. Both are islands, which is the assertion.
    const drawn = screen.getAllByText('carton')
    expect(drawn).toHaveLength(2)
    for (const el of drawn) expect(el).toHaveAttribute('dir', 'ltr')
  })

  it('writes a printed row’s day in Persian — «thursday» is not a Persian word', () => {
    draw(PAPER())
    // The design's inline `WD` (`Inja Panel.dc.html:4928`), which note 9 moves
    // into `factsLabels.ts` beside the decision table's short spelling.
    expect(screen.getByText('فقط پنجشنبه‌ها پر می‌شود')).toBeInTheDocument()
    expect(screen.queryByText(/thursday/)).toBeNull()
  })

  it('draws a printed row’s unit once, and as an island when it is only a symbol', () => {
    draw(PAPER())
    // `unit: 'pack'` with no `unit_raw` — the one row in the whole mock in that
    // state. The design writes `unit_raw || UNIT_FA[unit] || unit` (:4934) and
    // note 9 deletes the middle; with no served `unit_title` on a ROW, the
    // symbol is a code and is drawn as one rather than as Persian prose.
    const symbol = screen.getAllByText('pack')
    expect(symbol).toHaveLength(1)
    expect(symbol[0]).toHaveAttribute('dir', 'ltr')
  })

  it('draws a printed row’s unit as the units record’s word once the bundle serves it', () => {
    // The same `staff_sugar` row, with `unit_titles` served: the phrase is
    // «بسته» and the symbol survives as the design's mono hint (:1420).
    draw(PAPER({ unit_titles: { pack: 'بسته' } }))
    expect(screen.getByText('بسته')).toBeInTheDocument()
    const hint = screen.getByText('pack')
    expect(hint).toHaveAttribute('dir', 'ltr')
    expect(hint.className).toContain('text-fs-micro')
  })

  it('heads a grid column with the units record’s word, not the symbol', () => {
    draw(BOM({ unit_titles: { g: 'گرم' } }))
    // `grams` is titled «گرم» and its unit is `g` → «گرم · گرم» would be the
    // title twice; the head keeps the title and draws the served word beside
    // it only where the two differ — so the symbol never appears.
    expect(screen.queryByText('g')).toBeNull()
  })

  it('draws the source’s own word for a unit AND the design’s raw-symbol hint beside it', () => {
    // `F-00012`'s `burger_box`, verbatim. The design draws two nodes (:1419-1420)
    // — the phrase, then the stored symbol as a 10.5px mono LTR hint — and the
    // hint is unconditional there. An earlier round deleted it by borrowing the
    // COLUMNS table's «never both» rule (:4981 → :1393), which belongs to that
    // one-node cell and not to this row.
    draw(PAPER({}, undefined, [
      { key: 'burger_box', title: 'جعبه برگر', unit: 'carton', unit_raw: 'کارتن ۱۰۰تایی' },
    ]))
    expect(screen.getByText('کارتن ۱۰۰تایی')).toBeInTheDocument()
    const hint = screen.getByText('carton')
    expect(hint).toHaveAttribute('dir', 'ltr')
    expect(hint.className).toContain('text-fs-micro')
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
    // …and both stored values are islands rather than English inside Persian
    // prose. `F-00018` (the Sepidz till) drew «قالب receipt number» as one text
    // node — the same defect the item's pack and the constant's `per` carried.
    expect(within(location).getByText('Sepidz')).toHaveAttribute('dir', 'ltr')
    expect(within(location).getByText('receipt number')).toHaveAttribute('dir', 'ltr')
  })

  it('writes the day boundary in Persian digits, as the signature row does', () => {
    draw(PAPER())
    // The design disagrees with itself — `sfRecBoundary` (:4957) is raw and
    // `sfRecSigs.range` (:4943) is `toFa`. A number inside a Persian sentence is
    // prose on this screen, so both are Persian digits and neither is an island.
    expect(screen.getByText(/روز کاری/)).toHaveTextContent('۰۱:۱۵')
    expect(screen.queryByText(/01:15/)).toBeNull()
  })

  it('draws the structure card’s rows from the served payload', () => {
    draw(PAPER())
    expect(screen.getByText('ساختار و مکان جدول')).toBeInTheDocument()
    expect(screen.getByText('هر ردیف یک قلم، هر برگ یک شیفت')).toBeInTheDocument()
    expect(screen.getByText('هر شب')).toBeInTheDocument()
    expect(screen.getByText('انبار دار')).toBeInTheDocument()
    expect(screen.getByText('برگهٔ خالی برای پر کردن')).toBeInTheDocument()
  })

  it('draws a foreign key that carries both of its sides', () => {
    // The other half of the guard: dropping the malformed ones must not drop
    // the shape the spec defines. `role: reference` is where it is expressible
    // at all — a mirror has no `fields[]` to join on.
    draw(bundleOf('record', {
      medium: 'sheet', role: 'reference', location: {},
      fields: [{ key: 'ingredient', title: 'ماده اولیه', type: 'string' }],
      foreignKeys: [{
        fields: ['ingredient'],
        reference: { ref: 'F-00007' },
        reference_fields: ['key'],
      }],
    }, { resolved: { 'F-00007': { kind: 'record', title: 'فهرست مواد اولیه' } } }))
    // Scoped to the block: `ingredient` is also a column of the grid above it.
    const fks = screen.getByText('ارتباط با جدول دیگر').parentElement!
    expect(fks).toHaveTextContent('ingredient')
    expect(fks).toHaveTextContent('فهرست مواد اولیه')
    expect(fks).toHaveTextContent('key')
  })

  it('lists «نسخه‌ها» in place of the single location line', () => {
    draw(TEMPLATE())
    expect(screen.getByText('نسخه‌ها')).toBeInTheDocument()
    expect(screen.queryByText('محل')).toBeNull()
    expect(screen.getByText('Gozaresh markazi')).toBeInTheDocument()
    expect(screen.getByText('Gozaresh naharkhoran')).toBeInTheDocument()
    expect(screen.getByText('ناهارخوران')).toBeInTheDocument()
    // The hidden tab says so; the visible one draws no marker.
    expect(screen.getAllByText('مخفی')).toHaveLength(1)
  })

  it('draws «—» for an instance whose workbook title came back empty', () => {
    // `??` lets an empty string through, and the cell went blank — the reader
    // cannot tell "no title" from "nothing drawn here". The falsy test is the
    // one «محل اجرا» makes on the same label.
    draw(TEMPLATE({ binding_labels: {
      gozaresh_markazi__s0: { workbook: '', sheet: 'پیتزا', branch: 'چاله‌باغ' },
      gozaresh_naharkhoran__s0: { workbook: 'Gozaresh naharkhoran',
                                  sheet: 'پیتزا', branch: 'ناهارخوران' },
    } }))
    const versions = screen.getByText('نسخه‌ها').parentElement!
    expect(versions).toHaveTextContent('—')
  })

  it('keeps the single location line for a record with no instances', () => {
    // A paper form and an external table have a `location` and no `instances[]`,
    // and that row is the only thing that says where they are — «نگهداری» for
    // the paper form, since §3.3 leaves it no locator to put under «محل».
    draw(PAPER())
    expect(screen.getByText('نگهداری')).toBeInTheDocument()
    expect(screen.queryByText('نسخه‌ها')).toBeNull()
  })

  it('draws «ورودی از» under the instance that pulls the table in', () => {
    draw(TEMPLATE())
    const imports = screen.getAllByText('ورودی از')
    expect(imports).toHaveLength(2)
    // A `{ref}` source is the record's Persian title, and a link.
    expect(screen.getByRole('button', { name: /دستور پیتزا تکی/ })).toBeInTheDocument()
    // A locator source is the workbook's title and its tab — never a drive id.
    expect(screen.getByText(/Mavade Avalie/)).toBeInTheDocument()
    expect(screen.getByText(/singlePizza/)).toBeInTheDocument()
    expect(screen.queryByText('ID_SRC')).toBeNull()
    expect(screen.getByText('A:V')).toBeInTheDocument()
  })

  it('hangs a column_shift issue on the instance it names', () => {
    draw(TEMPLATE())
    expect(screen.getByText('ستون «مصرف واقعی» در این نسخه جا افتاده است.'))
      .toBeInTheDocument()
  })

  /** §3.3 — a paper form's closed `location`: where the forms are kept and who
   *  holds them. The 2026-09-07 run wrote two of these with no `location` at
   *  all and invented keys instead, and the panel had nothing to draw. */
  const KEPT = (over: Record<string, unknown> = {}): FactBundle => bundleOf('record', {
    medium: 'paper', role: 'log',
    location: { kept_at: 'قفسهٔ دفتر انبار', holder: 'مسئول انبار' },
    cadence: 'nightly',
    ...over,
  })

  it('draws a paper form’s «نگهداری» and «مسئول» where a sheet draws its path', () => {
    draw(KEPT())
    expect(screen.getByText('نگهداری')).toBeInTheDocument()
    expect(screen.getByText('قفسهٔ دفتر انبار')).toBeInTheDocument()
    expect(screen.getByText('مسئول')).toBeInTheDocument()
    expect(screen.getByText('مسئول انبار')).toBeInTheDocument()
    // Both are Persian prose, so neither is an LTR island (note 6 / QF-42):
    // `Mono` is for a stored latin run, and there is none here.
    expect(screen.getByText('قفسهٔ دفتر انبار')).not.toHaveAttribute('dir')
    // …and the empty «محل» row is gone rather than drawn as «—».
    expect(screen.queryByText('محل')).toBeNull()
  })

  it('names the outside system for an external table', () => {
    draw(KEPT({ medium: 'external', location: { system: 'سپیدز', kept_at: 'گزارش فروش روزانه' } }))
    expect(screen.getByText('سامانه')).toBeInTheDocument()
    expect(screen.getByText('سپیدز')).toBeInTheDocument()
    expect(screen.getByText('نگهداری')).toBeInTheDocument()
    expect(screen.queryByText('مسئول')).toBeNull()
  })

  it('lets «سامانه» replace the authority instead of drawing both rows', () => {
    // `F-00018` in the mock, exactly: a `system` and a `kept_at` beside an
    // `identifier_scheme.authority` naming that same outside system in latin.
    // The scheme is not a second location.
    draw(KEPT({
      medium: 'external',
      location: {
        system: 'سپیدز', kept_at: 'صندوق شعبه',
        identifier_scheme: { authority: 'Sepidz', format: 'receipt number' },
      },
    }))
    expect(screen.getByText('سامانه')).toBeInTheDocument()
    expect(screen.getByText('نگهداری')).toBeInTheDocument()
    expect(screen.queryByText('محل')).toBeNull()
    expect(screen.queryByText('Sepidz')).toBeNull()
    // «قالب» describes the scheme, not the row that is gone — it stays.
    expect(screen.getByText('receipt number')).toBeInTheDocument()
  })
})
