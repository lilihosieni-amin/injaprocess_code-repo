import { useLocation, useNavigate } from 'react-router-dom'

export function BackButton() {
  const nav = useNavigate()
  const loc = useLocation()
  if (loc.pathname === '/departments') return null
  return (
    <button onClick={() => nav(-1)} className="btn btn-ghost px-[13px] py-2 text-[12.5px]">
      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><path d="M9 18l6-6-6-6" /></svg>
      بازگشت
    </button>
  )
}
