import { test, expect, type Page } from '@playwright/test'
import type { Branch, Department, FactBundle, FactKind } from '../src/api/types'
import { expectDesign, serve, shot, signedIn, visit } from './_harness'

/**
 * §14's fact detail — `Inja Panel.dc.html:1107-1750`.
 *
 * The bundles below are trimmed out of `ui/design/mock/facts/api/entries.json`
 * and **typed as the endpoint's own response**, so a change to `FactBundle` — a
 * renamed map, a widened union — is a `tsc -b` error here rather than a screen
 * rendering `undefined` under a check that still passes.
 *
 * Two things in the mock are not in the served shape and cannot be: its
 * `confirmation` is the design's per-viewer map (`{editor_star,
 * cooking_editor}`) where the route serves one boolean, one `can_confirm` and
 * one print (QF-24/25), and its `resolved` entries carry an `id` that
 * `facts_store._labels` does not compose (`facts_store.py:291`).
 */

const bundle = (
  id: string, kind: FactKind, title: string,
  data: Record<string, unknown>,
  over: Partial<FactBundle> = {},
  entryOver: Record<string, unknown> = {},
): FactBundle => ({
  entry: {
    id, kind, key: id.toLowerCase(), title, statement: `${title} — بیان`,
    scope: { departments: ['cooking'], branches: ['chalebagh'] },
    status: 'confirmed', retired: false, updated_at: '2026-09-16T14:05:00Z',
    data, ...entryOver,
  },
  confirmation: { confirmed: false, can_confirm: true, fingerprint: 'sha256:abc' },
  red_paths: { unknown: [], disputed: [] },
  resolved: {}, row_titles: {}, path_labels: {}, consumers: [], processes: [],
  ...over,
})

/** F-00030 — the disputed `feel` rule: an expression, three inputs, two open
 *  accounts on `data/expr`, and the «متن اصلی» the owner approved. */
const RULE = bundle('F-00030', 'rule', 'مصرف اعلامی پیتزا', {
  lang: 'feel',
  expr: 'declared_use = start + received - end',
  original_ref: 'facts/originals/F-00030.txt',
  inputs: [
    { key: 'start', title: 'موجودی اول شب', unit: 'kg', unit_title: 'کیلوگرم',
      from: { ref: 'F-00016', field: 'start_stock' } },
    { key: 'received', title: 'دریافت از انبار', from: 'operator' },
  ],
  outputs: [{
    key: 'declared_use', title: 'مصرف اعلامی', unit: 'kg', unit_title: 'کیلوگرم',
    nature: 'observed', writes_to: { ref: 'F-00016', field: 'declared_use' },
  }],
  calls: [{ ref: 'F-00031' }],
}, {
  confirmation: { confirmed: false, can_confirm: false, fingerprint: 'sha256:r30' },
  red_paths: { unknown: [], disputed: ['data/expr'] },
  path_labels: { 'data/expr': 'فرمول' },
  resolved: {
    'F-00016': { kind: 'record', title: 'گزارش مرکزی — پیتزا (چاله‌باغ)' },
    'F-00031': { kind: 'rule', title: 'مصرف استاندارد پیتزا' },
    'cooking-001': { kind: 'process', title: 'وزن‌کشی و ثبت مانده شب پیتزا' },
  },
  consumers: [
    { id: 'F-00016', title: 'گزارش مرکزی — پیتزا (چاله‌باغ)' },
    { id: 'F-00038', restricted: true },
  ],
  processes: [
    { ref: 'cooking-001', title: 'وزن‌کشی و ثبت مانده شب پیتزا',
      tombstoned: false, heir: null, missing_nodes: [] },
    { ref: 'cooking-002', title: 'شمارش انبار',
      tombstoned: true, heir: 'cooking-007', missing_nodes: [] },
    { ref: 'cooking-003', title: null, tombstoned: false, heir: null, missing_nodes: [] },
    { ref: 'cooking-004', title: 'ثبت فیش', tombstoned: false, heir: null,
      missing_nodes: ['cooking-004-n010'] },
  ],
}, {
  status: 'disputed',
  aliases: ['مصرف اعلام‌شده'],
  source: [
    { type: 'sheet', ref: 'attachments/sheets/Gozaresh markazi.xlsx', sheet: 'پیتزا', cell: 'H6' },
    { type: 'voice', ref: 'meetings/transcripts/cooking-1405-06-01.txt', lines: '40' },
  ],
  accounts: [
    { id: 'd8379975', field: 'data/expr', status: 'open',
      statement: '=MINUS(SUM(F6,E6),G6)', value: 'declared_use = start + received - end',
      speaker_role: null,
      source: { type: 'sheet', ref: 'attachments/sheets/Gozaresh markazi.xlsx',
        sheet: 'پیتزا', cell: 'H6' } },
    { id: 'abbe139f', field: 'data/expr', status: 'open',
      statement: 'مصرف اعلامیشون تفاوت بین مانده اول شب و آخر شبشونه',
      speaker_role: 'سرپرست گزارش‌ها',
      source: { type: 'voice', ref: 'meetings/transcripts/cooking-1405-06-01.txt', lines: '40' } },
  ],
})

