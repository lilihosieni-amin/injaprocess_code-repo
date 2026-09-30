import { describe, it, expect, vi, afterEach } from 'vitest'
import { screen, fireEvent, waitFor, render } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { ConfirmAllProcesses } from './ConfirmAllProcesses'
import { ToastProvider } from './ToastProvider'

afterEach(() => vi.restoreAllMocks())

function wrap(ui: React.ReactNode) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={qc}><ToastProvider>{ui}</ToastProvider></QueryClientProvider>,
  )
}

const TARGETS = [
  { target: 'cooking-001', fingerprint: 'a'.repeat(64) },
  { target: 'cooking-014', fingerprint: 'b'.repeat(64) },
  { target: 'cooking-020', fingerprint: 'c'.repeat(64) },
]

/** Answers each POST by target: `status` maps a target to its status, 200 otherwise. */
function mockPosts(status: Record<string, number> = {}) {
  const posts: { url: string; body: unknown }[] = []
  vi.spyOn(globalThis, 'fetch').mockImplementation((input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input)
    if (init?.method === 'POST') posts.push({ url, body: JSON.parse(String(init.body)) })
    const target = url.split('/').pop() ?? ''
    const code = status[target] ?? 200
    const body = code === 200
      ? { target, kind: 'process', fingerprint: 'x', confirmed: true, confirmed_by: 'u', confirmed_at: 1 }
      : { detail: 'این محتوا از زمانی که آن را دیدید تغییر کرده است' }
    return Promise.resolve(new Response(JSON.stringify(body),
      { status: code, headers: { 'Content-Type': 'application/json' } }))
  })
  return posts
}

describe('ConfirmAllProcesses', () => {
  it('asks first, naming the department and how many processes it will confirm', () => {
    mockPosts()
    wrap(<ConfirmAllProcesses code="cooking" deptName="پخت" targets={TARGETS} onClose={vi.fn()} />)
    expect(screen.getByRole('dialog', { name: 'تأیید همهٔ فرآیندهای دپارتمان پخت؟' })).toBeInTheDocument()
    expect(screen.getByText(/۳ فرآیند تأییدنشده تأیید می‌شود/)).toBeInTheDocument()
    expect(screen.getByText(/برای همهٔ کسانی که به این دپارتمان دسترسی دارند/)).toBeInTheDocument()
  })

  it('confirms nothing until «تأیید همه» and nothing at all on «انصراف»', () => {
    const posts = mockPosts()
    const onClose = vi.fn()
    wrap(<ConfirmAllProcesses code="cooking" deptName="پخت" targets={TARGETS} onClose={onClose} />)
    fireEvent.click(screen.getByRole('button', { name: 'انصراف' }))
    expect(onClose).toHaveBeenCalled()
    expect(posts).toEqual([])
  })

  it('confirms every target at the fingerprint the page loaded, one after another', async () => {
    const posts = mockPosts()
    const onClose = vi.fn()
    wrap(<ConfirmAllProcesses code="cooking" deptName="پخت" targets={TARGETS} onClose={onClose} />)
    fireEvent.click(screen.getByRole('button', { name: 'تأیید همه' }))
    await waitFor(() => expect(onClose).toHaveBeenCalled())
    expect(posts).toEqual([
      { url: '/api/confirmations/cooking-001', body: { fingerprint: 'a'.repeat(64) } },
      { url: '/api/confirmations/cooking-014', body: { fingerprint: 'b'.repeat(64) } },
      { url: '/api/confirmations/cooking-020', body: { fingerprint: 'c'.repeat(64) } },
    ])
    expect(await screen.findByText('۳ فرآیند تأیید شد')).toBeInTheDocument()
  })

  it('skips a process that changed since the page loaded and says so', async () => {
    // The single confirm's rule, kept: a document that moved under the editor
    // (409) is not vouched for unseen. The rest still land.
    const posts = mockPosts({ 'cooking-014': 409 })
    const onClose = vi.fn()
    wrap(<ConfirmAllProcesses code="cooking" deptName="پخت" targets={TARGETS} onClose={onClose} />)
    fireEvent.click(screen.getByRole('button', { name: 'تأیید همه' }))
    await waitFor(() => expect(onClose).toHaveBeenCalled())
    expect(posts).toHaveLength(3)
    expect(await screen.findByText(
      '۲ فرآیند تأیید شد · ۱ فرآیند در این فاصله تغییر کرده بود و تأیید نشد')).toBeInTheDocument()
  })

  it('counts any other refusal apart from a change', async () => {
    mockPosts({ 'cooking-020': 403 })
    const onClose = vi.fn()
    wrap(<ConfirmAllProcesses code="cooking" deptName="پخت" targets={TARGETS} onClose={onClose} />)
    fireEvent.click(screen.getByRole('button', { name: 'تأیید همه' }))
    await waitFor(() => expect(onClose).toHaveBeenCalled())
    expect(await screen.findByText('۲ فرآیند تأیید شد · ۱ فرآیند تأیید نشد')).toBeInTheDocument()
  })

  it('looks busy while it works', async () => {
    vi.spyOn(globalThis, 'fetch').mockReturnValue(new Promise<Response>(() => {}))
    wrap(<ConfirmAllProcesses code="cooking" deptName="پخت" targets={TARGETS} onClose={vi.fn()} />)
    fireEvent.click(screen.getByRole('button', { name: 'تأیید همه' }))
    const go = await screen.findByRole('button', { name: /در حال تأیید/ })
    expect(go).toHaveAttribute('aria-busy', 'true')
    expect(go).toBeDisabled()
  })
})
