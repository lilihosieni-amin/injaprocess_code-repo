import { useNavigate, useParams, useLocation, Link } from 'react-router-dom'
import { useState, useRef, useEffect } from 'react'
import { ReactFlowProvider, useReactFlow, type Connection } from '@xyflow/react'
import { useConfirmations, useProcess, useProcesses, usePutProcess, useRelayout, useCreateProcess, useResolvePending } from '../api/hooks'
import { useSession } from '../auth/useSession'
import { useCan } from '../auth/can'
import { ConfirmAction } from '../write/ConfirmMark'
import { useFlowEditor } from './useFlowEditor'
import { neighborProcess } from '../lib/process-nav'
import { toFlowNodes, toFlowEdges } from './adapt'
import { Canvas } from './Canvas'
import { Button, Spinner } from '../ui/Button'
import { Icon } from '../ui/Icon'
import { readerBack } from '../shell/crumbs'
import { useSurface } from '../ui/surface'
import { IdBadge } from '../ui/IdBadge'
import { pushDismissible, popDismissible, isTopDismissible } from '../ui/dismissibleStack'
import { DeleteNodeConfirm } from './DeleteNodeConfirm'
import { DetailDrawer } from './DetailDrawer'
import { JunctionLegend } from './JunctionLegend'
import type { ActivityNode } from '../api/types'

/**
 * One row of the ⋯ menu — `Inja Panel.dc.html:578`, and identical at 586, 589
 * and 592.
 *
 * `display:flex; align-items:center; gap:10px; padding:12px; border-radius:11px;
 * font-size:13.5px; font-weight:600; color:#2A1D5E; text-align:start`, on
 * `--tile-v2` when hovered. `min-h-touch` is F11's floor and is the app's, not
 * the design's: 12px of padding round a 13.5px line is 40px drawn, and the
 * design draws what is PAINTED while the floor is what is pressable.
 *
 * A constant rather than four copies, because four rows differing by nothing is
 * four places one radius would have to be kept in step.
 */
const MENU_ROW =
  'flex items-center gap-s5 p-s6 w-full min-h-touch border-0 bg-transparent '
  + 'rounded-input cursor-pointer text-start text-fs-menu font-semibold text-ink '
  + 'hover:bg-tile-v2 disabled:text-disabled disabled:cursor-default'

export function FlowScreen() {
  return (
    <ReactFlowProvider>
      <FlowEditor />
    </ReactFlowProvider>
  )
}

