import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { Activity } from './Activity'
import { toFa } from '../lib/format'
import type { SessionDescriptor } from '../auth/session'

let session: SessionDescriptor | undefined
vi.mock('../auth/useSession', () => ({ useSession: () => ({ data: session }) }))
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals() })

const CAPS = ['view', 'comment', 'export_pdf', 'manage_users', 'manage_peers', 'view_audit'] as const
const ADMIN: SessionDescriptor = { username: '09120000001', displayName: 'مهدی', role: 'admin',
  capabilities: [...CAPS], scopes: ['*'], supervisor: null, canSupervise: false, pendingApprovals: 0 }
const SCOPED: SessionDescriptor = { ...ADMIN, scopes: ['dept:cashier'] }
const READER: SessionDescriptor = { ...ADMIN, role: 'reader', capabilities: ['view', 'comment'],
  scopes: ['dept:cooking'] }

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })

const now = Math.floor(Date.now() / 1000)
const USERS = Array.from({ length: 7 }, (_, i) => ({
  id: i + 1, username: `0912000000${i}`, displayName: `کاربر ${toFa(i + 1)}`, role: 'reader',
  scopes: ['dept:cooking'], disabled: false, logins: i, failures: i === 2 ? 3 : 0,
  sessions: i, activeSeconds: 720, lastSeen: now }))
const PERMISSIONS = [
  { at: now, actor: 'مهدی', action: 'role.assigned', subject: 'نگار', before: 'reader', after: 'admin' },
  { at: now - 60, actor: 'مهدی', action: 'visibility.policy.changed', subject: 'process_summary',
    before: true, after: false },
]

function stub() {
  const gets: string[] = []
  vi.stubGlobal('fetch', vi.fn(async (path: string) => {
    gets.push(path)
    if (path === '/api/activity/summary') return json(
      session === SCOPED ? { activeUsers: null, views: 4, failedSignIns: null, commentsAwaiting: 1 }
                         : { activeUsers: 7, views: 12, failedSignIns: 5, commentsAwaiting: 2 })
    if (path === '/api/activity/users') return json(USERS)
    if (path === '/api/activity/failures') return json([
      { username: '09129999999', ip: '185.1.1.1', attempts: 6, first: now - 60, last: now }])
    if (path === '/api/activity/permissions') return json(PERMISSIONS)
    if (path === '/api/activity/departments') return json([
      { code: 'cashier', name: 'صندوق', readers: 0, views: 0, downloads: 0,
        topProcess: null, lastViewed: null }])
    if (path === '/api/departments') return json([{ code: 'cooking', name: 'آشپزخانه', count: 1, subs: 0 },
                                                  { code: 'cashier', name: 'صندوق', count: 1, subs: 0 }])
    if (path === '/api/reports') return json({ reports: [] })
    return json([])
  }))
  return gets
}

function mount() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter initialEntries={['/activity']}>
        <Routes>
          <Route path="/activity" element={<Activity />} />
          <Route path="/activity/users/:id" element={<p>صفحهٔ کاربر</p>} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>)
}

describe('Activity', () => {
  it('shows a * holder the four counts and five tabs', async () => {
    session = ADMIN; stub(); mount()
    expect(await screen.findByText('۱۲')).toBeTruthy()
    const tabs = within(screen.getByRole('tablist')).getAllByRole('tab').map((t) => t.textContent)
    expect(tabs).toEqual(['فعالیت هر کاربر', 'مشاهده دپارتمان', 'تاریخچهٔ مجوزها',
                          'مسیر کامنت‌ها', 'ورود ناموفق'])
  })

  it('pages the users by five and opens one', async () => {
    session = ADMIN; stub(); mount()
    expect(await screen.findByText('کاربر ۱')).toBeTruthy()
    expect(screen.queryByText('کاربر ۶')).toBeNull()
    await userEvent.click(screen.getByText('کاربر ۱'))
    expect(await screen.findByText('صفحهٔ کاربر')).toBeTruthy()
  })

  it('lists failed sign-ins in their own tab', async () => {
    session = ADMIN; stub(); mount()
    await userEvent.click(await screen.findByRole('tab', { name: 'ورود ناموفق' }))
    expect(await screen.findByText('09129999999')).toBeTruthy()
    expect(screen.getByText('۶')).toBeTruthy()
  })

  it('names each permission change in Persian, before and after', async () => {
    session = ADMIN; stub(); mount()
    await userEvent.click(await screen.findByRole('tab', { name: 'تاریخچهٔ مجوزها' }))
    expect(await screen.findByText('خواننده ← مدیر')).toBeTruthy()
    expect(screen.getByText('نقش')).toBeTruthy()
    // A policy switch has no one subject: it applies to every non-editor (D16).
    expect(screen.getByText('همهٔ غیرادیتورها')).toBeTruthy()
    expect(screen.getByText('نمایش ← پنهان')).toBeTruthy()
  })

  it('gives a scoped admin two tabs and no *-only counts', async () => {
    session = SCOPED; const gets = stub(); mount()
    expect(await screen.findByText('صندوق')).toBeTruthy()
    const tabs = within(screen.getByRole('tablist')).getAllByRole('tab').map((t) => t.textContent)
    expect(tabs).toEqual(['مشاهده دپارتمان', 'مسیر کامنت‌ها'])
    expect(gets).not.toContain('/api/activity/users')
    await waitFor(() => expect(screen.getAllByText('—').length).toBeGreaterThanOrEqual(2))
  })

  it('refuses a reader', async () => {
    session = READER; stub(); mount()
    expect(await screen.findByText('چیزی اینجا نیست')).toBeTruthy()
  })
})
