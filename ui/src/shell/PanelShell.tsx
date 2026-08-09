import { Outlet } from 'react-router-dom'
import type { SessionDescriptor } from '../auth/session'

/** Compact density, breadcrumb trail, administration surfaces. */
export function PanelShell({ session }: { session: SessionDescriptor }) {
  return (
    <div data-shell="panel" className="min-h-screen bg-bg text-ink">
      <header className="flex items-center gap-3 px-6 py-3 bg-ink text-card">
        <h1 className="text-title font-extrabold m-0 flex-1">اینجا فست‌فود</h1>
        <span className="text-caption">{session.displayName}</span>
      </header>
      <main className="px-6 py-6"><Outlet /></main>
    </div>
  )
}
