import { describe, it, expect, vi, afterEach } from 'vitest'
import { screen, fireEvent, within, waitFor, render } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom'
import { renderAt } from '../test/utils'
import { HEAD, VIEWER } from '../test/sessions'
import type { SessionDescriptor } from '../auth/session'
import type { Comment, InboxTab } from '../api/comments'
import { SurfaceProvider } from '../ui/surface'
import { ToastProvider } from '../write/ToastProvider'
import { ReaderShell } from '../shell/ReaderShell'
import { CommentsScreen } from './CommentsScreen'

afterEach(() => vi.restoreAllMocks())

const json = (body: unknown) =>
  new Response(JSON.stringify(body), { status: 200, headers: { 'Content-Type': 'application/json' } })

const NO = { approve: false, reject: false, edit: false, withdraw: false, address: false }

function cmt(n: number, over: Partial<Comment> = {}): Comment {
  return {
    id: `CMT-${n}`,
    anchor: { kind: 'node', id: 'dining-001-n010', processId: 'dining-001', department: 'dining',
      departmentName: 'سالن', processName: 'پذیرش', nodeLabel: 'خوشامد', orphan: false },
    text: `متن نویسنده ${n}`, state: 'awaiting', stage: 'reader', waitingWith: null,
    author: { name: 'سمیرا احمدی', isMe: false, role: 'reader' },
    createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
    approvals: 0, notes: [], rejectReason: null, addressed: null, actions: NO,
    ...over,
  }
}

/** Where a link out of /comments landed, and the origin it carried. */
function Where() {
  const loc = useLocation()
  return <p data-testid="from">{(loc.state as { from?: string } | null)?.from ?? ''}</p>
}

const page = (items: Comment[]) => ({ items, total: items.length, page: 1, pages: 1 })

function stub(tabs: Partial<Record<InboxTab, Comment[]>>) {
  return vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
    const url = String(input)
    const m = url.match(/^\/api\/comments\/inbox\?tab=(\w+)/)
    if (m) return json(page(tabs[m[1] as InboxTab] ?? []))
    if (url === '/api/departments') return json([{ code: 'dining', name: 'سالن', count: 1, subs: 0 }])
    return json({})
  })
}

const open = (session: SessionDescriptor) => renderAt('/comments', (
  <ToastProvider><SurfaceProvider surface="reader"><CommentsScreen /></SurfaceProvider></ToastProvider>
), '/comments', session)

const posted = (spy: ReturnType<typeof stub>) =>
  spy.mock.calls.filter(([, init]) => init?.method && init.method !== 'GET')

const waiting = () => cmt(1, { actions: { ...NO, approve: true, reject: true } })

