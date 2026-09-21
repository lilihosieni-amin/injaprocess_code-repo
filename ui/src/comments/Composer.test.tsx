import { describe, it, expect, vi, afterEach } from 'vitest'
import { screen, fireEvent, waitFor } from '@testing-library/react'
import { readFileSync, readdirSync, statSync, existsSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { renderAt } from '../test/utils'
import { VIEWER } from '../test/sessions'
import { ToastProvider } from '../write/ToastProvider'
import { CommentsProvider } from './CommentsProvider'
import { DeptFab } from './DeptDrawer'
import { SurfaceProvider, type Surface } from '../ui/surface'

afterEach(() => vi.restoreAllMocks())

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })

function stub(post: (body: unknown) => Response) {
  return vi.spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => {
    const url = String(input)
    if (init?.method === 'POST' && url === '/api/comments') return post(JSON.parse(String(init.body)))
    if (url.startsWith('/api/comments?department=')) return json([])
    if (url === '/api/departments') return json([{ code: 'dining', name: 'سالن', count: 1, subs: 0 }])
    return json({}, 404)
  })
}

function openComposer(surface: Surface = 'panel') {
  renderAt('/departments/:code', (
    <SurfaceProvider surface={surface}>
      <ToastProvider><CommentsProvider><DeptFab code="dining" /></CommentsProvider></ToastProvider>
    </SurfaceProvider>
  ), '/departments/dining', VIEWER)
  fireEvent.click(screen.getByRole('button', { name: 'کامنت‌های این صفحه' }))
  fireEvent.click(screen.getByRole('button', { name: 'کامنت تازه' }))
}

describe('Composer', () => {
  it('posts the anchor and the text, toasts, and returns to the drawer it came from', async () => {
    const posted: unknown[] = []
    const fetch = stub((b) => { posted.push(b); return json({ id: 'CMT-1' }, 201) })
    openComposer()
    expect(screen.getByRole('dialog', { name: 'کامنت تازه' })).toBeInTheDocument()
    expect(await screen.findByText('سالن', { selector: 'div' })).toBeInTheDocument()
    expect(screen.getByText('اطلاعات کلی دپارتمان، نه یک فرآیند خاص')).toBeInTheDocument()
    fireEvent.change(screen.getByRole('textbox'), { target: { value: '  میزها دیر چیده می‌شوند  ' } })
    fireEvent.click(screen.getByRole('button', { name: 'ثبت کامنت' }))
    await screen.findByText('کامنت شما ثبت شد')
    expect(posted).toEqual([{ anchorKind: 'department', anchorId: 'dining', text: 'میزها دیر چیده می‌شوند' }])
    expect(fetch).toHaveBeenCalled()
    expect(screen.queryByRole('dialog', { name: 'کامنت تازه' })).toBeNull()
    expect(screen.getByRole('dialog', { name: 'کامنت‌های این خلاصه' })).toBeInTheDocument()
  })

  it('draws the Reader composer (§1.10) on the reader surface, with the path line', () => {
    stub(() => json({}, 201))
    openComposer('reader')
    expect(screen.getByRole('dialog', { name: 'چه چیزی درست نیست؟' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'فرستادن' })).toBeInTheDocument()
    expect(screen.getByText(/این کامنت اول برای سرپرست شما می‌رود/)).toBeInTheDocument()
  })

  it('refuses empty text with a toast and posts nothing', async () => {
    const posted: unknown[] = []
    stub((b) => { posted.push(b); return json({}, 201) })
    openComposer()
    fireEvent.change(screen.getByRole('textbox'), { target: { value: '   ' } })
    fireEvent.click(screen.getByRole('button', { name: 'ثبت کامنت' }))
    expect(await screen.findByText('چند خط بنویسید تا ثبت شود')).toBeInTheDocument()
    expect(posted).toEqual([])
  })

  it("shows the server's 422 detail as the toast and keeps the text", async () => {
    stub(() => json({ detail: 'متن بیشتر از ۲۰۰۰ نویسه است' }, 422))
    openComposer()
    fireEvent.change(screen.getByRole('textbox'), { target: { value: 'x'.repeat(2001) } })
    fireEvent.click(screen.getByRole('button', { name: 'ثبت کامنت' }))
    expect(await screen.findByText('متن بیشتر از ۲۰۰۰ نویسه است')).toBeInTheDocument()
    expect((screen.getByRole('textbox') as HTMLTextAreaElement).value).toHaveLength(2001)
  })

  it('closing the composer re-opens the drawer it came from', async () => {
    stub(() => json({}, 201))
    openComposer()
    fireEvent.click(screen.getByRole('button', { name: 'انصراف' }))
    await waitFor(() => expect(screen.getByRole('dialog', { name: 'کامنت‌های این خلاصه' })).toBeInTheDocument())
    expect(screen.queryByRole('textbox')).toBeNull()
  })
})

/**
 * The export must never carry the comment UI. It lives in `ui/export/` (the
 * brief says `src/export/`, which does not exist; both are scanned) and imports
 * `src/flow/*` directly, so the check follows imports transitively.
 */
describe('the export is free of comments', () => {
  const UI = process.cwd()
  function walk(dir: string, out: string[] = []): string[] {
    if (!existsSync(dir)) return out
    for (const n of readdirSync(dir)) {
      const p = join(dir, n)
      if (statSync(p).isDirectory()) walk(p, out)
      else if (/\.tsx?$/.test(n) && !/\.test\.tsx?$/.test(n)) out.push(p)
    }
    return out
  }
  const resolveImport = (from: string, spec: string) => {
    const base = resolve(dirname(from), spec)
    return [base, `${base}.ts`, `${base}.tsx`, join(base, 'index.ts'), join(base, 'index.tsx')]
      .find((p) => existsSync(p) && statSync(p).isFile())
  }

  it('no module reachable from the export imports src/comments', () => {
    const seen = new Set<string>()
    const queue = [...walk(join(UI, 'export')), ...walk(join(UI, 'src/export'))]
    expect(queue.length).toBeGreaterThan(0)
    while (queue.length) {
      const f = queue.pop()!
      if (seen.has(f)) continue
      seen.add(f)
      for (const m of readFileSync(f, 'utf8').matchAll(/from\s+'(\.[^']+)'/g)) {
        const p = resolveImport(f, m[1])
        if (p) queue.push(p)
      }
    }
    expect([...seen].filter((p) => p.includes(`${join('src', 'comments')}`))).toEqual([])
    expect([...seen].some((p) => p.endsWith(join('src', 'flow', 'Canvas.tsx')))).toBe(true)
  })
})
