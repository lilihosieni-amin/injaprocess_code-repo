import { describe, it, expect, vi, afterEach } from 'vitest'
import { screen, fireEvent } from '@testing-library/react'
import { Overview } from './Overview'
import { renderAt } from '../test/utils'
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

const OV = {
  department: 'cooking', name: 'دپارتمان پخت', updated_at: '2026-07-06T10:00:00Z',
  description: 'واحد پخت غذاهای گرم رستوران است.',
  sub_units: [{ name: 'آشپزخانهٔ گرم', description: 'غذاهای گرم' }],
  personnel: [{ role: 'سرآشپز', duties: ['مدیریت آشپزخانه', 'کنترل کیفیت'], kpi: ['کاهش ضایعات به زیر ۵٪'] }],
}

describe('Overview', () => {
  it('renders sub-units and the Jalali update date; personnel duties are collapsed until expanded', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(JSON.stringify(OV), { status: 200, headers: { 'Content-Type': 'application/json' } }))
    renderAt('/departments/:code/overview', <Overview />, '/departments/cooking/overview')
    expect(await screen.findByText('دپارتمان پخت')).toBeInTheDocument()
    expect(screen.getByText('واحد پخت غذاهای گرم رستوران است.')).toBeInTheDocument()
    expect(screen.getByText('آشپزخانهٔ گرم')).toBeInTheDocument()
    expect(screen.getByText('سرآشپز')).toBeInTheDocument()
    expect(screen.getByText(/۱۴۰۵\/۰۴\/۱۵/)).toBeInTheDocument()
    // collapsed by default: duty chips hidden, count shown
    expect(screen.queryByText('کنترل کیفیت')).not.toBeInTheDocument()
    expect(screen.getByText(/۲ وظیفه/)).toBeInTheDocument()
    // expand the category → duties appear
    fireEvent.click(screen.getByText('سرآشپز'))
    expect(screen.getByText('کنترل کیفیت')).toBeInTheDocument()
    // KPIs render below the duties once expanded
    expect(screen.getByText('کاهش ضایعات به زیر ۵٪')).toBeInTheDocument()
    // close from the bottom control
    fireEvent.click(screen.getByRole('button', { name: /بستن/ }))
    expect(screen.queryByText('کنترل کیفیت')).not.toBeInTheDocument()
  })

  it('offers the edit button to an editor of this department', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(JSON.stringify(OV), { status: 200, headers: { 'Content-Type': 'application/json' } }))
    renderAt('/departments/:code/overview', <Overview />, '/departments/cooking/overview', EDITOR)
    expect(await screen.findByRole('button', { name: 'ویرایش' })).toBeInTheDocument()
  })

  it('draws no edit button for a reader, and still draws the department itself', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(JSON.stringify(OV), { status: 200, headers: { 'Content-Type': 'application/json' } }))
    renderAt('/departments/:code/overview', <Overview />, '/departments/cooking/overview', READER)
    expect(await screen.findByText('دپارتمان پخت')).toBeInTheDocument()
    expect(screen.getByText('واحد پخت غذاهای گرم رستوران است.')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'ویرایش' })).not.toBeInTheDocument()
  })

  it('draws no edit button for an editor scoped to a different department', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(JSON.stringify(OV), { status: 200, headers: { 'Content-Type': 'application/json' } }))
    renderAt('/departments/:code/overview', <Overview />, '/departments/cooking/overview', OTHER_DEPT_EDITOR)
    expect(await screen.findByText('دپارتمان پخت')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'ویرایش' })).not.toBeInTheDocument()
  })
})
