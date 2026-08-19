import { describe, it, expect, vi, afterEach } from 'vitest'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { screen, fireEvent } from '@testing-library/react'
import { Overview } from './Overview'
import { renderAt } from '../test/utils'
import { deptMeta } from '../lib/departments'
import { declarations, paint } from '../test/paint'
import type { SessionDescriptor } from '../auth/session'

afterEach(() => vi.restoreAllMocks())

/** READER is EDITOR minus `edit` and nothing else — same scope, same everything
 *  else — so only `edit` can explain any difference the assertions below find. */
const EDITOR: SessionDescriptor = {
  username: '09120000001', displayName: 'مدیر', role: 'editor',
  capabilities: ['view', 'comment', 'export_pdf', 'edit'], scopes: ['dept:cooking'],
  supervisor: null, canSupervise: false, pendingApprovals: 0,
}
const READER: SessionDescriptor = { ...EDITOR, role: 'reader', capabilities: ['view', 'comment', 'export_pdf'] }
/** Holds `edit` — but over another department. Separates "may this person edit
 *  anything?" from "may they edit THIS one?", which is the question the endpoint
 *  asks and therefore the only one worth drawing from. */
const OTHER_DEPT_EDITOR: SessionDescriptor = { ...EDITOR, scopes: ['dept:cashier'] }

/**
 * TWO sub-units and TWO duties, deliberately.
 *
 * `[data-r-2col]` is a grid and a one-item grid proves no gutter and no second
 * track — the browser gate's own vacuity guard fires on it — and a single duty
 * would let a numbering that always writes «۱» pass the numbering assertion.
 */
const OV = {
  department: 'cooking', name: 'دپارتمان پخت', updated_at: '2026-07-06T10:00:00Z',
  description: 'واحد پخت غذاهای گرم رستوران است.',
  sub_units: [
    { name: 'آشپزخانهٔ گرم', description: 'غذاهای گرم' },
    { name: 'آشپزخانهٔ سرد', description: 'پیش‌غذا و سالاد' },
  ],
  personnel: [{ role: 'سرآشپز', duties: ['مدیریت آشپزخانه', 'کنترل کیفیت'], kpi: ['کاهش ضایعات به زیر ۵٪'] }],
}

/** Answer every read with one body. The screen's only GET is the overview
 *  itself unless the session holds `confirm`, and none of these do. */
function serve(body: unknown = OV) {
  return vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(
    JSON.stringify(body), { status: 200, headers: { 'Content-Type': 'application/json' } },
  ))
}

const at = (session?: SessionDescriptor) =>
  renderAt('/departments/:code/overview', <Overview />, '/departments/cooking/overview', session)

/** The measurement hooks the browser gate's `overview` row grades, by the
 *  element each one is meant to be on. */
const screenRoot = () => document.querySelector<HTMLElement>('[data-screen="overview"]')!
const column = () => document.querySelector<HTMLElement>('[data-col]')!
const firstCard = () => document.querySelector<HTMLElement>('[data-card]')!