/** What `POST …/resolve` answers with: the same bundle, the dispute settled. */
const RULE_SETTLED: FactBundle = {
  ...RULE,
  entry: { ...RULE.entry, status: 'confirmed', accounts: [] },
  red_paths: { unknown: [], disputed: [] },
  confirmation: { confirmed: false, can_confirm: true, fingerprint: 'sha256:r30b' },
}

/** F-00014 — the BOM, whose whole subject is the colour of one cell (note 3). */
const BOM = bundle('F-00014', 'record', 'مواد اولیه — پیتزا ایتالیایی (BOM)', {
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
}, { status: 'disputed' })

/** F-00011 — the paper form: four columns whose `unit` is present and `null`,
 *  one whose `unit` key is absent, and ten printed rows. */
const PAPER = bundle('F-00011', 'record', 'مانده شب فرنگی و برگر', {
  medium: 'paper', role: 'log',
  location: { path: 'departments/cooking/attachments/photo.jpg' },
  grain: 'هر ردیف یک قلم، هر برگ یک شیفت',
  cadence: 'nightly', day_boundary: '01:15', blank_master: true, approved_by: 'انبار دار',
  header_fields: [{ key: 'date', title: 'تاریخ' }, { key: 'operator', title: 'نام متصدی' }],
  signatures: [{ role: 'مسئول واحد', row_range: '1-5' }],
  primaryKey: ['date', 'item'],
  fields: [
    { key: 'row_no', title: 'ردیف', type: 'integer' },
    { key: 'start_stock', title: 'مانده اول شب', type: 'number', unit: null,
      filled_by: 'مسئول واحد' },
    { key: 'end_stock', title: 'مانده آخر شب', type: 'number', unit: null },
  ],
  rows: [
    { key: 'burger', title: 'برگر' },
    { key: 'bacon', title: 'بیکن ورقه ای', retired: true },
    // `F-00012`'s `staff_sugar`: a weekday the store spells in English.
    { key: 'staff_sugar', title: 'قند پرسنلی', unit: 'pack', when: 'thursday' },
    // `F-00012`'s `burger_box`: the source's own word for the unit AND the
    // stored symbol, which the design draws as two nodes (:1419-1420).
    { key: 'burger_box', title: 'جعبه برگر', unit: 'carton', unit_raw: 'کارتن ۱۰۰تایی' },
  ],
}, {
  red_paths: {
    unknown: ['data/fields/start_stock/unit', 'data/fields/end_stock/unit'],
    disputed: [],
  },
  row_titles: { burger: 'برگر', bacon: 'بیکن ورقه ای' },
}, {
  status: 'unknown',
  source: [
    { type: 'photo', ref: 'departments/cooking/attachments/photo.jpg' },
    { type: 'voice', ref: 'meetings/transcripts/cooking-1405-05-26.txt', lines: '74-80' },
  ],
})

/** F-00026 — the constant: one big number, its unit, its nature and its «per». */
const CONSTANT = bundle('F-00026', 'rule', 'تلورانس هر واحد — پیتزا', {
  inputs: [],
  outputs: [{ key: 'tolerance_g', title: 'تلورانس (گرم)', unit: 'g', unit_title: 'گرم',
    per: 'unit_sold', nature: 'limit', value: 5 }],
}, { confirmation: { confirmed: true, can_confirm: true, fingerprint: 'sha256:c26' } })

/** F-00048 — the item, with a RANGED `factor_to_base` (§7). */
const ITEM = bundle('F-00048', 'item', 'روغن سرخ‌کردنی', {
  code: '##77', category: 'consumable', unit: 'l', unit_raw: 'لیتر',
  // F-00048's own group, and one of the only two in the mock that `GROUP_FA`
  // does not map — the trimmed fixture had dropped it, which is why no browser
  // check could see the group row at all.
  group: 'oil',
  pack: { size: 16, unit: 'l' }, state: 'raw',
  units: [{ pack_unit: 'carton', factor_to_base: { min: 0.28, max: 0.32 } }],
  tracked: [{ value: true, reason: 'ارزش ریالی بالا' }],
})

/** F-00001 («پنیر پیتزا»), verbatim — the entry the GROUP row needs.
 *
 *  `enumFa`'s third site is `sfItemGroup` (:5009), and F-00048's `oil` is one of
 *  the only two groups in the whole mock that `GROUP_FA` does not map. Asserting
 *  the row on F-00048 alone is what let the defect live through three rounds. */
const CHEESE = bundle('F-00001', 'item', 'پنیر پیتزا', {
  code: '##1', category: 'ingredient', group: 'cheese', state: 'raw',
  unit: 'g', unit_raw: 'گرم', pack: { size: 10, unit: 'kg' },
  units: [{ pack_unit: 'carton', factor_to_base: 10000 }],
})

/** F-00023 — the measurement, whose «ثبت در» is note 2's correction. */
const MEASUREMENT = bundle('F-00023', 'measurement', 'وزن‌کشی پنیر در پایان شب', {
  quantity: 'mass', unit: 'kg',
  of: { ref: 'F-00001' }, writes_to: { ref: 'F-00011', field: 'end_stock' },
  when: 'پایان شیفت شب', by: 'مسئول واحد',
  method: 'ترازوی دیجیتال کنار یخچال', exceptions: 'شب‌های تعطیل ثبت نمی‌شود',
}, {
  resolved: {
    'F-00001': { kind: 'item', title: 'پنیر پیتزا', code: '##1' },
    'F-00011': { kind: 'record', title: 'مانده شب فرنگی و برگر' },
  },
})

