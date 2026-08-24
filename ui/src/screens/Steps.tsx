import { useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { useProcess } from '../api/hooks'
import { linearize, groupTitle, type Block, type Junction } from '../lib/linearize'
import { toFa } from '../lib/format'
import { refusalStatus } from '../api/client'
import { Icon } from '../ui/Icon'
import { LoadFailedScreen } from '../ui/states'
import { RefusalScreen } from './Refusal'
import type { ActivityNode } from '../api/types'

/**
 * The hand pointing at a step — `Inja Panel.dc.html:620`, drawn beside the
 * screen's one instruction. Through `Icon`'s `d` (§5.1.2), like every other path
 * this app draws that is not in the shared icon set.
 */
const HAND = 'M9 11V6a2 2 0 1 1 4 0v9M13 12h3a3 3 0 0 1 3 3v3a3 3 0 0 1-3 3h-4l-4-4-2-4'
  + 'a1.5 1.5 0 0 1 2.4-1.8L9 13'
/** The «برگرد به…» arrow: a loop back. `export/steps` draws the same path. */
const LOOP = 'M9 14l-4-4 4-4M5 10h9a4 4 0 0 1 0 8h-1'

/**
 * The letter a junction wears — the design's own three (`Inja Panel.dc.html:629`).
 *
 * Not the junction's Persian name and not its `junctionType` verbatim: the box
 * is 34px and the sentence beside it (`groupTitle`) is what says what the gate
 * means. `&` and `O` are the deliverable's abbreviations; `X` is XOR's.
 */
const GATE: Record<Junction, string> = { AND: '&', OR: 'O', XOR: 'X' }

/**
 * One step's card, at the one rung this screen draws.
 *
 * **The design draws two rungs and this draws one.** A top-level step is
 * `42×42` at radius 13 in a radius-16 card (`:686-688`); the same step inside a
 * branch is `40×40` at radius 12 in a radius-14 card (`:641-643`). Two pixels,
 * three times over, and expressing it would mean either a second component or a
 * `depth` prop threaded through `Blocks` — for a difference nobody reading a
 * process on a phone can see. The larger rung wins because it is the one the
 * screen opens on. Recorded rather than silently normalised.
 *
 * **The numeral tile is violet on every step, and the design gives a
 * sub-process step an amber one** (`:2857`). No token holds that value in this
 * role: `--junction-or` is that exact colour, and it is a JUNCTION's — picking
 * it here would be choosing a colour by its number, which is the one thing this
 * codebase's token rules forbid. The distinction is not lost: a step that leads
 * into a sub-process is drawn on `--steps-sub-bg` behind `--steps-sub-border`,
 * which is the amber the same line of the design gives its card, and it carries
 * the «مراحل این کار را ببین» pill that no other step has. Reported.
 */
function Step({ block, onEnter }: {
  block: Extract<Block, { kind: 'step' }>
  onEnter: (sub: string) => void
}) {
  const [open, setOpen] = useState(false)
  const n = block.node as ActivityNode
  const sub = n.subprocess ?? null
  // A sub-process step has no body of its own to open — the press goes into the
  // child process instead, which is what its pill promises.
  const expandable = sub === null && (n.actor?.trim() || n.description?.trim())

  return (
    <div
      data-step={block.num}
      className={
        'rounded-card shadow-card overflow-hidden border-2 '
        + (sub ? 'bg-steps-sub border-steps-sub-border' : 'bg-card border-warm')
      }
    >
      <button
        type="button"
        onClick={() => (sub ? onEnter(sub) : setOpen((v) => !v))}
        aria-expanded={expandable ? open : undefined}
        className="flex items-center gap-s6 w-full min-h-touch px-s6 py-s5 border-0 bg-transparent cursor-pointer text-start"
      >
        <span className="flex items-center justify-center flex-none w-glyph-tile h-glyph-tile rounded-tile bg-violet text-card font-extrabold text-fs-h5">
          {toFa(block.num)}
        </span>
        <span className="flex-1 min-w-0 flex flex-col items-start gap-s4">
          <span className="font-bold text-fs-lg text-ink leading-snug text-start">{n.label}</span>
          {(block.cond || sub || block.back.some((r) => r.num)) && (
            <span className="flex flex-wrap items-center gap-s3">
              {/* The edge label that leads INTO this step — «اگر: پرداخت نقدی».
                  Without it a branch's steps read as unconditional. */}
              {block.cond && (
                <span className="inline-flex items-center text-fs-xs font-semibold px-s5 py-s1 rounded-pill bg-tile-warn text-warn">
                  اگر: {block.cond}
                </span>
              )}
              {/* A loop, stated. `linearize` resolves a back-edge to the numbered
                  step it returns to, and leaves `num` unset when the target is a
                  junction or a terminal — so only the ones a reader can act on
                  are drawn, and none of them can name a step that is not there.
                  Not a control: this screen has no scroll-to, and a badge that
                  looked pressable and did nothing is worse than a label. */}
              {block.back.filter((r) => r.num).map((r, i) => (
                <span key={`${r.to}-${i}`}
                  className="inline-flex items-center gap-s2 text-fs-xs font-semibold px-s5 py-s1 rounded-pill bg-tile-v2 text-violet">
                  <Icon d={LOOP} px={12} stroke={2.4} />
                  برگرد به مرحلهٔ {toFa(r.num!)}
                </span>
              ))}
              {sub && (
                <span className="inline-flex items-center gap-s3 text-fs-xs font-bold px-s5 py-s1 rounded-pill bg-violet text-card">
                  <Icon name="chevronEnd" px={12} stroke={2.6} />
                  مراحل این کار را ببین
                </span>
              )}
            </span>
          )}
        </span>
        {(expandable || sub) && (
          // Down when there is a body to open and it is shut, up when it is
          // open, and the inward chevron when the press leaves this screen —
          // three states, because a control that always draws the same arrow
          // tells the reader nothing about what pressing it will do.
          // …and `chevronEnd` is the one that LEAVES this screen: in a
          // right-to-left reading "onward" points left, which is the direction
          // the users table's own open column draws and the opposite of the
          // back controls in both shells.
          <Icon name={sub ? 'chevronEnd' : open ? 'chevronUp' : 'chevronDown'}
            px={19} stroke={2.6} className="flex-none text-muted" />
        )}
      </button>
      {open && expandable && (
        <div className="mx-s6 mb-s7 pt-s7 border-t border-dashed border-line-dashed flex flex-col gap-s7">
          {/* Each field is drawn only when it carries something. `visibility`
              blanks `actor` and `description` per department (`node_actor`,
              `node_description`), so for many readers this body is one field or
              none — and a caption over nothing is a claim of absence made in
              pictures, which is the shape owner ruling R43 removed from the
              summary screen. The step's own label and its order are never
              withheld, which is why the card above is unconditional. */}
          {n.actor?.trim() && (
            <div>
              <div className="text-fs-caption text-faint">این کار را چه کسی انجام می‌دهد؟</div>
              <div className="inline-flex items-center gap-s4 mt-s4 px-s7 py-s5 rounded-button border-hairline border-line text-fs-body font-bold text-violet">
                <Icon name="user" px={15} />
                {n.actor}
              </div>
            </div>
          )}
          {n.description?.trim() && (
            <div>
              <div className="text-fs-caption text-faint">توضیح کار</div>
              <p className="mt-s4 text-fs-body text-body-ink leading-looser text-justify [text-wrap:pretty] whitespace-pre-line m-0">
                {n.description}
              </p>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

/**
 * The list, and the branches inside it — `Inja Panel.dc.html:624-700`.
 *
 * Recursive because the model is: a junction's branch holds blocks, and one of
 * those can be another junction. `linearize` has already resolved the merge
 * point, so a branch ends where the paths rejoin and the steps after it are
 * drawn once, at the outer level, rather than repeated per branch.
 */
function Blocks({ blocks, onEnter }: { blocks: Block[]; onEnter: (sub: string) => void }) {
  return (
    <div className="flex flex-col gap-s7">
      {blocks.map((b, i) => b.kind === 'step' ? (
        <Step key={b.node.id} block={b} onEnter={onEnter} />
      ) : (
        <div key={`g${i}`} className="rounded-feature border border-steps-group-border bg-steps-group p-s7">
          <div className="flex items-center gap-s6 px-s3 pb-s7">
            <span className="flex items-center justify-center flex-none w-tool h-tool rounded-control bg-coral text-card font-extrabold text-fs-body">
              {GATE[b.type]}
            </span>
            <span className="text-fs-body font-bold text-conflict">
              {groupTitle(b.type, b.branches.length)}
            </span>
          </div>
          <div className="flex flex-col gap-s6">
            {b.branches.map((br, j) => (
              <div key={j} className="rounded-card bg-card p-s7">
                <div className="flex items-center gap-s5 px-s1 pb-s6">
                  <span className="flex items-center justify-center flex-none w-s11 h-s11 rounded-reveal bg-tile-v text-violet font-extrabold text-fs-sm2">
                    {toFa(j + 1)}
                  </span>
                  <span className="text-fs-menu font-bold text-ink">
                    {/* The edge's own label when it has one — «اگر: پرداخت
                        نقدی». A branch with no label still needs a name, or two
                        unlabelled paths are two identical boxes. */}
                    {br.label ? `اگر: ${br.label}` : `حالت ${toFa(j + 1)}`}
                  </span>
                </div>
                {br.blocks.length > 0
                  ? <Blocks blocks={br.blocks} onEnter={onEnter} />
                  : <p className="text-fs-sm2 text-faint m-0 px-s1">کاری لازم نیست</p>}
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  )
}

/**
 * **«گام‌به‌گام» — one process, read as a numbered list.** Owner ruling: *"where
 * is step by step bottumn? i have it in design, but in currebt version no. add
 * it."*
 *
 * `Inja Panel.dc.html:615-705` draws it as a MODE of the flowchart screen
 * (`flowView: 'steps'`), sharing that screen's toolbar. Here it is a route of
 * its own, `/processes/{pid}/steps`, for three reasons that are all about this
 * app rather than about the mockup:
 *
 * 1. **The process list links to it.** `openSteps` at `:2783` navigates, and in
 *    a real router a navigation needs a URL. As a mode it would be a piece of
 *    component state the process list could not address, and «گام‌به‌گام» would
 *    have to open the flowchart and then reach into it.
 * 2. **It is a document, not a canvas.** `FlowScreen` is a `min-h-0` flex column
 *    wrapped around a React Flow pane that measures itself; this is a scrolling
 *    `[data-r-pad]` region like every other screen in the product. Hanging it
 *    off the same route would put two incompatible layouts behind one path.
 * 3. **A reader can be sent here.** The reader deliverable makes this the
 *    PRIMARY way in — its process list draws «گام‌به‌گام» as the violet button
 *    and its own lead sentence promises steps, not a diagram — and a link
 *    somebody can send is what that needs.
 *
 * **The graph is not re-read here.** `linearize` is the one implementation, in
 * `src/lib/`, and the exported staff guide walks it too — so the printed
 * document and this screen cannot come to disagree about what order the steps
 * are in, which branch a step is under, or which loop returns where. It moved
 * out of `export/steps/` for exactly that: it was a pure module about a
 * *process*, sitting in the folder for the printed artefact, and the app could
 * only have reached it by importing backwards through its own layering.
 *
 * **Nothing is withheld or revealed here that the API did not already decide.**
 * `useProcess` returns what `visibility.filtered` served, so a department with
 * `node_actor` off simply has steps with no actor line, and this screen never
 * asks a second question about it (D48).
 */
export function Steps() {
  const { pid = '' } = useParams()
  const nav = useNavigate()
  const { data: proc, error, refetch } = useProcess(pid)

  // Placed after every hook, so the early returns never change hook order.
  const refused = refusalStatus(error)
  if (refused) return <RefusalScreen status={refused} />
  if (error) {
    return <LoadFailedScreen message="مراحل این فرآیند بارگذاری نشد." error={error}
      onRetry={() => { void refetch() }} />
  }
  if (!proc) return <div className="flex-1 bg-ink" />

  const blocks = linearize(proc)

  return (
    <div
      data-screen="steps"
      data-r-pad
      className="flex-1 overflow-auto bg-ink py-screen-y px-screen-x max760:px-s7 max760:py-s9"
    >
      {/* `--width-steps` 760px, minted for this screen and never writable until
          now. §8's scroll box flips its own children back in `base.css`, so the
          direction is pinned nowhere in this file. */}
      <div data-col className="max-w-steps mx-auto">
        <h1 data-h1 className="font-extrabold text-fs-steps-title text-role-title-on-field text-center leading-snug m-0">
          {proc.name}
        </h1>
        {/* `:618` — the one instruction on the screen, on `--tile-v5`, whose own
            token comment names this site: "sub-process node fill, steps hint
            strip". `flex-row-reverse` in the deliverable is what puts the glyph
            after the sentence in reading order; written as DOM order here, so
            the accessible name and the painted order are the same thing. */}
        <div className="flex items-center justify-center gap-s5 mt-s8 px-s9 py-s7 rounded-tile bg-tile-v5">
          <span data-body className="text-fs-menu font-semibold text-violet leading-normal">
            روی هر مرحله بزنید تا توضیح کامل و مسئول آن را ببینید.
          </span>
          <Icon d={HAND} px={20} className="flex-none text-violet" />
        </div>
        <div className="mt-s9">
          {blocks.length > 0 ? (
            <Blocks blocks={blocks} onEnter={(sub) => nav(`/processes/${sub}/steps`)} />
          ) : (
            /* A process whose flowchart has no activity in it yet. The list is
               not withheld here and never can be — a step's label and its order
               are outside the visibility policy — so this is «nobody has drawn
               it», which is a thing that can be said out loud. */
            <p className="rounded-card border border-dashed border-line bg-card p-s11 text-center text-fs-sm2 text-faint m-0">
              هنوز گامی برای این فرآیند ثبت نشده است.
            </p>
          )}
        </div>
      </div>
    </div>
  )
}