function FlowEditor() {
  const { pid = '' } = useParams()
  const nav = useNavigate()
  const { pathname } = useLocation()
  const { data: server } = useProcess(pid)
  const can = useCan(useSession().data)
  const { data: siblings = [] } = useProcesses(server?.department ?? '', { enabled: !!server?.department })
  const ed = useFlowEditor(server)
  const put = usePutProcess(pid)
  const relayout = useRelayout(pid)
  const createProcess = useCreateProcess()
  const resolve = useResolvePending(pid)
  const [pendingDel, setPendingDel] = useState<string | null>(null)
  const [detailId, setDetailId] = useState<string | null>(null)
  const [mode, setMode] = useState<'pan' | 'select'>('pan')
  const rf = useReactFlow()
  const wrapRef = useRef<HTMLDivElement>(null)
  // **R47 — the ⋯ menu, and the confirm question it shares with the toolbar.**
  //
  // Both pieces of state live HERE and not in a child, because the design puts
  // them here: `Inja Panel.dc.html:3563` is `mConfirm: () => set({flowMenu:
  // false, confirmDialog: true})` — one dialog, opened from two controls, and
  // the menu closes behind it. A dialog owned by whichever control was pressed
  // could not do that, and the ⋯'s trigger and its popover are not siblings
  // either: the trigger is inside `data-r-flowtitle` (panel 571) and the
  // popover is a child of the BAR (panel 576), because it is positioned against
  // the bar's own box.
  //
  // **Above the in-flight early return**, like every other hook in this
  // function — see the note on `useSurface` below, and R46's §4.
  const [flowMenu, setFlowMenu] = useState(false)
  const [asking, setAsking] = useState(false)
  const moreRef = useRef<HTMLButtonElement>(null)
  const popRef = useRef<HTMLDivElement>(null)
  const menuIdentity = useRef(Symbol('flow-more')).current

  // I7 — the ⋯ joins `Overlay`'s dismissible stack rather than listening to
  // `document` on its own, so a menu opened underneath a dialog does not answer
  // the same Escape the dialog does. `ProcessList`'s own ⋯ and `src/ui/Menu.tsx`
  // share this stack for the same reason.
  //
  // Two refs and not one: the trigger and the popover have different parents
  // (see above), so "outside" is the union of the two boxes and cannot be asked
  // of a single wrapper the way `ProcessList` asks it.
  useEffect(() => {
    if (!flowMenu) return
    pushDismissible(menuIdentity)
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape' && isTopDismissible(menuIdentity)) setFlowMenu(false)
    }
    function onDown(e: MouseEvent) {
      const t = e.target as Node
      if (moreRef.current?.contains(t) || popRef.current?.contains(t)) return
      setFlowMenu(false)
    }
    document.addEventListener('keydown', onKey)
    document.addEventListener('mousedown', onDown)
    return () => {
      popDismissible(menuIdentity)
      document.removeEventListener('keydown', onKey)
      document.removeEventListener('mousedown', onDown)
    }
  }, [flowMenu, menuIdentity])

  // **R46 — the process confirmation lives here, and the department is read
  // lexically off the id in the URL.**
  //
  // Not `proc.department`: that is only reachable past the in-flight early
  // return forty lines down, and a hook below a conditional return changes hook
  // order between renders the moment the document arrives. `Summary.tsx:146`
  // reads it the same way and for the same reason, and so does the server —
  // `storage.dept_of` is `pid.rsplit("-", 1)[0]`, and `_target_scope` gates on
  // the id it was handed before anything is loaded.
  //
  // `enabled` is not an optimisation. `GET /api/confirmations` requires
  // `confirm` on the department and 403s everyone else, so an ungated read puts
  // a refusal in the console on every flowchart a reader opens.
  const dept = pid.replace(/-[^-]*$/, '')
  const mayConfirm = can('confirm', `dept:${dept}`)
  const { data: marks = [] } = useConfirmations(dept, { enabled: mayConfirm })

  // **R44** — which surface is asking, and therefore whether this toolbar draws
  // «بازگشت» at all. Its one use is on the toolbar far below.
  //
  // **Above the in-flight early return, and that is a bug fix rather than a
  // tidy-up.** This call sat below `if (!ed.doc) return`, so the first render —
  // the one where the document is still in flight — called sixteen hooks and
  // bailed, and the render after it called seventeen. React reports that on
  // every single load of this screen (*"React has detected a change in the order
  // of Hooks called by FlowEditor"*), and `react-hooks/rules-of-hooks` reported
  // it as the ONLY ESLint error in `ui/`. It survived the whole 25-task rebuild
  // because F16 froze `src/flow/`: nobody was allowed to open the file that had
  // it. `src/flow/FlowScreen.hooks.test.tsx` is the regression test, and it has
  // to delay the read — resolve it synchronously and the early return is never
  // taken, which is why the nine test files already here never saw it.
  const onReader = useSurface() === 'reader'

  function centerPos() {
    const el = wrapRef.current
    if (!el) return { x: 120, y: 120 }
    const r = el.getBoundingClientRect()
    return rf.screenToFlowPosition({ x: r.left + r.width / 2, y: r.top + r.height / 2 })
  }

  if (!ed.doc) return <div className="flex-1 bg-bg" />
  const proc = ed.doc
  const tombstoned = !!proc.tombstoned
  const editing = ed.editing
  // `row.confirmed` is "the stored mark is for THESE bytes", not "a mark
  // exists" — FR-V2 / FR-V3 / AC-18. The server recomputes the fingerprint on
  // read, so a flowchart whose nodes were moved since it was vouched for
  // arrives `false` and both controls below say so without this file owning a
  // rule about it.
  const mark = marks.find((m) => m.target === proc.id)
  const prevProc = neighborProcess(siblings, proc.id, -1)
  const nextProc = neighborProcess(siblings, proc.id, 1)
  // R21's destination. `readerBack` answers `undefined` for a path that IS the
  // root it is handed, which `/processes/{pid}/flow` against a department never
  // is; the coalesce narrows `string | undefined` to the `To` a `<Link>` takes
  // and is not a second answer to the question.
  const deptRoot = `/departments/${proc.department}`
  const backTo = readerBack(pathname, deptRoot) ?? deptRoot
  // R5 — the edit control is not drawn to someone the edit path would refuse.
  //
  // Cosmetic only, like every other `useCan` on a screen (D48): PUT
  // /api/processes/{pid}, POST .../relayout, DELETE and the pending resolver
  // all re-derive `edit` from the session row and refuse regardless
  // (`routers/processes.py:280,358,386,416`). What it fixes is the app leading
  // a reader to that refusal: signed in as one, the complete set of controls
  // this screen offers is «بازگشت», «ویرایش» and React Flow's three zoom
  // buttons — so the one in-app action a reader was offered here was the one
  // action they may not take.
  //
  // Asked about THIS process's department, not about the person, because
  // `_pid_target` gates every one of those endpoints on `dept:{dept_of(pid)}`
  // — the same question `Summary.tsx:67` and `ProcessList.tsx:42` ask. The
  // scope argument is load-bearing and not decoration: without it the head of
  // another department is handed a button whose save 403s, which is the same
  // R5 defect one level in. (`session.ts`'s bare `can(descriptor, capability)`
  // takes no target at all and would do exactly that; this is `auth/can.ts`'s
  // `useCan`, which does.)
  const mayEdit = can('edit', `dept:${proc.department}`)

  function onSave() {
    if (tombstoned) return
    put.mutate(proc, { onSuccess: (saved) => { ed.adopt(saved); ed.exitEdit() } })
  }

  function onRelayout() { relayout.mutate(proc, { onSuccess: (laid) => ed.adopt(laid) }) }

  function onNodeClick(id: string) {
    const n = proc.nodes.find((x) => x.id === id)
    if (n && n.type === 'junction') { if (editing) ed.select(id); setDetailId(id); return }
    if (editing) { ed.select(id); return }
    if (n && n.type === 'activity' && (n as ActivityNode).subprocess) nav(`/processes/${(n as ActivityNode).subprocess}/flow`)
  }

  return (
    // R40 — **the flowchart screen is cream, for everyone.** Owner ruling, and a
    // regression rather than a preference: at this branch's merge base
    // `PanelShell` painted `bg-bg` on its root and this screen inherited it; the
    // shell rebuild moved both shell roots to `bg-ink` (§6.0's violet field,
    // which is right for every other screen) and this file declares no ground of
    // its own, so the canvas silently went violet. Ledger **L-01** records
    // `#FBF7F1` as "the flow canvas's ground".
    //
    // **Here, not on the shells.** `bg-ink` on `[data-screen]` is fixed into
    // place across the rebuild and `e2e/sweep.spec.ts` pins it for eight screens;
    // repainting a shell would make this screen right and take the other eight
    // off the field. `background-color` does not inherit, so this is the element
    // that has to say it — one declaration on the one root that is an ancestor of
    // all three regions.
    //
    // **And only here.** `Canvas.tsx` paints nothing and must go on painting
    // nothing: `@xyflow/react`'s own `.react-flow` background-color is
    // `transparent` by default, and the pane, its viewport and the renderer are
    // transparent too, so the cream declared on this box is what shows through
    // the canvas — exactly as it did before the regression. The two toolbars
    // (`bg-white`) and the tombstone strip are opaque and cover it deliberately;
    // the in-flight blank forty lines up is already `bg-bg`, so the route is one
    // colour from first paint to last. Measured in Chrome by `e2e/flow.spec.ts`
    // at three widths on both surfaces — `data-r-flow` is that spec's hook, and
    // deliberately not `data-screen`, which means "sits on §6.0's field" and is
    // the one thing this screen does not do.
    <div data-r-flow className="flex-1 flex flex-col min-h-0 bg-bg">
      {/* **R3 — the two surfaces draw this bar at their own scale.** `padding:
          11px 22px; gap:12px` (panel 558) against `10px 20px; gap:10px` (reader
          312). The file drew the PANEL's numbers on both, as an arbitrary
          `px-[22px] py-[11px]`; all four now read the theme.

          **`py-flowbar-y` — R47's mint, and R46's `py-[11px]`.** Eleven tokens
          in `tokens.css` hold 11px — the textarea's padding, the dialog
          dropdown's, the nested tick's, the note's inline padding, the ≤760
          table-row gap… — and not one of them is a bar's padding-y. The file's
          own rule for that case is the one `--gap-table-row-mobile` states:
          *mint again under its own name rather than borrow*. R46 had no mint
          authority and reported it; R47 minted it. The reader's 10px needed
          nothing — it is `--space-5` — which is why only one surface names a
          new token here.

          **`max760:` — `padding:9px 12px; gap:8px` on BOTH surfaces** (panel 93,
          reader 99), the one place the two converge. The 12 is `--space-6` and
          the 8 `--space-4`; the 9 is `--pad-flowbar-y-mobile`, a third role at
          that number on this bar alone (`--pad-flowbar-action-y` and
          `--pad-flowback-y` are the other two).

          **`relative`** — both deliverables declare `position:relative` on this
          element (panel 558, reader 312), and it is load-bearing rather than
          decorative: the ⋯ menu's popover is `position:absolute; top:calc(100%
          + 6px); left:12px` against THIS box (panel 576). Without it the
          popover would anchor to whatever ancestor happened to be positioned.

          **`flex-wrap`, and it is the whole of the owner's "it doesn't
          responsive".** `Inja Panel.dc.html:558` declares it on the element and
          `Inja Reader.dc.html:99` turns the reader's `nowrap` into `wrap` inside
          the ≤760 block. Without it every control stays on one line and the last
          of them are pushed off a phone screen entirely.

          **`data-r-flowbar` alone, though both deliverables put `data-r-topbar`
          on this element too** (panel 558, reader 312). In THIS build that hook
          has a second, narrower meaning: `e2e/reader-shell.spec.ts:236` counts
          `[data-r-topbar]` to assert the reader shell draws *no chrome at all*
          on the flowchart route, which is the whole of R21's arrangement. The
          only ≤1080 rule the design addresses to `[data-r-topbar]` is
          `[data-r-topbar] [data-r-hide]`, and the two `data-r-hide` children it
          governs here — the reader's department crumb and its «/» separator
          (reader 317-318) — are not drawn by this build at all. So the hook
          would buy nothing today and would break a shell contract; it belongs
          with those two children, whenever they are built. Reported. */}
      <div
        data-r-flowbar
        className={
          'relative flex items-center flex-wrap bg-card border-b border-warm shrink-0 '
          + 'max760:px-s6 max760:py-flowbar-y-mobile max760:gap-s4 '
          + (onReader ? 'gap-s5 px-topbar-reader py-s5' : 'gap-s6 px-topbar py-flowbar-y')
        }
      >
        {/* R21 — `Inja Reader.dc.html:312-316`. On the flowchart the design puts
            «بازگشت» INSIDE this toolbar, as its first child, and draws no bar of
            its own above it; that is why `ReaderShell` renders no chrome on this
            route at all. Without this control the screen is a dead end for a
            reader: signed in as one, the complete set of controls rendered here
            is «ویرایش» and React Flow's three zoom buttons — no back, no home,
            no sign-out, no link of any kind.

            **R44, and the reason this is the file's one surface branch.** The
            owner's ruling was "in flowchart screen, the back button should be on
            top menu too. like other page." That is the panel, and it is what its
            own deliverable draws: `Inja Panel.dc.html:558-613` is the panel's
            flow toolbar and there is no back button anywhere in it — its first
            child is `data-r-flownav`, the next/previous pair — while the crumb
            strip above carries «بازگشت» on every route but the home screen
            (`canBack`/`showCrumbBar`, `:3451` and `:3454`). The two deliverables
            genuinely disagree about this one control, and there is one
            `FlowScreen`, so the answer cannot be a constant: drawn always, the
            panel has two of them, which is the defect R41 was raised for; drawn
            never, the reader is stranded, which is R21 above. `useSurface()` is
            what tells them apart, and `PanelShell` drops the `!onFlow` guard
            that used to stand in for this branch. The destination is untouched
            either way — `crumbs[length-2]` on this route and `readerBack` are
            the same process summary.

            `readerBack` rather than a literal `/processes/{pid}`, so the one
            function that answers "where does back go" stays the only one. On
            this route it answers the process summary (`crumbs.ts:116`) whatever
            root it is handed, which is why this department — a page anyone who
            can open this process can also reach — is a safe thing to hand it.

            Drawn at reader 313's own numbers (`9px 13px`, radius 11, 13px, the
            lavender tile behind a 1.5px hairline), and now every one of them
            reads the theme. The `9px 13px` was the last pair left arbitrary:
            no token was a back button's padding, because reader 157's CHROME
            back button is `10px 15px` and owns `--pad-back-y`/`--pad-button-x`,
            and this bar's button is a different site. R47 mints both halves.

            **≤760 — reader 104-105.** The button keeps its glyph and loses its
            word (`[data-r-backlabel]{display:none}`) and squares to
            `width:38px; padding:9px 0`. Three tokens hold 38px —
            `--size-menu-more-reader` (the reader chrome's own square button),
            `--size-logo-bar` (the logo IMAGE) and `--space-14` — and none is
            this, so R47 mints `--width-flowback-mobile` rather than borrow one
            of them. The vertical 9 is the same `--pad-flowback-y` the wide
            state draws, which is why only the inline half is zeroed. */}
        {onReader && (
          <Link
            to={backTo}
            data-r-flowback
            aria-label="بازگشت"
            title="بازگشت"
            className="inline-flex items-center gap-s3 px-flowback-x py-flowback-y rounded-input font-bold text-fs-sm bg-tile-v2 text-violet border-hairline border-line flex-none no-underline max760:order-first max760:w-flowback-mobile max760:justify-center max760:px-0"
          >
            <Icon name="chevronStart" px={15} stroke={2.4} />
            <span data-r-backlabel className="inline max760:hidden">بازگشت</span>
          </Link>
        )}
        {/* **`data-r-flownav` — the next/previous pair, and the first thing that
            goes on a phone.** `[data-r-flowbar] [data-r-flownav]{display:none
            !important}` at panel 99 and reader 115: both surfaces drop it at
            ≤760, and it is the one control here whose job the browser's own back
            gesture already does.

            **Three of this group's values were un-writable rather than
            un-named, which is a different failure — and R47 closed it.** The
            3px gap is `--gap-tab-flow`, the 5px inset is `--space-2` and the
            tool-group divider is `--line-divider`. All three tokens existed and
            all three utilities sat on `theme.test.ts`'s `UNPAINTED`, whose guard
            fails the moment a class on it acquires a consumer ("Delete these
            lines from the list and lower CEILING by the same number") — and that
            bookkeeping lived in a file R46 could not edit, so writing the
            correct token here turned the suite red. `--gap-tab-flow`'s own
            comment in `tokens.css` reads *"the flow nav group, `gap:3px;
            padding:5px`"*: it was minted for THIS element and had never been
            writable, because the only file that would consume it was frozen by
            F16 and the list recording its orphanhood was frozen too. */}
        {!editing && (prevProc || nextProc) && (
          <div data-r-flownav className="flex items-center gap-tab-flow bg-tile-v2 rounded-button p-s2 flex-none max760:hidden">
            {/* next process — sits on the right in RTL (first in DOM), '>' icon */}
            <button onClick={() => nextProc && nav(`/processes/${nextProc.id}/flow`)} disabled={!nextProc}
              title={nextProc ? `فرآیند بعدی: ${nextProc.name}` : undefined} aria-label={nextProc ? `فرآیند بعدی: ${nextProc.name}` : undefined}
              className="w-tool h-tool flex items-center justify-center rounded-tool bg-card text-violet disabled:text-disabled disabled:cursor-default">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><path d="M9 6l6 6-6 6" /></svg>
            </button>
            <div className="w-px h-s9 bg-line-divider" />
            {/* previous process — on the left, '<' icon */}
            <button onClick={() => prevProc && nav(`/processes/${prevProc.id}/flow`)} disabled={!prevProc}
              title={prevProc ? `فرآیند قبلی: ${prevProc.name}` : undefined} aria-label={prevProc ? `فرآیند قبلی: ${prevProc.name}` : undefined}
              className="w-tool h-tool flex items-center justify-center rounded-tool bg-card text-violet disabled:text-disabled disabled:cursor-default">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><path d="M15 6l-6 6 6 6" /></svg>
            </button>
          </div>
        )}
        {proc.parent && !editing && (
          <Button variant="ghost" onClick={() => nav(`/processes/${proc.parent!.process}/flow`)} className="px-3 py-[7px] text-[12px]">فرآیند والد</Button>
        )}
        {/* **`data-r-flowtitle` — which on a phone is the whole first row.**
            `order:-1; flex:1 1 auto; min-width:0` (panel 94 and 103, reader 110
            and 119, where the later `flex:1 1 auto` is what the cascade lands
            on). `order-first` is Tailwind's reachable spelling of a negative
            order — its `-9999` and the design's `-1` order identically against
            the default 0, and the theme has no negative rung.

            `min-w-0` is the load-bearing half of the pair: a flex item's default
            `min-width` is `auto`, so without it the name refuses to shrink below
            its own text and the ellipsis below never fires — the bar simply
            grows and the controls after it leave the screen. */}
        <div data-r-flowtitle className="flex items-center gap-s5 min-w-0 max760:order-first max760:flex-auto max760:min-w-0">
          <IdBadge tone="violet">{proc.id}</IdBadge>
          {!editing
            // `max760:truncate`, not a bare `truncate`: panel 95 and reader 111
            // put the ellipsis INSIDE the ≤760 block. Above the breakpoint the
            // bar wraps instead of clipping, and a name silently cut at 1440
            // would be a different screen from the one the design draws.
            ? <span data-r-pname className="font-bold text-fs-lg text-ink max760:truncate max760:min-w-0">{proc.name}</span>
            : <input value={proc.name} onChange={(e) => ed.setName(e.target.value)} className="font-bold text-fs-lg text-ink border-hairline border-line rounded-control px-s5 py-1 outline-none focus:border-coral w-[280px] max-w-full" />}
          {/* **`data-r-flowmore` — R46's C7, unblocked by R47's mint.**
              `Inja Panel.dc.html:571`: a 34×34 radius-10 lavender tile behind a
              1.5px hairline, `display:none`, and `display:flex` at ≤760 (panel
              102). It REPLACES the action group rather than supplementing it —
              panel 99 takes `data-r-actions` and `data-r-flownav` off the bar at
              the same breakpoint — so every act the bar offers is in here too.
              That is the rule `ProcessList`'s own ⋯ states, and it is the mobile
              behaviour the owner reported missing.

              **`--size-tool`, not `--size-menu-more`.** Both are square boxes on
              a top bar and they are 34 and 36; `ProcessList`'s ⋯ is the 36, the
              panel's chrome squares are the 36, and this one is the 34 that
              every other button on THIS bar is drawn at (panel 561).

              **The panel only.** `Inja Reader.dc.html:118` forces it
              `display:none` at the one width it could have appeared at, because
              the reader's actions stay on the bar instead (reader 113). Drawn
              never rather than drawn-and-hidden: a hook with no visible state on
              a surface is a thing for a later reader to wonder about, and R44
              already makes `useSurface()` this file's one surface branch.

              **Not while editing.** The design has no edit mode to draw, so
              panel 99's `display:none` is written about the VIEW state; applying
              it to the edit toolbar would take undo, «ذخیره» and «انصراف» off a
              phone entirely. `data-r-flownav` above is gated the same way. */}
          {!onReader && !editing && (
            <button
              ref={moreRef}
              type="button"
              data-r-flowmore
              aria-haspopup="menu"
              aria-expanded={flowMenu}
              aria-label="ابزارها"
              title="ابزارها"
              onClick={() => setFlowMenu((v) => !v)}
              className={
                'relative before:absolute before:content-[""] before:-inset-s2 '
                + 'hidden max760:flex items-center justify-center flex-none ms-auto '
                + 'w-tool h-tool rounded-control bg-tile-v2 border-hairline border-line '
                + 'text-violet text-fs-lg font-bold cursor-pointer'
              }
            >
              ⋯
            </button>
          )}
        </div>
        {/* **The popover — R46's C8, and the 225px that blocked it.**
            `position:absolute; top:calc(100% + 6px); left:12px; min-width:225px`
            (panel 576). `left` in an RTL document is the inline END, so it is
            written `end-s6`; `--space-6` is the 12 and `--space-3` the 6.

            `min-w-menu-flow` is R47's mint. `tokens.css`'s `--width-menu`
            comment had already written this line down — *"A later screen whose
            menu genuinely wants 225 mints its own name; it does not re-value
            this one"* — and `--width-menu` is 265px, the panel SHELL's «مدیریت»
            popover. Two menus, two floors.

            A sibling of `data-r-flowtitle` and a child of the BAR, which is what
            the design draws and what the bar's `relative` is for. The design
            also lays a `position:fixed; inset:0` catcher under it (panel 575);
            this build dismisses through `dismissibleStack` instead, as
            `ProcessList` and `src/ui/Menu.tsx` both do, so one Escape closes one
            thing. */}
        {flowMenu && (
          <div
            ref={popRef}
            role="menu"
            className={
              'absolute top-full mt-s3 end-s6 z-dropdown min-w-menu-flow flex flex-col gap-half '
              + 'bg-card border border-border-card rounded-card shadow-pop p-s4'
            }
          >
            {/* «تأییدشده» — the same question the toolbar's control asks, and
                the same dialog. Gated on `confirm` for this department, exactly
                as `ConfirmAction` gates itself (R5): the row is absent for
                someone the write would refuse, not disabled.

                **Its own tick box, and not `TickBox`.** Ledger L-48 makes every
                `TickBox` in the app violet and reserves green for this element
                by name — *"the flow screen's confirmed mark keeps its green and
                this box may not borrow it"* — so borrowing the primitive here is
                the one thing that rule forbids. `--border-pick`'s own token
                comment names "unchecked tick" as one of its three roles. */}
            {mayConfirm && mark && (
              <button
                role="menuitem"
                type="button"
                onClick={() => { setFlowMenu(false); setAsking(true) }}
                className={MENU_ROW}
              >
                <span
                  data-testid="flowmenu-tick"
                  className={
                    'flex items-center justify-center flex-none w-tick h-tick rounded-tick '
                    + 'border-hairline text-card '
                    + (mark.confirmed ? 'bg-green border-green' : 'bg-card border-border-pick')
                  }
                >
                  {mark.confirmed && <Icon name="check" px={13} stroke={3} />}
                </span>
                <span className="flex-1">تأییدشده</span>
              </button>
            )}
            {mayEdit && !tombstoned && (
              <button role="menuitem" type="button" onClick={() => { setFlowMenu(false); ed.enter() }} className={MENU_ROW}>
                <span className="flex-1">ویرایش</span>
              </button>
            )}
            {/* `height:1px; background:#F2ECE3; margin:6px 4px` (panel 590) —
                `--hair`, whose own `_ds` comment reads "internal divider". Its
                `bg-` spelling was the fourth utility R46 reported as named,
                compiled and never writable. */}
            {(prevProc || nextProc) && <div data-testid="flowmenu-rule" className="h-px bg-hair my-s3 mx-s1" />}
            {(prevProc || nextProc) && (
              <>
                <button role="menuitem" type="button" disabled={!nextProc}
                  onClick={() => { setFlowMenu(false); if (nextProc) nav(`/processes/${nextProc.id}/flow`) }}
                  className={MENU_ROW}>
                  <span className="flex-1">فرآیند بعدی</span>
                </button>
                <button role="menuitem" type="button" disabled={!prevProc}
                  onClick={() => { setFlowMenu(false); if (prevProc) nav(`/processes/${prevProc.id}/flow`) }}
                  className={MENU_ROW}>
                  <span className="flex-1">فرآیند قبلی</span>
                </button>
              </>
            )}
          </div>
        )}
        {/* **R46 — `data-r-actions`, the flow bar's own action group.**
            `Inja Panel.dc.html:597-608` and `Inja Reader.dc.html:357-368` draw
            it identically: `margin-inline-start:auto`, and inside it the
            process confirmation followed by «ویرایش». Naming the group is what
            lets the ≤760 rules below address it, and it is the same hook both
            deliverables' own media queries use.

            **R47 — and at ≤760 the two surfaces do OPPOSITE things with it.**
            The panel takes the whole group off the bar (`[data-r-flowbar]
            [data-r-flownav],[data-r-flowbar] [data-r-actions]{display:none
            !important}`, panel 99) and puts its acts in the ⋯ above; the reader
            keeps it and re-lays it (`order:2; margin-inline-start:0; flex:1 1
            auto; justify-content:flex-end`, reader 113) and draws no ⋯ at all
            (reader 118). This is the deliberate R3 disagreement, and it is the
            "it doesn't responsive" the owner reported.

            **The collapse is gated on `!editing`.** The design has no edit mode
            to draw, so panel 99 is a rule about the VIEW state; this group holds
            the whole edit toolbar when `editing`, and hiding it at ≤760 would
            take undo, «ذخیره» and «انصراف» off a phone with nothing offering
            them instead. */}
        <div
          data-r-actions
          className={
            'ms-auto flex items-center gap-s4 flex-wrap '
            + (onReader
              ? 'max760:order-2 max760:ms-0 max760:flex-auto max760:justify-end'
              : editing ? '' : 'max760:hidden')
          }
        >
          {/* **The confirmation, moved off the information page (R46).**

              The owner's words were *"the each process accept or reject should
              be in flowchart page, not in information page"*, and the design is
              more precise than the ruling: the summary's action group
              (`Inja Panel.dc.html:393-396`) holds **only** «ویرایش اطلاعات»,
              while both flow bars hold the confirm control immediately before
              their «ویرایش». So `ConfirmAction` moves here and
              `Summary.tsx` keeps only its status pill, which the design does
              still draw on that screen's badge row (`:389`, under `isEditor`).

              **`ConfirmAction` alone, and NOT `ConfirmMark` beside it.** Panel
              599 is a single `7px 12px` pill carrying a 19px tick AND the label
              «تأییدشده» AND the press; this build draws §6.3's settled control
              instead — a 34px `--size-tool` box behind §6.15's dialog, which is
              what `Overview.tsx:178-181` already draws in an action group. The
              pill's own `padding:7px 12px` has no token and
              `tokens.css:613-616` names this exact site (*"the confirm box,
              panel 599 and reader 359"*) as one that *"mints its own when their
              screens are built"*, so the design's box is reported rather than
              approximated with a neighbouring 7.

              **The mark stays off this bar because it is not legible on it, and
              that is measured.** `ConfirmMark` renders a byline in
              `--role-subtitle-on-field` — its own docstring says both
              its call sites "are inside a `bg-ink` screen root … drawn on the
              `--ink` field and never on cream". This toolbar is `--card` white:
              measured in Chrome, that byline lands at **1.74:1**, and the
              `StatusPill` beside it at 3.86:1. The design draws no byline here
              at all. State is not lost — `ConfirmAction`'s accessible name IS
              the state («لغو تأیید» only when the row is confirmed, «تأیید
              محتوا» only when it is not) and its glyph switches with it — and
              the pill still stands on `Summary`, on the violet field, where
              `Inja Panel.dc.html:389` draws it and where its ink is right.
              `e2e/flow.spec.ts` grades every run of text on this bar against
              the ground actually behind it, so this cannot come back quietly.

              Not gated here: it returns null without `confirm` on this
              department (R5), which is a different capability from the `edit`
              that gates the button beside it — so each control carries its own
              question and this row asks none. Drawn only outside edit mode: the
              design has no edit mode to draw it beside, and by FR-V3 a document
              being edited is one whose confirmation is about to be invalid
              anyway. */}
          {/* **`render="trigger"` — R47.** The DIALOG is drawn at the screen
              root instead, and the split is forced by the ≤760 rule three
              comments up: `display:none` on this group takes a `position:fixed`
              descendant with it, so a dialog opened from the ⋯ would render
              inside a hidden box and never appear. `open`/`onOpenChange` are
              this file's, which is also where the design keeps them
              (`confirmDialog` is app state, panel 3563). */}
          {!editing && (
            <ConfirmAction row={mark} department={dept} render="trigger"
              open={asking} onOpenChange={setAsking} />
          )}
          {tombstoned || !mayEdit ? null : !editing ? (
            // `padding:9px 16px; font-size:13px` (panel 607, reader 367). It was
            // `px-4 py-2` — Tailwind's own rem ladder, 16px and 8px, which is the
            // scale the `s` prefix exists to keep out of this app and which no
            // guard in the repo can see, because a t-shirt name is neither a hex
            // nor an arbitrary value. The 16 is `--space-8`; the 9 is R47's
            // `--pad-flowbar-action-y`, minted rather than borrowed from the five
            // other 9px tokens, none of which is a toolbar button's padding-y.
            <Button variant="violet" onClick={ed.enter} className="px-s8 py-flowbar-action-y text-fs-sm" data-testid="enter-edit">ویرایش</Button>
          ) : (
            <>
              {/* undo / redo */}
              <div className="flex items-center gap-[3px] bg-tile-v2 rounded-xl p-[5px]">
                <button disabled={!ed.canUndo} onClick={ed.undo} title="واگرد" className="w-[34px] h-[34px] flex items-center justify-center rounded-[9px] bg-white text-violet disabled:text-disabled disabled:cursor-default">
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M9 14L4 9l5-5" /><path d="M4 9h11a5 5 0 0 1 0 10h-1" /></svg>
                </button>
                <button disabled={!ed.canRedo} onClick={ed.redo} title="ازنو" className="w-[34px] h-[34px] flex items-center justify-center rounded-[9px] bg-white text-violet disabled:text-disabled disabled:cursor-default">
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M15 14l5-5-5-5" /><path d="M20 9H9a5 5 0 0 0 0 10h1" /></svg>
                </button>
              </div>
              {/* mouse mode: move (pan) vs select */}
              <div className="flex items-center gap-[3px] bg-tile-v2 rounded-xl p-[5px]">
                <button onClick={() => setMode('pan')} title="حالت جابه‌جایی" className={`w-[34px] h-[34px] flex items-center justify-center rounded-[9px] ${mode === 'pan' ? 'bg-violet text-white' : 'bg-white text-violet'}`}>
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M5 9l-3 3 3 3M9 5l3-3 3 3M15 19l-3 3-3-3M19 9l3 3-3 3M2 12h20M12 2v20" /></svg>
                </button>
                <button onClick={() => setMode('select')} title="حالت انتخاب" className={`w-[34px] h-[34px] flex items-center justify-center rounded-[9px] ${mode === 'select' ? 'bg-violet text-white' : 'bg-white text-violet'}`}>
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 3l7.07 17 2.51-7.39L20 10.07z" /></svg>
                </button>
              </div>
              {/* relayout */}
              <div className="flex items-center gap-[7px] bg-tile-v2 rounded-xl p-[5px]">
                <button onClick={onRelayout} disabled={relayout.isPending} className="flex items-center gap-1.5 px-[11px] py-[7px] rounded-[9px] bg-white text-[12px] font-semibold text-violet disabled:opacity-50">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 2v6h-6M3 12a9 9 0 0 1 15-6.7L21 8M3 22v-6h6M21 12a9 9 0 0 1-15 6.7L3 16" /></svg>چیدمان
                </button>
              </div>
              {/* add activity / junction */}
              <div className="flex items-center gap-[7px] bg-tile-v2 rounded-xl p-[5px]">
                <button onClick={() => ed.addActivity(centerPos())} className="flex items-center gap-1.5 px-[11px] py-[7px] rounded-[9px] bg-white text-[12px] font-semibold text-violet">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><rect x="4" y="7" width="16" height="10" rx="2" /><path d="M12 10v4M10 12h4" strokeWidth="2.2" /></svg>فعالیت
                </button>
                <button onClick={() => ed.addJunction(centerPos())} className="flex items-center gap-1.5 px-[11px] py-[7px] rounded-[9px] bg-white text-[12px] font-semibold text-violet">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinejoin="round"><path d="M12 3l9 9-9 9-9-9z" /></svg>اتصال
                </button>
              </div>
              <button onClick={ed.cancel} data-testid="flow-cancel" className="px-3.5 py-[9px] border-[1.5px] border-line bg-white rounded-[11px] font-semibold text-[12.5px] text-muted hover:bg-tile-v2">انصراف</button>
              <button onClick={onSave} disabled={put.isPending} aria-busy={put.isPending || undefined} data-testid="save" className={`flex items-center gap-1.5 px-[18px] py-[9px] rounded-[11px] bg-green text-white font-bold text-[13px] shadow-green hover:brightness-105 ${put.isPending ? 'cursor-progress' : ''}`}>
                {put.isPending
                  ? <Spinner />
                  : <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><path d="M20 6L9 17l-5-5" /></svg>}
                {put.isPending ? 'در حال ذخیره…' : 'ذخیره'}
              </button>
            </>
          )}
        </div>
      </div>

      {tombstoned && (
        <div className="shrink-0 border-b border-warm bg-tile-dead px-[22px] py-2.5 text-[13px] text-muted flex flex-wrap items-center gap-2">
          <span className="font-bold text-ink">این فرآیند باطل شده است.</span>
          {(proc.superseded_by ?? []).length > 0 && (
            <>
              <span>جانشین:</span>
              {(proc.superseded_by ?? []).map((h) => (
                <Link key={h} to={`/processes/${h}`} className="font-mono text-violet underline decoration-dotted">{h}</Link>
              ))}
            </>
          )}
        </div>
      )}

      <div ref={wrapRef} className="flex-1 min-h-0 relative">
        <Canvas
          docNodes={toFlowNodes(proc)} docEdges={toFlowEdges(proc)} revision={ed.revision} editing={editing} mode={mode}
          onNodeClick={onNodeClick}
          onConnect={(c: Connection) => c.source && c.target && ed.connect(c.source, c.target)}
          onOpenDetail={setDetailId}
          onCommitPositions={(u) => ed.moveNodes(u)}
          onSetEdgeLabel={(f, t, v) => ed.setEdgeLabel(f, t, v)}
          onDeleteEdge={(f, t) => ed.deleteEdge(f, t)}
        />
        <JunctionLegend />
        {(() => {
          if (!detailId) return null
          const detailNode = proc.nodes.find((x) => x.id === detailId)
          if (!detailNode) return null
          return (
            <DetailDrawer
              node={detailNode}
              editing={editing}
              conflicts={(proc.pending ?? []).map((pending, index) => ({ pending, index })).filter((x) => x.pending.status === 'open' && x.pending.node === detailId)}
              process={proc}
              onClose={() => setDetailId(null)}
              onEdit={() => {}}
              onAccept={(index) => resolve.mutate({ index, decision: 'accept' })}
              onReject={(index) => resolve.mutate({ index, decision: 'reject' })}
              onOpenSub={(sub) => nav(`/processes/${sub}/flow`)}
              onPatch={(patch) => ed.patchActivity(detailId, patch as Partial<Pick<ActivityNode, 'label' | 'actor' | 'description'>>)}
              onLinkSub={(s) => ed.linkSub(detailId, s)}
              onSetJunction={(t) => ed.setJunction(detailId, t)}
              onDeleteNode={() => { setPendingDel(detailId); setDetailId(null) }}
              onCreateSub={() => {
                createProcess.mutate(
                  { department: proc.department, name: 'زیرفرآیند جدید', parent: { process: proc.id, node: detailId! } },
                  { onSuccess: (child) => { setDetailId(null); nav(`/processes/${child.id}/flow`) } },
                )
              }}
            />
          )
        })()}
      </div>
      {/* §6.15's confirm-content dialog, drawn at the SCREEN root and reached
          from two places — the toolbar's control and the ⋯ menu's «تأییدشده»
          row. That is the design's own arrangement (`confirmDialog` is app
          state, panel 3563) and here it is also a requirement: the action group
          is `display:none` at ≤760 on the panel, and a `position:fixed`
          descendant of a `display:none` box is not painted at all. */}
      {!editing && (
        <ConfirmAction row={mark} department={dept} render="dialog"
          open={asking} onOpenChange={setAsking} />
      )}
      {pendingDel && (() => {
        const n = proc.nodes.find((x) => x.id === pendingDel)
        const label = n && 'label' in n ? (n as { label: string }).label : pendingDel
        return <DeleteNodeConfirm label={label} onCancel={() => setPendingDel(null)} onConfirm={() => { ed.deleteNode(pendingDel); setPendingDel(null) }} />
      })()}
    </div>
  )
}
