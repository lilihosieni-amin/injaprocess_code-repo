import { useState, type ReactNode } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import {
  useAddressComment, useApproveComment, useComment, useInbox, useRejectComment,
  type Comment, type CommentDetail, type InboxTab,
} from '../api/comments'
import { ApiError } from '../api/client'
import { can } from '../auth/session'
import { useSession } from '../auth/useSession'
import { STATUS, ageText, statusLabel } from '../lib/comments'
import { jalali, toFa } from '../lib/format'
import { Icon } from '../ui/Icon'
import { NavTabTray } from '../ui/NavTabTray'
import { Pager } from '../ui/Pager'
import { TextField } from '../ui/TextField'
import { Timeline, type TimelineNode } from '../ui/Timeline'
import { LoadFailedScreen, ScreenSkeleton } from '../ui/states'
import { useToast } from '../write/ToastProvider'
import { DecisionModal, type Decision } from './DecisionModal'

/** Panel L4192–4194. */
const TABS = {
  editor: [{ id: 'waiting', label: 'رسیده به شما' }, { id: 'all', label: 'همه' }],
  admin: [
    { id: 'waiting', label: 'در انتظار تأیید' },
    { id: 'own', label: 'کامنت‌های من' },
    { id: 'all', label: 'همهٔ کامنت‌ها' },
  ],
}
/** Panel L5184. */
const INTRO = {
  editor: 'کامنت‌هایی که زنجیرهٔ تأیید را کامل کرده‌اند و منتظر رسیدگی شما هستند.',
  admin: 'کامنت‌هایی که به شما رسیده‌اند: تأیید کنید تا بالاتر برود، یادداشت بگذارید، یا با دلیل رد کنید.',
}
const PER_PAGE = 10

// Panel L1771 / L1804 / L1935 — the three panes share the card frame.
const PANE = 'bg-card border border-border-card rounded-feature shadow-card'
// Panel L1822 / L1832 / L1845 / L1874 — the detail's boxes.
const BOX = 'bg-surface-sub border border-border-current rounded-card p-s9'
const LABEL = 'text-fs-xxs font-bold text-muted'

/**
 * The panel's comments inbox, Panel L1767–1953: the list, and the comment
 * `?c=CMT-n` names beside it (a full-screen overlay at ≤760). Every control is
 * the server's `actions`; the Editor and the Admin differ only in tabs and copy.
 */
export function PanelInbox() {
  const session = useSession().data
  const kind = session && can(session, 'edit') ? 'editor' : 'admin'
  const [params, setParams] = useSearchParams()
  const sel = params.get('c')
  const [tab, setTab] = useState<InboxTab>('waiting')
  const [page, setPage] = useState(1)
  const { data, error, refetch } = useInbox(tab, tab === 'all' ? page : 1)

  if (error) return <LoadFailedScreen message="کامنت‌ها بارگذاری نشد." error={error} onRetry={() => { void refetch() }} />
  if (!data) return <ScreenSkeleton column="list" />

  const from = (data.page - 1) * PER_PAGE + 1
  return (
    <div data-r-cmtwrap className="flex-1 flex min-h-0 gap-s9 py-s10 px-s11 overflow-hidden max760:flex-col max760:gap-0 max760:p-0">
      <div data-r-cmtlist className={`${PANE} w-cmt-list flex-none overflow-hidden flex flex-col min-h-0 max760:flex-auto max760:w-auto max760:border-0 max760:rounded-none max760:shadow-none`}>
        <div className="pt-s9 px-s9 pb-s7 border-b border-hair flex-none">
          <h1 className="m-0 font-extrabold text-fs-dialog text-ink">صندوق کامنت‌ها</h1>
          <p className="m-0 text-fs-caption text-muted mt-s1 leading-normal [text-wrap:pretty]">{INTRO[kind]}</p>
          <NavTabTray tabs={TABS[kind]} value={tab} label="صندوق کامنت‌ها" className="mt-s7"
            onChange={(id) => { setTab(id as InboxTab); setPage(1); setParams({}) }} />
        </div>
        <div className="flex-1 overflow-auto p-s7">
          {data.items.length === 0 && (
            <div className="text-center py-empty-y-inline px-s9 text-faint">
              <div className="text-fs-menu font-semibold text-muted">کاری لازم نیست</div>
              <div className="text-fs-caption mt-s3">کامنتی در این فهرست نیست.</div>
            </div>
          )}
          <div className="flex flex-col gap-s5">
            {data.items.map((c) => <Row key={c.id} c={c} />)}
          </div>
          {tab === 'all' && data.pages > 1 && (
            <Pager from={from} to={from + data.items.length - 1} count={data.total}
              page={data.page} pages={data.pages} onPage={setPage} />
          )}
        </div>
      </div>

      {sel ? <Detail key={sel} cref={sel} onClose={() => setParams({})} /> : (
        <div data-r-hide className={`${PANE} flex-1 flex items-center justify-center p-s12 max760:hidden`}>
          <div className="text-center max-w-cmt-none">
            <div className="w-fab-reader h-fab-reader rounded-card bg-tile-v text-violet flex items-center justify-center mx-auto mb-s7">
              <Icon name="comment" px={26} />
            </div>
            <div className="text-fs-body font-bold text-ink">یک کامنت را انتخاب کنید</div>
            <div className="text-fs-sm2 text-muted mt-s3 leading-sub">متن، جایی که به آن اشاره دارد، و زنجیرهٔ تأییدش اینجا نمایش داده می‌شود.</div>
          </div>
        </div>
      )}
    </div>
  )
}