describe('reader inbox', () => {
  it('gives an approver three tabs, opens on the waiting one, and offers «تأیید»', async () => {
    const spy = stub({ waiting: [waiting()] })
    open(HEAD)
    expect(await screen.findByText('متن نویسنده 1')).toBeInTheDocument()
    const tabs = screen.getAllByRole('tab').map((t) => t.textContent)
    expect(tabs).toEqual(['در انتظار تأیید شما', 'کامنت‌های من', 'همه'])
    expect(screen.getByRole('tab', { name: 'در انتظار تأیید شما' })).toHaveAttribute('aria-selected', 'true')
    expect(spy.mock.calls.some(([u]) => String(u) === '/api/comments/inbox?tab=waiting&page=1')).toBe(true)
    expect(screen.getByRole('button', { name: 'تأیید' })).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'جزئیات' }))
    expect(screen.getByText('نوشتهٔ سمیرا احمدی')).toBeInTheDocument()
    // a node anchor opens that step (Reader L2715–2716)
    expect(screen.getByRole('link', { name: 'گام «خوشامد»' })).toHaveAttribute('href', '/processes/dining-001/steps?step=dining-001-n010')
    // Reader L71–72: at ≤760 the tray wraps and each tab takes half a row
    expect(screen.getByRole('tablist')).toHaveClass('max760:flex-wrap')
    for (const t of screen.getAllByRole('tab')) expect(t).toHaveClass('max760:basis-tab-half')
    expect(screen.getByText(/کامنت افراد شما اول به شما می‌رسد/)).toBeInTheDocument()
  })

  it('approves with a note: posts {note} only after the modal’s «تأیید می‌کنم»', async () => {
    const spy = stub({ waiting: [waiting()] })
    open(HEAD)
    fireEvent.click(await screen.findByRole('button', { name: 'افزودن یادداشت' }))
    fireEvent.change(screen.getByPlaceholderText('یادداشت شما کنار کامنت او اضافه می‌شود…'),
      { target: { value: 'یک نکته' } })
    fireEvent.click(screen.getByRole('button', { name: 'ثبت یادداشت و تأیید' }))
    const modal = screen.getByRole('dialog', { name: 'با یادداشت شما تأیید شود؟' })
    expect(posted(spy)).toHaveLength(0)
    fireEvent.click(within(modal).getByRole('button', { name: 'تأیید می‌کنم' }))
    await waitFor(() => expect(posted(spy)).toHaveLength(1))
    const [url, init] = posted(spy)[0]
    expect(url).toBe('/api/comments/CMT-1/approve')
    expect(JSON.parse(String(init!.body))).toEqual({ note: 'یک نکته' })
    expect(await screen.findByText('یادداشت شما ثبت و تأیید شد')).toBeInTheDocument()
  })

  it('refuses a rejection with no reason and posts nothing', async () => {
    const spy = stub({ waiting: [waiting()] })
    open(HEAD)
    fireEvent.click(await screen.findByRole('button', { name: 'رد کردن' }))
    // Reader L787: the reason box is edged in --border-danger, not the field's --line.
    expect(screen.getByPlaceholderText('چرا قبول ندارید؟')).toHaveClass('border-border-danger')
    expect(screen.getByPlaceholderText('چرا قبول ندارید؟')).not.toHaveClass('border-line')
    fireEvent.click(screen.getByRole('button', { name: 'ثبت' }))
    expect(await screen.findByText('دلیل رد کردن را بنویسید')).toBeInTheDocument()
    expect(screen.queryByRole('dialog')).toBeNull()
    expect(posted(spy)).toHaveLength(0)
  })

  it('shows a non-approver no tabs, only their own comments, with the author controls', async () => {
    const spy = stub({ own: [cmt(2, { author: { name: 'سمیرا احمدی', isMe: true, role: 'reader' }, actions: { ...NO, edit: true, withdraw: true } })] })
    open(VIEWER)
    expect(await screen.findByText('متن نویسنده 2')).toBeInTheDocument()
    expect(screen.queryByRole('tablist')).toBeNull()
    expect(spy.mock.calls.some(([u]) => String(u) === '/api/comments/inbox?tab=own&page=1')).toBe(true)
    expect(screen.getByRole('button', { name: 'عوض کردن متن' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'پس گرفتن' })).toBeInTheDocument()
    expect(screen.queryByText('تا تأیید نشده می‌توانید متنش را عوض کنید.')).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'جزئیات' }))
    expect(screen.queryByText(/^نوشتهٔ/)).toBeNull()
    expect(screen.getByText('تا تأیید نشده می‌توانید متنش را عوض کنید.')).toBeInTheDocument()
    expect(screen.getByText('کامنت‌هایی که خودتان ثبت کرده‌اید و وضعیت‌شان در زنجیره.')).toBeInTheDocument()
  })

  it('draws every note under the original, which stays as written', async () => {
    stub({ own: [cmt(3, { state: 'approved', approvals: 2, notes: [
      { by: 'حسین مازندرانی', text: 'یادداشت اول', at: '' },
      { by: 'مهدی رجبی', text: 'یادداشت دوم', at: '' },
    ] })] })
    open(VIEWER)
    const original = await screen.findByText('متن نویسنده 3')
    fireEvent.click(screen.getByRole('button', { name: 'جزئیات' }))
    const first = screen.getByText('یادداشت اول')
    const second = screen.getByText('یادداشت دوم')
    expect(screen.getByText('حسین مازندرانی اضافه کرد:')).toBeInTheDocument()
    expect(screen.getByText('مهدی رجبی اضافه کرد:')).toBeInTheDocument()
    expect(original.compareDocumentPosition(first) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    expect(first.compareDocumentPosition(second) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    expect(screen.getByText('رسید به ادیتور.')).toBeInTheDocument()
  })

  it('pages «همه» with the Pager: page 2 asks for page=2', async () => {
    const spy = vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
      const url = String(input)
      const p = Number(url.match(/page=(\d+)/)?.[1] ?? 1)
      if (url.includes('tab=all')) return json({ items: [cmt(10 + p)], total: 11, page: p, pages: 2 })
      return json(page([]))
    })
    open(HEAD)
    fireEvent.click(await screen.findByRole('tab', { name: 'همه' }))
    expect(await screen.findByText('متن نویسنده 11')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'صفحهٔ بعدی' }))
    expect(await screen.findByText('متن نویسنده 12')).toBeInTheDocument()
    expect(spy.mock.calls.some(([u]) => String(u) === '/api/comments/inbox?tab=all&page=2')).toBe(true)
  })

  it('keeps the screen while the next tab loads — no whole-screen skeleton', async () => {
    stub({ waiting: [waiting()] })
    open(HEAD)
    await screen.findByText('متن نویسنده 1')
    fireEvent.click(screen.getByRole('tab', { name: 'کامنت‌های من' }))
    expect(screen.getByRole('heading', { name: 'کامنت‌ها' })).toBeInTheDocument()
  })

  it('«عوض کردن متن» → «دوباره بفرست» PUTs the edited text', async () => {
    const spy = stub({ own: [cmt(2, { author: { name: 'سمیرا احمدی', isMe: true, role: 'reader' }, actions: { ...NO, edit: true, withdraw: true } })] })
    open(VIEWER)
    fireEvent.click(await screen.findByRole('button', { name: 'عوض کردن متن' }))
    const box = screen.getByPlaceholderText('حرفتان را ساده بنویسید…')
    expect(box).toHaveValue('متن نویسنده 2')
    fireEvent.change(box, { target: { value: 'متن تازه' } })
    fireEvent.click(screen.getByRole('button', { name: 'دوباره بفرست' }))
    await waitFor(() => expect(posted(spy)).toHaveLength(1))
    const [url, init] = posted(spy)[0]
    expect(url).toBe('/api/comments/CMT-2')
    expect(init!.method).toBe('PUT')
    expect(JSON.parse(String(init!.body))).toEqual({ text: 'متن تازه' })
  })

  it('shows the design’s empty line', async () => {
    stub({})
    open(VIEWER)
    expect(await screen.findByText('چیزی اینجا نیست')).toBeInTheDocument()
  })

  it('gives the approver tabs to anyone comments can wait on, flag or not', async () => {
    stub({})
    const { unmount } = open({ ...VIEWER, supervisor: null, pendingApprovals: 1 })
    expect(await screen.findByRole('tablist')).toBeInTheDocument()
    unmount()
    open({ ...VIEWER, supervisor: null, scopes: ['*'] })
    expect(await screen.findByRole('tablist')).toBeInTheDocument()
  })

  it('an orphan anchor draws its name but no link', async () => {
    stub({ own: [cmt(4, { anchor: { ...cmt(4).anchor, orphan: true } })] })
    open(VIEWER)
    expect(await screen.findByText('گام «خوشامد»')).toBeInTheDocument()
    expect(screen.queryByRole('link')).toBeNull()
  })

  describe('?c=CMT-n', () => {
    const at = (session: SessionDescriptor, ref: string) => renderAt('/comments', (
      <ToastProvider><SurfaceProvider surface="reader"><CommentsScreen /></SurfaceProvider></ToastProvider>
    ), `/comments?c=${ref}`, session)

    function stubWith(one: Comment, tabs: Partial<Record<InboxTab, Comment[]>>) {
      return vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
        const url = String(input)
        const m = url.match(/^\/api\/comments\/inbox\?tab=(\w+)/)
        if (m) return json(page(tabs[m[1] as InboxTab] ?? []))
        if (url === `/api/comments/${one.id}`) return json({ ...one, trail: [] })
        return json({})
      })
    }

    it("opens «کامنت‌های من» on the viewer's own comment and scrolls it into view once", async () => {
      const scroll = vi.fn()
      Element.prototype.scrollIntoView = scroll
      const mine = cmt(5, { author: { name: 'حسین مازندرانی', isMe: true, role: 'reader' } })
      stubWith(mine, { waiting: [waiting()], own: [cmt(9), mine] })
      at(HEAD, 'CMT-5')
      await waitFor(() => expect(screen.getByRole('tab', { name: 'کامنت‌های من' })).toHaveAttribute('aria-selected', 'true'))
      await waitFor(() => expect(scroll).toHaveBeenCalledTimes(1))
      expect(scroll.mock.contexts[0]).toBe(document.getElementById('cmt-CMT-5'))
      fireEvent.click(screen.getByRole('tab', { name: 'در انتظار تأیید شما' }))
      fireEvent.click(screen.getByRole('tab', { name: 'کامنت‌های من' }))
      await screen.findByText('متن نویسنده 5')
      expect(scroll).toHaveBeenCalledTimes(1)
    })

    it("opens «در انتظار تأیید شما» on a comment that waits on the viewer, not the paged «همه»", async () => {
      Element.prototype.scrollIntoView = vi.fn()
      const mine = cmt(7, { actions: { ...NO, approve: true, reject: true } })
      stubWith(mine, { waiting: [mine], all: [] })
      at(HEAD, 'CMT-7')
      expect(await screen.findByText('متن نویسنده 7')).toBeInTheDocument()
      expect(screen.getByRole('tab', { name: 'در انتظار تأیید شما' })).toHaveAttribute('aria-selected', 'true')
    })

    it("opens the approver's «همه» on someone else's comment", async () => {
      Element.prototype.scrollIntoView = vi.fn()
      const theirs = cmt(6)
      stubWith(theirs, { all: [theirs] })
      at(HEAD, 'CMT-6')
      await waitFor(() => expect(screen.getByRole('tab', { name: 'همه' })).toHaveAttribute('aria-selected', 'true'))
      expect(await screen.findByText('متن نویسنده 6')).toBeInTheDocument()
    })
  })

  it('draws the anchor as a pill, its chevron after the text (Reader L750–753)', async () => {
    stub({ waiting: [waiting()] })
    open(HEAD)
    const pill = await screen.findByRole('link', { name: 'گام «خوشامد»' })
    expect(pill).toHaveClass('rounded-pill', 'bg-value-current', 'text-fs-micro', 'font-semibold', 'text-muted',
      'py-hint', 'ps-option', 'pe-button-icon', 'leading-cmt-pill', 'hover:bg-tile-v', 'hover:text-violet')
    const label = within(pill).getByText('گام «خوشامد»')
    expect(label).toHaveClass('truncate')
    const svg = pill.querySelector('svg')!
    expect(label.compareDocumentPosition(svg) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    expect(svg).toHaveAttribute('width', '10')
    expect(svg).toHaveClass('opacity-70')
  })

  it('keeps the context behind «جزئیات»; the buttons stay outside it', async () => {
    stub({ waiting: [waiting()] })
    open(HEAD)
    const toggle = await screen.findByRole('button', { name: 'جزئیات' })
    expect(toggle).toHaveAttribute('aria-expanded', 'false')
    expect(toggle).toHaveClass('w-full', 'mt-s7', 'pt-option-y', 'border-t', 'border-tile-v', 'text-fs-sm', 'font-bold', 'text-violet')
    expect(toggle.querySelector('path')).toHaveAttribute('d', 'M6 9l6 6 6-6')
    expect(screen.queryByText('نوشتهٔ سمیرا احمدی')).toBeNull()
    expect(screen.getByRole('button', { name: 'تأیید' })).toBeInTheDocument()
    fireEvent.click(toggle)
    expect(toggle).toHaveAttribute('aria-expanded', 'true')
    expect(toggle.querySelector('path')).toHaveAttribute('d', 'M6 15l6-6 6 6')
    expect(screen.getByText('نوشتهٔ سمیرا احمدی')).toBeInTheDocument()
    fireEvent.click(toggle)
    expect(screen.queryByText('نوشتهٔ سمیرا احمدی')).toBeNull()
  })

  it('opens one card at a time', async () => {
    stub({ waiting: [waiting(), cmt(2, { author: { name: 'مهدی رجبی', isMe: false, role: 'reader' } })] })
    open(HEAD)
    const [a, b] = await screen.findAllByRole('button', { name: 'جزئیات' })
    fireEvent.click(a)
    expect(screen.getByText('نوشتهٔ سمیرا احمدی')).toBeInTheDocument()
    fireEvent.click(b)
    expect(screen.getByText('نوشتهٔ مهدی رجبی')).toBeInTheDocument()
    expect(screen.queryByText('نوشتهٔ سمیرا احمدی')).toBeNull()
  })

  it('a note or a rejection in progress holds the card open', async () => {
    stub({ waiting: [waiting()] })
    open(HEAD)
    fireEvent.click(await screen.findByRole('button', { name: 'افزودن یادداشت' }))
    expect(screen.getByRole('button', { name: 'جزئیات' })).toHaveAttribute('aria-expanded', 'true')
    expect(screen.getByText('نوشتهٔ سمیرا احمدی')).toBeInTheDocument()
  })

  it('draws no «جزئیات» when there is nothing behind it', async () => {
    stub({ own: [cmt(8, { state: 'withdrawn', author: { name: 'سمیرا احمدی', isMe: true, role: 'reader' } })] })
    open(VIEWER)
    expect(await screen.findByText('متن نویسنده 8')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'جزئیات' })).toBeNull()
  })

  it('«پس گرفتن» asks first, and posts only on «پس می‌گیرم»', async () => {
    const spy = stub({ own: [cmt(2, { author: { name: 'سمیرا احمدی', isMe: true, role: 'reader' }, actions: { ...NO, edit: true, withdraw: true } })] })
    open(VIEWER)
    fireEvent.click(await screen.findByRole('button', { name: 'پس گرفتن' }))
    let modal = screen.getByRole('dialog', { name: 'این کامنت را پس می‌گیرید؟' })
    expect(within(modal).getByText('کامنت از زنجیره خارج می‌شود و در سابقه می‌ماند.')).toBeInTheDocument()
    expect(within(modal).getByRole('button', { name: 'پس می‌گیرم' })).toHaveClass('bg-coral', 'shadow-coral')
    fireEvent.click(within(modal).getByRole('button', { name: 'بی‌خیال' }))
    expect(screen.queryByRole('dialog')).toBeNull()
    expect(posted(spy)).toHaveLength(0)
    fireEvent.click(screen.getByRole('button', { name: 'پس گرفتن' }))
    modal = screen.getByRole('dialog', { name: 'این کامنت را پس می‌گیرید؟' })
    fireEvent.click(within(modal).getByRole('button', { name: 'پس می‌گیرم' }))
    await waitFor(() => expect(posted(spy)).toHaveLength(1))
    expect(posted(spy)[0][0]).toBe('/api/comments/CMT-2/withdraw')
    expect(await screen.findByText('پس گرفته شد — در سابقه می‌ماند')).toBeInTheDocument()
  })

  it('the anchor pill carries the comment it was opened from', async () => {
    stub({ waiting: [waiting()] })
    renderAt('*', (
      <ToastProvider><SurfaceProvider surface="reader"><Routes>
        <Route path="/comments" element={<CommentsScreen />} />
        <Route path="*" element={<Where />} />
      </Routes></SurfaceProvider></ToastProvider>
    ), '/comments', HEAD)
    fireEvent.click(await screen.findByRole('link', { name: 'گام «خوشامد»' }))
    expect(await screen.findByTestId('from')).toHaveTextContent('/comments?c=CMT-1')
  })

  it('never renders the word «اصلاح» — an approver adds a note, never an amendment', async () => {
    stub({ waiting: [waiting()] })
    open(HEAD)
    fireEvent.click(await screen.findByRole('button', { name: 'افزودن یادداشت' }))
    expect(document.body.textContent).not.toContain('اصلاح')
    expect(document.body.innerHTML).not.toContain('اصلاح')
  })
})