/** F-00017 — «واحدها», the units record. Its rows carry cells, so it is a grid,
 *  and its `dimension` column is what proves the grid needs `enumFa` too. */
const UNITS = bundle('F-00017', 'record', 'واحدها', {
  medium: 'native', role: 'config', location: {},
  grain: 'هر ردیف یک واحد',
  fields: [
    { key: 'symbol', title: 'نماد', type: 'string' },
    { key: 'dimension', title: 'بُعد', type: 'string' },
    { key: 'factor_to_base', title: 'ضریب به واحد پایه', type: 'number' },
    { key: 'unit_title', title: 'عنوان', type: 'string' },
  ],
  rows: [
    { key: 'g', symbol: 'g', dimension: 'mass', factor_to_base: 1, unit_title: 'گرم' },
    { key: 'ml', symbol: 'ml', dimension: 'volume', factor_to_base: 1, unit_title: 'میلی‌لیتر' },
    { key: 'pcs', symbol: 'pcs', dimension: 'count', factor_to_base: 1, unit_title: 'عدد' },
    { key: 'carton', symbol: 'carton', dimension: 'pack', factor_to_base: null, unit_title: 'کارتن' },
    { key: 'min', symbol: 'min', dimension: 'duration', factor_to_base: 1, unit_title: 'دقیقه' },
    { key: 'irr', symbol: 'irr', dimension: 'money', factor_to_base: 1, unit_title: 'ریال' },
    { key: 'percent', symbol: 'percent', dimension: 'dimensionless', factor_to_base: 0.01,
      unit_title: 'درصد' },
  ],
})

/**
 * F-00099 — a BOM wide enough to scroll, modelled on «مواد اولیه پیتزا
 * امریکایی»: ten ingredient columns at `minmax(110px,1fr)` is 1100px of tracks
 * inside an 880px card, so the grid overflows its own box at every width this
 * spec runs. No other fixture here does — which is why the head band and the
 * row rules could stop halfway across a table for as long as they did.
 */
const INGREDIENTS = [
  'مرغ پیتزا', 'گوشت چرخ کرده', 'کباب ترکی', 'سوسیس کراکاف', 'خمیر پیتزا',
  'فلفل دلمه میکس', 'قارچ اسلایس شده', 'سس گوجه کنسروی', 'پنیر پیتزا', 'زیتون',
]
const WIDE = bundle('F-00099', 'record', 'مواد اولیه پیتزا امریکایی', {
  medium: 'sheet', role: 'reference',
  location: { spreadsheetId: '15M2ovUmQ7kX3nR9pLwT2aB8cD4eF6gH1', sheet: 'امریکایی' },
  grain: 'یک ردیف به ازای هر آیتم منو',
  fields: INGREDIENTS.map((title, i) => ({
    key: `ing_${i}`, title, type: 'number', unit: 'g',
  })),
  rows: Array.from({ length: 12 }, (_, r) => ({
    key: `menu_${r}`,
    ...Object.fromEntries(INGREDIENTS.map((_, i) => [`ing_${i}`, (r + i) * 10])),
  })),
})

/** F-00021 — a stub, and F-00010 — a retired item. Neither draws a tick. */
const STUB = bundle('F-00021', 'record', 'موجودی آخر شب — پیتزا (ناهارخوران)', {
  medium: 'sheet', role: 'log', location: { sheet: 'پیتزا' }, stub: true,
})
const RETIRED = bundle('F-00010', 'item', 'گوشت چرخ‌کرده', {
  code: '##22', category: 'ingredient', unit: 'g',
}, {}, { retired: true })

const BRANCHES: Branch[] = [
  { code: 'chalebagh', name: 'چاله‌باغ' },
  { code: 'naharkhoran', name: 'ناهارخوران' },
]
const DEPARTMENTS: Department[] = [
  { code: 'cooking', name: 'آشپزخانه', count: 6, subs: 3, conflicts: 0 },
]

/**
 * What the page asked the browser to fetch — every `<a download>` this screen
 * clicks, recorded in the page.
 *
 * **Why a probe and not the wire.** QF-39's download is a programmatic
 * `<a download>`, which Chromium hands to its download manager rather than to
 * the renderer: measured here, neither `page.route`, nor a `request` event, nor
 * a `download` event sees it, so there is nothing on the wire for a spec to
 * assert. What the SCREEN is responsible for is the URL it asks for, and this
 * records exactly that, in the real browser, at all three widths. The route's
 * own gate is `ui-backend`'s (Task 20's tests); the anchor's shape is pinned a
 * second time in `src/facts/SourceRow.test.tsx`.
 */
declare global {
  interface Window { __factDownloads?: string[] }
}

async function recordDownloads(page: Page) {
  await page.addInitScript(() => {
    window.__factDownloads = []
    const real = HTMLAnchorElement.prototype.click
    HTMLAnchorElement.prototype.click = function click(this: HTMLAnchorElement) {
      if (this.hasAttribute('download')) window.__factDownloads?.push(this.href)
      else real.call(this)
    }
  })
}

