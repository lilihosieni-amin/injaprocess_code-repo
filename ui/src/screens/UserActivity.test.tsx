import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { UserActivity } from './UserActivity'
import type { SessionDescriptor } from '../auth/session'

let session: SessionDescriptor | undefined
vi.mock('../auth/useSession', () => ({ useSession: () => ({ data: session }) }))
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals() })

const ADMIN: SessionDescriptor = { username: '09120000001', displayName: 'مهدی', role: 'admin',
  capabilities: ['view', 'comment', 'export_pdf', 'manage_users', 'manage_peers', 'view_audit'],
  scopes: ['*'], supervisor: null, canSupervise: false, pendingApprovals: 0 }
const json = (b: unknown, status = 200) =>
  new Response(JSON.stringify(b), { status, headers: { 'Content-Type': 'application/json' } })
const at = Math.floor(Date.now() / 1000) - 60
const BODY = {
  user: { id: 4, username: '09150000004', displayName: 'نگار مرادی', role: 'reader',
          scopes: ['dept:dining'], disabled: false, logins: 24, failures: 2, sessions: 27,
          activeSeconds: 3120, lastSeen: at },
  total: 8, days: { '20000': 8 },
  rows: [{ id: 2, at, action: 'login.failure', kind: 'access', target: null, ip: '5.120.44.18',
           userAgent: 'Mozilla/5.0 (Windows NT 10.0) Chrome/120', outcome: 'fail', session: null },
         { id: 1, at, action: 'process.viewed', kind: 'content', target: 'dining-002', ip: '5.120.44.18',
           userAgent: 'Mozilla/5.0 (Windows NT 10.0) Chrome/120', outcome: 'ok', session: 'a1b2c3' }],
  sessions: [{ session: 'a1b2c3', issuedAt: at - 600, lastSeen: at, ip: '5.120.44.18',
               userAgent: 'Mozilla/5.0 (iPhone) Safari/605', activeSeconds: 540, state: 'active' }],
}

function stub() {
  const gets: string[] = []
  vi.stubGlobal('fetch', vi.fn(async (path: string) => {
    gets.push(path)
    if (path.startsWith('/api/activity/users/4')) return json(BODY)
    if (path === '/api/departments') return json([{ code: 'dining', name: 'سالن', count: 1, subs: 0 }])
    if (path === '/api/reports') return json({ reports: [] })
    return json({ detail: 'یافت نشد' }, 404)
  }))
  return gets
}

function mount() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(<QueryClientProvider client={qc}>
    <MemoryRouter initialEntries={['/activity/users/4']}>
      <Routes><Route path="/activity/users/:id" element={<UserActivity />} /></Routes>
    </MemoryRouter></QueryClientProvider>)
}

describe('UserActivity', () => {
  it('shows the person, their counts, their events and their sessions', async () => {
    session = ADMIN; stub(); mount()
    expect(await screen.findByText('تاریخچهٔ فعالیت نگار مرادی')).toBeTruthy()
    expect(screen.getByText('۲۴')).toBeTruthy()
    const failure = screen.getByText('ورود ناموفق', { selector: '[data-event]' })
    expect(failure).toBeTruthy()
    // A process id the server withheld arrives as `null` and reads «—».
    expect(failure.closest('[role="row"]')!.querySelector('[data-col="target"]')!.textContent).toBe('—')
    expect(screen.getByText('ناموفق')).toBeTruthy()
    expect(screen.getAllByText('کروم · ویندوز').length).toBe(2)
    expect(screen.getByText('نشست‌های این کاربر')).toBeTruthy()
    expect(screen.getByText('سافاری · آیفون', { exact: false })).toBeTruthy()
  })

  it('asks the server for a kind and for the next page', async () => {
    session = ADMIN; const gets = stub(); mount()
    await screen.findByText('تاریخچهٔ فعالیت نگار مرادی')
    // A Dropdown trigger is named «label value» (Dropdown.tsx, aria-labelledby).
    await userEvent.click(screen.getByRole('button', { name: /^دسته/ }))
    await userEvent.click(screen.getByRole('option', { name: 'محتوا' }))
    await waitFor(() => expect(gets.some((g) => g.includes('kind=content'))).toBe(true))
    await userEvent.click(screen.getByRole('button', { name: 'صفحهٔ بعدی' }))
    await waitFor(() => expect(gets.some((g) => g.includes('offset=6'))).toBe(true))
  })

  it('is 404 for a scoped holder, and asks the server nothing', async () => {
    session = { ...ADMIN, scopes: ['dept:dining'] }; const gets = stub(); mount()
    expect(await screen.findByText('چیزی اینجا نیست')).toBeTruthy()
    expect(gets.some((g) => g.startsWith('/api/activity'))).toBe(false)
  })
})
