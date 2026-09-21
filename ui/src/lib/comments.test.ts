import { describe, it, expect } from 'vitest'
import * as L from './comments'
import { STATUS, statusLabel, anchorText, composeContext, pathLine, ageText, waitingText } from './comments'
import type { Comment } from '../api/comments'
import { VIEWER, HEAD, ADMIN } from '../test/sessions'

const base = {
  id: 'CMT-1', text: 't', state: 'awaiting', stage: 'reader', waitingWith: null,
  author: { name: 'x', isMe: true }, createdAt: '', updatedAt: '', approvals: 0, notes: [],
  rejectReason: null, addressed: null,
  actions: { approve: false, reject: false, edit: false, withdraw: false, address: false },
} as const
const anchor = { id: 'dining-003-n020', processId: 'dining-003', department: 'dining',
  departmentName: 'دپارتمان سالن', processName: 'سرو غذا', nodeLabel: 'کنترل دما', orphan: false }
const c = (a: Partial<Comment['anchor']>, w: Comment['waitingWith'] = null): Comment =>
  ({ ...base, waitingWith: w, anchor: { ...anchor, kind: 'node', ...a } }) as Comment

describe('comment labels', () => {
  it('STATUS carries the Reader RST labels and tones', () => {
    expect(STATUS.awaiting).toEqual({ label: 'در انتظار تأیید', bg: 'bg-tile-warn', fg: 'text-icom-control' })
    expect(STATUS.approved).toEqual({ label: 'رسیده به ادیتور', bg: 'bg-tile-v', fg: 'text-violet' })
    expect(STATUS.addressed).toEqual({ label: 'رسیدگی شد', bg: 'bg-tile-ok', fg: 'text-green' })
    expect(STATUS.rejected).toEqual({ label: 'رد شد', bg: 'bg-tile-c', fg: 'text-danger' })
    expect(STATUS.withdrawn).toEqual({ label: 'پس گرفته شد', bg: 'bg-tile-dead', fg: 'text-muted' })
  })
  it('statusLabel uses the Panel ST wording on the panel', () => {
    expect(statusLabel('addressed', 'panel')).toBe('رسیدگی‌شده')
    expect(statusLabel('rejected', 'panel')).toBe('رد شده')
    expect(statusLabel('withdrawn', 'panel')).toBe('پس گرفته شد')
    expect(statusLabel('addressed', 'reader')).toBe('رسیدگی شد')
  })
  it('anchorText for the three kinds', () => {
    expect(anchorText(c({ kind: 'node' }))).toBe('گام «کنترل دما»')
    expect(anchorText(c({ kind: 'process', nodeLabel: null }))).toBe('کل «سرو غذا»')
    expect(anchorText(c({ kind: 'department', processId: null, processName: null, nodeLabel: null }))).toBe('دپارتمان سالن')
  })
  it('composeContext for the three kinds', () => {
    expect(composeContext({ kind: 'node', id: 'dining-003-n020', label: 'کنترل دما', processName: 'سرو غذا' })).toBe('گام «کنترل دما» · سرو غذا')
    expect(composeContext({ kind: 'process', id: 'dining-003' })).toBe('کل این فرآیند، نه یک گام خاص')
    expect(composeContext({ kind: 'department', id: 'dining' })).toBe('اطلاعات کلی دپارتمان، نه یک فرآیند خاص')
  })
  it('pathLine for a reader with and without a supervisor, and for an admin', () => {
    const tail = 'تا وقتی کسی تأیید نکرده، می‌توانید متنش را عوض کنید یا پس بگیرید.'
    expect(pathLine(VIEWER)).toBe(`این کامنت اول برای سرپرست شما می‌رود؛ پس از تأیید او به یکی از ادمین‌ها و سپس به ادیتور می‌رسد. ${tail}`)
    expect(pathLine(VIEWER, 'حسین مازندرانی')).toBe(`این کامنت اول برای حسین مازندرانی می‌رود؛ پس از تأیید او به یکی از ادمین‌ها و سپس به ادیتور می‌رسد. ${tail}`)
    expect(pathLine(HEAD)).toBe(`این کامنت به یکی از ادمین‌ها و سپس به ادیتور می‌رسد. ${tail}`)
    expect(pathLine(ADMIN)).toBe('این کامنت به ادیتور می‌رود. تا وقتی رسیدگی نشده، می‌توانید متنش را عوض کنید یا پس بگیرید.')
  })
  it('ageText', () => {
    const now = new Date('2026-09-21T12:00:00Z')
    expect(ageText('2026-09-21T01:00:00Z', now)).toBe('امروز')
    expect(ageText('2026-09-18T11:00:00Z', now)).toBe('۳ روز پیش')
  })
  it('waitingText for the three kinds', () => {
    expect(waitingText(c({}, { kind: 'person', name: 'حسین مازندرانی' }))).toBe('در انتظار تأیید — حسین مازندرانی')
    expect(waitingText(c({}, { kind: 'pool' }))).toBe('در انتظار تأیید یکی از ادمین‌ها')
    expect(waitingText(c({}, { kind: 'editors' }))).toBe('رسیده به ادیتور')
    expect(waitingText(c({}, null))).toBeNull()
  })
  it('no exported string speaks of amending', () => {
    const text = JSON.stringify(L) + [VIEWER, HEAD, ADMIN].map((s) => pathLine(s)).join()
    expect(text).not.toMatch(/اصلاح متن|اصلاح کامنت/)
  })
})