const downloads = (page: Page) => page.evaluate(() => window.__factDownloads ?? [])

async function open(page: Page, id: string) {
  await recordDownloads(page)
  await signedIn(page)
  await serve(page, {
    '/api/facts/F-00030': RULE,
    '/api/facts/F-00030/resolve': RULE_SETTLED,
    '/api/facts/F-00014': BOM,
    '/api/facts/F-00011': PAPER,
    '/api/facts/F-00026': CONSTANT,
    '/api/facts/F-00048': ITEM,
    '/api/facts/F-00001': CHEESE,
    '/api/facts/F-00023': MEASUREMENT,
    '/api/facts/F-00017': UNITS,
    '/api/facts/F-00099': WIDE,
    '/api/facts/F-00021': STUB,
    '/api/facts/F-00010': RETIRED,
    '/api/facts/branches': BRANCHES,
    '/api/departments': DEPARTMENTS,
    // `PanelShell` asks for this whenever the session holds `edit`.
    '/api/pending': [],
    // The one write the tick makes; the harness answers every method on a
    // pathname with the same body, so this is the POST's answer too.
    '/api/confirmations/F-00026': {
      target: 'F-00026', confirmed: true, fingerprint: 'sha256:c26',
      confirmed_by: 'lili', confirmed_at: 1789000000,
    },
    '/api/facts/source': { ok: true },
  })
  await visit(page, `/facts/${id}`, 'factDetail')
}

test('fact detail — the design’s screen on the violet field, at three widths', async ({ page }) => {
  await open(page, 'F-00030')
  await expectDesign(page, 'factDetail')

  /* ---- the header, §6.2's kind·role·medium line included ---- */
  // A rule with inputs is «قاعده · فرمول» (Appendix D's "shown as, by shape").
  await expect(page.getByText('قاعده · فرمول', { exact: true })).toBeVisible()
  await expect(page.getByText('آشپزخانه · چاله‌باغ')).toBeVisible()
  await expect(page.getByRole('heading', { name: 'مصرف اعلامی پیتزا' })).toBeVisible()

  /* ---- the statement card (:1129) ---- */
  const statement = page.locator('[data-card]')
  await expect(statement.getByText('بیان', { exact: true })).toBeVisible()
  await expect(statement).toHaveCSS('border-inline-start-width', '4px')
  await expect(statement).toHaveCSS('border-inline-start-color', 'rgb(74, 37, 169)') // --violet
  // «نام‌های دیگر» — the alias strip under the sentence (:1132).
  await expect(statement.getByText('مصرف اعلام‌شده')).toBeVisible()

  /* ---- the formula, an LTR island in Latin digits (QF-42, §17) ---- */
  const expr = page.getByText('declared_use = start + received - end').first()
  await expect(expr).toHaveAttribute('dir', 'ltr')
  await expect(expr).toHaveCSS('font-size', '15px')

  /* ---- the I/O pair — `[data-r-2col]`, and `expectDesign` graded its tracks ---- */
  await expect(page.getByText('چه چیزهایی لازم دارد')).toBeVisible()
  await expect(page.getByText('چه چیزی می‌سازد')).toBeVisible()
  // Note 2 — the entry's own titles, and its own `unit_title`, never a `KEY_FA`.
  await expect(page.getByText('موجودی اول شب')).toBeVisible()
  await expect(page.getByText('کیلوگرم').first()).toBeVisible()
  // One of the two `from` literals (:4752).
  await expect(page.getByText('انتخاب اپراتور')).toBeVisible()

  /* ---- the outputs head is its OWN green, not the unit pill's ----
         Owner ruling of 2026-09-01, and the whole reason `--tile-ok2` /
         `--border-ok2` were minted: drawn at `--tile-ok` the head and the
         «کیلوگرم» pill inside the card are one band and the card loses its
         hierarchy. Asserted as the exact pair, so a revert to the shared token
         is a red rather than a flattening nobody notices. */
  const outputsHead = page.getByText('چه چیزی می‌سازد').locator('..')
  await expect(outputsHead).toHaveCSS('background-color', 'rgb(241, 250, 245)')
  await expect(outputsHead).toHaveCSS('border-bottom-color', 'rgb(221, 239, 229)')
  // …and the inputs head keeps its violet pair, so this is a two-card contrast
  // rather than one card repainted.
  const inputsHead = page.getByText('چه چیزهایی لازم دارد').locator('..')
  await expect(inputsHead).toHaveCSS('background-color', 'rgb(248, 244, 254)')  // --tile-v4

  /* ---- note 7: every orphan class, not only the tombstoned one ---- */
  await expect(page.getByText('اشاره به فرایند بازنشسته (جایگزین: cooking-007)')).toBeVisible()
  await expect(page.getByText('ارجاع بی‌مقصد')).toBeVisible()
  await expect(page.getByText('گرهٔ ارجاع‌شده حذف شده')).toBeVisible()

  /* ---- a healthy process link opens; the three dead classes do not ----
         :1721 gives the row an `onClick`, a hover fill and a dotted ref. R5
         keeps it off the rows that have just said the destination is gone. */
  const healthy = page.getByRole('button', { name: /وزن‌کشی و ثبت مانده شب/ })
  await expect(healthy).toHaveCSS('cursor', 'pointer')
  for (const dead of ['شمارش انبار', 'ثبت فیش']) {
    await expect(page.getByRole('button', { name: new RegExp(dead) })).toHaveCount(0)
  }

  /* ---- the masked consumer: a name it may not show, and no press ---- */
  const masked = page.getByText('خارج از دسترسی شما')
  await expect(masked).toHaveCount(1)
  await expect(masked.locator('xpath=ancestor::button')).toHaveCount(0)

  /* ---- the footer chip (:1742) ---- */
  const footer = page.getByTestId('fact-footer')
  await expect(footer.getByText('F-00030', { exact: true })).toHaveAttribute('dir', 'ltr')
  await expect(footer.getByText(/آخرین تغییر/)).toBeVisible()

  /* ---- C2: no raw-JSON view. The owner refused it on 2026-08-31. ---- */
  await expect(page.getByText('نمای خام (فقط‌خواندنی)')).toHaveCount(0)

  await shot(page, 'fact-detail')
})

