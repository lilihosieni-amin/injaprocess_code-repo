import { useState } from 'react'
import { Outlet } from 'react-router-dom'
import { can, type SessionDescriptor } from '../auth/session'
import { usePending, useLogout } from '../api/hooks'
import { InboxModal } from '../write/InboxModal'

const InboxIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" width="20" height="20" aria-hidden focusable="false">
    <rect x="3" y="5" width="18" height="14" rx="2" />
    <path d="M3 8l9 6 9-6" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
)

const LogoutIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" width="20" height="20" aria-hidden focusable="false">
    <path d="M15 4h3a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2h-3" strokeLinecap="round" strokeLinejoin="round" />
    <path d="M10 16l-4-4 4-4M6 12h10" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
)

/** Compact density, breadcrumb trail, administration surfaces. */
export function PanelShell({ session }: { session: SessionDescriptor }) {
  const [inboxOpen, setInboxOpen] = useState(false)
  const canEdit = can(session, 'edit')
  // C2 — the conflict inbox is an edit-only surface; a panel user without
  // `edit` (e.g. an auditor) never needs the query fired at all.
  const { data: pending = [] } = usePending({ enabled: canEdit })
  const logout = useLogout()
  const openCount = pending.length

  return (
    <div data-shell="panel" className="h-screen flex flex-col overflow-hidden bg-bg text-ink">
      <header className="flex items-center gap-3 px-6 py-3 bg-ink text-card">
        <div className="text-title font-extrabold flex-1">اینجا فست‌فود</div>
        <span className="text-caption">{session.displayName}</span>
        {canEdit && (
          <>
            <button
              type="button"
              onClick={() => setInboxOpen(true)}
              aria-label={openCount > 0 ? `صندوق بازبینی تعارض‌ها، ${openCount} مورد در انتظار` : 'صندوق بازبینی تعارض‌ها'}
              className="min-h-touch min-w-touch inline-flex items-center justify-center rounded-control bg-transparent text-card border-0 cursor-pointer hover:bg-tile-v2"
            >
              <InboxIcon />
            </button>
            {openCount > 0 && (
              <span aria-hidden className="min-h-touch min-w-touch inline-flex items-center justify-center rounded-control bg-coral text-card font-bold">
                {openCount}
              </span>
            )}
          </>
        )}
        <button
          type="button"
          onClick={() => logout.mutate()}
          aria-label="خروج"
          className="min-h-touch min-w-touch inline-flex items-center justify-center rounded-control bg-transparent text-card border-0 cursor-pointer hover:bg-tile-v2"
        >
          <LogoutIcon />
        </button>
      </header>
      {/* C1 — screens depend on this being a direct flex child of a flex-column
          ancestor with min-h-0: FlowScreen's own root is `flex-1 flex flex-col
          min-h-0`, and its canvas resolves `h-full` against this chain. Adding
          padding here re-breaks the flow canvas (it renders at zero height) —
          screens own their own padding instead. */}
      <main className="flex-1 min-h-0 flex flex-col">
        <Outlet />
      </main>
      {inboxOpen && <InboxModal onClose={() => setInboxOpen(false)} />}
    </div>
  )
}
