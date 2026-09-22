import { test, expect, type Page } from '@playwright/test'
import type { Department, Process, ProcNode } from '../src/api/types'
import type { Comment, CommentDetail, CommentTrailItem } from '../src/api/comments'
import { ADMIN, EDITOR, HEAD, VIEWER } from '../src/test/sessions'
import { expectEveryEndpointStubbed, serve, signedIn } from './_harness'

/**
 * P4 — the comment flows end to end in a real browser, every read stubbed.
 * The harness matches by pathname, so the one list endpoint answers both the
 * process and the department query; the inbox's pages are answered by a
 * route of this file's own (registered last, so tried first).
 */

const DEPARTMENTS: Department[] = [{ code: 'dining', name: 'سالن', count: 1, subs: 0 }]

const step = (id: string, label: string, x: number): ProcNode => ({
  id, type: 'activity', label, description: 'شرح', actor: 'میزبان',
  icom: { inputs: [], controls: [], outputs: [], mechanisms: [] }, subprocess: null,
  position: { x, y: 0 }, layout: 'auto', source: { created_by: '', touched_by: [] },
})

const PROCESS: Process = {
  id: 'dining-003', department: 'dining', name: 'پذیرایی از میهمان', parent: null, summary: 'خلاصه',
  idef0: { inputs: [], controls: [], outputs: [], mechanisms: [] }, kpis: [],
  nodes: [step('n1', 'استقبال', 0), step('n2', 'هدایت به میز', 260)],
  edges: [{ from: 'n1', to: 'n2' }], pending: [],
}

const NO = { approve: false, reject: false, edit: false, withdraw: false, address: false }
const AT = '2026-09-20T08:00:00Z'
const ev = (kind: CommentTrailItem['kind'], name: string): CommentTrailItem =>
  ({ kind, name, note: null, reason: null, commit: null, role: 'reader', at: AT })

function cmt(n: number, over: Partial<CommentDetail> = {}): CommentDetail {
  return {
    id: `CMT-${n}`,
    anchor: { kind: 'node', id: 'n1', processId: 'dining-003', department: 'dining',
      departmentName: 'سالن', processName: 'پذیرایی از میهمان', nodeLabel: 'استقبال', orphan: false },
    text: `متن نویسنده ${n}`, state: 'awaiting', stage: 'reader',
    waitingWith: { kind: 'person', name: 'حسین مازندرانی' },
    author: { name: 'سمیرا احمدی', isMe: false, role: 'reader' },
    createdAt: AT, updatedAt: AT, approvals: 0, notes: [], rejectReason: null, addressed: null,
    actions: NO, trail: [ev('submitted', 'سمیرا احمدی')], ...over,
  }
}

const PROC_CMT: Comment = cmt(2, {
  text: 'کل فرآیند یک مرحله کم دارد',
  anchor: { ...cmt(2).anchor, kind: 'process', id: 'dining-003', nodeLabel: null },
})

const toast = (page: Page) => page.locator('[role="status"][aria-live="polite"]')

/** Resolves with the JSON body of the next write to `path`. */
const nextWrite = (page: Page, path: string) => page.waitForRequest(
  (r) => r.method() === 'POST' && new URL(r.url()).pathname === path).then((r) => r.postDataJSON())

test('reader flow — the node badge, the process drawer and the step drawer', async ({ page }) => {
  await signedIn(page, VIEWER)
  await serve(page, {
    '/api/departments': DEPARTMENTS,
    '/api/pending': [],
    '/api/departments/dining/processes': [PROCESS],
    '/api/confirmations': [],
    '/api/processes/dining-003': PROCESS,
    '/api/comments?process=dining-003': [cmt(1), PROC_CMT],
  })
  await page.goto('/processes/dining-003/flow')
  await page.locator('.react-flow__renderer').waitFor()

  // Reader L523 — one comment on n1, none on n2.
  const badge = page.locator('[title="کامنت دارد"]')
  await expect(badge).toHaveCount(1)
  await expect(badge).toHaveText('۱')

  // The FAB counts process-anchored comments only; its drawer lists them.
  await page.getByRole('button', { name: 'کامنت‌های این صفحه، ۱ مورد' }).click()
  const drawer = page.getByRole('dialog', { name: 'کامنت‌های این فرآیند' })
  await expect(drawer).toBeVisible()
  await expect(drawer.getByText('کل فرآیند یک مرحله کم دارد')).toBeVisible()
  await expect(drawer.getByText('متن نویسنده 1')).toHaveCount(0)
  await expect(drawer.getByRole('button', { name: 'کامنت تازه روی این فرآیند' })).toBeVisible()

  // A step's detail replaces the drawer and carries that step's comment.
  await page.locator('.react-flow__node').filter({ hasText: 'استقبال' }).click()
  await expect(drawer).toHaveCount(0)
  await expect(page.getByText('کامنت‌های این گام (۱)')).toBeVisible()
  await expect(page.getByText('متن نویسنده 1')).toBeVisible()
  await expect(page.getByRole('button', { name: 'کامنت روی این گام' })).toBeVisible()
  await expectEveryEndpointStubbed(page)
})