test('fact detail — «متن اصلی» is collapsed and closed until it is asked for', async ({ page }) => {
  await open(page, 'F-00030')
  // The owner's decision of 2026-08-31 (facts-design-audit §6.1): closed by
  // default is part of it, because the block holds a raw formula body and must
  // not push the entry's Persian off the first screen.
  const disclosure = page.getByRole('button', { name: 'متن اصلی' })
  await expect(disclosure).toHaveAttribute('aria-expanded', 'false')
  await expect(page.getByText('facts/originals/F-00030.txt')).toHaveCount(0)
  await disclosure.click()
  await expect(disclosure).toHaveAttribute('aria-expanded', 'true')
  await expect(page.getByText('facts/originals/F-00030.txt')).toBeVisible()
})

test('fact detail — the disputed rule: accounts grouped by field, and the resolve', async ({ page }) => {
  const reads: string[] = []
  page.on('request', (r) => {
    const { pathname } = new URL(r.url())
    if (pathname === '/api/facts/F-00030' && r.method() === 'GET') reads.push(pathname)
  })
  await open(page, 'F-00030')

  /* ---- note 4: one group per disputed field, named by `path_labels` ---- */
  const group = page.getByRole('group', { name: 'فرمول' })
  await expect(group).toBeVisible()
  await expect(page.getByText('روایت‌های متعارض')).toBeVisible()
  // …and the speaker, which the design draws nowhere (`sfAccounts`, :5031).
  await expect(group.getByText(/گوینده \(نقش\): سرپرست گزارش‌ها/)).toBeVisible()
  // A reviewer never reads the machine path (§17).
  await expect(page.getByText('data/expr')).toHaveCount(0)

  /* ---- the red entry's tick: drawn, disabled, and named (QF-25) ---- */
  const tick = page.getByTestId('fact-tick')
  await expect(tick).toHaveText(/قابل تأیید نیست/)
  await expect(tick).toBeDisabled()

  /* ---- choosing goes through the design's own dialog (:5042) ---- */
  const before = reads.length
  await group.getByRole('button', { name: 'انتخاب این روایت' }).first().click()
  const dialog = page.getByRole('dialog', { name: 'این روایت انتخاب شود؟' })
  await expect(dialog).toBeVisible()
  const posted = page.waitForRequest((r) =>
    new URL(r.url()).pathname === '/api/facts/F-00030/resolve' && r.method() === 'POST')
  await dialog.getByRole('button', { name: 'انتخاب می‌کنم' }).click()
  await posted
  // **The invalidation, not just the write.** `useResolveFact` invalidates
  // `['fact', fid]` on settle, so the entry is re-read; without it the screen
  // would go on showing the dispute it had just settled.
  await expect.poll(() => reads.length).toBeGreaterThan(before)
})

test('fact detail — the BOM grid paints red from `red_paths` and nothing else', async ({ page }) => {
  await open(page, 'F-00014')
  const grid = page.getByRole('table', { name: /ردیف/ })
  const rows = grid.getByRole('row')
  // Head, then two data rows; the row-key column is not drawn, because
  // `primaryKey` composes the key (:4666).
  await expect(rows).toHaveCount(3)
  await expect(page.getByText('کلید ردیف')).toHaveCount(0)

  const disputed = rows.nth(1).getByRole('cell').nth(1)
  const unknown = rows.nth(2).getByRole('cell').nth(1)
  await expect(disputed).toHaveCSS('background-color', 'rgb(255, 233, 231)')  // --tile-c
  await expect(unknown).toHaveCSS('background-color', 'rgb(251, 238, 220)')   // --tile-warn
  // Both inks are `--conflict`; the two grounds are what tell them apart.
  await expect(disputed.locator('span')).toHaveCSS('color', 'rgb(226, 61, 53)')
  await expect(unknown).toHaveText('؟')

  /* ---- note 2: a refItems cell is the item's resolved title, key as tooltip ---- */
  const cell = rows.nth(1).getByRole('cell').first()
  await expect(cell).toHaveText('پنیر پیتزا ##1')
  await expect(cell).toHaveAttribute('title', 'ing_1')

  /* ---- note 6: the spreadsheet id is in the footer and in no other run ---- */
  const id = '15M2ovUmQ7kX3nR9pLwT2aB8cD4eF6gH1'
  await expect(page.getByText(id)).toHaveCount(1)
  await expect(page.getByTestId('fact-footer').getByText(id)).toBeVisible()

  await shot(page, 'fact-detail-record')
})