/** Panel L1790–1802. */
function Row({ c }: { c: Comment }) {
  const st = STATUS[c.state]
  const a = c.anchor
  return (
    <Link to={`?c=${encodeURIComponent(c.id)}`}
      className="block no-underline border-hairline border-warm bg-card rounded-tile p-s7 cursor-pointer shadow-card">
      <div className="flex items-center gap-s4 flex-wrap mb-s4">
        <span className={`text-fs-micro font-semibold py-half px-option rounded-pill ${st.bg} ${st.fg}`}>{statusLabel(c.state, 'panel')}</span>
        <span className="ms-auto text-fs-micro text-faint">{ageText(c.createdAt)}</span>
      </div>
      <div className="text-fs-sm text-ink leading-relaxed [text-wrap:pretty]">{c.text}</div>
      <div className="flex items-center gap-s3 mt-option text-fs-xxs text-muted flex-wrap">
        <span className="font-semibold text-ink-current">{c.author.name}</span>
        <span className="text-faint">·</span>
        <span>{a.nodeLabel || a.processName || a.departmentName}</span>
      </div>
    </Link>
  )
}

/** Panel L4219 `openFlow`: the process's flowchart, or a department's list. */
function flowHref(c: Comment): string {
  return c.anchor.processId
    ? `/processes/${encodeURIComponent(c.anchor.processId)}/flow`
    : `/departments/${encodeURIComponent(c.anchor.department)}`
}

const DAY = 86_400_000

/**
 * The approval chain (Panel L1843–1861, colours L4218–4235) from `trail`, plus
 * the hop it waits on now. `assigned`, `pooled` without a reason and `edited`
 * are routing, not people deciding, so they draw nothing of their own.
 */
function chain(c: CommentDetail, now: Date = new Date()): TimelineNode[] {
  const out: TimelineNode[] = []
  const muted = 'text-muted'
  c.trail.forEach((e, i) => {
    const id = String(i)
    const at = ` · ${jalali(e.at)}`
    const push = (n: Omit<TimelineNode, 'id' | 'role'>) => out.push({ id, role: '', ...n, stateLabel: n.stateLabel + at })
    if (e.kind === 'submitted') push({ name: e.name, state: 'done', mark: '✓', stateLabel: 'نویسنده', tone: 'text-violet' })
    else if (e.kind === 'approved') push({ name: e.name, state: 'done', mark: '✓', stateLabel: e.note ? 'تأیید با یادداشت' : 'تأیید شد' })
    else if (e.kind === 'rejected') push({ name: e.name, state: 'rejected', mark: '×', stateLabel: 'رد شد', tone: 'text-danger' })
    else if (e.kind === 'addressed') push({ name: e.name, state: 'done', mark: '✓', stateLabel: 'رسیدگی شد' })
    else if (e.kind === 'skipped') push({ name: e.name, state: 'pending', mark: '·', stateLabel: 'از روی او گذشت — غیرفعال', tone: muted })
    else if (e.kind === 'withdrawn') push({ name: e.name, state: 'pending', mark: '·', stateLabel: 'پس گرفته شد', tone: muted })
    else if (e.kind === 'pooled' && e.reason === 'cycle') push({ name: 'سامانه', state: 'done', mark: '✓', stateLabel: 'زنجیره شکست — دور', tone: muted })
    else if (e.kind === 'delivered') push({ name: 'سامانه', state: 'done', mark: '✓', stateLabel: 'ادمینی نبود — مستقیم به ادیتور', tone: muted })
  })
  const w = c.waitingWith
  if (w?.kind === 'person') {
    const since = c.trail.at(-1)?.at ?? c.updatedAt
    const days = Math.floor((now.getTime() - new Date(since).getTime()) / DAY)
    out.push({ id: 'wait', role: '', name: w.name, state: 'awaiting', mark: '…', tone: muted,
      stateLabel: days >= 1 ? `در انتظار تأیید — ${toFa(days)} روز` : 'در انتظار تأیید' })
  } else if (w?.kind === 'pool') {
    out.push({ id: 'wait', role: '', name: 'ادمین‌ها', state: 'awaiting', mark: '…', tone: muted, stateLabel: 'در انتظار تأیید یکی از ادمین‌ها' })
  }
  return out
}

