import { useNavigate } from 'react-router-dom'
import { useDepartments } from '../api/hooks'
import { deptMeta } from '../lib/departments'
import { toFa } from '../lib/format'

export function Departments() {
  const nav = useNavigate()
  const { data = [] } = useDepartments()

  return (
    <div className="flex-1 overflow-auto py-[34px] px-10">
      <div className="max-w-[1080px] mx-auto">
        <div className="mb-6">
          <div className="font-extrabold text-2xl text-ink">دپارتمان‌ها</div>
          <div className="text-[13.5px] text-muted mt-1.5">یک دپارتمان را برای مشاهدهٔ فرآیندهای مستندشدهٔ آن انتخاب کنید.</div>
        </div>
        <div className="grid grid-cols-3 gap-[18px]">
          {data.map((d) => {
            const m = deptMeta(d.code)
            return (
              <div key={d.code} onClick={() => nav(`/departments/${d.code}`)}
                className="bg-white border border-warm rounded-[18px] p-5 cursor-pointer flex items-center gap-[15px] shadow-card hover:-translate-y-0.5 hover:shadow-card-hover transition">
                <div className={`w-12 h-12 rounded-[14px] flex items-center justify-center shrink-0 ${m.tileClass}`}>
                  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round"><path d={m.icon} /></svg>
                </div>
                <div className="flex-1 min-w-0">
                  <div className="font-bold text-[15.5px] text-ink">{d.name}</div>
                  <div className="text-xs text-muted mt-1">{toFa(d.count)} فرآیند</div>
                </div>
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#C9B8EC" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><path d="M15 18l-6-6 6-6" /></svg>
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}
