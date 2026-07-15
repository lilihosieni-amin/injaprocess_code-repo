import { useEffect, useRef, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { useDepartments, useProcesses } from '../api/hooks'
import { deptMeta } from '../lib/departments'
import { deriveTag, toFa } from '../lib/format'
import { IdBadge } from '../ui/IdBadge'
import { Button } from '../ui/Button'
import { CreateProcessModal } from '../write/CreateProcessModal'
import { DeleteProcessConfirm } from '../write/DeleteProcessConfirm'
import type { Process } from '../api/types'

const TAG_CLS: Record<string, string> = {
  sub: 'text-[#B4690E] bg-[#FBEEDC]', conflict: 'text-conflict bg-[#FFE9E7]',
  kpi: 'text-violet bg-tile-v', plain: 'text-violet bg-tile-v',
  tombstone: 'text-muted bg-[#EDEAF3]',
}

export function ProcessList() {
  const { code = '' } = useParams()
  const nav = useNavigate()
  const [q, setQ] = useState('')
  const [creating, setCreating] = useState(false)
  const [delTarget, setDelTarget] = useState<{ pid: string; name: string } | null>(null)
  const { data: procs = [] } = useProcesses(code)
  const { data: depts = [] } = useDepartments()
  const dept = depts.find((d) => d.code === code)
  const m = deptMeta(code)

  const query = q.trim()
  const list = procs.filter((p) => !query || p.name.includes(query) || p.id.includes(query))
  const activityCount = (p: Process) => p.nodes.filter((n) => n.type === 'activity' && !('removed' in n && n.removed)).length

  // Preserve the list's scroll position across visiting a process and coming back.
  const scrollRef = useRef<HTMLDivElement>(null)
  const restored = useRef(false)
  const scrollKey = `plist-scroll-${code}`
  useEffect(() => {
    const el = scrollRef.current
    if (el && procs.length && !restored.current) {
      el.scrollTop = Number(sessionStorage.getItem(scrollKey) ?? 0)
      restored.current = true
    }
  }, [procs, scrollKey])

  return (
    <div ref={scrollRef} onScroll={(e) => sessionStorage.setItem(scrollKey, String(e.currentTarget.scrollTop))} className="flex-1 overflow-auto py-[30px] px-10">
      <div className="max-w-[920px] mx-auto">
        <div className="flex items-end justify-between gap-4 mb-[22px]">
          <div>
            <div className="flex items-center gap-3">
              <div className={`w-12 h-12 rounded-[14px] flex items-center justify-center shrink-0 ${m.tileClass}`}>
                <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round"><path d={m.icon} /></svg>
              </div>
              <div className="font-extrabold text-[22px] text-ink">دپارتمان {dept?.name ?? ''}</div>
            </div>
            <div className="text-[13px] text-muted mt-2">{toFa(dept?.count ?? procs.length)} فرآیند مستندشده · برای مشاهدهٔ کارت خلاصه و فلوچارت روی هر فرآیند بزنید.</div>
          </div>
          <div className="flex items-center gap-2.5 shrink-0">
            <Button variant="ghost" onClick={() => nav(`/departments/${code}/overview`)} className="px-4 py-[11px] text-[13px]">اطلاعات دپارتمان</Button>
            <Button variant="coral" onClick={() => setCreating(true)} className="px-4 py-[11px] text-[13px]">فرآیند جدید</Button>
          </div>
        </div>

        <div className="relative mb-4">
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="جست‌وجو براساس نام یا شناسهٔ فرآیند…"
            className="w-full box-border px-11 py-[13px] border-[1.5px] border-line rounded-[13px] text-[13px] text-ink bg-white outline-none focus:border-coral" />
        </div>

        <div className="flex flex-col gap-3">
          {list.length === 0 && (
            <div className="text-center py-12 px-5 text-faint bg-white border border-warm rounded-2xl">فرآیندی با این نام پیدا نشد</div>
          )}
          {list.map((p) => {
            const tag = deriveTag(p)
            const tombstoned = !!p.tombstoned
            return (
              <div key={p.id} className={`bg-white border border-warm rounded-2xl px-[19px] py-[17px] flex items-center gap-4 shadow-card ${tombstoned ? 'opacity-60' : ''}`}>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2.5">
                    <IdBadge>{p.id}</IdBadge>
                    <span className="font-bold text-[15px] text-ink">{p.name}</span>
                    <span className={`text-[10.5px] px-2 py-0.5 rounded-full font-semibold ${TAG_CLS[tag.kind]}`}>{tag.label}</span>
                  </div>
                  <div className="text-[12.5px] text-muted mt-1.5 leading-normal">{p.summary}</div>
                  {tombstoned && (p.superseded_by ?? []).length > 0 && (
                    <div className="text-[12px] text-muted mt-1.5 flex flex-wrap gap-2 items-center">
                      <span>جانشین:</span>
                      {(p.superseded_by ?? []).map((h) => (
                        <Link key={h} to={`/processes/${h}`} className="font-mono text-violet underline decoration-dotted">{h}</Link>
                      ))}
                    </div>
                  )}
                </div>
                <div className="text-center shrink-0 min-w-[52px]">
                  <div className="font-extrabold text-[17px] text-violet">{toFa(activityCount(p))}</div>
                  <div className="text-[10px] text-faint">فعالیت</div>
                </div>
                <div className="flex gap-2 shrink-0">
                  <Button variant="ghost" onClick={() => nav(`/processes/${p.id}`)} className="px-3.5 py-[9px] text-[12.5px]">اطلاعات کلی</Button>
                  {!tombstoned && (
                    <Button variant="violet" onClick={() => nav(`/processes/${p.id}/flow`)} className="px-3.5 py-[9px] text-[12.5px]">فلوچارت</Button>
                  )}
                  <button onClick={() => setDelTarget({ pid: p.id, name: p.name })} title={tombstoned ? 'حذف دائمی فرآیند' : 'حذف فرآیند'}
                    className="flex items-center justify-center w-[38px] shrink-0 border-[1.5px] border-[#FDD9D6] bg-[#FFF3F2] rounded-[11px] text-conflict">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 6h18M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2M10 11v6M14 11v6" /></svg>
                  </button>
                </div>
              </div>
            )
          })}
        </div>
      </div>
      {creating && <CreateProcessModal department={code} departmentName={dept?.name ?? ''} onClose={() => setCreating(false)} />}
      {delTarget && <DeleteProcessConfirm pid={delTarget.pid} name={delTarget.name} onClose={() => setDelTarget(null)} />}
    </div>
  )
}
