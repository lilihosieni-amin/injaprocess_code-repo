import { keepPreviousData, useQuery } from '@tanstack/react-query'
import { fetchJson } from './client'
import type { CommentState } from './comments'

export type EventKind = 'access' | 'content' | 'governance'

export interface ActivityUser {
  id: number; username: string; displayName: string; role: string; scopes: string[]
  disabled: boolean; logins: number; failures: number; sessions: number
  activeSeconds: number; lastSeen: number | null
}
export interface ActivityEvent {
  id: number; at: number; action: string; kind: EventKind; target: string | null
  ip: string; userAgent: string; outcome: string; session: string | null
}
export interface ActivitySession {
  session: string; issuedAt: number; lastSeen: number; ip: string; userAgent: string
  activeSeconds: number; state: 'active' | 'revoked' | 'expired'
}
export interface UserActivity {
  user: ActivityUser; total: number; rows: ActivityEvent[]
  days: Record<string, number>; sessions: ActivitySession[]
}
export interface DeptReadership {
  code: string; name: string; readers: number; views: number; downloads: number
  topProcess: { id: string; name: string } | null; lastViewed: number | null
}
export interface SignInFailure { username: string; ip: string; attempts: number; first: number; last: number }
export interface PermissionChange {
  at: number; actor: string; action: string; subject: string | null
  before: string | boolean | null; after: string | boolean | null
}
export interface CommentFlow {
  ref: string; department: string; author: string; state: CommentState
  stage: 'reader' | 'pool' | null; holder: string | null; waitingSince: number | null
}
export interface ActivitySummary {
  activeUsers: number | null; views: number; failedSignIns: number | null; commentsAwaiting: number
}
export interface EventFilters { day?: number; kind?: EventKind; outcome?: 'ok' | 'fail'; page: number }

/** One page of the one-user list — the server's `store/activity.PAGE`. */
export const EVENTS_PER_PAGE = 6

function list<T>(path: string, enabled: boolean) {
  return { queryKey: ['activity', path], queryFn: () => fetchJson<T>(path), enabled }
}

export const useActivitySummary = (enabled: boolean) =>
  useQuery(list<ActivitySummary>('/api/activity/summary', enabled))
export const useActivityUsers = (enabled = true) =>
  useQuery(list<ActivityUser[]>('/api/activity/users', enabled))
export const useActivityDepartments = (enabled = true) =>
  useQuery(list<DeptReadership[]>('/api/activity/departments', enabled))
export const useActivityPermissions = (enabled = true) =>
  useQuery(list<PermissionChange[]>('/api/activity/permissions', enabled))
export const useActivityComments = (enabled = true) =>
  useQuery(list<CommentFlow[]>('/api/activity/comments', enabled))
export const useActivityFailures = (enabled = true) =>
  useQuery(list<SignInFailure[]>('/api/activity/failures', enabled))

export function useUserActivity(id: string, f: EventFilters, enabled: boolean) {
  const q = new URLSearchParams()
  if (f.day !== undefined) q.set('day', String(f.day))
  if (f.kind) q.set('kind', f.kind)
  if (f.outcome) q.set('outcome', f.outcome)
  if (f.page > 1) q.set('offset', String((f.page - 1) * EVENTS_PER_PAGE))
  const qs = q.toString()
  return useQuery({
    queryKey: ['activity', 'user', id, f],
    queryFn: () => fetchJson<UserActivity>(`/api/activity/users/${id}${qs ? `?${qs}` : ''}`),
    placeholderData: keepPreviousData,
    enabled,
  })
}
