import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Breadcrumb } from './Breadcrumb'
import { BackButton } from './BackButton'
import { usePending } from '../api/hooks'
import { InboxModal } from '../write/InboxModal'
import { toFa } from '../lib/format'
import logo from '../assets/inja-logo.jpg'

export function TopBar() {
  const nav = useNavigate()
  const [inbox, setInbox] = useState(false)
  const { data: pending = [] } = usePending()
  return (
    <div className="flex items-center gap-3.5 px-[22px] py-3 bg-white border-b border-warm shrink-0 z-20">
      <div onClick={() => nav('/departments')} className="flex items-center gap-2.5 cursor-pointer">
        <img src={logo} alt="" className="w-[38px] h-[38px] rounded-[11px] object-cover" />
        <div className="leading-tight">
          <div className="font-bold text-sm text-ink">اینجا فست‌فود</div>
          <div className="text-[10.5px] text-muted">سامانهٔ فرآیندها</div>
        </div>
      </div>
      <div className="w-px h-[26px] bg-[#EDE5F5] mx-1" />
      <BackButton />
      <Breadcrumb />
      <div className="ms-auto flex items-center gap-2.5">
        <button onClick={() => setInbox(true)} className="btn btn-ghost px-[13px] py-2 text-[12.5px] relative" title="صندوق بازبینی">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M22 12h-6l-2 3h-4l-2-3H2" /><path d="M5.45 5.11 2 12v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-6l-3.45-6.89A2 2 0 0 0 16.76 4H7.24a2 2 0 0 0-1.79 1.11z" /></svg>
          صندوق بازبینی
          {pending.length > 0 && (
            <span className="absolute -top-1.5 -left-1.5 min-w-[19px] h-[19px] px-1 bg-coral text-white rounded-full text-[10.5px] font-bold flex items-center justify-center border-2 border-white">{toFa(pending.length)}</span>
          )}
        </button>
        <div className="w-[34px] h-[34px] rounded-[10px] bg-tile-v text-violet flex items-center justify-center font-bold text-[13px]">آ</div>
      </div>
      {inbox && <InboxModal onClose={() => setInbox(false)} />}
    </div>
  )
}
