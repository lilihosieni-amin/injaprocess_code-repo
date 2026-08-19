import { useId, useState, type ReactNode } from 'react'
import { Icon } from './Icon'

export interface AccordionItem {
  key: string
  title: ReactNode
  /** The «{n} وظیفه» count beside the title. Optional: no count, no pill. */
  badge?: ReactNode
  body: ReactNode
}

/**
 * The disclosure §6.4 specifies for «نقش‌ها و شرح وظایف»
 * (`Inja Panel.dc.html:510-524`).
 *
 * **Why this component exists at all.** The design system's readme says the
 * product has *"no Avatar, Tabs, Tooltip, Accordion or Select"*. R1 makes the
 * deliverables the authority over the readme and records that this particular
 * claim is false of them — they carry two accordions, ~15 custom selects and
 * five tab trays — so the primitive stays. It had no consumer because
 * `screens/Overview.tsx` hand-rolled the same control instead of importing it;
 * that copy is deleted in the same change that gives this one its shape.
 *
 * **Not exclusive.** §6.4 makes no item close another, and a person comparing
 * two roles needs both open.
 *
 * **One control per item.** The hand-rolled copy grew a second «بستن» button
 * inside the open body, so an item had two ways to close and a screen reader
 * met a control with no stated relationship to the region it closed.
 *
 * ## The chevron, settled
 *
 * `Inja Panel.dc.html:3501` binds the glyph as
 * `chevron: open ? 'M6 15l6-6 6 6' : 'M15 18l-6-6 6-6'` — the same pair the
 * deliverables bind at Panel `:2853` and `:2933` and Reader `:1866`, `:1950`
 * and `:2539`. Collapsed is `<`, which in a right-to-left reading points at the
 * inline END: the drill-in direction, and the glyph this codebase already names
 * `chevronEnd`. It is **not** a down chevron; nothing in either deliverable
 * discloses with one (`chevronDown` is the select trigger).
 *
 * The two bound paths are ONE drawing and a quarter turn: rotating
 * `chevronEnd`'s three points 90° about the centre of the 24-box maps
 * `M15 18l-6-6 6-6` onto `M6 15l6-6 6 6` exactly. So the open state is written
 * as that rotation rather than as a second path — which is also the design
 * system's own disclosure idiom (`StepCard` turns a horizontal chevron a
 * quarter turn over `--duration-chev`, the token's only other consumer), and it
 * gives the change somewhere to animate. The prototype swaps the string because
 * a template engine binding a `d` has nowhere to put a transition, not because
 * the movement is unwanted.
 *
 * The rotation is spelled as a SWAP (`rotate-0` ⇄ `rotate-90`) and never as an
 * appended class: two rotation utilities on one element are resolved by
 * Tailwind's output order, not by the order of the class attribute.
 */
export function Accordion({ items }: { items: AccordionItem[] }) {
  const [open, setOpen] = useState<ReadonlySet<string>>(() => new Set())
  const toggle = (k: string) => setOpen((s) => {
    const next = new Set(s)
    if (!next.delete(k)) next.add(k)
    return next
  })

  return (
    <div className="flex flex-col gap-s5">
      {items.map((item) => (
        <Row
          key={item.key}
          item={item}
          open={open.has(item.key)}
          onToggle={() => toggle(item.key)}
        />
      ))}
    </div>
  )
}

/**
 * One item. Split out because the panel needs an id from `useId`, and a hook
 * cannot be called inside the `map` above.
 */
function Row({ item, open, onToggle }: {
  item: AccordionItem
  open: boolean
  onToggle: () => void
}) {
  const panelId = useId()
  return (
    <div className="border border-border-current rounded-tile overflow-hidden">
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={open}
        // Named only while the panel is in the document: the body is removed
        // when closed (the design's own `<sc-if>`), and `aria-controls` pointing
        // at an absent id is a broken reference rather than a helpful one.
        aria-controls={open ? panelId : undefined}
        className={
          'w-full min-h-touch flex items-center gap-s6 py-s7 px-s8 '
          + 'bg-surface-sub border-0 cursor-pointer text-start'
        }
      >
        <span className="flex-1 min-w-0 text-fs-body font-bold text-ink">{item.title}</span>
        {item.badge !== undefined && (
          // `py-hint` is 3px and its declared role is the offset of a hint line
          // under its label — borrowed here because 3px as a PILL's vertical
          // padding (5 uses across the two deliverables) has no token of its
          // own. Reported for the next mint pass rather than minted here.
          <span className="flex-none text-fs-xxs font-semibold text-violet bg-tile-v py-hint px-s5 rounded-pill">
            {item.badge}
          </span>
        )}
        <span
          aria-hidden
          className={
            'flex-none flex text-muted transition-transform duration-chev ease-css '
            + (open ? 'rotate-90' : 'rotate-0')
          }
        >
          <Icon name="chevronEnd" px={17} stroke={2.4} />
        </span>
      </button>
      {open && <div id={panelId} className="p-s8 bg-card">{item.body}</div>}
    </div>
  )
}
