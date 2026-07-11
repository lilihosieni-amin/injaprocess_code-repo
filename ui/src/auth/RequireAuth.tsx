import { Navigate, Outlet } from 'react-router-dom'
import { useMe } from '../api/hooks'

export function RequireAuth() {
  const { data, isLoading, isError } = useMe()
  if (isLoading) return <div className="min-h-screen bg-bg" />
  if (isError || !data) return <Navigate to="/login" replace />
  return <Outlet />
}
