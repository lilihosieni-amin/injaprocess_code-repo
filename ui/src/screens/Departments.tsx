import { useNavigate } from 'react-router-dom'
import { useDepartments } from '../api/hooks'
import { deptMeta } from '../lib/departments'
import { toFa } from '../lib/format'

export function Departments() {
  const nav = useNavigate()
  const { data = [] } = useDepartments()

  const totalProc = data.reduce((a, d) => a + (d.count ?? 0), 0)
  const totalConflicts = data.reduce((a, d) => a + (d.conflicts ?? 0), 0)
  const hasConflicts = totalConflicts > 0

  return (
    <div className="flex-1 overflow-auto pt-[38px] pb-12 px-10 bg-bg">
      <div className="max-w-[1120px] mx-auto">

        {/* header */}
        <div className="flex items-end justify-between gap-6 flex-wrap mb-[30px]">
          <div>
            <div className="flex items-center gap-2 mb-[11px]">
              <span className="w-[22px] h-0.5 bg-coral rounded-[2px]" />
              <span className="text-[11.5px] font-bold tracking-[.14em] text-[#B79FE6]">INJA FOOD · مستندسازی فرآیند</span>
            </div>
            <div className="font-extrabold text-[34px] text-ink tracking-[-.01em]">دپارتمان‌ها</div>
            <div className="text-[14px] text-muted mt-2 max-w-[440px] leading-[1.7]">نقشهٔ فرآیندهای مجموعه به تفکیک واحد. یک دپارتمان را برای مرور فرآیندهای مستندشده، کارت خلاصه و فلوچارت انتخاب کنید.</div>
          </div>
          <div className="flex gap-3 flex-none">
            <Stat value={toFa(totalProc)} label="فرآیند مستند" valueClass="text-violet" />
            <Stat value={toFa(data.length)} label="دپارتمان" valueClass="text-ink" />
            <div className="bg-white border border-warm rounded-2xl px-5 py-3.5 min-w-[96px] shadow-[0_4px_16px_-10px_rgba(74,37,169,.25)]">
              <div className="flex items-center gap-[7px]">
                <span className={`font-extrabold text-[27px] leading-none ${hasConflicts ? 'text-conflict' : 'text-green'}`}>{toFa(totalConflicts)}</span>
                {hasConflicts && <span className="w-2 h-2 rounded-full bg-coral shadow-[0_0_0_3px_#FFE4E1]" />}
              </div>
              <div className="text-[11.5px] text-muted mt-[5px] font-semibold">تعارض باز</div>
            </div>
          </div>
        </div>

        {/* grid */}
        <div className="grid grid-cols-3 gap-[18px]">
          {data.map((d, i) => {
            const m = deptMeta(d.code)
            const isC = m.accent === 'coral'
            const accentText = isC ? 'text-conflict' : 'text-violet'
            return (
              <div key={d.code} onClick={() => nav(`/departments/${d.code}`)}
                className="relative overflow-hidden bg-white border border-warm rounded-[20px] p-[22px] cursor-pointer shadow-[0_4px_20px_-12px_rgba(74,37,169,.28)] hover:-translate-y-0.5 hover:shadow-card-hover transition">
                <div className={`absolute top-0 inset-x-0 h-1 ${isC ? 'bg-conflict' : 'bg-violet'}`} />
                <div className={`absolute top-3.5 left-5 text-[46px] font-extrabold leading-none pointer-events-none ${isC ? 'text-[#FBE4E1]' : 'text-[#EDE4FA]'}`}>{toFa(String(i + 1).padStart(2, '0'))}</div>
                <div className={`w-12 h-12 rounded-[14px] flex items-center justify-center shrink-0 ${m.tileClass}`}>
                  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round"><path d={m.icon} /></svg>
                </div>
                <div className="font-extrabold text-[18px] text-ink mt-4">دپارتمان {d.name}</div>
                <div className="flex items-center gap-[7px] flex-wrap mt-[11px] min-h-[24px]">
                  <span className="inline-flex items-center gap-[5px] text-[11.5px] font-semibold text-[#6B5CA5] bg-[#F5F1FB] px-2.5 py-1 rounded-[20px]">
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" /><path d="M14 2v6h6" /></svg>
                    {toFa(d.count)} فرآیند
                  </span>
                  {(d.subs ?? 0) > 0 && <span className="text-[11px] font-semibold text-[#B4690E] bg-[#FBEEDC] px-[9px] py-1 rounded-[20px]">{toFa(d.subs)} زیرفرآیند</span>}
                  {(d.conflicts ?? 0) > 0 && <span className="inline-flex items-center gap-1 text-[11px] font-bold text-conflict bg-tile-c px-[9px] py-1 rounded-[20px]"><span className="w-1.5 h-1.5 rounded-full bg-coral" />{toFa(d.conflicts)} تعارض</span>}
                </div>
                <div className="flex items-center justify-between gap-2.5 mt-4 pt-[15px] border-t border-[#F2ECE3]">
                  <span className={`text-[12.5px] font-bold ${accentText}`}>مشاهدهٔ فرآیندها</span>
                  <div className={`w-[34px] h-[34px] rounded-full flex-none flex items-center justify-center ${accentText} ${isC ? 'bg-[#FFF0EE]' : 'bg-[#F3EDFC]'}`}>
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><path d="M15 18l-6-6 6-6" /></svg>
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}

function Stat({ value, label, valueClass }: { value: string; label: string; valueClass: string }) {
  return (
    <div className="bg-white border border-warm rounded-2xl px-5 py-3.5 min-w-[96px] shadow-[0_4px_16px_-10px_rgba(74,37,169,.25)]">
      <div className={`font-extrabold text-[27px] leading-none ${valueClass}`}>{value}</div>
      <div className="text-[11.5px] text-muted mt-[5px] font-semibold">{label}</div>
    </div>
  )
}
