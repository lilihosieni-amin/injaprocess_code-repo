import { describe, it, expect, vi, afterEach } from 'vitest'
import { screen, fireEvent, within, waitFor } from '@testing-library/react'
import { renderAt } from '../test/utils'
import { ADMIN, EDITOR } from '../test/sessions'
import type { SessionDescriptor } from '../auth/session'
import type { Comment, CommentDetail, CommentTrailItem, InboxTab } from '../api/comments'
import { SurfaceProvider } from '../ui/surface'
import { ToastProvider } from '../write/ToastProvider'
import { Route, Routes, useLocation } from 'react-router-dom'
import { CommentsScreen } from './CommentsScreen'

/** Where a link out of /comments landed, and the origin it carried. */
function Where() {
  const loc = useLocation()
  return <p data-testid="from">{(loc.state as { from?: string } | null)?.from ?? ''}</p>
}

afterEach(() => vi.restoreAllMocks())

const json = (body: unknown) =>
  new Response(JSON.stringify(body), { status: 200, headers: { 'Content-Type': 'application/json' } })

const NO = { approve: false, reject: false, edit: false, withdraw: false, address: false }
const AT = '2026-09-20T08:00:00Z'
const ev = (kind: CommentTrailItem['kind'], name: string, over: Partial<CommentTrailItem> = {}): CommentTrailItem =>
  ({ kind, name, note: null, reason: null, commit: null, role: kind === 'pooled' || kind === 'delivered' ? null : 'reader', at: AT, ...over })

function cmt(n: number, over: Partial<CommentDetail> = {}): CommentDetail {
  return {
    id: `CMT-${n}`,
    anchor: { kind: 'node', id: 'dining-001-n010', processId: 'dining-001', department: 'dining',
      departmentName: 'سالن', processName: 'پذیرش', nodeLabel: 'خوشامد', orphan: false },
    text: `متن نویسنده ${n}`, state: 'awaiting', stage: 'pool', waitingWith: { kind: 'pool' },
    author: { name: 'سمیرا احمدی', isMe: false, role: 'reader' },
    createdAt: AT, updatedAt: AT,
    approvals: 1, notes: [], rejectReason: null, addressed: null, actions: NO,
    trail: [ev('submitted', 'سمیرا احمدی'), ev('assigned', 'حسین مازندرانی'),
      ev('approved', 'حسین مازندرانی'), ev('pooled', 'system')],
    ...over,
  }
}

function stub(tabs: Partial<Record<InboxTab, Comment[]>>, details: CommentDetail[] = [], me: SessionDescriptor = ADMIN) {
  return vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
    const url = String(input)
    // a write invalidates ['session'] (the pending count), which refetches it
    if (url === '/api/auth/me') return json(me)
    const m = url.match(/^\/api\/comments\/inbox\?tab=(\w+)/)
    if (m) {
      const items = tabs[m[1] as InboxTab] ?? []
      return json({ items, total: items.length, page: 1, pages: 1 })
    }
    const d = url.match(/^\/api\/comments\/(CMT-\d+)(?:\/\w+)?$/)
    if (d) return json(details.find((c) => c.id === d[1]) ?? cmt(0))
    return json({})
  })
}

const open = (session: SessionDescriptor, url = '/comments') => renderAt('/comments', (
  <ToastProvider><SurfaceProvider surface="panel"><CommentsScreen /></SurfaceProvider></ToastProvider>
), url, session)

const posted = (spy: ReturnType<typeof stub>) =>
  spy.mock.calls.filter(([, init]) => init?.method && init.method !== 'GET')

