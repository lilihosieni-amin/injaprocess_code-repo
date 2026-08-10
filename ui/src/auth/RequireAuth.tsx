import { Navigate } from 'react-router-dom'
import { useSession } from './useSession'
import { AppShell } from '../shell/AppShell'

export function RequireAuth() {
  const { data, isPending, isError } = useSession()
  // A blank frame rather than a spinner: this resolves in one request and a
  // flash of loading chrome on every navigation is worse than nothing.
  if (isPending) return <div />
  if (isError || !data) return <Navigate to="/login" replace />
  return <AppShell session={data} />
}
