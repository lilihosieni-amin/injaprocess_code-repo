import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { DetailDrawer } from './DetailDrawer'
import type { ActivityNode } from '../api/types'

vi.mock('../api/hooks', () => ({ useProcesses: () => ({ data: [] }) }))

const n: ActivityNode = { id: 'cooking-001-n010', type: 'activity', label: 'دریافت درخواست', description: 'شرح', actor: 'کارپرداز',
  icom: { inputs: ['درخواست'], controls: ['بودجه'], outputs: ['ثبت'], mechanisms: ['سامانه رزرو'] },
  subprocess: null, position: { x: 0, y: 0 }, layout: 'auto', source: { created_by: 'voice', touched_by: [] } } as ActivityNode

/** The same node with some part of it blanked — which is what a withheld field
 *  arrives as. `ui-backend/inja_ui_backend/visibility.py` **blanks** the three
 *  switchable node fields rather than dropping them (`_NODE_SWITCH` maps
 *  `description`/`actor`/`icom` to `""`/`""`/`_empty_icom()`) and blanks
 *  `source` unconditionally for every non-editor, precisely because this
 *  directory is frozen and dereferences all four with no guard. */
function blanked(patch: Partial<ActivityNode>): ActivityNode {
  return { ...n, ...patch } as ActivityNode
}

function drawIn(node: ActivityNode) {
  return render(<DetailDrawer node={node} editing={false} conflicts={[]} onClose={() => {}} onEdit={vi.fn()} onAccept={vi.fn()} onReject={vi.fn()} onOpenSub={vi.fn()} onPatch={vi.fn()} onLinkSub={vi.fn()} onSetJunction={vi.fn()} process={{ nodes: [] } as never} onCreateSub={vi.fn()} onDeleteNode={vi.fn()} />)
}
function draw(node: ActivityNode) { drawIn(node) }

describe('DetailDrawer view', () => {
  it('shows label, actor, description, ICOM chips and the id', () => {
    draw(n)
    expect(screen.getByText('دریافت درخواست')).toBeInTheDocument()
    expect(screen.getByText('کارپرداز')).toBeInTheDocument()
    expect(screen.getByText('شرح')).toBeInTheDocument()
    expect(screen.getByText('درخواست')).toBeInTheDocument()
    expect(screen.getByText('بودجه')).toBeInTheDocument()
    expect(screen.getByText('سامانه رزرو')).toBeInTheDocument()
  })
})

/**
 * **R42 — a heading is a disclosure.**
 *
 * The owner's ruling: *"when any details don't show to reader user, it shouldn't
 * show the title of that … if user couldn't see anything, we shouldn't see
 * anything about it."* A section title with nothing under it tells the person
 * that a thing exists which they cannot see, which is NFR-12 / AC-25 — *what is
 * withheld is never sent and then hidden; nor is anything that would betray it
 * indirectly*.
 *
 * **Why emptiness is the right question here, and not `isEditor`.** The server
 * cannot drop these fields — `src/flow/**` dereferences them — so it blanks
 * them, and a blanked field and a never-recorded one arrive as the same bytes.
 * The drawer therefore cannot tell *withheld* from *genuinely empty*, and under
 * R42 both answers are the same: draw nothing, claim nothing. That is also what
 * the design draws. `ui/design/Inja Panel.dc.html:819` and `Inja
 * Reader.dc.html:579` both put «اطلاعات ICOM» inside `<sc-if value="{{ isEditor
 * }}">`, and both put the `source:` footer inside one too (`Panel:857`,
 * `Reader:617`) — for the roles the design gates out, the blanks are exactly
 * what this drawer is handed.
 *
 * Each case is pinned **twice**: absent when the content is empty or withheld,
 * present when content exists. One half alone is how the opposite bug ships —
 * a screen that has gone silent about something the reader is entitled to.
 */
