import { useEffect } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import { selectShell, type SessionDescriptor } from '../auth/session'
import { onUnauthorized } from '../api/client'
import { ToastProvider } from '../ui/Toast'
import { PanelShell } from './PanelShell'
import { ReaderShell } from './ReaderShell'

export function AppShell({ session }: { session: SessionDescriptor }) {
  const navigate = useNavigate()
  const location = useLocation()

  useEffect(() => {
    document.documentElement.setAttribute('dir', 'rtl')
    document.documentElement.setAttribute('lang', 'fa')
  }, [])

  useEffect(() => {
    // F14 — a session that ends mid-use returns the user to where they were.
    onUnauthorized(() => navigate('/login', { replace: true, state: { from: location.pathname } }))
    return () => onUnauthorized(() => {})
  }, [navigate, location.pathname])

  const Shell = selectShell(session.capabilities) === 'panel' ? PanelShell : ReaderShell
  return <ToastProvider><Shell session={session} /></ToastProvider>
}
