import { test, expect } from '@playwright/test'
import type { Branch, Department, FactsListResponse } from '../src/api/types'
import {
  CARD_BORDER, expectDesign, serve, shot, signedIn, trackCount, visit,
} from './_harness'

/**
 * Six rows out of `ui/design/mock/facts/api/list.json`, trimmed to what this
 * spec asks of them and **typed as the endpoint's own response**: a change to
 * `FactListRow` — a renamed field, a widened union — is then a `tsc -b` error
 * here rather than a screen rendering `undefined` in a check that still passes.
 *
 * Two fields are not in the mock and cannot be: it is the *design's* fixture and
 * predates the served shape. `confirmation` there is the design's per-viewer map
 * (`{editor_star, cooking_editor}`), and the route serves one boolean plus the
 * print it was taken against (QF-24/25) — so `confirmed` below is `stOf`'s own
 * fold of that map, `green` and nothing else (`Inja Panel.dc.html:4629`).
 * `aliases` and `fingerprint` are the two the mock does not carry at all.
 *
 * Between them the six cover every state the list can draw: universal and
 * scoped, one department and a department+branch, three kinds, both chip values,
 * both red counts and both badges.
 */
const FACTS: FactsListResponse = {
  entries: [
    {
      id: 'F-00001', kind: 'item', key: 'ing_1', title: 'پنیر پیتزا', aliases: ['موتزارلا'],
      scope: { departments: [], branches: [] },
      status: 'confirmed', retired: false, stub: false,
      red_counts: { unknown: 0, disputed: 0 },
      fingerprint: 'f1', confirmed: true, updated_at: '2026-09-16T14:05:00Z',
    },
    {
      id: 'F-00010', kind: 'item', key: 'ing_22', title: 'گوشت چرخ‌کرده', aliases: [],
      scope: { departments: ['cooking'], branches: [] },
      status: 'confirmed', retired: true, stub: false,
      red_counts: { unknown: 0, disputed: 0 },
      fingerprint: 'f2', confirmed: false, updated_at: '2026-09-02T15:40:00Z',
    },
    {
      id: 'F-00011', kind: 'record', key: 'mande_shab_farangi_burger',
      title: 'مانده شب فرنگی و برگر', aliases: [],
      scope: { departments: ['cooking'], branches: ['chalebagh'] },
      status: 'unknown', retired: false, stub: false,
      red_counts: { unknown: 4, disputed: 0 },
      fingerprint: 'f3', confirmed: false, updated_at: '2026-09-16T14:05:00Z',
    },
    {
      id: 'F-00014', kind: 'record', key: 'mavad__pizza_italian',
      title: 'مواد اولیه — پیتزا ایتالیایی (BOM)', aliases: [],
      scope: { departments: [], branches: [] },
      status: 'disputed', retired: false, stub: false,
      red_counts: { unknown: 1, disputed: 1 },
      fingerprint: 'f4', confirmed: false, updated_at: '2026-09-16T14:05:00Z',
    },
    {
      id: 'F-00021', kind: 'record', key: 'pitza_nk__end_of_night',
      title: 'موجودی آخر شب — پیتزا (ناهارخوران)', aliases: [],
      scope: { departments: ['cooking'], branches: ['naharkhoran'] },
      status: 'confirmed', retired: false, stub: true,
      red_counts: { unknown: 0, disputed: 0 },
      fingerprint: 'f5', confirmed: false, updated_at: '2026-09-16T14:05:00Z',
    },
    {
      id: 'F-00026', kind: 'rule', key: 'tolerance_per_food_gr',
      title: 'تلورانس هر واحد — پیتزا', aliases: [],
      scope: { departments: ['management'], branches: ['chalebagh'] },
      status: 'confirmed', retired: false, stub: false,
      red_counts: { unknown: 0, disputed: 0 },
      fingerprint: 'f6', confirmed: false, updated_at: '2026-09-16T14:05:00Z',
    },
  ],
  // Served, and drawn nowhere — the owner refused the coverage line on
  // 2026-08-31 (facts-design-audit §6, C1). It is in the fixture because the
  // route sends it and the screen must go on ignoring it.
  coverage: { read: 19, total: 28 },
}

/** QF-4 — the «شعبه» menu's options come from here and from nowhere else. */
const BRANCHES: Branch[] = [
  { code: 'chalebagh', name: 'چاله‌باغ' },
  { code: 'naharkhoran', name: 'ناهارخوران' },
]

/** Conformance note 9 — «آشپزخانه» is the registry's word, not an inline map's. */
const DEPARTMENTS: Department[] = [
  { code: 'cooking', name: 'آشپزخانه', count: 6, subs: 3, conflicts: 0 },
  { code: 'management', name: 'مدیریت', count: 4, subs: 1, conflicts: 0 },
]

