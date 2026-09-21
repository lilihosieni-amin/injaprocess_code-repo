import { createContext, useContext, useEffect, useMemo, useRef } from 'react'
import { isTopDismissible, popDismissible, pushDismissible } from '../ui/dismissibleStack'
import type { ComposeAnchor } from '../lib/comments'
import { useSession } from '../auth/useSession'
import { useCan } from '../auth/can'
import { useProcessComments } from '../api/comments'

export type CommentsDrawer = { kind: 'process'; pid: string } | { kind: 'dept'; code: string }
/** Design `compose.from`: where closing the composer returns to. */
export type ComposeFrom = 'dept' | 'proc' | 'node'

export interface CommentsApi {
  drawer: CommentsDrawer | null
  compose: { anchor: ComposeAnchor; from: ComposeFrom } | null
  openDrawer: (d: CommentsDrawer) => void
  closeDrawer: () => void
  openCompose: (anchor: ComposeAnchor, from: ComposeFrom) => void
  /** Closes the composer and restores the drawer it came from (design `closeCompose`). */
  closeCompose: () => void
}

/** Null outside a `CommentsProvider`: every comment control then draws nothing. */
export const CommentsContext = createContext<CommentsApi | null>(null)

export const useComments = () => useContext(CommentsContext)

/**
 * «کامنت تازه» and its siblings: the session may comment on this department
 * and is not an Editor (addendum §7.2 — the Editor reads comments, never writes one).
 */
export function useMayComment(code: string): boolean {
  const session = useSession().data
  const can = useCan(session)
  return can('comment', `dept:${code}`) && session?.capabilities.includes('edit') !== true
}

/**
 * Visible node-anchored comments per node id (D66 — the server already
 * filtered to what the viewer may see). Fetches nothing outside a
 * `CommentsProvider`, so the export and the provider-less screen tests are
 * untouched.
 */
export function useNodeCommentCounts(pid: string): Record<string, number> {
  const { data } = useProcessComments(pid, !!useComments())
  return useMemo(() => {
    const m: Record<string, number> = {}
    for (const c of data ?? []) if (c.anchor.kind === 'node') m[c.anchor.id] = (m[c.anchor.id] ?? 0) + 1
    return m
  }, [data])
}

/**
 * Escape closes a comment drawer or the composer. It joins the shared
 * dismissible stack (I7, as FlowScreen's ⋯ does), so a dialog opened over the
 * pane answers the Escape first. Pushed once on open: a re-render must not lift
 * the pane above a dialog opened after it.
 */
export function useEscape(onClose: () => void) {
  const latest = useRef(onClose)
  useEffect(() => { latest.current = onClose })
  useEffect(() => {
    const me = Symbol('comments-pane')
    pushDismissible(me)
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape' && isTopDismissible(me)) latest.current() }
    document.addEventListener('keydown', onKey)
    return () => { popDismissible(me); document.removeEventListener('keydown', onKey) }
  }, [])
}