describe('R42 — no heading is drawn over content that is empty or withheld', () => {
  it('draws «توضیحات» with the description, and neither without it', () => {
    draw(n)
    expect(screen.getByText('توضیحات')).toBeInTheDocument()
    expect(screen.getByText('شرح')).toBeInTheDocument()
  })

  it('draws no «توضیحات» heading when the description is blank', () => {
    draw(blanked({ description: '' }))
    expect(screen.getByText('دریافت درخواست')).toBeInTheDocument()
    expect(screen.queryByText('توضیحات')).not.toBeInTheDocument()
  })

  it('draws no «توضیحات» heading when the description is only whitespace', () => {
    draw(blanked({ description: '   \n  ' }))
    expect(screen.queryByText('توضیحات')).not.toBeInTheDocument()
  })

  it('draws «اطلاعات ICOM» and all four face labels when every face carries a term', () => {
    draw(n)
    expect(screen.getByText('اطلاعات ICOM')).toBeInTheDocument()
    expect(screen.getByText('ورودی‌ها')).toBeInTheDocument()
    expect(screen.getByText('کنترل‌ها')).toBeInTheDocument()
    expect(screen.getByText('خروجی‌ها')).toBeInTheDocument()
    expect(screen.getByText('مکانیزم‌ها')).toBeInTheDocument()
  })

  it('draws no «اطلاعات ICOM» heading and no face label when every face is empty', () => {
    // Byte-for-byte what `visibility._empty_icom()` sends when `node_icom` is
    // off — and what a node nobody has filled in yet carries.
    draw(blanked({ icom: { inputs: [], controls: [], outputs: [], mechanisms: [] } }))
    expect(screen.getByText('دریافت درخواست')).toBeInTheDocument()
    expect(screen.queryByText('اطلاعات ICOM')).not.toBeInTheDocument()
    expect(screen.queryByText('ورودی‌ها')).not.toBeInTheDocument()
    expect(screen.queryByText('کنترل‌ها')).not.toBeInTheDocument()
    expect(screen.queryByText('خروجی‌ها')).not.toBeInTheDocument()
    expect(screen.queryByText('مکانیزم‌ها')).not.toBeInTheDocument()
  })

  it('draws only the faces that carry a term, and the block around them', () => {
    // The block is shown, so nothing was withheld: an empty face here really is
    // empty. Its label still goes, because a label with nothing under it is the
    // shape R42 names — and the block's own presence already says as much.
    draw(blanked({ icom: { inputs: ['درخواست'], controls: [], outputs: [], mechanisms: [] } }))
    expect(screen.getByText('اطلاعات ICOM')).toBeInTheDocument()
    expect(screen.getByText('ورودی‌ها')).toBeInTheDocument()
    expect(screen.getByText('درخواست')).toBeInTheDocument()
    expect(screen.queryByText('کنترل‌ها')).not.toBeInTheDocument()
    expect(screen.queryByText('خروجی‌ها')).not.toBeInTheDocument()
    expect(screen.queryByText('مکانیزم‌ها')).not.toBeInTheDocument()
  })

  it('draws the performer row when there is a performer', () => {
    const { container } = drawIn(n)
    expect(container.querySelector('[data-actor]')).not.toBeNull()
    expect(screen.getByText('کارپرداز')).toBeInTheDocument()
  })

  it('draws no performer row when the performer is blank', () => {
    // The row has no words of its own, so its label is the person glyph and the
    // violet tile around it — still a caption saying «this step has a performer»
    // drawn over the empty string `node_actor: off` sends. `data-actor` is the
    // hook that lets a test see a row with nothing in it, spelled the way this
    // file already spells `data-drawer`.
    const { container } = drawIn(blanked({ actor: '  ' }))
    expect(screen.getByText('دریافت درخواست')).toBeInTheDocument()
    expect(container.querySelector('[data-actor]')).toBeNull()
  })

  it('draws the `source:` footer for a caller who was sent a provenance', () => {
    draw(n)
    expect(screen.getByText(/^source:/)).toBeInTheDocument()
  })

  it('draws no `source:` footer when the provenance is blank', () => {
    // FR-V6 — provenance is never shown to anyone but the editor and cannot be
    // switched on. `_public_node` blanks `source` for every non-editor with no
    // switch at all, so a blank `created_by` IS the non-editor case.
    draw(blanked({ source: { created_by: '', touched_by: [] } }))
    expect(screen.getByText('دریافت درخواست')).toBeInTheDocument()
    expect(screen.queryByText(/^source:/)).not.toBeInTheDocument()
  })
})

/**
 * **Edit mode is the third case, and it is the opposite one.**
 *
 * For an editor actively editing, an empty section heading is not a disclosure —
 * it is the affordance for adding the content, and it is a `<label>` for a form
 * control, so removing it would leave an input a screen reader cannot name.
 * There is nothing to withhold from this person either: `visibility.filtered`
 * returns early for an editor and blanks nothing, so what they see empty IS
 * empty. The design does not arbitrate this branch — neither deliverable draws a
 * drawer edit form at all (`Inja Panel.dc.html` has no «انتخاب دروازهٔ منطقی» and
 * no drawer `<textarea>`) — so the spec decides, and it decides for the labels.
 */
describe('R42 — the edit branch keeps every label, empty or not', () => {
  it('names all three fields of an entirely blank activity', () => {
    render(<DetailDrawer node={blanked({ label: '', actor: '', description: '', icom: { inputs: [], controls: [], outputs: [], mechanisms: [] } })}
      editing conflicts={[]} onClose={() => {}} onEdit={vi.fn()} onAccept={vi.fn()} onReject={vi.fn()} onOpenSub={vi.fn()}
      onPatch={vi.fn()} onLinkSub={vi.fn()} onSetJunction={vi.fn()} process={{ nodes: [] } as never} onCreateSub={vi.fn()} onDeleteNode={vi.fn()} />)
    expect(screen.getByLabelText('عنوان')).toBeInTheDocument()
    expect(screen.getByLabelText('مجری فعالیت')).toBeInTheDocument()
    expect(screen.getByLabelText('توضیحات')).toBeInTheDocument()
  })
})