async function open(page: import('@playwright/test').Page) {
  // The harness's default session is an Editor holding `edit` and `confirm`,
  // which is two of the five Panel capabilities `routers/facts.py` gates on — so
  // this screen serves them. A `view`-only holder gets the reader shell and the
  // uniform 404, which is the refusal case and not this spec's.
  await signedIn(page)
  await serve(page, {
    '/api/facts': FACTS,
    '/api/facts/branches': BRANCHES,
    '/api/departments': DEPARTMENTS,
    // `PanelShell` asks for this whenever the session holds `edit`.
    '/api/pending': [],
  })
  await visit(page, '/facts', 'facts')
}

const rowFor = (page: import('@playwright/test').Page, title: string) =>
  page.getByRole('row').filter({ hasText: title })

test('facts — the design’s list on the violet field, at three widths', async ({ page }) => {
  await open(page)
  await expectDesign(page, 'facts')

  const w = page.viewportSize()!.width
  const head = page.locator('[data-r-thead]')
  const row = rowFor(page, 'مانده شب فرنگی و برگر')

  if (w > 760) {
    // :1037 and :1051 — the exact template, not "six of something". The two
    // fixed rails survive into the used value; the four `fr` tracks resolve to
    // px, so they are counted rather than matched. No `--grid-facts` exists to
    // name them: it is on the audit's `UNTOKENISED` list for the owner.
    const tracks = await head.evaluate((el) => getComputedStyle(el).gridTemplateColumns)
    expect(tracks).toMatch(/ 34px$/)
    expect(trackCount(tracks)).toBe(6)
    // **The five ratios, not merely five tracks.** `1fr 1fr 1fr 1fr 1fr 34px`
    // passes the two lines above and is a different table: the title column is
    // more than twice the id's, and that proportion is the whole of what
    // `1.7fr .8fr .9fr 1.1fr 1.1fr` says. The used values are px, so the ratios
    // come back out of them — normalised against the `.8fr` track, which is the
    // smallest and therefore the one a rounding error moves most. This is the
    // design's most conspicuous untokenised value; nothing else can hold it.
    const px = tracks.split(' ').map(parseFloat)
    for (const [i, want] of [1.7, 0.8, 0.9, 1.1, 1.1].map((f) => f / 0.8).entries()) {
      expect(px[i] / px[1], `track ${i} of \`${tracks}\``).toBeCloseTo(want, 1)
    }
    // …and the row is laid on the SAME six. A head and a body that disagree is
    // the one defect a grid table has that no single cell reveals.
    expect(await row.evaluate((el) => getComputedStyle(el).gridTemplateColumns)).toBe(tracks)

    await expect(head).toBeVisible()
    await expect(head).toHaveCSS('background-color', 'rgb(248, 244, 254)')  // --tile-v4
    const kindHead = head.getByText('نوع')
    await expect(kindHead).toHaveCSS('font-size', '11.5px')
    await expect(kindHead).toHaveCSS('color', 'rgb(138, 125, 176)')         // --text-muted

    // The id is a mono LTR island, and the scope cell is Persian from the two
    // registries — never a stored code.
    const id = row.getByText('F-00011')
    await expect(id).toHaveAttribute('dir', 'ltr')
    await expect(id).toHaveCSS('font-size', '11.5px')
    await expect(row.getByText('آشپزخانه · چاله‌باغ')).toBeVisible()
    await expect(row).not.toContainText('cooking')
  } else {
    // ≤760 — the head goes and the row becomes a flex line at 14px, dropping the
    // id and the scope (`[data-r-tcol3]`).
    await expect(head).toBeHidden()
    await expect(row).toHaveCSS('display', 'flex')
    await expect(row).toHaveCSS('padding', '14px')
    // Hidden, not absent, and both halves are asserted: `toBeHidden()` is also
    // satisfied by a locator that resolves to nothing, which is exactly what a
    // screen that DROPPED the column at this width would produce.
    for (const text of ['F-00011', 'آشپزخانه · چاله‌باغ']) {
      await expect(row.getByText(text), text).toHaveCount(1)
      await expect(row.getByText(text), text).toBeHidden()
    }
    await expect(row.getByText('مانده شب فرنگی و برگر')).toBeVisible()
  }

  /* ---- the chip: two values, and two only (`CONF`, :4624) ---- */
  const green = rowFor(page, 'پنیر پیتزا').getByText('تأییدشده', { exact: true })
  await expect(green).toHaveCSS('color', 'rgb(31, 138, 91)')               // --green
  const amber = row.getByText('تأییدنشده')
  await expect(amber).toHaveCSS('color', 'rgb(138, 90, 0)')                // --warn-fg
  // Asserted on both rows, because one colour alone passes for a list that
  // paints every chip the same.
  const dot = (r: ReturnType<typeof rowFor>) => r.locator('[aria-hidden].rounded-round').first()
  await expect(dot(rowFor(page, 'پنیر پیتزا')))
    .toHaveCSS('background-color', 'rgb(31, 138, 91)')                     // --green
  await expect(dot(row)).toHaveCSS('background-color', 'rgb(232, 163, 61)') // --junction-or
  await expect(dot(row)).toHaveCSS('width', '8px')

  // :1059 — the dot row's `gap:7px`, the one untokenised value on this screen
  // that nothing else pins. Its sibling (the `fr` ratios above) is asserted, and
  // a whole fix round was fought for this exact number: written `gap-s3` it
  // becomes 6px, which is a design value quietly changed because 6px had a name.
  // `column-gap`, not the `gap` shorthand: Chrome reports the shorthand as
  // `normal` on a flex row that sets only the inline axis.
  await expect(row.locator('[data-col="confirmation"] > span').first())
    .toHaveCSS('column-gap', '7px')

  /* ---- conformance note 1: the counts and the badges, beside the chip ---- */
  // Persian digits, the design's own separator, and a count only when there is
  // one — «۰ بی‌پاسخ» on a clean row would be noise on every row in the list.
  await expect(row.getByText('۴ بی‌پاسخ')).toBeVisible()
  await expect(rowFor(page, 'مواد اولیه').getByText('۱ بی‌پاسخ · ۱ متعارض')).toBeVisible()
  await expect(rowFor(page, 'موجودی آخر شب').getByText('پیش‌ثبت')).toBeVisible()
  await expect(rowFor(page, 'گوشت چرخ‌کرده').getByText('بازنشسته')).toBeVisible()
  await expect(rowFor(page, 'پنیر پیتزا').getByText(/بی‌پاسخ|متعارض/)).toHaveCount(0)
  // The slot's own type ramp (:1064) — 10.5px in `--text-faint`, one line.
  await expect(row.getByText('۴ بی‌پاسخ')).toHaveCSS('font-size', '10.5px')
  await expect(row.getByText('۴ بی‌پاسخ')).toHaveCSS('color', 'rgb(169, 159, 196)')

  /* ---- the chevron disc (:1067) — the row's one piece of furniture, and the
         cell a reader aims at. Asserted because it is shipped correct and
         nothing else would notice it drifting. ---- */
  const disc = row.locator('[data-col="open"] > span')
  await expect(disc).toHaveCSS('width', '30px')
  await expect(disc).toHaveCSS('height', '30px')
  // …and it is a DISC. `border-radius:50%` on a 30px box is the whole shape;
  // `--radius-round` dropped for a `--radius-*` rung would leave a violet
  // square that every other assertion here still passes.
  await expect(disc).toHaveCSS('border-top-left-radius', '50%')
  await expect(disc).toHaveCSS('background-color', 'rgb(243, 237, 252)')   // --disc-violet
  await expect(disc).toHaveCSS('color', 'rgb(74, 37, 169)')                // --violet

  /* ---- the row has NO confirm tick (:1052-1070) ---- */
  await expect(row.getByRole('button')).toHaveCount(0)
  await expect(row.getByRole('checkbox')).toHaveCount(0)

  /* ---- the card, and the hover that is a fill rather than a lift ---- */
  const card = page.locator('[data-card]')
  await expect(card).toHaveCSS('border-top-color', CARD_BORDER)
  await expect(row).toHaveCSS('border-bottom-color', 'rgb(244, 240, 250)')  // --line-row
  await row.hover()
  await expect(row).toHaveCSS('background-color', 'rgb(251, 249, 254)')     // --surface-sub
  await expect(row).toHaveCSS('transform', 'none')

  await shot(page, 'facts')
})

