import { Outlet } from 'react-router-dom'
import type { SessionDescriptor } from '../auth/session'

/**
 * Roomier density, one screen at a time. The badge for comments awaiting you
 * lives here because this is where every session starts, and with in-app
 * notification as the only channel that placement is the whole signal (F15).
 */
export function ReaderShell({ session }: { session: SessionDescriptor }) {
  return (
    <div data-shell="reader" className="min-h-screen bg-ink text-card">
      <header className="flex items-center gap-3 px-4 py-3">
        <h1 className="text-title font-extrabold m-0 flex-1">اینجا فست‌فود</h1>
        {session.pendingApprovals > 0 && (
          <span className="min-h-touch min-w-touch inline-flex items-center justify-center rounded-control bg-coral text-card font-bold">
            {session.pendingApprovals}
          </span>
        )}
      </header>
      <main className="px-4 pb-8"><Outlet /></main>
    </div>
  )
}
