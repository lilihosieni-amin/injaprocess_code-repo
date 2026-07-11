import { useParams } from 'react-router-dom'
import { useOverview } from '../api/hooks'
import { deptMeta } from '../lib/departments'
import { jalali } from '../lib/format'
import { Card } from '../ui/Card'
import { Button } from '../ui/Button'

export function Overview() {
  const { code = '' } = useParams()
  const { data } = useOverview(code)
  const m = deptMeta(code)
  if (!data) return <div className="flex-1 bg-bg" />

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
          <Button variant="violet" className="px-4 py-2.5 text-[13px]">ویرایش</Button>
        </div>

        <section className="mb-7">
          <div className="font-extrabold text-[15px] text-ink mb-3">واحدهای زیرمجموعه</div>
          {data.sub_units.length === 0 && <div className="text-[12.5px] text-faint px-0.5 py-1.5">واحدی ثبت نشده است.</div>}
          <div className="grid grid-cols-2 gap-3">
            {data.sub_units.map((s, i) => (
              <Card key={i} className="px-[17px] py-[15px]">
                <div className="font-bold text-sm text-ink">{s.name}</div>
                <div className="text-[12.5px] text-muted mt-1.5 leading-relaxed">{s.description}</div>
              </Card>
            ))}
          </div>
        </section>

        <section>
          <div className="font-extrabold text-[15px] text-ink mb-3">پرسنل و شرح وظایف</div>
          {data.personnel.length === 0 && <div className="text-[12.5px] text-faint px-0.5 py-1.5">پرسنلی ثبت نشده است.</div>}
          <div className="flex flex-col gap-3">
            {data.personnel.map((pr, i) => (
              <Card key={i} className="px-[18px] py-4">
                <div className="font-bold text-sm text-ink mb-2.5">{pr.role}</div>
                <div className="flex flex-wrap gap-1.5">
                  {pr.duties.length === 0 && <div className="text-[11.5px] text-faint">وظیفه‌ای ثبت نشده است.</div>}
                  {pr.duties.map((d, j) => (
                    <span key={j} className="text-[11.5px] text-violet bg-tile-v2 px-2.5 py-1 rounded-full">{d}</span>
                  ))}
                </div>
              </Card>
            ))}
          </div>
        </section>
      </div>
    </div>
  )
}
