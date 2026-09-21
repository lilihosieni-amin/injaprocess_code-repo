import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { fetchJson } from './client'

/** The JSON of `ui-backend/inja_ui_backend/routers/comments.py::present`. */
export type CommentAnchorKind = 'node' | 'process' | 'department'
export type CommentState = 'awaiting' | 'approved' | 'addressed' | 'rejected' | 'withdrawn'
export type CommentAction = 'approve' | 'reject' | 'edit' | 'withdraw' | 'address'

export interface Comment {
  id: string
  anchor: {
    kind: CommentAnchorKind
    id: string
    processId: string | null
    department: string
    departmentName: string | null
    processName: string | null
    nodeLabel: string | null
    /** The anchor no longer stands (D31): surfaced, never repointed. */
    orphan: boolean
  }
  text: string
  state: CommentState
  stage: 'reader' | 'pool' | null
  waitingWith: { kind: 'person'; name: string } | { kind: 'pool' } | { kind: 'editors' } | null
  author: { name: string; isMe: boolean }
  createdAt: string
  updatedAt: string
  approvals: number
  notes: { by: string; text: string; at: string }[]
  rejectReason: string | null
  addressed: { by: string; at: string; note: string | null; commit: string | null } | null
  actions: Record<CommentAction, boolean>
}

export interface CommentTrailItem {
  kind: 'submitted' | 'edited' | 'assigned' | 'skipped' | 'pooled' | 'delivered'
    | 'approved' | 'rejected' | 'withdrawn' | 'addressed'
  name: string
  note: string | null
  reason: string | null
  commit: string | null
  at: string
}

export interface CommentDetail extends Comment { trail: CommentTrailItem[] }

export type InboxTab = 'waiting' | 'own' | 'all'
export interface InboxPage { items: Comment[]; total: number; page: number; pages: number }

export const useProcessComments = (pid: string, enabled = true) =>
  useQuery({ queryKey: ['comments', 'process', pid], enabled, queryFn: () => fetchJson<Comment[]>(`/api/comments?process=${encodeURIComponent(pid)}`) })

export const useDeptComments = (code: string) =>
  useQuery({ queryKey: ['comments', 'dept', code], queryFn: () => fetchJson<Comment[]>(`/api/comments?department=${encodeURIComponent(code)}`) })

export const useInbox = (tab: InboxTab, page: number) =>
  useQuery({ queryKey: ['comments', 'inbox', tab, page], queryFn: () => fetchJson<InboxPage>(`/api/comments/inbox?tab=${tab}&page=${page}`) })

export const useComment = (ref: string) =>
  useQuery({ queryKey: ['comments', 'one', ref], queryFn: () => fetchJson<CommentDetail>(`/api/comments/${encodeURIComponent(ref)}`) })

/** Every write moves a comment and the viewer's pending count (D68, in the session). */
function useCommentMutation<V>(send: (v: V) => Promise<CommentDetail>) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: send,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['comments'] })
      qc.invalidateQueries({ queryKey: ['session'] })
    },
  })
}

const post = (path: string, method: string, body?: unknown) =>
  fetchJson<CommentDetail>(path, { method, body: body === undefined ? undefined : JSON.stringify(body) })
const at = (ref: string) => `/api/comments/${encodeURIComponent(ref)}`

export const useCreateComment = () => useCommentMutation(
  (b: { anchorKind: CommentAnchorKind; anchorId: string; text: string }) => post('/api/comments', 'POST', b))
export const useApproveComment = () => useCommentMutation(
  ({ ref, note }: { ref: string; note?: string | null }) => post(`${at(ref)}/approve`, 'POST', { note: note ?? null }))
export const useRejectComment = () => useCommentMutation(
  ({ ref, reason }: { ref: string; reason: string }) => post(`${at(ref)}/reject`, 'POST', { reason }))
export const useEditComment = () => useCommentMutation(
  ({ ref, text }: { ref: string; text: string }) => post(at(ref), 'PUT', { text }))
export const useWithdrawComment = () => useCommentMutation(
  (ref: string) => post(`${at(ref)}/withdraw`, 'POST'))
export const useAddressComment = () => useCommentMutation(
  ({ ref, note }: { ref: string; note?: string | null }) => post(`${at(ref)}/address`, 'POST', { note: note ?? null }))
