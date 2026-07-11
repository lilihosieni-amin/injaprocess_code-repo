import { useState } from 'react'
import { Chip } from '../ui/Chip'
import { useProcesses } from '../api/hooks'
import { fieldFa } from './adapt'
import { toFa, formatConflictValue } from '../lib/format'
import type { ProcNode, ActivityNode, JunctionNode, Pending, Process } from '../api/types'

export type DrawerProps = {
  node: ProcNode
  editing: boolean
  conflicts: { pending: Pending; index: number }[]
  process: Process
  onClose: () => void
  onEdit: () => void
  onAccept: (index: number) => void
  onReject: (index: number) => void
  onOpenSub: (subId: string) => void
  onPatch: (patch: Partial<Pick<ActivityNode, 'label' | 'actor' | 'description'>>) => void
  onLinkSub: (subId: string | null) => void
  onSetJunction: (type: 'AND' | 'OR' | 'XOR') => void
  onCreateSub: () => void
}

export function DetailDrawer(props: DrawerProps) {
  const { node, onClose } = props
  const isActivity = node.type === 'activity'
  const a = node as ActivityNode
  const j = node as JunctionNode

  // Must be called unconditionally (Rules of Hooks); result used only in the edit branch.
  const { data: deptProcesses } = useProcesses(props.process.department ?? '')
  const [subQuery, setSubQuery] = useState('')
  const [subDropOpen, setSubDropOpen] = useState(false)

  // Subprocess search options: same department, excluding current process, filtered by query.
  const subOptions = (deptProcesses ?? []).filter(
    (p) => p.id !== props.process.id &&
      (subQuery === '' ||
        p.name.includes(subQuery) ||
        p.id.toLowerCase().includes(subQuery.toLowerCase())),
  )
  const linkedProcess = (deptProcesses ?? []).find((p) => p.id === (isActivity ? a.subprocess : null))

  return (
    <div className="absolute top-0 bottom-0 left-0 w-[340px] bg-white border-e border-warm shadow-[20px_0_50px_-30px_rgba(74,37,169,.5)] flex flex-col z-[15]">
      <div className="flex items-center justify-between px-[18px] py-4 border-b border-[#F0E9FB]">
        <span className="id-badge bg-violet text-white" dir="ltr">{node.id}</span>
        <button onClick={onClose} title="بستن" className="w-7 h-7 bg-tile-v2 rounded-lg text-muted text-lg">×</button>
      </div>
      <div className="flex-1 overflow-auto p-[18px]">
        {props.editing && node.type === 'junction' ? (
          /* ─── EDIT BRANCH (junction) ─── */
          <>
            <div className="font-extrabold text-[16px] text-ink mb-4">انتخاب دروازهٔ منطقی</div>
            <div className="flex gap-3 mb-5">
              {(['XOR', 'AND', 'OR'] as const).map((type) => (
                <button
                  key={type}
                  onClick={() => props.onSetJunction(type)}
                  className={`flex-1 py-3 px-3 rounded-lg font-bold text-[13px] border-[1.5px] transition-all ${
                    j.junctionType === type
                      ? 'bg-violet border-violet text-white'
                      : 'bg-white border-line text-ink hover:border-violet'
                  }`}
                >
                  {type}
                </button>
              ))}
            </div>
            <div className="text-[12.5px] text-muted leading-loose">XOR: فقط یکی از مسیرها فعال می‌شود. AND: همهٔ مسیرها هم‌زمان. OR: یک یا چند مسیر.</div>
          </>
        ) : props.editing && isActivity ? (
          /* ─── EDIT BRANCH (activity) ─── */
          <>
            <label className="text-[11px] font-bold text-muted block mt-1 mb-1.5">عنوان</label>
            <input
              aria-label="عنوان"
              value={a.label}
              onChange={(e) => props.onPatch({ label: e.target.value })}
              className="w-full px-3 py-2 border-[1.5px] border-line rounded-lg text-[12.5px] outline-none focus:border-coral"
            />

            <label className="text-[11px] font-bold text-muted block mt-4 mb-1.5">مجری فعالیت</label>
            <input
              aria-label="مجری فعالیت"
              value={a.actor}
              onChange={(e) => props.onPatch({ actor: e.target.value })}
              className="w-full px-3 py-2 border-[1.5px] border-line rounded-lg text-[12.5px] outline-none focus:border-coral"
            />

            <label className="text-[11px] font-bold text-muted block mt-4 mb-1.5">توضیحات</label>
            <textarea
              aria-label="توضیحات"
              value={a.description}
              rows={5}
              onChange={(e) => props.onPatch({ description: e.target.value })}
              className="w-full px-3 py-2 border-[1.5px] border-line rounded-lg text-[12.5px] outline-none focus:border-coral resize-none"
            />

            <label className="text-[11px] font-bold text-muted block mt-4 mb-1.5">زیرفرآیندِ پیوندی (اختیاری)</label>
            <div className="relative">
              <input
                value={subQuery}
                onChange={(e) => setSubQuery(e.target.value)}
                onFocus={() => setSubDropOpen(true)}
                onBlur={() => setTimeout(() => setSubDropOpen(false), 150)}
                placeholder="جست‌وجوی نام یا شناسهٔ فرآیند…"
                autoComplete="off"
                className="w-full px-3 py-2 ps-[34px] border-[1.5px] border-line rounded-lg text-[12.5px] outline-none focus:border-coral"
              />
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#a99fc4" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="absolute left-[11px] top-1/2 -translate-y-1/2 pointer-events-none"><circle cx="11" cy="11" r="7" /><path d="m21 21-4.3-4.3" /></svg>
              {subDropOpen && (
                <div className="absolute top-[calc(100%+5px)] left-0 right-0 bg-white border border-[#E3D8F5] rounded-xl shadow-[0_18px_40px_-16px_rgba(74,37,169,.5)] z-20 max-h-[236px] overflow-auto p-[5px]">
                  {subOptions.length === 0 ? (
                    <div className="px-[10px] py-3 text-[12px] text-muted text-center">فرآیندی یافت نشد</div>
                  ) : subOptions.map((opt) => (
                    <div
                      key={opt.id}
                      onPointerDown={() => { props.onLinkSub(opt.id); setSubQuery(opt.name); setSubDropOpen(false) }}
                      className="flex items-center gap-[9px] px-[10px] py-[9px] rounded-[9px] cursor-pointer hover:bg-[#F8F4FE]"
                    >
                      <div className="flex-1 min-w-0">
                        <div className="text-[13px] font-bold text-[#2A1D5E] truncate">{opt.name}</div>
                        <div className="font-mono text-[10.5px] text-muted mt-0.5" dir="ltr">{opt.id}</div>
                      </div>
                      {opt.id === a.subprocess && (
                        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#1F8A5B" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" className="flex-none"><path d="M20 6L9 17l-5-5" /></svg>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>

            {linkedProcess && (
              <div className="flex items-center justify-between gap-2 mt-2">
                <div className="flex items-center gap-[5px] text-[11px] text-[#1F8A5B]">
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round"><path d="M20 6L9 17l-5-5" /></svg>
                  پیوند شده به «{linkedProcess.name}»
                </div>
                <button onClick={() => props.onLinkSub(null)} className="border-none bg-transparent text-[#E23D35] font-bold text-[11px] cursor-pointer px-1 py-0.5">حذف پیوند</button>
              </div>
            )}

            <div className="text-[11px] text-muted mt-[7px] leading-relaxed">با انتخاب یک فرآیند، این باکس به آن به‌عنوان زیرفرآیند پیوند می‌خورد؛ سپس با کلیک روی باکس می‌توان وارد فلوچارتش شد.</div>

            <button
              onClick={props.onCreateSub}
              className="w-full mt-[14px] flex items-center justify-center gap-2 py-[11px] border-[1.5px] border-coral bg-white text-coral rounded-xl font-bold text-[12.5px] cursor-pointer hover:bg-[#FFF3F2]"
            >
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 3h7v7H3zM14 14h7v7h-7zM14 3l7 7M10 14l-7 7" /></svg>
              ساخت زیرفرآیند جدید و ورود
            </button>

            <div className="text-[11px] text-muted mt-[14px] leading-relaxed">تغییرات فقط پس از فشردن «ذخیره» روی دیسک نوشته می‌شوند.</div>
          </>
        ) : node.type === 'junction' ? (
          /* ─── VIEW: junction ─── */
          <>
            <div className="font-extrabold text-[16px] text-ink">دروازهٔ منطقی {j.junctionType}</div>
            <div className="text-[12.5px] text-muted mt-2.5 leading-loose">XOR: فقط یکی از مسیرها فعال می‌شود. AND: همهٔ مسیرها هم‌زمان. OR: یک یا چند مسیر.</div>
          </>
        ) : isActivity ? (
          /* ─── VIEW: activity ─── */
          <>
            <div className="font-extrabold text-[16px] text-ink leading-tight">{a.label}</div>
            <div className="flex items-center gap-2 mt-3 px-3 py-2.5 bg-[#F8F4FE] rounded-[10px]">
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#4A25A9" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="8" r="4"></circle><path d="M4 21a8 8 0 0 1 16 0"></path></svg>
              <span className="text-[12.5px] text-violet font-semibold">{a.actor}</span>
            </div>
            <div className="text-[11px] font-bold text-muted mt-[18px] mb-1.5">توضیحات</div>
            <div className="text-[12.5px] text-[#5a5175] leading-relaxed">{a.description}</div>
            <div className="text-[11px] font-bold text-muted mt-[18px] mb-2">اطلاعات ICOM</div>
            <div className="flex flex-col gap-2.5">
              <IcomRow label="ورودی‌ها" items={a.icom.inputs} kind="input" />
              <IcomRow label="کنترل‌ها" items={a.icom.controls} kind="control" />
              <IcomRow label="خروجی‌ها" items={a.icom.outputs} kind="output" />
              <IcomRow label="مکانیزم‌ها" items={a.icom.mechanisms} kind="mech" />
            </div>
            {props.conflicts.length > 0 && (
              <div className="mt-5">
                <div className="flex items-center gap-[6px] text-[11px] font-bold text-[#E23D35] mb-2">
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 9v4M12 17h.01M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z" /></svg>
                  تعارض‌های این باکس ({toFa(props.conflicts.length)})
                </div>
                {props.conflicts.map((c) => (
                  <div key={c.index} className="bg-white border border-[#FDD9D6] rounded-[12px] p-3 mb-[10px]">
                    <div className="flex items-center justify-between mb-[9px]">
                      <span className="text-[11.5px] font-bold text-[#2A1D5E]">{fieldFa(c.pending.field)}</span>
                      <span className="text-[10px] text-[#a99fc4]">{c.pending.source}</span>
                    </div>
                    <div className="bg-[#F6F3FB] border border-[#EDE5F5] rounded-[9px] px-[10px] py-2 mb-[7px]">
                      <div className="text-[9.5px] text-[#a99fc4] mb-[3px]">مقدار فعلی</div>
                      <div className="text-[12px] text-[#5a5175] leading-relaxed whitespace-pre-line">{formatConflictValue(c.pending.current)}</div>
                    </div>
                    <div className="bg-[#FFF3F2] border border-[#FDD9D6] rounded-[9px] px-[10px] py-2 mb-[10px]">
                      <div className="text-[9.5px] text-[#E23D35] mb-[3px]">پیشنهاد جدید</div>
                      <div className="text-[12px] text-[#8a2b26] leading-relaxed font-semibold whitespace-pre-line">{formatConflictValue(c.pending.proposed)}</div>
                    </div>
                    <div className="flex gap-2">
                      <button
                        onClick={() => props.onAccept(c.index)}
                        className="flex-1 py-2 border-none rounded-[9px] bg-[#1F8A5B] text-white font-bold text-[12px] cursor-pointer"
                      >پذیرش</button>
                      <button
                        onClick={() => props.onReject(c.index)}
                        className="flex-1 py-2 border-[1.5px] border-[#E3D8F5] bg-white text-[#8a7db0] font-semibold text-[12px] cursor-pointer rounded-[9px]"
                      >رد</button>
                    </div>
                  </div>
                ))}
              </div>
            )}
            <div className="text-[10.5px] text-[#c3bad6] mt-5 border-t border-dashed border-[#EDE5F5] pt-3" dir="ltr">source: {a.source.created_by}</div>
          </>
        ) : (
          <div className="font-extrabold text-[16px] text-ink">{'label' in node ? (node as { label: string }).label : (node as { id: string }).id}</div>
        )}
      </div>
    </div>
  )
}

function IcomRow({ label, items, kind }: { label: string; items: string[]; kind: 'input' | 'control' | 'output' | 'mech' }) {
  return (
    <div>
      <div className="text-[10.5px] text-faint mb-1.5">{label}</div>
      <div className="flex flex-wrap gap-1.5">{items.map((t, i) => <Chip key={i} kind={kind}>{t}</Chip>)}</div>
    </div>
  )
}