describe('Overview', () => {
  it('renders sub-units and the Jalali update date; personnel duties are collapsed until expanded', async () => {
    serve()
    at()
    // §6.4's title is «خلاصهٔ {{ deptName }}», one line, not the bare name.
    expect(await screen.findByText('خلاصهٔ دپارتمان پخت')).toBeInTheDocument()
    expect(screen.getByText('واحد پخت غذاهای گرم رستوران است.')).toBeInTheDocument()
    expect(screen.getByText('آشپزخانهٔ گرم')).toBeInTheDocument()
    expect(screen.getByText('سرآشپز')).toBeInTheDocument()
    expect(screen.getByText(/۱۴۰۵\/۰۴\/۱۵/)).toBeInTheDocument()
    // collapsed by default: the duty text is absent, the count is drawn
    expect(screen.queryByText('کنترل کیفیت')).not.toBeInTheDocument()
    expect(screen.getByText('۲ وظیفه')).toBeInTheDocument()
    fireEvent.click(screen.getByText('سرآشپز'))
    expect(screen.getByText('کنترل کیفیت')).toBeInTheDocument()
    expect(screen.getByText('کاهش ضایعات به زیر ۵٪')).toBeInTheDocument()
    // …and closes from the same control, because there is only one
    fireEvent.click(screen.getByText('سرآشپز'))
    expect(screen.queryByText('کنترل کیفیت')).not.toBeInTheDocument()
  })

  it('offers the edit button to an editor of this department', async () => {
    serve()
    at(EDITOR)
    expect(await screen.findByRole('button', { name: 'ویرایش' })).toBeInTheDocument()
  })

  it('draws no edit button for a reader, and still draws the department itself', async () => {
    serve()
    at(READER)
    expect(await screen.findByText('خلاصهٔ دپارتمان پخت')).toBeInTheDocument()
    expect(screen.getByText('واحد پخت غذاهای گرم رستوران است.')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'ویرایش' })).not.toBeInTheDocument()
  })

  it('draws no edit button for an editor scoped to a different department', async () => {
    serve()
    at(OTHER_DEPT_EDITOR)
    expect(await screen.findByText('خلاصهٔ دپارتمان پخت')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'ویرایش' })).not.toBeInTheDocument()
  })
})