describe('panel inbox', () => {
  it('gives the Admin three tabs and pages «همهٔ کامنت‌ها»: page 2 asks for page=2', async () => {
    const spy = vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
      const url = String(input)
      const p = Number(url.match(/page=(\d+)/)?.[1] ?? 1)
      if (url.includes('tab=all')) {
        const items = Array.from({ length: p === 1 ? 10 : 2 }, (_, i) => cmt((p - 1) * 10 + i + 1))
        return json({ items, total: 12, page: p, pages: 2 })
      }
      return json({ items: [], total: 0, page: 1, pages: 1 })
    })
    open(ADMIN)
    expect(await screen.findByText('کاری لازم نیست')).toBeInTheDocument()
    expect(screen.getAllByRole('tab').map((t) => t.textContent))
      .toEqual(['در انتظار تأیید', 'کامنت‌های من', 'همهٔ کامنت‌ها'])
    expect(screen.getByText(/کامنت‌هایی که به شما رسیده‌اند/)).toBeInTheDocument()
    // «در انتظار تأیید» is not paged
    expect(screen.queryByRole('button', { name: 'صفحهٔ بعدی' })).toBeNull()
    fireEvent.click(screen.getByRole('tab', { name: 'همهٔ کامنت‌ها' }))
    expect(await screen.findByText('متن نویسنده 10')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'صفحهٔ بعدی' }))
    expect(await screen.findByText('متن نویسنده 12')).toBeInTheDocument()
    expect(spy.mock.calls.some(([u]) => String(u) === '/api/comments/inbox?tab=all&page=2')).toBe(true)
    // nothing selected yet
    expect(screen.getByText('یک کامنت را انتخاب کنید')).toBeInTheDocument()
  })

  it('opens the comment named by ?c= and lets the Admin approve it with a note', async () => {
    const pool = cmt(1, { actions: { ...NO, approve: true, reject: true } })
    const spy = stub({ waiting: [pool] }, [pool])
    open(ADMIN, '/comments?c=CMT-1')
    fireEvent.click(await screen.findByRole('button', { name: 'افزودن یادداشت' }))
    expect(screen.getByText('تأیید کنید تا به ادیتور برسد، یادداشتی کنار آن بگذارید، یا با ذکر دلیل به نویسنده برگردانید.')).toBeInTheDocument()
    fireEvent.change(screen.getByPlaceholderText('یادداشت شما کنار کامنت او اضافه می‌شود…'), { target: { value: 'یک نکته' } })
    fireEvent.click(screen.getByRole('button', { name: 'ثبت یادداشت و تأیید' }))
    const modal = screen.getByRole('dialog', { name: 'با یادداشت شما تأیید شود؟' })
    // Panel L2949: the body is 13.5px on the panel (the reader's is 14px).
    expect(within(modal).getByText(/یک پله بالاتر/)).toHaveClass('text-fs-menu')
    expect(posted(spy)).toHaveLength(0)
    fireEvent.click(within(modal).getByRole('button', { name: 'تأیید می‌کنم' }))
    await waitFor(() => expect(posted(spy)).toHaveLength(1))
    const [url, init] = posted(spy)[0]
    expect(url).toBe('/api/comments/CMT-1/approve')
    expect(JSON.parse(String(init!.body))).toEqual({ note: 'یک نکته' })
  })

  it('selects a comment from the list into ?c= and reads the pool hop as «ادمین‌ها»', async () => {
    const pool = cmt(1)
    stub({ waiting: [pool] }, [pool])
    open(ADMIN)
    fireEvent.click(await screen.findByText('متن نویسنده 1'))
    const trail = await screen.findByRole('list', { name: 'زنجیرهٔ تأیید' })
    expect(within(trail).getByText('ادمین‌ها')).toBeInTheDocument()
    expect(within(trail).getByText('در انتظار تأیید یکی از ادمین‌ها')).toBeInTheDocument()
    expect(within(trail).getByText('سمیرا احمدی')).toBeInTheDocument()
    expect(within(trail).getByText(/^نویسنده/)).toBeInTheDocument()
    expect(within(trail).getByText(/^تأیید شد/)).toBeInTheDocument()
    // the role beside each person (Panel L1853), and under the author (L1841)
    expect(within(trail).getAllByText('خواننده')).toHaveLength(2)
    expect(screen.getAllByText('خواننده').length).toBe(3)
    // the no-action box for an Admin who has nothing to do here
    expect(screen.getByText('در این سطح کاری لازم نیست')).toBeInTheDocument()
  })

  it('shows the Editor an in-flight comment read-only, with the no-action box and no decision', async () => {
    const flight = cmt(2, { stage: 'reader', waitingWith: { kind: 'person', name: 'حسین مازندرانی' },
      trail: [ev('submitted', 'سمیرا احمدی'), ev('assigned', 'حسین مازندرانی')] })
    stub({ all: [flight] }, [flight], EDITOR)
    open(EDITOR, '/comments?c=CMT-2')
    expect(await screen.findByText('در این سطح کاری لازم نیست')).toBeInTheDocument()
    expect(screen.getByText(/اکنون روی میز حسین مازندرانی قرار دارد/)).toBeInTheDocument()
    expect(screen.getAllByRole('tab').map((t) => t.textContent)).toEqual(['رسیده به شما', 'همه'])
    for (const name of ['تأیید و ارسال به بالا', 'افزودن یادداشت', 'رد کردن', 'ثبت به‌عنوان رسیدگی‌شده']) {
      expect(screen.queryByRole('button', { name }), name).toBeNull()
    }
  })

  it('lets the Editor resolve an approved comment through the resolve modal', async () => {
    const done = cmt(3, { state: 'approved', stage: null, waitingWith: { kind: 'editors' }, actions: { ...NO, address: true } })
    const spy = stub({ waiting: [done] }, [done], EDITOR)
    open(EDITOR, '/comments?c=CMT-3')
    fireEvent.change(await screen.findByPlaceholderText('یادداشت رسیدگی — چه تغییری داده شد…'), { target: { value: 'درست شد' } })
    fireEvent.click(screen.getByRole('button', { name: 'ثبت به‌عنوان رسیدگی‌شده' }))
    const modal = screen.getByRole('dialog', { name: 'این کامنت رسیدگی‌شده ثبت شود؟' })
    expect(within(modal).getByText('کامنت بسته می‌شود و نتیجه‌اش به همهٔ کسانی که آن را دیده‌اند نشان داده می‌شود.')).toBeInTheDocument()
    expect(posted(spy)).toHaveLength(0)
    fireEvent.click(within(modal).getByRole('button', { name: 'ثبت می‌کنم' }))
    await waitFor(() => expect(posted(spy)).toHaveLength(1))
    const [url, init] = posted(spy)[0]
    expect(url).toBe('/api/comments/CMT-3/address')
    expect(JSON.parse(String(init!.body))).toEqual({ note: 'درست شد' })
  })

  it('draws each note as «… اضافه کرد:» and never says «اصلاح»', async () => {
    const noted = cmt(4, {
      actions: { ...NO, approve: true, reject: true },
      notes: [{ by: 'حسین مازندرانی', text: 'یادداشت سرپرست', at: AT }],
      trail: [ev('submitted', 'سمیرا احمدی'), ev('assigned', 'حسین مازندرانی'),
        ev('approved', 'حسین مازندرانی', { note: 'یادداشت سرپرست' }), ev('pooled', 'system')],
    })
    stub({ waiting: [noted] }, [noted])
    open(ADMIN, '/comments?c=CMT-4')
    expect(await screen.findByText('حسین مازندرانی اضافه کرد:')).toBeInTheDocument()
    expect(screen.getByText('یادداشت سرپرست')).toBeInTheDocument()
    expect(screen.getByText(/^تأیید با یادداشت/)).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'افزودن یادداشت' }))
    expect(document.body.textContent).not.toContain('اصلاح')
    expect(document.body.innerHTML).not.toContain('اصلاح')
  })

  it('draws the outcome with its commit, and the orphan warning', async () => {
    const closed = cmt(5, {
      state: 'addressed', stage: null, waitingWith: null,
      anchor: { ...cmt(0).anchor, orphan: true },
      addressed: { by: 'آرزو نیک‌پی', at: AT, note: 'گام جدا شد', commit: 'a1b2c3d' },
      trail: [ev('submitted', 'سمیرا احمدی'), ev('delivered', 'system', { reason: 'no_admin' }),
        ev('addressed', 'آرزو نیک‌پی', { commit: 'a1b2c3d' })],
    })
    stub({ all: [closed] }, [closed], EDITOR)
    open(EDITOR, '/comments?c=CMT-5')
    expect(await screen.findByText('رسیدگی شد — آرزو نیک‌پی')).toBeInTheDocument()
    expect(screen.getByText('گام جدا شد')).toBeInTheDocument()
    expect(screen.getByText('a1b2c3d')).toBeInTheDocument()
    expect(screen.getByText(/این کامنت به فرآیندی اشاره دارد که بعداً جایگزین شده است/)).toBeInTheDocument()
    expect(screen.getByText(/^ادمینی نبود — مستقیم به ادیتور/)).toBeInTheDocument()
    expect(screen.queryByText('در این سطح کاری لازم نیست')).toBeNull()
    // the anchor's process is gone: nothing to open
    expect(screen.queryByRole('link', { name: 'مشاهده در فلوچارت' })).toBeNull()
  })

  it('ends an approved comment’s chain with the Editor hop, worded for the viewer', async () => {
    const approved = cmt(6, { state: 'approved', stage: null, waitingWith: { kind: 'editors' },
      trail: [ev('submitted', 'سمیرا احمدی'), ev('delivered', 'system', { reason: 'no_admin' })] })
    stub({ all: [approved] }, [approved], EDITOR)
    const { unmount } = open(EDITOR, '/comments?c=CMT-6')
    let trail = await screen.findByRole('list', { name: 'زنجیرهٔ تأیید' })
    expect(within(trail).getByText('ادیتور')).toBeInTheDocument()
    expect(within(trail).getByText('رسیده به شما')).toBeInTheDocument()
    unmount()
    stub({ all: [approved] }, [approved], ADMIN)
    open(ADMIN, '/comments?c=CMT-6')
    trail = await screen.findByRole('list', { name: 'زنجیرهٔ تأیید' })
    expect(within(trail).getByText('در انتظار رسیدگی ادیتور')).toBeInTheDocument()
  })

  it('opens the flowchart on the anchored step', async () => {
    const pool = cmt(7)
    stub({ waiting: [pool] }, [pool])
    open(ADMIN, '/comments?c=CMT-7')
    expect(await screen.findByRole('link', { name: 'مشاهده در فلوچارت' }))
      .toHaveAttribute('href', '/processes/dining-001/flow?node=dining-001-n010')
  })

  it('«مشاهده در فلوچارت» carries the comment it was opened from', async () => {
    const pool = cmt(7)
    stub({ waiting: [pool] }, [pool])
    renderAt('*', (
      <ToastProvider><SurfaceProvider surface="panel"><Routes>
        <Route path="/comments" element={<CommentsScreen />} />
        <Route path="*" element={<Where />} />
      </Routes></SurfaceProvider></ToastProvider>
    ), '/comments?c=CMT-7', ADMIN)
    fireEvent.click(await screen.findByRole('link', { name: 'مشاهده در فلوچارت' }))
    expect(await screen.findByTestId('from')).toHaveTextContent('/comments?c=CMT-7')
  })

  it('the resolve box has no «رفتن به فرآیند»; the anchor box keeps «مشاهده در فلوچارت»', async () => {
    const done = cmt(3, { state: 'approved', stage: null, waitingWith: { kind: 'editors' }, actions: { ...NO, address: true } })
    stub({ waiting: [done] }, [done], EDITOR)
    open(EDITOR, '/comments?c=CMT-3')
    expect(await screen.findByRole('button', { name: 'ثبت به‌عنوان رسیدگی‌شده' })).toBeInTheDocument()
    expect(screen.queryByText('رفتن به فرآیند')).toBeNull()
    expect(screen.getByRole('link', { name: 'مشاهده در فلوچارت' })).toBeInTheDocument()
  })

  it('draws the comment text box above the anchor box (Panel L1819), at 11px author (lili, smaller than the design) and 15px text', async () => {
    const pool = cmt(4)
    stub({ waiting: [pool] }, [pool])
    open(ADMIN, '/comments?c=CMT-4')
    const anchorLabel = await screen.findByText('این کامنت به چه چیزی اشاره دارد؟')
    const detail = anchorLabel.closest('[data-r-cmtdetail]') as HTMLElement
    const text = within(detail).getByText('متن نویسنده 4')
    expect(text.compareDocumentPosition(anchorLabel) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    expect(text).toHaveClass('text-fs-lg', 'leading-loose')
    expect(within(detail).getAllByText('سمیرا احمدی')[0]).toHaveClass('text-fs-xxs', 'font-bold')
  })

  it('shows the comment id in the detail header and copies it on click (the id the Editor quotes to the bot)', async () => {
    const c = cmt(8)
    stub({ waiting: [c] }, [c], EDITOR)
    const writeText = vi.fn().mockResolvedValue(undefined)
    Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true })
    open(EDITOR, '/comments?c=CMT-8')
    const anchorLabel = await screen.findByText('این کامنت به چه چیزی اشاره دارد؟')
    const detail = anchorLabel.closest('[data-r-cmtdetail]') as HTMLElement
    const chip = within(detail).getByRole('button', { name: 'CMT-8' })
    fireEvent.click(chip)
    expect(writeText).toHaveBeenCalledWith('CMT-8')
  })

  it('marks the open comment’s row as selected; the others stay plain', async () => {
    const a = cmt(5), b = cmt(6)
    stub({ waiting: [a, b] }, [a, b])
    open(ADMIN, '/comments?c=CMT-5')
    const on = (await screen.findAllByText('متن نویسنده 5'))[0].closest('a')!
    const off = screen.getByText('متن نویسنده 6').closest('a')!
    expect(on).toHaveAttribute('aria-current', 'true')
    expect(on).toHaveClass('bg-tile-v4', 'border-border-current', 'border-hairline')
    expect(on).not.toHaveClass('border-warm')
    expect(off).not.toHaveAttribute('aria-current')
    expect(off).toHaveClass('bg-card', 'border-warm')
    expect(off).not.toHaveClass('bg-tile-v4')
  })
})