test('fact detail — the paper form: printed rows, and only a null unit is red', async ({ page }) => {
  await open(page, 'F-00011')
  /* ---- note 3. Two columns carry `unit: null` and are in `red_paths`;
         `row_no` carries no `unit` key at all and the design would redden it
         too (`sfRecFields`, :4978). ---- */
  await expect(page.getByText('واحد ثبت نشده')).toHaveCount(2)
  const missing = page.getByText('واحد ثبت نشده').first()
  await expect(missing).toHaveCSS('background-color', 'rgb(255, 233, 231)')  // --tile-c
  await expect(missing).toHaveCSS('color', 'rgb(226, 61, 53)')               // --conflict

  await expect(page.getByText('قلم‌های چاپ‌شده روی فرم')).toBeVisible()
  await expect(page.getByText('برگر', { exact: true })).toBeVisible()
  await expect(page.getByText('دیگر استفاده نمی‌شود')).toBeVisible()
  await expect(page.getByText('ساختار و مکان جدول')).toBeVisible()
  await expect(page.getByText('برگهٔ خالی برای پر کردن')).toBeVisible()

  /* ---- «محل» and «تناوب» carry stored values, and each takes its own rule ----
         A file name is a code and is an island; a closing time inside a Persian
         sentence is prose and is written in Persian digits, as the signature row
         one card down already wrote its range. */
  const where = page.getByText('محل', { exact: true }).locator('..')
  await expect(where.getByText('photo.jpg')).toHaveAttribute('dir', 'ltr')
  await expect(page.getByText(/روز کاری/)).toContainText('۰۱:۱۵')

  /* ---- every word on a Persian-only screen (QF-42) ----
         The store spells this day «thursday»; the design maps it through its
         inline `WD` (:4928) and note 9 moves that map into `factsLabels.ts`.
         Asserted in the browser as well as in jsdom, because "no English on
         the screen" is a claim about the rendered page. */
  await expect(page.getByText('فقط پنجشنبه‌ها پر می‌شود')).toBeVisible()
  await expect(page.getByText('thursday')).toHaveCount(0)

  /* ---- :1419-1420 — the unit phrase AND the raw symbol beside it ----
         Two nodes, and the hint is the design's own element: an earlier round
         deleted it by borrowing the columns table's one-node «never both» rule
         (:4981 → :1393). Asserted in the browser because it is a claim about
         what is on the page, not about what a branch returns. */
  await expect(page.getByText('کارتن ۱۰۰تایی')).toBeVisible()
  const symbolHint = page.getByText('carton', { exact: true })
  await expect(symbolHint).toHaveAttribute('dir', 'ltr')
  await expect(symbolHint).toHaveCSS('font-size', '10.5px')

  /* ---- the source download popup (QF-39) — download-only, and asked first ----
         **The transfer is observed as a DOWNLOAD, not as a request.** A
         `<a download>` is fetched by Chromium's download manager rather than by
         the renderer, so `page.route` never sees it and no `request` event
         fires — measured here, an assertion on the wire saw nothing while the
         file was downloading. `e2e/_harness.ts`'s stub table therefore cannot
         answer this one, and it does not have to: what QF-39 requires of the
         Panel is that nothing is rendered inline and that the press is a
         download, which is exactly what the event says. The URL's own shape is
         pinned in `src/facts/SourceRow.test.tsx`. */
  await page.getByRole('button', { name: /photo\.jpg/ }).click()
  const dialog = page.getByRole('dialog', { name: 'فایل منبع دانلود شود؟' })
  await expect(dialog).toContainText('photo.jpg')
  // FR-I3 — the question is asked before anything is fetched.
  expect(await downloads(page)).toEqual([])

  // «انصراف» first: the question can be answered no, and nothing is fetched.
  await dialog.getByRole('button', { name: 'انصراف' }).click()
  await expect(dialog).toHaveCount(0)
  expect(await downloads(page)).toEqual([])

  await page.getByRole('button', { name: /photo\.jpg/ }).click()
  await page.getByRole('dialog', { name: 'فایل منبع دانلود شود؟' })
    .getByRole('button', { name: 'دانلود' }).click()
  await expect(page.getByRole('dialog')).toHaveCount(0)
  // The one auth- and scope-gated route QF-39 gives the attachment roots, with
  // the STORED path as its query — not the file name the row shows.
  const asked = (await downloads(page)).map((u) => new URL(u))
  expect(asked.map((u) => u.pathname)).toEqual(['/api/facts/source'])
  expect(asked[0].searchParams.get('path'))
    .toBe('departments/cooking/attachments/photo.jpg')
})

