import { useState } from 'react'
import { useParams } from 'react-router-dom'
import { useOverview, usePutOverview } from '../api/hooks'
import { deptMeta } from '../lib/departments'
import { jalali, toFa } from '../lib/format'
import { Card } from '../ui/Card'
import { Button } from '../ui/Button'
import { useToast } from '../write/ToastProvider'
import type { Overview as OverviewT } from '../api/types'

type Draft = { description: string; sub_units: { name: string; description: string }[]; personnel: { role: string; duties: string[] }[] }
type ArrayKey = { [K in keyof Draft]: Draft[K] extends unknown[] ? K : never }[keyof Draft]

export function Overview() {
  const { code = '' } = useParams()
  const { data } = useOverview(code)
  const put = usePutOverview(code)
  const toast = useToast()
  const m = deptMeta(code)
  const [draft, setDraft] = useState<Draft | null>(null)
  const [openRoles, setOpenRoles] = useState<Set<number>>(new Set())  // read view: which categories are expanded (collapsed by default)
  if (!data) return <div className="flex-1 bg-bg" />

  function enter() {
    setDraft({
      description: data!.description,
      sub_units: data!.sub_units.map((s) => ({ ...s })),
      personnel: data!.personnel.map((p) => ({ role: p.role, duties: [...p.duties] })),
    })
  }
  function save() {
    const d = draft!
    const doc: OverviewT = {
      ...data!,
      description: d.description.trim(),
      sub_units: d.sub_units,
      personnel: d.personnel.map((p) => ({ role: p.role, duties: p.duties.map((x) => x.trim()).filter(Boolean) })),
    }
    put.mutate(doc, { onSuccess: () => { setDraft(null); toast.show('اطلاعات دپارتمان ذخیره شد') } })
  }
  const editing = draft !== null

  return (
    <div className="flex-1 overflow-auto py-[30px] px-10">
      <div className="max-w-[920px] mx-auto">
        <div className="flex items-start justify-between gap-4 mb-6">
          <div className="flex items-center gap-3">
            <div className={`w-12 h-12 rounded-[14px] flex items-center justify-center shrink-0 ${m.tileClass}`}>
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round"><path d={m.icon} /></svg>
            </div>
            <div>
              <div className="font-extrabold text-[22px] text-ink">{data.name}</div>
              <div className="text-xs text-faint mt-1">آخرین به‌روزرسانی: {jalali(data.updated_at)}</div>
            </div>
          </div>
          {!editing ? (
            <Button variant="violet" onClick={enter} className="px-4 py-2.5 text-[13px]">ویرایش</Button>
          ) : (
            <div className="flex gap-2.5">
              <Button variant="ghost" onClick={() => setDraft(null)} className="px-4 py-2.5 text-[13px]">انصراف</Button>
              <Button variant="green" onClick={save} disabled={put.isPending} className="px-4 py-2.5 text-[13px]">ذخیره</Button>
            </div>
          )}
        </div>

        <section className="mb-7">
          <div className="font-extrabold text-[15px] text-ink mb-3">معرفی دپارتمان</div>
          {!editing ? (
            data.description.trim() ? (
              <Card className="px-[18px] py-4">
                <div className="text-[14px] text-muted leading-relaxed whitespace-pre-line">{data.description}</div>
              </Card>
            ) : (
              <div className="text-[12.5px] text-faint px-0.5 py-1.5">شرحی ثبت نشده است.</div>
            )
          ) : (
            <textarea value={draft!.description} onChange={(e) => setDraft({ ...draft!, description: e.target.value })} rows={5}
              placeholder="شرح کوتاه دپارتمان (یک تا دو پاراگراف)"
              className="w-full px-3 py-2.5 border-[1.5px] border-line rounded-[10px] text-[13px] text-ink outline-none focus:border-coral resize-y leading-relaxed" />
          )}
        </section>

        <Section title="واحدهای زیرمجموعه"
          onAdd={editing ? () => setDraft({ ...draft!, sub_units: [...draft!.sub_units, { name: '', description: '' }] }) : undefined}>
          {!editing ? (
            <div className="grid grid-cols-2 gap-3">
              {data.sub_units.length === 0 && <div className="text-[12.5px] text-faint px-0.5 py-1.5">واحدی ثبت نشده است.</div>}
              {data.sub_units.map((s, i) => (
                <Card key={i} className="px-[17px] py-[15px]">
                  <div className="font-bold text-sm text-ink">{s.name}</div>
                  <div className="text-[14px] text-muted mt-1.5 leading-relaxed">{s.description}</div>
                </Card>
              ))}
            </div>
          ) : (
            <div className="flex flex-col gap-3">
              {draft!.sub_units.map((s, i) => (
                <Card key={i} className="p-3.5 flex gap-3 items-start">
                  <div className="flex-1 flex flex-col gap-2">
                    <input value={s.name} onChange={(e) => patch('sub_units', i, { name: e.target.value })} placeholder="نام واحد"
                      className="w-full px-3 py-2 border-[1.5px] border-line rounded-[10px] text-[13px] font-bold text-ink outline-none focus:border-coral" />
                    <textarea value={s.description} onChange={(e) => patch('sub_units', i, { description: e.target.value })} rows={2} placeholder="شرح واحد"
                      className="w-full px-3 py-2 border-[1.5px] border-line rounded-[10px] text-[12.5px] text-ink outline-none focus:border-coral resize-y" />
                  </div>
                  <button onClick={() => del('sub_units', i)} title="حذف واحد" className="w-8 h-8 shrink-0 border-[1.5px] border-[#FADAD8] rounded-[9px] text-conflict flex items-center justify-center">
                    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 6h18M8 6V4h8v2M19 6l-1 14H6L5 6" /></svg>
                  </button>
                </Card>
              ))}
            </div>
          )}
        </Section>

        <Section title="پرسنل و شرح وظایف"
          onAdd={editing ? () => setDraft({ ...draft!, personnel: [...draft!.personnel, { role: '', duties: [] }] }) : undefined}>
          {!editing ? (
            <div className="flex flex-col gap-3">
              {data.personnel.length === 0 && <div className="text-[12.5px] text-faint px-0.5 py-1.5">پرسنلی ثبت نشده است.</div>}
              {data.personnel.map((pr, i) => {
                const open = openRoles.has(i)
                return (
                  <Card key={i} className="px-[18px] py-4">
                    <button onClick={() => toggleRole(i)} className="w-full flex items-center justify-between gap-3 text-right" aria-expanded={open}>
                      <span className="font-bold text-sm text-ink">{pr.role}</span>
                      <span className="flex items-center gap-2 shrink-0 text-muted">
                        <span className="text-[11px] font-semibold">{toFa(pr.duties.length)} وظیفه</span>
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" className={`transition-transform ${open ? 'rotate-180' : ''}`}><path d="M6 9l6 6 6-6" /></svg>
                      </span>
                    </button>
                    {open && (
                      <>
                        <div className="flex flex-wrap gap-1.5 mt-3">
                          {pr.duties.map((d, j) => <span key={j} className="text-[13px] text-violet bg-tile-v2 px-3 py-1.5 rounded-full leading-relaxed">{d}</span>)}
                        </div>
                        <button onClick={() => toggleRole(i)} className="mt-3 flex items-center gap-1 text-[11px] font-semibold text-muted hover:text-ink">
                          بستن <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><path d="M18 15l-6-6-6 6" /></svg>
                        </button>
                      </>
                    )}
                  </Card>
                )
              })}
            </div>
          ) : (
            <div className="flex flex-col gap-3">
              {draft!.personnel.map((pr, i) => (
                <Card key={i} className="p-3.5">
                  <div className="flex gap-3 items-center">
                    <input value={pr.role} onChange={(e) => patch('personnel', i, { role: e.target.value })} placeholder="عنوان شغلی"
                      className="flex-1 px-3 py-2 border-[1.5px] border-line rounded-[10px] text-[13px] font-bold text-ink outline-none focus:border-coral" />
                    <button onClick={() => del('personnel', i)} title="حذف نفر" className="w-8 h-8 shrink-0 border-[1.5px] border-[#FADAD8] rounded-[9px] text-conflict flex items-center justify-center">
                      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 6h18M8 6V4h8v2M19 6l-1 14H6L5 6" /></svg>
                    </button>
                  </div>
                  <div className="flex flex-col gap-2 mt-2.5">
                    {pr.duties.map((d, j) => (
                      <div key={j} className="flex gap-2 items-center">
                        <input value={d} onChange={(e) => setDuty(i, j, e.target.value)} placeholder="شرح وظیفه…"
                          className="flex-1 px-3 py-2 border-[1.5px] border-line rounded-[10px] text-[12.5px] text-ink outline-none focus:border-coral" />
                        <button onClick={() => removeDuty(i, j)} title="حذف وظیفه" className="w-8 h-8 shrink-0 border-[1.5px] border-[#FADAD8] rounded-[9px] text-conflict flex items-center justify-center text-lg leading-none">×</button>
                      </div>
                    ))}
                    <button onClick={() => addDuty(i)} className="self-start text-[12px] font-semibold text-violet border-[1.5px] border-dashed border-[#C9B8EC] rounded-[10px] px-3 py-1.5">افزودن وظیفه</button>
                  </div>
                </Card>
              ))}
            </div>
          )}
        </Section>
      </div>
    </div>
  )

  function patch<K extends ArrayKey>(key: K, i: number, p: Partial<Draft[K][number]>) {
    setDraft((d) => d && ({ ...d, [key]: d[key].map((row, k) => (k === i ? { ...row, ...p } : row)) }))
  }
  function del<K extends ArrayKey>(key: K, i: number) {
    setDraft((d) => d && ({ ...d, [key]: d[key].filter((_, k) => k !== i) }))
  }
  function patchDuties(i: number, next: (duties: string[]) => string[]) {
    setDraft((d) => d && ({ ...d, personnel: d.personnel.map((p, k) => (k === i ? { ...p, duties: next(p.duties) } : p)) }))
  }
  function setDuty(i: number, j: number, val: string) { patchDuties(i, (duties) => duties.map((x, m) => (m === j ? val : x))) }
  function addDuty(i: number) { patchDuties(i, (duties) => [...duties, '']) }
  function removeDuty(i: number, j: number) { patchDuties(i, (duties) => duties.filter((_, m) => m !== j)) }
  function toggleRole(i: number) {
    setOpenRoles((s) => { const next = new Set(s); next.has(i) ? next.delete(i) : next.add(i); return next })
  }
}

function Section({ title, onAdd, children }: { title: string; onAdd?: () => void; children: React.ReactNode }) {
  return (
    <section className="mb-7">
      <div className="flex items-center justify-between mb-3">
        <div className="font-extrabold text-[15px] text-ink">{title}</div>
        {onAdd && <button onClick={onAdd} className="text-[12px] font-semibold text-violet border-[1.5px] border-dashed border-[#C9B8EC] rounded-[10px] px-3 py-1.5">افزودن</button>}
      </div>
      {children}
    </section>
  )
}
