import { useNavigate, useParams, useLocation, Link } from 'react-router-dom'
import { useState, useRef } from 'react'
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
import { DeleteNodeConfirm } from './DeleteNodeConfirm'
import { DetailDrawer } from './DetailDrawer'
import { JunctionLegend } from './JunctionLegend'
import type { ActivityNode } from '../api/types'

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
          `px-[22px] py-[11px]`; three of those four values have tokens and are
          now written as tokens.

          `py-[11px]` is the fourth and stays arbitrary. Eleven tokens in
          `tokens.css` hold 11px — the textarea's padding, the dialog dropdown's,
          the nested tick's, the note's inline padding, the ≤760 table-row gap,
          `--radius-input`, `--fs-xxs`… — and not one of them is a bar's
          padding-y. This file's own rule for that case is the one
          `--gap-table-row-mobile` states: *mint again under its own name rather
          than borrow*. Minting is not this task's to do (the token files are
          frozen), so it is reported with its role instead of being pointed at a
          neighbouring 11.

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
          'flex items-center flex-wrap bg-card border-b border-warm shrink-0 '
          + (onReader ? 'gap-s5 px-topbar-reader py-s5' : 'gap-s6 px-topbar py-[11px]')
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
            lavender tile behind a 1.5px hairline). Radius, type, tile and
            hairline now read the theme; the `9px 13px` does not, because no
            token is a back button's padding — reader 157's chrome back button is
            `10px 15px` and owns `--pad-back-y`/`--pad-button-x`, and this bar's
            button is a different site. Reported with its role.

            **≤760 — `[data-r-backlabel]{display:none}` (reader 105).** The
            button keeps its glyph and loses its word. The design also squares it
            to `38px` with `padding:9px 0` (reader 104); 38px has four owners in
            `tokens.css` and none is this, so that half is reported rather than
            approximated — which is why the label rule lands here alone. */}
        {onReader && (
          <Link
            to={backTo}
            data-r-flowback
            aria-label="بازگشت"
            title="بازگشت"
            className="inline-flex items-center gap-s3 px-[13px] py-[9px] rounded-input font-bold text-fs-sm bg-tile-v2 text-violet border-hairline border-line flex-none no-underline max760:order-first"
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

            Three of this group's values are un-writable rather than un-named,
            which is a different failure and is why they are still literals. The
            3px gap is `--gap-tab-flow`, the 5px inset is `--space-2` and the
            tool-group divider is `--line-divider` — all three tokens exist and
            all three utilities sit on `theme.test.ts`'s `UNPAINTED`, whose guard
            fails the moment a class on it acquires a consumer ("Delete these
            lines from the list and lower CEILING by the same number"). That
            bookkeeping is in a file this task may not edit, so writing the
            correct token here turns the suite red. Measured, not assumed — all
            four are listed in this task's report. */}
        {!editing && (prevProc || nextProc) && (
          <div data-r-flownav className="flex items-center gap-[3px] bg-tile-v2 rounded-button p-[5px] flex-none max760:hidden">
            {/* next process — sits on the right in RTL (first in DOM), '>' icon */}
            <button onClick={() => nextProc && nav(`/processes/${nextProc.id}/flow`)} disabled={!nextProc}
              title={nextProc ? `فرآیند بعدی: ${nextProc.name}` : undefined} aria-label={nextProc ? `فرآیند بعدی: ${nextProc.name}` : undefined}
              className="w-tool h-tool flex items-center justify-center rounded-tool bg-card text-violet disabled:text-disabled disabled:cursor-default">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><path d="M9 6l6 6-6 6" /></svg>
            </button>
            <div className="w-px h-s9 bg-[#D9CEF0]" />
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
        </div>
        {/* **R46 — `data-r-actions`, the flow bar's own action group.**
            `Inja Panel.dc.html:597-608` and `Inja Reader.dc.html:357-368` draw
            it identically: `margin-inline-start:auto`, and inside it the
            process confirmation followed by «ویرایش». Naming the group is what
            lets the ≤760 rules below address it, and it is the same hook both
            deliverables' own media queries use. */}
        <div data-r-actions className="ms-auto flex items-center gap-s4 flex-wrap">
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
          {!editing && <ConfirmAction row={mark} department={dept} />}
          {tombstoned || !mayEdit ? null : !editing ? (
            <Button variant="violet" onClick={ed.enter} className="px-4 py-2 text-[13px]" data-testid="enter-edit">ویرایش</Button>
          ) : (
            <>
              {/* undo / redo */}
              <div className="flex items-center gap-[3px] bg-tile-v2 rounded-xl p-[5px]">
                <button disabled={!ed.canUndo} onClick={ed.undo} title="واگرد" className="w-[34px] h-[34px] flex items-center justify-center rounded-[9px] bg-white text-violet disabled:text-[#cfc7e0] disabled:cursor-default">
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M9 14L4 9l5-5" /><path d="M4 9h11a5 5 0 0 1 0 10h-1" /></svg>
                </button>
                <button disabled={!ed.canRedo} onClick={ed.redo} title="ازنو" className="w-[34px] h-[34px] flex items-center justify-center rounded-[9px] bg-white text-violet disabled:text-[#cfc7e0] disabled:cursor-default">
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
              <button onClick={ed.cancel} className="px-3.5 py-[9px] border-[1.5px] border-line bg-white rounded-[11px] font-semibold text-[12.5px] text-muted hover:bg-[#F4EFFB]">انصراف</button>
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
        <div className="shrink-0 border-b border-warm bg-[#EDEAF3] px-[22px] py-2.5 text-[13px] text-muted flex flex-wrap items-center gap-2">
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
      {pendingDel && (() => {
        const n = proc.nodes.find((x) => x.id === pendingDel)
        const label = n && 'label' in n ? (n as { label: string }).label : pendingDel
        return <DeleteNodeConfirm label={label} onCancel={() => setPendingDel(null)} onConfirm={() => { ed.deleteNode(pendingDel); setPendingDel(null) }} />
      })()}
    </div>
  )
}