test('facts — the four filters, and the link that clears them', async ({ page }) => {
  await open(page)

  // `[data-r-trow]` rather than `getByRole('row')`: at ≤760 the head is
  // `display:none` and drops out of the accessibility tree, so a role count is
  // seven at two widths and six at the third — a number that changes with the
  // viewport for a reason that has nothing to do with what is being counted.
  const rows = page.locator('[data-r-trow]')
  await expect(rows).toHaveCount(6)

  /* ---- «وضعیت تأیید» offers TWO values, whatever the design's stale comment
         between `CONF` and `CONF_KEYS` says about three (:4628 — it sits BELOW
         `CONF`, :4624-4627, and above `CONF_KEYS`, :4629) ---- */
  await page.getByRole('button', { name: /وضعیت تأیید/ }).click()
  const conf = page.getByRole('listbox', { name: 'وضعیت تأیید' })
  await expect(conf.getByRole('option')).toHaveText(['وضعیت تأیید', 'تأییدشده', 'تأییدنشده'])
  await conf.getByRole('option', { name: 'تأییدشده' }).click()
  await expect(rows).toHaveCount(1)
  await expect(rowFor(page, 'پنیر پیتزا')).toBeVisible()

  /* ---- R5: the clear link is ABSENT until something is set, and it is
         **ledger L-06's `--violet-mid`, not the `--conflict` the design paints**
         (:1033; :1032 is the `hasFactFilters` gate above it) — the owner’s
         ruling on this exact control, settled on
         semantics: clearing a filter destroys nothing. The same value
         `UsersFilters` writes, so the two screens cannot drift apart again. ---- */
  const clear = page.getByRole('button', { name: 'پاک کردن همهٔ فیلترها' })
  await expect(clear).toHaveCSS('color', 'rgb(122, 82, 208)')
  await clear.click()
  await expect(rows).toHaveCount(6)
  await expect(clear).toHaveCount(0)

  /* ---- «دپارتمان» carries «سراسری» beside the registry's departments, and it
         is the absence of a department rather than one of them (:4639) ---- */
  await page.getByRole('button', { name: /دپارتمان/ }).click()
  const dept = page.getByRole('listbox', { name: 'دپارتمان' })
  await expect(dept.getByRole('option'))
    .toHaveText(['دپارتمان', 'آشپزخانه', 'مدیریت', 'سراسری'])
  await dept.getByRole('option', { name: 'سراسری' }).click()
  await expect(rows).toHaveCount(2)     // the two entries bound to no department
  await expect(rowFor(page, 'پنیر پیتزا')).toBeVisible()
  await expect(rowFor(page, 'مواد اولیه')).toBeVisible()
  await page.getByRole('button', { name: 'پاک کردن همهٔ فیلترها' }).click()

  /* ---- «شعبه», from GET /api/facts/branches ---- */
  await page.getByRole('button', { name: /شعبه/ }).click()
  const branch = page.getByRole('listbox', { name: 'شعبه' })
  await expect(branch.getByRole('option')).toHaveText(['شعبه', 'چاله‌باغ', 'ناهارخوران'])
  await branch.getByRole('option', { name: 'ناهارخوران' }).click()
  await expect(rows).toHaveCount(1)
  await expect(rowFor(page, 'موجودی آخر شب')).toBeVisible()
  await page.getByRole('button', { name: 'پاک کردن همهٔ فیلترها' }).click()

  /* ---- «نوع», from KIND_LABELS ---- */
  await page.getByRole('button', { name: /نوع/ }).click()
  await page.getByRole('listbox', { name: 'نوع' }).getByRole('option', { name: 'قاعده' }).click()
  await expect(rows).toHaveCount(1)
  await expect(rowFor(page, 'تلورانس هر واحد')).toBeVisible()

  /* ---- the search, and the empty line the design states for it ---- */
  await page.getByRole('button', { name: 'پاک کردن همهٔ فیلترها' }).click()
  const search = page.getByRole('searchbox')
  await search.fill('F-00014')
  await expect(rows).toHaveCount(1)
  await expect(rowFor(page, 'مواد اولیه')).toBeVisible()
  // An alias is searchable too — «نام‌های دیگر» is what the estate called the
  // thing before anybody titled it.
  await search.fill('موتزارلا')
  await expect(rowFor(page, 'پنیر پیتزا')).toBeVisible()
  await search.fill('چیزی که نیست')
  await expect(rows).toHaveCount(0)
  const empty = page.locator('[data-r-empty]')
  await expect(empty).toHaveText('با این فیلترها داده‌ای نیست')
  // :1047 — «emptiness is a fact, not an apology», at the design's own weight:
  // `44px 20px`, 13px, `--text-faint`, centred. The only state on this screen
  // with no row to compare it against, so nothing else would catch it drifting.
  await expect(empty).toHaveCSS('padding', '44px 20px')
  await expect(empty).toHaveCSS('font-size', '13px')
  await expect(empty).toHaveCSS('color', 'rgb(169, 159, 196)')
  await expect(empty).toHaveCSS('text-align', 'center')

  // C1 — the coverage line is served and drawn nowhere. Asserted at the end,
  // over the whole screen, because the refusal is about the SCREEN and not
  // about one band of it.
  await expect(page.getByText(/کاربرگ خوانده شده/)).toHaveCount(0)
})
