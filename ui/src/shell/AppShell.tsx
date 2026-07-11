import { Outlet } from 'react-router-dom'
import { TopBar } from './TopBar'

export function AppShell() {
  return (
    <div dir="rtl" className="h-screen flex flex-col bg-bg overflow-hidden font-sans text-ink">
      <TopBar />
      <Outlet />
    </div>
  )
}
