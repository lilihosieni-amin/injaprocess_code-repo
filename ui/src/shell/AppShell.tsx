import { useEffect } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import { selectShell, type SessionDescriptor } from '../auth/session'
import { onUnauthorized } from '../api/client'
import { ToastProvider } from '../ui/Toast'
import { SurfaceProvider } from '../ui/surface'
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

  // R3 — the surface is chosen exactly where the shell is, from the same
  // descriptor, so the scale and the chrome can never disagree about which
  // product this is.
  const surface = selectShell(session.capabilities)
  const Shell = surface === 'panel' ? PanelShell : ReaderShell
  return (
    <SurfaceProvider surface={surface}>
      <ToastProvider><Shell session={session} /></ToastProvider>
    </SurfaceProvider>
  )
}
