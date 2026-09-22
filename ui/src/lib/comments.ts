import type { Comment, CommentRole, CommentState } from '../api/comments'
import type { SessionDescriptor } from '../auth/session'
import { can } from '../auth/session'
import { toFa } from './format'

/** Reader design `RST` (Inja Reader.dc.html L1291), hex mapped to tokens. */
export const STATUS: Record<CommentState, { label: string; bg: string; fg: string }> = {
  awaiting: { label: 'در انتظار تأیید', bg: 'bg-tile-warn', fg: 'text-icom-control' },
  approved: { label: 'رسیده به ادیتور', bg: 'bg-tile-v', fg: 'text-violet' },
  addressed: { label: 'رسیدگی شد', bg: 'bg-tile-ok', fg: 'text-green' },
  rejected: { label: 'رد شد', bg: 'bg-tile-c', fg: 'text-danger' },
  withdrawn: { label: 'پس گرفته شد', bg: 'bg-tile-dead', fg: 'text-muted' },
}

/** Panel design `ST` (Inja Panel.dc.html L3870) words two states differently. */
const PANEL_LABEL: Partial<Record<CommentState, string>> = { addressed: 'رسیدگی‌شده', rejected: 'رد شده' }

/** The design's `authorRole` / trail `role` (Panel L1841, L1853). */
const ROLE: Record<CommentRole, string> = { reader: 'خواننده', admin: 'ادمین', editor: 'ادیتور' }
export const roleLabel = (r: CommentRole | null) => (r ? ROLE[r] : '')

export const statusLabel = (state: CommentState, surface: 'reader' | 'panel') =>
  (surface === 'panel' && PANEL_LABEL[state]) || STATUS[state].label

/** Reader L2714. */
/**
 * The department as the design's comment data names it — «دپارتمان سالن»
 * (Reader L1246, Panel L3237): the server sends the registry name alone
 * (ledger, Task 4), so the word is added here.
 */
export const deptLabel = (name: string | null): string => `دپارتمان ${name ?? ''}`

export function anchorText(c: Comment): string {
  const a = c.anchor
  if (a.kind === 'department') return deptLabel(a.departmentName)
  if (a.kind === 'node') return `گام «${a.nodeLabel ?? ''}»`
  return `کل «${a.processName ?? ''}»`
}

export type ComposeAnchor =
  | { kind: 'node'; id: string; label: string; processName: string }
  | { kind: 'process'; id: string }
  | { kind: 'department'; id: string }

/** Reader L2601. */
export function composeContext(a: ComposeAnchor): string {
  if (a.kind === 'node') return `گام «${a.label}» · ${a.processName}`
  if (a.kind === 'department') return 'اطلاعات کلی دپارتمان، نه یک فرآیند خاص'
  return 'کل این فرآیند، نه یک گام خاص'
}

const UNTIL = 'تا وقتی کسی تأیید نکرده، می‌توانید متنش را عوض کنید یا پس بگیرید.'

/**
 * The composer's path line (addendum §7.1). The session names the supervisor by
 * username only, so the name is shown only when a caller has it.
 */
export function pathLine(s: SessionDescriptor, supervisorName?: string | null): string {
  if (can(s, 'manage_users') && !can(s, 'edit'))
    // An admin's comment is approved at submit (D63.5): no edit/withdraw window (D73).
    return 'این کامنت مستقیم به ادیتور می‌رود.'
  if (s.supervisor)
    return `این کامنت اول برای ${supervisorName || 'سرپرست شما'} می‌رود؛ پس از تأیید او به یکی از ادمین‌ها و سپس به ادیتور می‌رسد. ${UNTIL}`
  return `این کامنت به یکی از ادمین‌ها و سپس به ادیتور می‌رسد. ${UNTIL}`
}

export function ageText(iso: string, now: Date = new Date()): string {
  const days = Math.floor((now.getTime() - new Date(iso).getTime()) / 86_400_000)
  return days < 1 ? 'امروز' : `${toFa(days)} روز پیش`
}
