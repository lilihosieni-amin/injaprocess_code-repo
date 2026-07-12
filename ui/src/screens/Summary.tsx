import { useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { useProcess, usePutProcess } from '../api/hooks'
import { useToast } from '../write/ToastProvider'
import type { Process, Icom, Kpi } from '../api/types'
import { Chip } from '../ui/Chip'
import { IdBadge } from '../ui/IdBadge'
import { Button } from '../ui/Button'

function ListEditor({ label, items, onChange }: { label: string; items: string[]; onChange: (v: string[]) => void }) {
  return (
    <div>
      <div className="text-[12px] font-bold text-ink mb-2">{label}</div>
      <div className="flex flex-col gap-1.5">
        {items.map((it, i) => (
          <div key={i} className="flex gap-1.5 items-center">
            <input value={it} onChange={(e) => onChange(items.map((x, k) => (k === i ? e.target.value : x)))}
              className="flex-1 px-3 py-2 border-[1.5px] border-line rounded-[9px] text-[12.5px] text-ink outline-none focus:border-coral" />
            <button onClick={() => onChange(items.filter((_, k) => k !== i))} className="w-[30px] h-[30px] shrink-0 border-[1.5px] border-[#FDD9D6] bg-[#FFF3F2] text-conflict rounded-[9px]">×</button>
          </div>
        ))}
        <button onClick={() => onChange([...items, ''])} className="self-start text-[11.5px] font-semibold text-violet border-[1.5px] border-dashed border-[#C9B8EC] bg-[#F8F4FE] rounded-[9px] px-3 py-1.5">افزودن</button>
      </div>
    </div>
  )
}

export function Summary() {
  const { pid = '' } = useParams()
  const nav = useNavigate()
  const { data: p } = useProcess(pid)
  const put = usePutProcess(pid)
  const toast = useToast()

  type Draft = { name: string; summary: string; idef0: Icom; kpis: Kpi[] }
  const [draft, setDraft] = useState<Draft | null>(null)
  const editing = draft !== null

  if (!p) return <div className="flex-1 bg-bg" />

  const proc: Process = p
  function enter() { setDraft({ name: proc.name, summary: proc.summary, idef0: { ...proc.idef0 }, kpis: proc.kpis.map((k) => ({ ...k })) }) }
  function save() {
    const doc: Process = { ...proc, name: draft!.name, summary: draft!.summary, idef0: draft!.idef0, kpis: draft!.kpis }
    put.mutate(doc, { onSuccess: () => { setDraft(null); toast.show('اطلاعات فرآیند ذخیره شد') } })
  }
  const setIcom = (key: keyof Icom, items: string[]) => setDraft((d) => d && ({ ...d, idef0: { ...d.idef0, [key]: items } }))
  const setKpi = (i: number, p2: Partial<Kpi>) => setDraft((d) => d && ({ ...d, kpis: d.kpis.map((k, k2) => (k2 === i ? { ...k, ...p2 } : k)) }))

  return (
    <div className="flex-1 overflow-auto py-[30px] px-10">
      <div className="max-w-[960px] mx-auto">
        <div className="flex items-start justify-between gap-4 mb-[22px]">
          <div>
            <div className="flex items-center gap-2.5 mb-2">
              <IdBadge tone="violet">{proc.id}</IdBadge>
              {proc.parent && <span className="text-[11px] text-violet bg-tile-v px-2.5 py-1 rounded-md font-semibold">زیرفرآیند</span>}
            </div>
            {!editing ? (
              <>
                <div className="font-extrabold text-[23px] text-ink">{proc.name}</div>
                <div className="text-[15px] text-muted mt-2 max-w-[640px] leading-relaxed">{proc.summary}</div>
              </>
            ) : (
              <>
                <input value={draft!.name} onChange={(e) => setDraft({ ...draft!, name: e.target.value })} placeholder="نام فرآیند"
                  className="w-[520px] max-w-full font-extrabold text-[19px] text-ink border-[1.5px] border-line rounded-xl px-3 py-2 outline-none focus:border-coral" />
                <textarea value={draft!.summary} onChange={(e) => setDraft({ ...draft!, summary: e.target.value })} rows={2} placeholder="خلاصهٔ فرآیند"
                  className="w-[520px] max-w-full mt-2 text-[13px] text-ink border-[1.5px] border-line rounded-xl px-3 py-2 outline-none focus:border-coral resize-y" />
              </>
            )}
          </div>
          <div className="flex gap-2.5 shrink-0">
            {!editing ? (
              <>
                <Button variant="ghost" onClick={enter} className="px-4 py-3 text-[13px]">ویرایش اطلاعات</Button>
                <Button variant="coral" onClick={() => nav(`/processes/${proc.id}/flow`)} className="px-[18px] py-3 text-[13.5px]">مشاهدهٔ فلوچارت</Button>
              </>
            ) : (
              <>
                <Button variant="ghost" onClick={() => setDraft(null)} className="px-4 py-3 text-[13px]">انصراف</Button>
                <Button variant="green" onClick={save} disabled={put.isPending} className="px-[18px] py-3 text-[13.5px]">ذخیره</Button>
              </>
            )}
          </div>
        </div>

        {!editing ? (
          <>
            <div className="bg-white border border-warm rounded-[18px] p-6 mb-5 shadow-card">
              <div className="font-bold text-sm text-violet mb-[18px] flex items-center gap-2">
                <span className="w-2 h-2 bg-coral rounded-full" />نمای IDEF0 سطح فرآیند (A-0)
              </div>
              <div className="grid grid-cols-[1fr_1.4fr_1fr] gap-3.5 items-center">
                <div className="col-start-2 row-start-1 text-center">
                  <div className="text-[11px] text-muted mb-1.5">کنترل‌ها ↓</div>
                  <div className="flex flex-wrap gap-1.5 justify-center">{proc.idef0.controls.map((t, i) => <Chip key={i} kind="control">{t}</Chip>)}</div>
                </div>
                <div className="col-start-3 row-start-2 text-center">
                  <div className="text-[11px] text-muted mb-1.5">ورودی‌ها →</div>
                  <div className="flex flex-col gap-1.5 items-center">{proc.idef0.inputs.map((t, i) => <Chip key={i} kind="input">{t}</Chip>)}</div>
                </div>
                <div className="col-start-2 row-start-2 bg-violet rounded-[14px] px-4 py-[22px] text-center text-white shadow-violet">
                  <div className="font-bold text-[15px]">{proc.name}</div>
                  <div className="font-mono text-[11px] text-[#C9BEEE] mt-1.5" dir="ltr">A-0 · {proc.id}</div>
                </div>
                <div className="col-start-1 row-start-2 text-center">
                  <div className="text-[11px] text-muted mb-1.5">← خروجی‌ها</div>
                  <div className="flex flex-col gap-1.5 items-center">{proc.idef0.outputs.map((t, i) => <Chip key={i} kind="output">{t}</Chip>)}</div>
                </div>
                <div className="col-start-2 row-start-3 text-center">
                  <div className="flex flex-wrap gap-1.5 justify-center">{proc.idef0.mechanisms.map((t, i) => <Chip key={i} kind="mech">{t}</Chip>)}</div>
                  <div className="text-[11px] text-muted mt-1.5">↑ مکانیزم‌ها</div>
                </div>
              </div>
            </div>

            <div className="font-bold text-[15px] text-ink mb-3">شاخص‌های کلیدی عملکرد (KPI)</div>
            {proc.kpis.length > 0 ? (
              <div className="grid grid-cols-2 gap-3.5">
                {proc.kpis.map((k, i) => (
                  <div key={i} className="bg-white border border-warm rounded-[14px] px-[18px] py-4">
                    <div className="flex items-center justify-between">
                      <div className="font-bold text-sm text-ink">{k.name}</div>
                      {k.target && <div className="text-xs font-bold text-conflict bg-[#FFE9E7] px-2.5 py-0.5 rounded-lg">{k.target}</div>}
                    </div>
                    <div className="text-[13.5px] text-muted mt-2 leading-relaxed">{k.definition}</div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="bg-white border border-dashed border-line rounded-[14px] p-5 text-center text-faint text-[12.5px]">
                شاخصی برای این فرآیند ثبت نشده است. (سامانه اطلاعات را نمی‌سازد؛ فقط از محتوای واقعی جلسه پر می‌شود.)
              </div>
            )}
          </>
        ) : (
          <>
            <div className="bg-white border border-warm rounded-[18px] p-6 mb-5 shadow-card grid grid-cols-2 gap-5">
              <ListEditor label="ورودی‌ها" items={draft!.idef0.inputs} onChange={(v) => setIcom('inputs', v)} />
              <ListEditor label="کنترل‌ها" items={draft!.idef0.controls} onChange={(v) => setIcom('controls', v)} />
              <ListEditor label="خروجی‌ها" items={draft!.idef0.outputs} onChange={(v) => setIcom('outputs', v)} />
              <ListEditor label="مکانیزم‌ها" items={draft!.idef0.mechanisms} onChange={(v) => setIcom('mechanisms', v)} />
            </div>
            <div className="flex flex-col gap-3">
              {draft!.kpis.map((k, i) => (
                <div key={i} className="bg-white border border-warm rounded-[14px] p-4 flex gap-2.5 items-start">
                  <div className="flex-1 flex flex-col gap-2">
                    <input value={k.name} onChange={(e) => setKpi(i, { name: e.target.value })} placeholder="نام شاخص" className="px-3 py-2 border-[1.5px] border-line rounded-[9px] text-[13px] font-bold text-ink outline-none focus:border-coral" />
                    <input value={k.definition ?? ''} onChange={(e) => setKpi(i, { definition: e.target.value })} placeholder="تعریف شاخص" className="px-3 py-2 border-[1.5px] border-line rounded-[9px] text-[12.5px] text-ink outline-none focus:border-coral" />
                    <input value={k.target ?? ''} onChange={(e) => setKpi(i, { target: e.target.value })} placeholder="مقدار هدف" className="px-3 py-2 border-[1.5px] border-line rounded-[9px] text-[12.5px] text-conflict font-semibold outline-none focus:border-coral" />
                  </div>
                  <button onClick={() => setDraft({ ...draft!, kpis: draft!.kpis.filter((_, k2) => k2 !== i) })} className="w-8 h-8 shrink-0 border-[1.5px] border-[#FDD9D6] bg-[#FFF3F2] text-conflict rounded-[9px]">×</button>
                </div>
              ))}
              <button onClick={() => setDraft({ ...draft!, kpis: [...draft!.kpis, { name: '' }] })} className="self-start text-[12px] font-semibold text-violet border-[1.5px] border-dashed border-[#C9B8EC] bg-[#F8F4FE] rounded-[9px] px-3 py-1.5">افزودن شاخص</button>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