describe('the rebuilt department page', () => {
  it('uses the shared accordion and has no second close button', async () => {
    serve()
    at(READER)
    const head = await screen.findByRole('button', { name: /سرآشپز/ })
    expect(head).toHaveAttribute('aria-expanded', 'false')
    fireEvent.click(head)
    // The hand-rolled copy grew a «بستن» button inside the open body. The
    // primitive has one control per item and this is where that is proved on
    // the screen rather than on the primitive.
    expect(screen.queryByRole('button', { name: 'بستن' })).not.toBeInTheDocument()
    expect(screen.getAllByRole('button')).toHaveLength(1)
  })

  it('numbers the duties the way §6.4 numbers them', async () => {
    serve()
    at(READER)
    fireEvent.click(await screen.findByRole('button', { name: /سرآشپز/ }))
    // Persian numerals in a tile beside the text, not a chip per duty — and the
    // second one is «۲», which a numbering that always writes «۱» fails.
    expect(screen.getByText('۱')).toBeInTheDocument()
    expect(screen.getByText('۲')).toBeInTheDocument()
    // §6.4's KPI block carries its own counted eyebrow.
    expect(screen.getByText('شاخص‌های عملکرد (۱)')).toBeInTheDocument()
  })

  it('says a KPI list is empty rather than drawing a policy line it cannot know about', async () => {
    // Ledger P3-10 — §6.4's padlock line («…طبق سیاست نمایش محتوا برای شما پنهان
    // است») is NOT drawn: D55 returns the overview unchanged for both stances
    // and `overview.schema.json` marks `kpi` required, so a withheld-KPI case
    // cannot arrive. An empty list really is empty, and saying otherwise would
    // tell a reader something is being kept from them on no evidence at all.
    serve({ ...OV, personnel: [{ role: 'سرآشپز', duties: ['مدیریت آشپزخانه'], kpi: [] }] })
    at(READER)
    fireEvent.click(await screen.findByRole('button', { name: /سرآشپز/ }))
    expect(screen.getByText('شاخصی ثبت نشده است.')).toBeInTheDocument()
    expect(document.body.textContent ?? '').not.toMatch(/پنهان|سیاست نمایش/)
  })

  it('puts each measurement hook on the element the browser gate’s row means', async () => {
    // A hook on the wrong element grades that element and reports GREEN, which
    // is worse than omitting it. Every one is pinned to what it is supposed to
    // be, not merely to existing.
    serve()
    at(READER)
    await screen.findByText('خلاصهٔ دپارتمان پخت')
    expect(screenRoot().hasAttribute('data-r-pad')).toBe(true)
    // `[data-col]` is the capped column, and it is the root's own child — which
    // is what `[data-r-pad] > div` in every sibling screen's spec reads.
    expect(column().parentElement).toBe(screenRoot())
    expect(document.querySelector('[data-h1]')!.tagName).toBe('H1')
    expect(document.querySelector('[data-h1]')!.textContent).toBe('خلاصهٔ دپارتمان پخت')
    expect(document.querySelector('[data-body]')!.textContent).toMatch(/آخرین به‌روزرسانی/)
    // The row names `[data-r-2col]` itself, so there must be no `data-grid`
    // competing with it.
    expect(document.querySelector('[data-grid]')).toBeNull()
    expect(document.querySelectorAll('[data-r-2col]')).toHaveLength(1)
    // …and exactly ONE `data-card`, on the first of the three sections: the
    // gate measures `.first()`, and three identical hooks say one thing thrice.
    expect(document.querySelectorAll('[data-card]')).toHaveLength(1)
    expect(firstCard().textContent).toMatch(/^شرح دپارتمان/)
    // The department tile beside the title. §6.4 draws NO tile here — this is
    // the plan's own addition, matching the lockup the sibling list screen
    // does draw — so it is pinned rather than left as an unasserted ornament,
    // and it is named in the task report for the owner to veto. `cooking` is
    // coral in `deptMeta`, and a tile that lost the code would fall back to the
    // violet default with nothing else moving.
    const tile = document.querySelector<HTMLElement>('[data-tile]')!
    expect(tile.className).toContain('bg-tile-c')
    expect(tile.querySelector('path')!.getAttribute('d')).toBe(deptMeta('cooking').icon)
  })

  it('caps its column where every sibling screen caps theirs', async () => {
    serve()
    at(READER)
    await screen.findByText('خلاصهٔ دپارتمان پخت')
    // Ledger P3-1/L-07: §6.4 says 900px, four sibling screens say 920px, and
    // `--role-column` resolves to `--width-list`, so the theme cannot say 900.
    expect(declarations(await paint(column().className))).toEqual(new Set([
      'max-width: var(--width-list)',
      'margin-left: auto',
      'margin-right: auto',
    ]))
  })

  it('paints the field, the screen padding and §6.16’s mobile gutter', async () => {
    serve()
    at(READER)
    await screen.findByText('خلاصهٔ دپارتمان پخت')
    const root = await paint(screenRoot().className)
    // The root repaints the violet field: the browser gate reads
    // `background-color` off THIS element and `getComputedStyle` does not
    // inherit, so a root that painted nothing would compute transparent.
    expect([...declarations(root)].sort()).toEqual([
      'background-color: var(--ink)',
      'flex: 1 1 0%',
      'overflow: auto',
      'padding-bottom: var(--pad-screen-y)',
      'padding-left: var(--pad-screen-x)',
      'padding-right: var(--pad-screen-x)',
      'padding-top: var(--pad-screen-y)',
    ])
    // …and §6.16's `18px 14px` below 760, which is a SWAP of the pair above and
    // wins because Tailwind sorts every variant after every bare utility.
    const R760 = '(max-width: 760px)'
    expect([...declarations(root, '', R760)].sort()).toEqual([
      'padding-bottom: var(--space-9)',
      'padding-left: var(--space-7)',
      'padding-right: var(--space-7)',
      'padding-top: var(--space-9)',
    ])
  })

  it('collapses §6.16’s header stack at ≤760, which carrying the attribute owes', async () => {
    // `[data-r-stack]{flex-direction:column;align-items:stretch;gap:12px}` is a
    // rule the deliverable writes once for every screen that carries the
    // attribute, and this screen carries it. A SWAP at the breakpoint, not an
    // append: `flex-col` replaces the row direction and `gap-s6` replaces the
    // 16px gutter.
    serve()
    at(READER)
    await screen.findByText('خلاصهٔ دپارتمان پخت')
    const stack = document.querySelector<HTMLElement>('[data-r-stack]')!
    const R760 = '(max-width: 760px)'
    const painted = await paint(stack.className)
    expect([...declarations(painted)].sort()).toEqual([
      'align-items: flex-start',
      'display: flex',
      'gap: var(--space-8)',
      'justify-content: space-between',
      'margin-bottom: var(--space-10)',
    ])
    expect([...declarations(painted, '', R760)].sort()).toEqual([
      'align-items: stretch',
      'flex-direction: column',
      'gap: var(--space-6)',
    ])
  })

  it('paints the title and the last-updated line in the roles the field decided', async () => {
    serve()
    at(READER)
    const h1 = await screen.findByText('خلاصهٔ دپارتمان پخت')
    // `--role-title-on-field` is #FFFFFF (L-01). NOT `text-on-dark`, which is
    // #FBF7F1 — the value L-01 retired and the class that reads like the answer.
    expect([...declarations(await paint(h1.className))].sort()).toEqual([
      'color: var(--role-title-on-field)',
      'font-size: var(--fs-h2)',
      'font-weight: var(--fw-extrabold)',
    ])
    const body = document.querySelector<HTMLElement>('[data-body]')!
    // `--role-subtitle-on-field` is #C9BEEE (L-28), and it sits one letter from
    // `--violet-on-dark-body`, the token L-28 ruled against.
    expect([...declarations(await paint(body.className))].sort()).toEqual([
      'color: var(--role-subtitle-on-field)',
      'font-size: var(--fs-sm)',
      'line-height: var(--lh-normal)',
      'margin-top: var(--space-4)',
    ])
  })

  it('paints §6.4’s card, its eyebrow and the prose inside it', async () => {
    serve()
    at(READER)
    await screen.findByText('خلاصهٔ دپارتمان پخت')
    // `background:#fff;border:1px solid rgba(42,29,94,.07);border-radius:18px;
    //  padding:22px;margin-bottom:14px` + the two-layer shadow.
    expect([...declarations(await paint(firstCard().className))].sort()).toEqual([
      '--tw-shadow-color: var(--card)',
      '--tw-shadow-colored: var(--shadow-card)',
      '--tw-shadow: var(--tw-shadow-colored)',
      'background-color: var(--card)',
      'border-color: var(--border-card)',
      'border-radius: var(--radius-doc)',
      'border-width: 1px',
      'box-shadow: var(--tw-ring-offset-shadow, 0 0 #0000), var(--tw-ring-shadow, 0 0 #0000), var(--tw-shadow)',
      'margin-bottom: var(--space-7)',
      'padding: var(--space-10)',
    ])
    const eyebrow = screen.getByText('شرح دپارتمان')
    expect([...declarations(await paint(eyebrow.className))].sort()).toEqual([
      'color: var(--text-muted)',
      'font-size: var(--fs-xxs)',
      'font-weight: var(--fw-bold)',
      'margin-bottom: var(--space-6)',
    ])
    // `font-size:14px;color:#2A1D5E;line-height:2.05;text-align:justify;
    //  text-wrap:pretty` — the 2.05 is ledger L-17's long-form prose role, 1.9.
    const prose = screen.getByText('واحد پخت غذاهای گرم رستوران است.')
    expect([...declarations(await paint(prose.className))].sort()).toEqual([
      'color: var(--ink)',
      'font-size: var(--fs-body)',
      'line-height: var(--lh-loose)',
      'text-align: justify',
      'text-wrap: pretty',
      'white-space: pre-line',
    ])
  })

  it('collapses the sub-unit grid at ≤760, and paints the tiles in it', async () => {
    serve()
    at(READER)
    await screen.findByText('خلاصهٔ دپارتمان پخت')
    const grid = document.querySelector<HTMLElement>('[data-r-2col]')!
    const R760 = '(max-width: 760px)'
    const g = await paint(grid.className)
    expect([...declarations(g)].sort()).toEqual([
      'display: grid',
      'gap: var(--space-6)',
      'grid-template-columns: repeat(2, minmax(0, 1fr))',
    ])
    // A SWAP, not an append: `grid-cols-1` at ≤760 replaces the two-track value
    // rather than sitting beside it.
    expect([...declarations(g, '', R760)]).toEqual(['grid-template-columns: repeat(1, minmax(0, 1fr))'])

    const tile = grid.firstElementChild as HTMLElement
    expect([...declarations(await paint(tile.className))].sort()).toEqual([
      'align-self: flex-start',
      'background-color: var(--surface-sub)',
      'border-color: var(--border-current)',
      'border-radius: var(--radius-tile)',
      'border-width: 1px',
      'padding: var(--space-7)',
    ])
    expect([...declarations(await paint((screen.getByText('غذاهای گرم')).className))].sort()).toEqual([
      'color: var(--text-body)',
      'font-size: var(--fs-sm2)',
      'line-height: var(--lh-loose)',
      'margin-top: var(--space-4)',
      'text-align: justify',
      'text-wrap: pretty',
    ])
  })

  it('paints §6.4’s roles card — the numbered duty, its text, and the KPI block', async () => {
    // The mutation survey found the duty text and the sub-unit name unasserted:
    // both are `13.5px` in the deliverable, which ledger L-27 names `--fs-menu`
    // ("menu, dropdown and SUB-CARD TITLES"), and both could drop to the 12.5px
    // control step the brief writes for them with every other check green.
    serve()
    at(READER)
    fireEvent.click(await screen.findByRole('button', { name: /سرآشپز/ }))

    expect([...declarations(await paint(screen.getByText('آشپزخانهٔ گرم').className))].sort()).toEqual([
      'color: var(--ink)',
      'font-size: var(--fs-menu)',
      'font-weight: var(--fw-bold)',
    ])
    expect([...declarations(await paint(screen.getByText('کنترل کیفیت').className))].sort()).toEqual([
      'color: var(--text-body)',
      // Without `flex: 1` a long duty does not fill the row beside its numeral.
      'flex: 1 1 0%',
      'font-size: var(--fs-menu)',
      'line-height: var(--lh-loose)',
      'text-align: justify',
      'text-wrap: pretty',
    ])
    // §6.4's `20x20` numeral tile — see the report for why it draws 22.
    expect([...declarations(await paint(screen.getByText('۲').className))].sort()).toEqual([
      'align-items: center',
      'background-color: var(--tile-v)',
      'border-radius: var(--radius-badge)',
      'color: var(--violet)',
      'display: flex',
      'flex: none',
      'font-size: var(--fs-micro)',
      'font-weight: var(--fw-bold)',
      'height: var(--space-10)',
      'justify-content: center',
      'margin-top: var(--space-half)',
      'width: var(--space-10)',
    ])
    // The two eyebrows inside the open body are `--text-faint`, one step
    // dimmer than the card's own `--text-muted` eyebrow.
    for (const t of ['شرح وظایف', 'شاخص‌های عملکرد (۱)']) {
      expect([...declarations(await paint(screen.getByText(t).className))].sort(), t).toEqual([
        'color: var(--text-faint)',
        'font-size: var(--fs-xxs)',
        'font-weight: var(--fw-bold)',
        'margin-bottom: var(--space-5)',
      ])
    }
    // The rule §6.4 draws between the duties and the KPIs — `margin-top:18px;
    // padding-top:14px;border-top:1px solid --hair`. It is a box with no text
    // in it, so nothing else in either layer can see it disappear.
    expect([...declarations(await paint(
      screen.getByText('شاخص‌های عملکرد (۱)').parentElement!.className,
    ))].sort()).toEqual([
      'border-color: var(--hair)',
      'border-top-width: 1px',
      'margin-top: var(--space-9)',
      'padding-top: var(--space-7)',
    ])
    // The KPI row and the tick in it. The tick has no text of its own, so the
    // browser gate's contrast census cannot see it turn the colour of the card.
    const kpi = screen.getByText('کاهش ضایعات به زیر ۵٪')
    expect([...declarations(await paint(kpi.className))].sort()).toEqual([
      'align-items: flex-start',
      'color: var(--text-body)',
      'display: flex',
      'font-size: var(--fs-sm)',
      'gap: var(--space-4)',
      'line-height: var(--lh-loose)',
      'text-wrap: pretty',
    ])
    const tick = kpi.querySelector('svg')!
    expect(tick).toHaveAttribute('stroke-width', '2.6')
    expect(tick).toHaveAttribute('width', '14')
    expect([...declarations(await paint(tick.getAttribute('class')!))].sort()).toEqual([
      'color: var(--green)',
      'flex: none',
      'margin-top: var(--space-1)',
    ])
  })

  it('says each empty section is empty, in the dimmest ink on the card', async () => {
    // Three sections and a fourth line inside the accordion all say "nothing is
    // recorded here". The mutation survey found every one of them asserted by
    // its WORDS and by nothing else: `--text-faint` could become
    // `--text-muted` — a step brighter, and the colour the section's own
    // eyebrow takes — with the suite green. Emptiness is a fact, not an
    // apology, and it is stated one step below the content it stands in for.
    serve({ ...OV, description: '   ', sub_units: [], personnel: [{ role: 'سرآشپز', duties: ['مدیریت'], kpi: [] }] })
    at(READER)
    await screen.findByText('خلاصهٔ دپارتمان پخت')
    const FAINT = ['color: var(--text-faint)', 'font-size: var(--fs-sm2)']
    for (const t of ['شرحی ثبت نشده است.', 'واحدی ثبت نشده است.']) {
      expect([...declarations(await paint(screen.getByText(t).className))].sort(), t).toEqual(FAINT)
    }
    // …and the KPI line, which carries the block's own rule above it.
    fireEvent.click(screen.getByRole('button', { name: /سرآشپز/ }))
    expect([...declarations(await paint(screen.getByText('شاخصی ثبت نشده است.').className))].sort()).toEqual([
      'border-color: var(--hair)',
      'border-top-width: 1px',
      'color: var(--text-faint)',
      'font-size: var(--fs-sm2)',
      'margin-top: var(--space-9)',
      'padding-top: var(--space-7)',
    ])
    // The sub-units section is empty, so `[data-r-2col]` is not drawn at all —
    // which is why the browser gate's fixture has to serve two of them.
    expect(document.querySelector('[data-r-2col]')).toBeNull()
  })

  it('leaves no literal value, no physical direction and no near-miss border', () => {
    // Derived from this file's own location, and through `fileURLToPath` on a
    // STRING: under jsdom the global `URL` is jsdom's, which neither `node:fs`
    // nor `node:url` will take, so the brief's `new URL('./Overview.tsx',
    // import.meta.url)` throws before a single assertion below runs.
    const src = readFileSync(fileURLToPath(import.meta.url).replace(/\.test\.tsx$/, '.tsx'), 'utf8')
    expect(src).not.toMatch(/#[0-9a-fA-F]{3,8}\b/)      // #FADAD8 ×4 was --border-danger missed by 3 bytes
    expect(src).not.toMatch(/(text|rounded|shadow)-\[/)
    expect(src).not.toMatch(/\btext-(right|left)\b/)
    expect(src).not.toMatch(/\brounded-(sm|md|lg|xl|2xl|3xl|full)\b/)
    expect(src).not.toMatch(/\btext-(xs|sm|base|lg|xl|[2-9]xl)\b/)
    // The scan is over a file that really was read, or every line above passes
    // over an empty string.
    expect(src).toMatch(/data-screen="overview"/)
  })
})
