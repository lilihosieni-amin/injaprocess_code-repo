import { Link, useLocation, useParams } from 'react-router-dom'
import { useDepartments, useProcess } from '../api/hooks'

export function Breadcrumb() {
  const loc = useLocation()
  const { code, pid } = useParams()
  const { data: depts = [] } = useDepartments()
  const { data: proc } = useProcess(pid ?? '')

  const crumbs: { label: string; to: string }[] = [{ label: 'دپارتمان‌ها', to: '/departments' }]
  const deptCode = code ?? proc?.department
  const dept = depts.find((d) => d.code === deptCode)
  if (deptCode && dept) crumbs.push({ label: dept.name, to: `/departments/${deptCode}` })
  if (pid && proc) crumbs.push({ label: proc.name, to: loc.pathname })

  return (
    <div className="flex items-center gap-1.5 text-[12.5px] text-muted flex-wrap">
      {crumbs.map((c, i) => (
        <span key={c.to + i} className="flex items-center gap-1.5">
          {i > 0 && <span className="text-faint">/</span>}
          <Link to={c.to} className={i === crumbs.length - 1 ? 'text-ink font-semibold' : 'text-muted hover:text-coral'}>{c.label}</Link>
        </span>
      ))}
    </div>
  )
}
