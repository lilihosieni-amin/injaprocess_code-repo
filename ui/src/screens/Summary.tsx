import { useNavigate, useParams } from 'react-router-dom'
import { useProcess } from '../api/hooks'
import { Chip } from '../ui/Chip'
import { IdBadge } from '../ui/IdBadge'
import { Button } from '../ui/Button'

export function Summary() {
  const { pid = '' } = useParams()
  const nav = useNavigate()
  const { data: p } = useProcess(pid)
  if (!p) return <div className="flex-1 bg-bg" />

  return (
    <div className="flex-1 overflow-auto py-[30px] px-10">
      <div className="max-w-[960px] mx-auto">
        <div className="flex items-start justify-between gap-4 mb-[22px]">
          <div>
            <div className="flex items-center gap-2.5 mb-2">
              <IdBadge tone="violet">{p.id}</IdBadge>
              {p.parent && <span className="text-[11px] text-violet bg-tile-v px-2.5 py-1 rounded-md font-semibold">زیرفرآیند</span>}
            </div>
            <div className="font-extrabold text-[23px] text-ink">{p.name}</div>
            <div className="text-[13.5px] text-muted mt-2 max-w-[640px] leading-relaxed">{p.summary}</div>
          </div>
          <div className="flex gap-2.5 shrink-0">
            <Button variant="ghost" className="px-4 py-3 text-[13px]">ویرایش اطلاعات</Button>
            <Button variant="coral" onClick={() => nav(`/processes/${p.id}/flow`)} className="px-[18px] py-3 text-[13.5px]">مشاهدهٔ فلوچارت</Button>
          </div>
        </div>

        <div className="bg-white border border-warm rounded-[18px] p-6 mb-5 shadow-card">
          <div className="font-bold text-sm text-violet mb-[18px] flex items-center gap-2">
            <span className="w-2 h-2 bg-coral rounded-full" />نمای IDEF0 سطح فرآیند (A-0)
          </div>
          <div className="grid grid-cols-[1fr_1.4fr_1fr] gap-3.5 items-center">
            <div className="col-start-2 row-start-1 text-center">
              <div className="text-[11px] text-muted mb-1.5">کنترل‌ها ↓</div>
              <div className="flex flex-wrap gap-1.5 justify-center">{p.idef0.controls.map((t, i) => <Chip key={i} kind="control">{t}</Chip>)}</div>
            </div>
            <div className="col-start-3 row-start-2 text-center">
              <div className="text-[11px] text-muted mb-1.5">ورودی‌ها →</div>
              <div className="flex flex-col gap-1.5 items-center">{p.idef0.inputs.map((t, i) => <Chip key={i} kind="input">{t}</Chip>)}</div>
            </div>
            <div className="col-start-2 row-start-2 bg-violet rounded-[14px] px-4 py-[22px] text-center text-white shadow-violet">
              <div className="font-bold text-[15px]">{p.name}</div>
              <div className="font-mono text-[11px] text-[#C9BEEE] mt-1.5" dir="ltr">A-0 · {p.id}</div>
            </div>
            <div className="col-start-1 row-start-2 text-center">
              <div className="text-[11px] text-muted mb-1.5">← خروجی‌ها</div>
              <div className="flex flex-col gap-1.5 items-center">{p.idef0.outputs.map((t, i) => <Chip key={i} kind="output">{t}</Chip>)}</div>
            </div>
            <div className="col-start-2 row-start-3 text-center">
              <div className="flex flex-wrap gap-1.5 justify-center">{p.idef0.mechanisms.map((t, i) => <Chip key={i} kind="mech">{t}</Chip>)}</div>
              <div className="text-[11px] text-muted mt-1.5">↑ مکانیزم‌ها</div>
            </div>
          </div>
        </div>

        <div className="font-bold text-[15px] text-ink mb-3">شاخص‌های کلیدی عملکرد (KPI)</div>
        {p.kpis.length > 0 ? (
          <div className="grid grid-cols-2 gap-3.5">
            {p.kpis.map((k, i) => (
              <div key={i} className="bg-white border border-warm rounded-[14px] px-[18px] py-4">
                <div className="flex items-center justify-between">
                  <div className="font-bold text-sm text-ink">{k.name}</div>
                  {k.target && <div className="text-xs font-bold text-conflict bg-[#FFE9E7] px-2.5 py-0.5 rounded-lg">{k.target}</div>}
                </div>
                <div className="text-xs text-muted mt-2 leading-normal">{k.definition}</div>
              </div>
            ))}
          </div>
        ) : (
          <div className="bg-white border border-dashed border-line rounded-[14px] p-5 text-center text-faint text-[12.5px]">
            شاخصی برای این فرآیند ثبت نشده است. (سامانه اطلاعات را نمی‌سازد؛ فقط از محتوای واقعی جلسه پر می‌شود.)
          </div>
        )}
      </div>
    </div>
  )
}