test('fact detail — the constant, the item and the measurement', async ({ page }) => {
  await open(page, 'F-00026')
  /* ---- the big number (:1150): 44px, mono, an LTR island in Latin digits ---- */
  const value = page.getByText('5', { exact: true })
  await expect(value).toHaveAttribute('dir', 'ltr')
  await expect(value).toHaveCSS('font-size', '44px')
  await expect(value).toHaveCSS('font-weight', '800')
  await expect(page.getByText('حد مجاز')).toBeVisible()
  await expect(page.getByText(/به ازای هر/)).toBeVisible()
  // A confirmed entry the caller may tick: the green box, and the design's word.
  await expect(page.getByTestId('fact-tick')).toHaveText(/تأییدشده/)

  await open2(page, 'F-00048')
  /* ---- a ranged `factor_to_base`, as one Latin island (§7) ---- */
  const ranged = page.getByText('0.28–0.32')
  await expect(ranged).toHaveAttribute('dir', 'ltr')
  await expect(page.getByText('واحد پایه')).toBeVisible()
  await expect(page.getByText('ردیابی می‌شود')).toHaveCSS('color', 'rgb(31, 138, 91)') // --green
  // `oil` is in neither `GROUP_FA` nor this build's map: the key stands alone,
  // as an island, and never at the Persian prose node.
  await expect(page.getByText('oil', { exact: true })).toHaveAttribute('dir', 'ltr')

  await open2(page, 'F-00001')
  /* ---- `enumFa`'s THIRD site: the item's group, in the design's two nodes ---- */
  const group = page.getByText('گروه', { exact: true }).locator('..')
  // :1573 — the Persian word at 13.5px…
  await expect(group.getByText('پنیر', { exact: true })).toBeVisible()
  // …and :1574 — the stored key beside it, a 10.5px mono LTR hint.
  const groupKey = group.getByText('cheese', { exact: true })
  await expect(groupKey).toHaveAttribute('dir', 'ltr')
  await expect(groupKey).toHaveCSS('font-size', '10.5px')
  // QF-42 over the design's `toFa(size) + unitFa(unit)` (:5008): Latin digits,
  // and one island rather than a latin run inside a Persian row.
  await expect(page.getByText('10 kg', { exact: true })).toHaveAttribute('dir', 'ltr')

  await open2(page, 'F-00023')
  /* ---- note 2: «ثبت در» is the record's TITLE, never `F-00011 end_stock` ---- */
  await expect(page.getByText('کمیت و واحد')).toBeVisible()
  await expect(page.getByRole('button', { name: 'مانده شب فرنگی و برگر' })).toBeVisible()
  await expect(page.getByText('F-00011')).toHaveCount(0)
  await expect(page.getByText('end_stock')).toBeVisible()
})

test('fact detail — the units record’s dimension column is Persian', async ({ page }) => {
  await open(page, 'F-00017')
  const grid = page.getByRole('table', { name: /ردیف/ })
  // :4912 — `enumFa`'s SECOND site, which the first fix pass missed. Seven
  // English words reached this column on a Persian-only screen; asserted in the
  // browser so the regression cannot come back through a jsdom-only check.
  for (const word of ['جرم', 'حجم', 'تعداد', 'بسته', 'زمان', 'پول', 'بی‌بعد']) {
    await expect(grid.getByText(word, { exact: true }), word).toBeVisible()
  }
  for (const english of ['mass', 'volume', 'count', 'duration', 'money', 'dimensionless']) {
    await expect(grid.getByText(english, { exact: true }), english).toHaveCount(0)
  }
  // …and the machine columns stay latin: a symbol is a code (QF-42, :4909).
  await expect(grid.getByText('percent', { exact: true }).first()).toHaveAttribute('dir', 'ltr')
})

test('fact detail — a stub and a retired entry draw no tick at all', async ({ page }) => {
  await open(page, 'F-00021')
  // Appendix D: «universal entry the reviewer cannot tick | no control, no
  // label», and `sfCanTick` (:5062) excludes a stub and a retired entry too.
  await expect(page.getByTestId('fact-tick')).toHaveCount(0)

  await open2(page, 'F-00010')
  await expect(page.getByTestId('fact-tick')).toHaveCount(0)
  await expect(page.getByText('بازنشسته')).toBeVisible()
})

/** A second navigation inside one test — the stubs are already installed, so
 *  this is `visit` without the sign-in and the fixtures. */
async function open2(page: Page, id: string) {
  await visit(page, `/facts/${id}`, 'factDetail')
}

/**
 * How far each element's own TEXT sits from its content box on either side.
 *
 * The text, deliberately, and not the element's box: a `display:block` child
 * fills its parent's width whatever its text is doing inside, so a box
 * measurement reports every cell perfectly placed while the glyphs sit against
 * one edge — which is exactly the defect this measures. A `Range` over the
 * contents bounds the glyph runs themselves.
 */
async function textOffsets(cells: import('@playwright/test').Locator) {
  return (await cells.evaluateAll((nodes) => nodes.map((node) => {
    // Over the TEXT NODES, one range each, and not `selectNodeContents(cell)`:
    // a range spanning a block-level child reports that child's full-width box,
    // so a cell whose glyphs are jammed against one edge measures as perfectly
    // placed. That is the very shape being tested, and the first version of this
    // helper passed under a mutation that restored the bug because of it.
    const walker = document.createTreeWalker(node, NodeFilter.SHOW_TEXT)
    let left = Infinity
    let right = -Infinity
    while (walker.nextNode()) {
      const range = document.createRange()
      range.selectNodeContents(walker.currentNode)
      const r = range.getBoundingClientRect()
      if (r.width === 0) continue
      left = Math.min(left, r.left)
      right = Math.max(right, r.right)
    }
    if (right < left) return null                // an empty cell places nothing
    const box = node.getBoundingClientRect()
    const style = getComputedStyle(node)
    return {
      text: node.textContent ?? '',
      start: left - (box.left + parseFloat(style.paddingLeft)),
      end: (box.right - parseFloat(style.paddingRight)) - right,
    }
  }))).filter((o): o is { text: string; start: number; end: number } => o !== null)
}