test('composer on the process list — a department comment is sent', async ({ page }) => {
  await signedIn(page, VIEWER)
  await serve(page, {
    '/api/departments': DEPARTMENTS,
    '/api/pending': [],
    '/api/departments/dining/processes': [PROCESS],
    '/api/confirmations': [],
    '/api/comments?department=dining': [],
  })
  await page.goto('/departments/dining')
  await page.getByRole('button', { name: 'کامنت‌های این صفحه' }).click()
  const drawer = page.getByRole('dialog', { name: 'کامنت‌های این اطلاعات' })
  await expect(drawer.getByText('کامنتی روی این اطلاعات نیست')).toBeVisible()
  await drawer.getByRole('button', { name: 'کامنت تازه' }).click()

  const composer = page.getByRole('dialog', { name: 'چه چیزی درست نیست؟' })
  await expect(composer.getByText('سالن', { exact: true })).toBeVisible()
  await composer.getByRole('textbox').fill('  میزها دیر چیده می‌شوند  ')
  const body = nextWrite(page, '/api/comments')
  await composer.getByRole('button', { name: 'فرستادن' }).click()
  expect(await body).toEqual({ anchorKind: 'department', anchorId: 'dining', text: 'میزها دیر چیده می‌شوند' })
  await expect(toast(page)).toHaveText('کامنت شما ثبت شد')
  // Closing the composer returns to the drawer it came from.
  await expect(page.getByRole('dialog', { name: 'کامنت‌های این اطلاعات' })).toBeVisible()
  await expectEveryEndpointStubbed(page)
})

test('reader inbox — the head approves with a note', async ({ page }) => {
  await signedIn(page, HEAD)
  const waiting = cmt(1, { actions: { ...NO, approve: true, reject: true } })
  await serve(page, {
    '/api/departments': DEPARTMENTS,
    '/api/comments/inbox?tab=waiting&page=1': { items: [waiting], total: 1, page: 1, pages: 1 },
    '/api/comments/CMT-1/approve': waiting,
  })
  await page.goto('/comments')
  await expect(page.getByRole('tab', { name: 'در انتظار تأیید شما' })).toHaveAttribute('aria-selected', 'true')
  await expect(page.getByText('نوشتهٔ سمیرا احمدی')).toBeVisible()

  await page.getByRole('button', { name: 'افزودن یادداشت' }).click()
  await page.getByRole('textbox').fill('در شیفت شب هم همین است')
  await page.getByRole('button', { name: 'ثبت یادداشت و تأیید' }).click()
  const modal = page.getByRole('dialog', { name: 'با یادداشت شما تأیید شود؟' })
  await expect(modal).toBeVisible()
  const body = nextWrite(page, '/api/comments/CMT-1/approve')
  await modal.getByRole('button', { name: 'تأیید می‌کنم' }).click()
  expect(await body).toEqual({ note: 'در شیفت شب هم همین است' })
  await expect(toast(page)).toHaveText('یادداشت شما ثبت و تأیید شد')
  await expectEveryEndpointStubbed(page)
})

test('panel inbox — the admin pages «همهٔ کامنت‌ها»', async ({ page }) => {
  await signedIn(page, ADMIN)
  await serve(page, { '/api/departments': DEPARTMENTS, '/api/pending': [] })
  const asked: string[] = []
  await page.route((u) => u.pathname === '/api/comments/inbox', (route) => {
    const q = new URL(route.request().url()).searchParams
    asked.push(`${q.get('tab')}:${q.get('page')}`)
    const n = Number(q.get('page'))
    const items = q.get('tab') === 'all'
      ? Array.from({ length: n === 1 ? 10 : 2 }, (_, i) => cmt((n - 1) * 10 + i + 1))
      : []
    return route.fulfill({ contentType: 'application/json',
      body: JSON.stringify({ items, total: q.get('tab') === 'all' ? 12 : 0, page: n, pages: q.get('tab') === 'all' ? 2 : 1 }) })
  })
  await page.goto('/comments')
  await expect(page.getByText('کاری لازم نیست')).toBeVisible()
  await page.getByRole('tab', { name: 'همهٔ کامنت‌ها' }).click()
  await expect(page.getByText('متن نویسنده 10', { exact: true })).toBeVisible()
  await page.getByRole('button', { name: 'صفحهٔ بعدی' }).click()
  await expect(page.getByText('متن نویسنده 12', { exact: true })).toBeVisible()
  await expect(page.getByText('متن نویسنده 1', { exact: true })).toHaveCount(0)
  expect(asked).toEqual(expect.arrayContaining(['waiting:1', 'all:1', 'all:2']))
})

test('panel inbox — the editor resolves an approved comment', async ({ page }) => {
  await signedIn(page, EDITOR)
  const ready = cmt(5, {
    state: 'approved', stage: null, waitingWith: { kind: 'editors' }, approvals: 2,
    actions: { ...NO, address: true },
    trail: [ev('submitted', 'سمیرا احمدی'), ev('approved', 'حسین مازندرانی'), { ...ev('approved', 'مهدی رجبی'), role: 'admin' }],
  })
  await serve(page, {
    '/api/departments': DEPARTMENTS,
    '/api/pending': [],
    '/api/comments/inbox?tab=waiting&page=1': { items: [ready], total: 1, page: 1, pages: 1 },
    '/api/comments/CMT-5': ready,
    '/api/comments/CMT-5/address': { ...ready, state: 'addressed' },
  })
  await page.goto('/comments')
  await page.getByRole('link', { name: /متن نویسنده 5/ }).click()
  await expect(page).toHaveURL(/\?c=CMT-5$/)
  await expect(page.getByText('رسیده به شما').last()).toBeVisible()

  await page.getByRole('textbox').fill('گام استقبال جابه‌جا شد')
  await page.getByRole('button', { name: 'ثبت به‌عنوان رسیدگی‌شده' }).click()
  const modal = page.getByRole('dialog', { name: 'این کامنت رسیدگی‌شده ثبت شود؟' })
  const body = nextWrite(page, '/api/comments/CMT-5/address')
  await modal.getByRole('button', { name: 'ثبت می‌کنم' }).click()
  expect(await body).toEqual({ note: 'گام استقبال جابه‌جا شد' })
  await expect(toast(page)).toHaveText('کامنت رسیدگی‌شده ثبت شد')
  await expectEveryEndpointStubbed(page)
})