describe('reader top bar comments entry', () => {
  function shell(session: SessionDescriptor, entry: string) {
    stub({})
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    qc.setQueryData(['session'], session)
    return render(
      <QueryClientProvider client={qc}>
        <ToastProvider>
          <MemoryRouter initialEntries={[entry]}>
            <Routes>
              <Route element={<ReaderShell session={session} />}>
                <Route path="/departments" element={<p>فهرست</p>} />
                {/* one department: R4 lands the reader on it */}
                <Route path="/departments/:code" element={<p>فهرست</p>} />
                <Route path="/comments" element={<CommentsScreen />} />
              </Route>
            </Routes>
          </MemoryRouter>
        </ToastProvider>
      </QueryClientProvider>,
    )
  }

  it('shows «۲» for HEAD and links to /comments', async () => {
    shell(HEAD, '/departments')
    const btn = await screen.findByRole('link', { name: /^کامنت‌ها/ })
    expect(btn).toHaveAttribute('href', '/comments')
    expect(btn).toHaveAttribute('title', 'کامنت‌ها')
    expect(btn).toHaveTextContent('۲')
    expect(btn).toHaveClass('w-iconbtn', 'h-iconbtn', 'bg-tile-v2')
  })

  it('carries no badge at zero, and the route renders the inbox', async () => {
    shell(VIEWER, '/departments')
    const btn = await screen.findByRole('link', { name: 'کامنت‌ها' })
    expect(btn.textContent).toBe('')
    fireEvent.click(btn)
    expect(await screen.findByText('چیزی اینجا نیست')).toBeInTheDocument()
  })
})