// Panel L1878–1897 / L1908–1911. At ≤760 a row stacks, full width (Panel L39–40).
const ROW = 'flex gap-s5 flex-wrap max760:flex-col max760:flex-nowrap max760:gap-s4'
const BTN = 'flex-1 py-s6 px-s8 rounded-button font-bold text-fs-sm cursor-pointer disabled:opacity-60 max760:w-full max760:flex-none max760:min-w-0'
const GHOST = `${BTN} border-hairline border-line bg-card text-violet`
const FIELD = 'text-role-textarea py-textarea-y px-s6 rounded-input leading-normal'

type Mode = null | 'note' | 'reject'

function Detail({ cref, onClose }: { cref: string; onClose: () => void }) {
  const { data: c, error } = useComment(cref)
  const toast = useToast()
  const approve = useApproveComment()
  const reject = useRejectComment()
  const address = useAddressComment()
  const [mode, setMode] = useState<Mode>(null)
  const [text, setText] = useState('')
  const [ask, setAsk] = useState<Decision | null>(null)
  const busy = approve.isPending || reject.isPending || address.isPending

  const pane = (body: ReactNode) => (
    <div data-r-cmtdetail className={`${PANE} flex-1 min-h-0 overflow-auto py-s11 px-s12 max760:fixed max760:inset-0 max760:z-drawer max760:rounded-none max760:border-0 max760:shadow-none`}>
      <div className="max-w-cmt-detail mx-auto">{body}</div>
    </div>
  )
  if (error) return pane(<p className="m-0 text-fs-sm text-muted">کامنت بارگذاری نشد.</p>)
  if (!c) return pane(null)

  const st = STATUS[c.state]
  const a = c.anchor
  const fail = (e: unknown) => toast.show((e instanceof ApiError && e.detail) || 'انجام نشد')
  const done = (msg: string) => () => { toast.show(msg); setMode(null); setText(''); setAsk(null) }
  const switchTo = (m: Mode) => { setMode(mode === m ? null : m); setText('') }

  function askApprove() {
    if (mode === 'note' && !text.trim()) { toast.show('یادداشتتان را بنویسید'); return }
    setAsk(mode === 'note' ? 'note' : 'approve')
  }
  function askReject() {
    if (mode !== 'reject') { switchTo('reject'); return }
    if (!text.trim()) { toast.show('دلیل رد کردن را بنویسید'); return }
    setAsk('reject')
  }
  function confirm() {
    const ref = c!.id
    if (ask === 'reject') {
      reject.mutate({ ref, reason: text.trim() }, { onSuccess: done('کامنت با ذکر دلیل به نویسنده برگشت'), onError: fail })
    } else if (ask === 'resolve') {
      address.mutate({ ref, note: text.trim() || null }, { onSuccess: done('کامنت رسیدگی‌شده ثبت شد'), onError: fail })
    } else {
      const note = ask === 'note' ? text.trim() : null
      approve.mutate({ ref, note }, { onSuccess: done(note ? 'یادداشت شما ثبت و تأیید شد' : 'کامنت تأیید شد'), onError: fail })
    }
  }

  const area = (placeholder: string, rows: number, danger = false) => (
    <TextField multiline rows={rows} label={placeholder} placeholder={placeholder} value={text} onChange={setText}
      boxClassName={`${FIELD} ${danger ? 'border-border-danger' : ''}`} className="mb-s6 [&>label]:sr-only" />
  )

  const rejectedBy = c.trail.filter((e) => e.kind === 'rejected').at(-1)?.name ?? ''
  const outcome = c.state === 'addressed'
    ? { box: 'bg-tile-ok border-border-ok', fg: 'text-green', title: `رسیدگی شد — ${c.addressed?.by ?? ''}`, note: c.addressed?.note || 'بدون یادداشت' }
    : c.state === 'rejected'
      ? { box: 'bg-tile-c border-border-danger', fg: 'text-danger', title: `رد شد — ${rejectedBy}`, note: c.rejectReason ?? '' }
      : null
  const noAction = !c.actions.approve && !c.actions.address && (c.state === 'awaiting' || c.state === 'approved')
  const desk = c.waitingWith?.kind === 'person' ? c.waitingWith.name : 'یکی از ادمین‌ها'

  return pane(
    <>
      <div className="flex items-center gap-s5 mb-s8 flex-wrap">
        <button type="button" data-r-show onClick={onClose}
          className="hidden max760:flex items-center gap-s3 py-s4 px-s6 rounded-input font-bold text-fs-sm2 cursor-pointer bg-card text-violet border-hairline border-line">
          <Icon name="chevronStart" px={15} stroke={2.4} />
          فهرست
        </button>
        <span className={`text-fs-xxs font-semibold py-hint px-note-x rounded-pill ${st.bg} ${st.fg}`}>{statusLabel(c.state, 'panel')}</span>
        <span className="text-fs-xs text-faint">{ageText(c.createdAt)}</span>
      </div>

      <div className={`${BOX} mb-s7`}>
        <div className={`${LABEL} mb-s5`}>این کامنت به چه چیزی اشاره دارد؟</div>
        <div className="flex items-center gap-s4 flex-wrap text-fs-sm2 text-ink-current">
          <span className="font-bold text-ink">{a.departmentName}</span>
          {a.processName && <><span className="text-faint">›</span><span>{a.processName}</span></>}
          {a.kind === 'node' && <><span className="text-faint">›</span><span className="font-semibold text-violet">{a.nodeLabel}</span></>}
          <span dir="ltr" className="font-mono text-fs-micro py-half px-s4 rounded-badge bg-tile-v2 text-muted">{a.id}</span>
        </div>
        {a.orphan && (
          <div className="mt-s5 bg-tile-warn border border-warn-edge rounded-control py-s5 px-s6 text-fs-caption text-icom-control leading-normal">
            این کامنت به فرآیندی اشاره دارد که بعداً جایگزین شده است. متن اصلی و عکس لحظه‌ای آن نگه داشته شده و به‌طور خودکار به چیز دیگری وصل نمی‌شود.
          </div>
        )}
        <Link to={flowHref(c)}
          className="mt-s7 inline-flex items-center gap-button-icon py-option px-s7 rounded-input font-bold text-fs-sm2 no-underline bg-card text-violet border-hairline border-line">
          مشاهده در فلوچارت
        </Link>
      </div>

      <div className={`${BOX} mb-s7`}>
        <div className="mb-s6 text-fs-sm font-bold text-ink">{c.author.name}</div>
        <div className="text-fs-body-lead text-ink leading-loose whitespace-pre-line [text-wrap:pretty]">{c.text}</div>
        {c.notes.map((n, i) => (
          <div key={i} className="mt-s7 border-t border-dashed border-border-current pt-s7">
            <div className={`${LABEL} mb-s4`}>{n.by} اضافه کرد:</div>
            <div className="text-fs-body text-ink leading-loose bg-tile-v4 rounded-control p-s6 whitespace-pre-line">{n.text}</div>
          </div>
        ))}
      </div>

      <div className={`${BOX} mb-s7`}>
        <div className={`${LABEL} mb-s7`}>زنجیرهٔ تأیید</div>
        <Timeline label="زنجیرهٔ تأیید" nodes={chain(c)} />
      </div>

      {c.actions.approve && (
        <div className={BOX}>
          <div className="text-fs-sm font-bold text-ink mb-s1">تصمیم شما</div>
          <div className="text-fs-caption text-muted leading-normal mb-s7 [text-wrap:pretty]">
            تأیید کنید تا به ادیتور برسد، یادداشتی کنار آن بگذارید، یا با ذکر دلیل به نویسنده برگردانید.
          </div>
          {mode === 'note' && area('یادداشت شما کنار کامنت او اضافه می‌شود…', 4)}
          {mode === 'reject' && area('دلیل رد کردن…', 3, true)}
          {mode === null && (
            <div data-r-actions className={ROW}>
              <button type="button" onClick={askApprove} className={`${BTN} min-w-cmt-action border-0 bg-green text-card shadow-green`}>تأیید و ارسال به بالا</button>
              <button type="button" onClick={() => switchTo('note')} className={`${GHOST} min-w-cmt-action`}>افزودن یادداشت</button>
              {c.actions.reject && (
                <button type="button" onClick={askReject} className={`${BTN} min-w-cmt-action border-hairline border-border-danger bg-tile-c2 text-danger`}>رد کردن</button>
              )}
            </div>
          )}
          {mode === 'note' && (
            <div data-r-actions className={ROW}>
              <button type="button" onClick={askApprove} className={`${BTN} min-w-cmt-action-wide border-0 bg-green text-card shadow-green`}>ثبت یادداشت و تأیید</button>
              <button type="button" onClick={() => switchTo('note')} className={`${GHOST} min-w-cmt-action`}>انصراف</button>
            </div>
          )}
          {mode === 'reject' && (
            <div data-r-actions className={ROW}>
              <button type="button" onClick={askReject} className={`${BTN} min-w-cmt-action-wide border-0 bg-coral text-card shadow-coral`}>ثبت رد کردن</button>
              <button type="button" onClick={() => switchTo('reject')} className={`${GHOST} min-w-cmt-action`}>انصراف</button>
            </div>
          )}
        </div>
      )}

      {c.actions.address && (
        <div className={BOX}>
          <div className="text-fs-sm font-bold text-ink mb-s1">رسیدگی</div>
          <div className="text-fs-caption text-muted leading-normal mb-s7 [text-wrap:pretty]">
            این کامنت زنجیره را کامل کرده و به شما رسیده است. می‌توانید در تلگرام با شناسهٔ {c.id} به آن ارجاع دهید، یا اینجا آن را رسیدگی‌شده ثبت کنید.
          </div>
          {area('یادداشت رسیدگی — چه تغییری داده شد…', 3)}
          <div data-r-actions className={ROW}>
            {/* The design's green shadow on this violet button (L1909) is a drift. */}
            <button type="button" onClick={() => setAsk('resolve')} className={`${BTN} min-w-cmt-resolve border-0 bg-violet text-card shadow-violet`}>ثبت به‌عنوان رسیدگی‌شده</button>
            <Link to={flowHref(c)} className={`${GHOST} min-w-cmt-resolve no-underline text-center`}>رفتن به فرآیند</Link>
          </div>
        </div>
      )}

      {noAction && (
        <div className="bg-value-current border border-border-current rounded-card p-s9">
          <div className="text-fs-sm font-bold text-ink mb-s3">در این سطح کاری لازم نیست</div>
          <div className="text-fs-sm2 text-muted leading-sub [text-wrap:pretty]">
            {c.state === 'awaiting'
              ? `این کامنت هنوز در زنجیرهٔ تأیید است و اکنون روی میز ${desk} قرار دارد. تا کامل شدن زنجیره به شما نمی‌رسد.`
              : 'رسیدگی به این کامنت در اختیار ادیتور است؛ شما آن را برای پیگیری شاخهٔ خود می‌بینید.'}
          </div>
        </div>
      )}

      {outcome && (
        <div className={`border rounded-card p-s9 ${outcome.box}`}>
          <div className={`text-fs-sm font-bold mb-s4 ${outcome.fg}`}>{outcome.title}</div>
          <div className="text-fs-sm text-ink-current leading-sub [text-wrap:pretty]">{outcome.note}</div>
          {c.addressed?.commit && (
            <div dir="ltr" className="mt-s5 font-mono text-fs-xs text-violet bg-card border border-line rounded-reveal py-s3 px-s5 inline-block">{c.addressed.commit}</div>
          )}
        </div>
      )}

      {ask && <DecisionModal kind={ask} pending={busy} onConfirm={confirm} onClose={() => setAsk(null)} />}
    </>,
  )
}