test('fact detail — a value grid centres every cell in its column, whatever its dir', async ({ page }) => {
  // **Owner report, 2026-09-06:** «the table content doesn't show correctly …
  // the data should be center of column». On the units grid, `g` and `1` sat
  // against the LEFT of their columns while `جرم`, `گرم` and every header sat
  // against the right — the split falling exactly on which cells are `dir="ltr"`
  // islands (QF-42) and which are Persian.
  //
  // The cause was a `display:block` span: a block box makes its own alignment
  // context, so `text-align: start` resolved against the span's OWN direction
  // and flipped to the left. The design has never done this — every grid cell
  // there is `inline-block`, which stays in the parent cell's inline flow and
  // is placed by the parent whatever the span's `dir` says.
  //
  // Centring is the owner's own correction to the design (which start-aligns);
  // it is asserted here on the two grids whose columns hold VALUES, and
  // deliberately not on the columns table or edge cases, whose columns hold
  // wrapped Persian prose.
  await open(page, 'F-00017')
  const grid = page.getByRole('table', { name: /ردیف/ })

  for (const role of ['columnheader', 'cell'] as const) {
    for (const o of await textOffsets(grid.getByRole(role))) {
      // Sub-pixel text metrics differ per glyph run, so this is "centred", not
      // "centred to the pixel". A cell against an edge is off by tens of px.
      expect(Math.abs(o.start - o.end),
        `${role} «${o.text}» sits ${o.start.toFixed(1)}px from one edge and `
        + `${o.end.toFixed(1)}px from the other`).toBeLessThan(2)
    }
  }
})

test('fact detail — a grid wider than its card paints its head and rules the whole way', async ({ page }) => {
  // **Owner report, 2026-09-06:** «Starting from a certain column onward, the
  // table has neither a colored header nor the lines drawn between rows.»
  //
  // A row is a grid whose tracks are `minmax(110px,1fr)`. Given more columns
  // than fit, the tracks overflow the row's own box — but `min-width:100%` sizes
  // that box to the SCROLL CONTAINER, not to the tracks. Background and
  // border-bottom paint the box, so both stop exactly where the container ends
  // and every column past it is bare. Nothing is missing from those columns;
  // the row simply is not as wide as its own contents.
  //
  // Asserted per CELL — "is this cell's ground painted, and is its rule drawn"
  // — rather than against the row's box or a pixel width. The paint may live on
  // the cell or on the row; what the report is about is whether it reaches the
  // cell at all. That question survives either implementation, which the row's
  // own geometry does not.
  await open(page, 'F-00099')
  const grid = page.getByRole('table', { name: /ردیف/ })
  const bare = await grid.getByRole('row').evaluateAll((rows) => {
    const painted = (el: Element, prop: 'background-color' | 'border-bottom-width') => {
      const v = getComputedStyle(el).getPropertyValue(prop)
      return prop === 'background-color'
        ? v !== 'rgba(0, 0, 0, 0)' && v !== 'transparent'
        : parseFloat(v) > 0
    }
    const covers = (outer: Element, inner: Element) => {
      const o = outer.getBoundingClientRect()
      const i = inner.getBoundingClientRect()
      return o.left <= i.left + 0.5 && o.right >= i.right - 0.5
    }
    return rows.flatMap((row, r) => [...row.children].flatMap((cell, c) => {
      // The head's ground, and every row's rule — each drawn either on the cell
      // itself or on a row wide enough to reach it.
      const want = r === 0 ? 'background-color' as const : 'border-bottom-width' as const
      const ok = painted(cell, want) || (painted(row, want) && covers(row, cell))
      return ok ? [] : [{ row: r, cell: c, want }]
    }))
  })
  expect(bare, `${bare.length} cells are unpainted — first at row ${bare[0]?.row}`
    + ` column ${bare[0]?.cell} (${bare[0]?.want})`).toEqual([])
})

test('fact detail — a start-aligned grid puts a latin cell where its header is', async ({ page }) => {
  // The same defect, on the grid the owner's centring correction does NOT
  // reach — and so the test that actually pins the repair rather than the
  // correction. Centring hides a block cell's misplacement (a block child
  // inherits `text-align: center` and centres its text anyway); start
  // alignment does not, because that is the case where the block box resolves
  // `start` against its own `dir` and flips.
  //
  // The columns table's «کلید» column is a `dir="ltr"` key under a Persian
  // header. Both must sit against the same edge — `end` is the distance from
  // the start edge, which is the right one on an RTL page.
  await open(page, 'F-00011')
  const columns = page.getByRole('table', { name: /ستون/ })
  for (const role of ['columnheader', 'cell'] as const) {
    for (const o of await textOffsets(columns.getByRole(role))) {
      expect(o.end,
        `${role} «${o.text}» sits ${o.end.toFixed(1)}px from the start edge`)
        .toBeLessThan(2)
    }
  }
})
