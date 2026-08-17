import { Link, Outlet } from 'react-router-dom'
import type { SessionDescriptor } from '../auth/session'
import { useLogout } from '../api/hooks'

const LogoutIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" width="20" height="20" aria-hidden focusable="false">
    <path d="M15 4h3a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2h-3" strokeLinecap="round" strokeLinejoin="round" />
    <path d="M10 16l-4-4 4-4M6 12h10" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
)

/**
 * Roomier density, one screen at a time. The badge for comments awaiting you
 * lives here because this is where every session starts, and with in-app
 * notification as the only channel that placement is the whole signal (F15).
 */
export function ReaderShell({ session }: { session: SessionDescriptor }) {
  const logout = useLogout()

  return (
    <div data-shell="reader" className="h-screen flex flex-col overflow-hidden bg-ink text-card">
      <header className="flex items-center gap-3 px-4 py-3">
        {/* I6 — the shell takes no h1 of its own; the routed screen owns it. */}
        <div className="text-title font-extrabold flex-1">اینجا فست‌فود</div>
        {/* The reader shell has no administration surface at all, so this is
            the only entry it will ever carry — and leaving it out of this shell
            would leave most of the staff with no way to change their password.
            Same wording as the panel header's, because it goes to the same
            screen. */}
        <Link
          to="/profile"
          className="min-h-touch inline-flex items-center px-s6 rounded-control text-card text-caption no-underline hover:bg-tile-v2"
        >
          نمایه
        </Link>
        {session.pendingApprovals > 0 && (
          <span className="min-h-touch min-w-touch inline-flex items-center justify-center rounded-control bg-coral text-card font-bold">
            {session.pendingApprovals}
          </span>
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
    </div>
  )
}
