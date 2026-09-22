import { useMemo, useState, type ReactNode } from 'react'
import { useLocation } from 'react-router-dom'
import { CommentsContext, type CommentsApi, type CommentsDrawer } from './state'
import { DeptDrawer } from './DeptDrawer'
import { Composer } from './Composer'

type State = Pick<CommentsApi, 'drawer' | 'compose'> & { path: string }

/**
 * The comment drawers and the one composer (addendum §7.9), mounted once in
 * `AppShell` — never under `export/`. The state belongs to the page it was
 * opened on: moving to another path reads as closed, as the design's own
 * screen change does.
 *
 * The process drawer is drawn by the flow screen inside its canvas (Reader
 * L680 is `position:absolute` there); the department drawer and the composer
 * are `position:fixed` and are drawn here.
 */
export function CommentsProvider({ children }: { children: ReactNode }) {
  const { pathname } = useLocation()
  const [raw, setRaw] = useState<State>({ drawer: null, compose: null, path: pathname })
  const s = raw.path === pathname ? raw : { drawer: null, compose: null, path: pathname }

  const api = useMemo<CommentsApi>(() => {
    const set = (p: Partial<State>) => setRaw((r) => ({ ...(r.path === pathname ? r : { drawer: null, compose: null }), ...p, path: pathname }))
    return {
      drawer: s.drawer,
      compose: s.compose,
      openDrawer: (drawer) => set({ drawer, compose: null }),
      closeDrawer: () => set({ drawer: null }),
      openCompose: (anchor, from) => set({ compose: { anchor, from }, drawer: null }),
      closeCompose: () => {
        const c = s.compose
        let drawer: CommentsDrawer | null = null
        if (c?.from === 'dept') drawer = { kind: 'dept', code: c.anchor.id }
        if (c?.from === 'proc') drawer = { kind: 'process', pid: c.anchor.id }
        set({ compose: null, drawer })
      },
    }
  }, [s.drawer, s.compose, pathname])

  return (
    <CommentsContext.Provider value={api}>
      {children}
      {s.drawer?.kind === 'dept' && <DeptDrawer code={s.drawer.code} />}
      {s.compose && <Composer anchor={s.compose.anchor} />}
    </CommentsContext.Provider>
  )
}
