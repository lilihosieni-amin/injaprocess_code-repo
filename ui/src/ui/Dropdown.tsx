import { useEffect, useId, useRef, useState } from 'react'
import { toLatinDigits } from '../lib/digits'
import { Icon } from './Icon'
import { useSurface } from './surface'
import { pushDismissible, popDismissible, isTopDismissible } from './dismissibleStack'
import { TickBox } from './Checkbox'

export interface DropdownOption {
  value: string
  label: string
  note?: string
}

export interface DropdownProps {
  /** Always the accessible name. `hideLabel` hides it; nothing removes it. */
  label: string
  options: DropdownOption[]
  placeholder: string
  /** Single-select. */
  value?: string
  onChange?: (next: string) => void
  /** Supplying `values` puts the control in multi-select mode. */
  values?: string[]
  onToggle?: (value: string) => void
  searchable?: boolean
  searchPlaceholder?: string
  /** Stated, never blank — §"EmptyState": emptiness is a fact, not an apology.
   *  This one is the SEARCH MISS: the list has rows and the query matched none. */
  noHit?: string
  /**
   * What the popover says when there are no options **at all**, which is a
   * different fact from a search that missed and usually has different advice.
   * §6.14 states one for the supervisor picker («برای این نقش سرپرستی در دسترس
   * نیست»); said with `noHit` instead, an administrator searching a healthy
   * installation for a name nobody has would be told the account can have no
   * supervisor whatever. Defaults to `noHit`, so a caller with one sentence for
   * both keeps the behaviour it had.
   */
  empty?: string
  hideLabel?: boolean
  className?: string
}

const OPTION =
  'w-full flex items-center gap-option px-s6 py-s5 rounded-input border-0 ' +
  'text-start text-fs-sm text-ink cursor-pointer hover:bg-tile-v2'

/**
 * The design has no native `<select>` anywhere: every choice in the product is
 * a trigger and a popover. This is that pair, once, in place of the fifteen the
 * two deliverables hand-rolled.
 *
 * The trigger is the design's screen-level one — `padding:10px 14px`, radius 12,
 * a 1.5px `--line` edge that turns coral while open (§4.6's one focus idiom) —
 * and the popover is `top: calc(100% + 6px); inset-inline: 0` with a 7px inset,
 * 2px between rows, a 280px scroll cap and the card hairline rather than the
 * control's.
 */
export function Dropdown({
  label, options, placeholder, value, onChange, values, onToggle,
  searchable = false, searchPlaceholder = 'جست‌وجو…', noHit = 'موردی پیدا نشد',
  empty, hideLabel = false, className = '',
}: DropdownProps) {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const box = useRef<HTMLDivElement>(null)
  const trigger = useRef<HTMLButtonElement>(null)
  const list = useRef<HTMLDivElement>(null)
  const search = useRef<HTMLInputElement>(null)
  const identity = useRef(Symbol('dropdown')).current
  const id = useId()
  const multiple = values !== undefined
  const text = useSurface() === 'reader' ? 'text-fs-lg' : 'text-fs-menu'

  useEffect(() => {
    if (!open) return
    // I7 — joins Overlay's dismissible stack, so a dropdown opened inside a
    // dialog answers Escape without taking the dialog down with it.
    pushDismissible(identity)
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape' && isTopDismissible(identity)) {
        setOpen(false)
        trigger.current?.focus()
      }
    }
    // §5.2 — a document listener rather than a full-screen invisible backdrop,
    // "so the wheel is not stolen from the scrolling dialog" behind it.
    function onDown(e: MouseEvent) {
      if (box.current && !box.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('keydown', onKey)
    document.addEventListener('mousedown', onDown)
    return () => {
      popDismissible(identity)
      document.removeEventListener('keydown', onKey)
      document.removeEventListener('mousedown', onDown)
    }
  }, [open, identity])

  // The popover closes with its query still in it; reopening on a filter the
  // user cannot see is a list that has silently lost most of its options.
  useEffect(() => {
    if (!open) setQuery('')
  }, [open])

  // Over the label AND the note, and over both **as they are stored**: the note
  // is a latin-digit mobile number (D57) while an ordinary Persian keyboard
  // emits ۰۹…, so an unfolded query matches nothing while looking exactly like
  // "this person is not on the list". `toLatinDigits` is a no-op on Persian
  // prose, so the name half is unaffected.
  const needle = toLatinDigits(query)
  const shown = query
    ? options.filter((o) =>
      o.label.includes(query)
      || toLatinDigits(o.label).includes(needle)
      || (o.note !== undefined && toLatinDigits(o.note).includes(needle)))
    : options
  const chosen = multiple
    ? options.filter((o) => values.includes(o.value))
    : options.filter((o) => o.value === value)

  function move(step: number | 'first' | 'last') {
    const nodes = Array.from(list.current?.querySelectorAll<HTMLElement>('[role="option"]') ?? [])
    if (nodes.length === 0) return
    if (step === 'first') return nodes[0].focus()
    if (step === 'last') return nodes[nodes.length - 1].focus()
    const at = nodes.indexOf(document.activeElement as HTMLElement)
    nodes[Math.min(nodes.length - 1, Math.max(0, at + step))].focus()
  }

  function onListKey(e: React.KeyboardEvent) {
    // Home/End belong to the CARET while the search field holds it. This
    // handler sits on the popover, so without the exemption a user correcting
    // the start of a Persian family name — caret at «ادی|», Home — has the key
    // preventDefault()ed, the caret left where it was and focus thrown out of
    // the field onto an option. ArrowUp/ArrowDown are the opposite case: they
    // are the only way down into the results, so the field gives them up.
    const inField = e.target === search.current
    if (e.key === 'ArrowDown') { e.preventDefault(); move(1) }
    else if (e.key === 'ArrowUp') { e.preventDefault(); move(-1) }
    else if (inField) return
    else if (e.key === 'Home') { e.preventDefault(); move('first') }
    else if (e.key === 'End') { e.preventDefault(); move('last') }
  }

  return (
    <div ref={box} data-dd className={`relative ${className}`}>
      <span
        id={`${id}-label`}
        className={hideLabel ? 'sr-only' : 'block font-semibold text-violet mb-s3 text-fs-sm2'}
      >
        {label}
      </span>
      <button
        ref={trigger}
        type="button"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={open ? `${id}-list` : undefined}
        // BOTH ids, in this order. `aria-labelledby` REPLACES the button's
        // contents in the accessible-name computation, so naming only the
        // label gave every trigger the accessible name «نقش» whatever was
        // chosen inside it — a screen-reader user could open the menu, pick a
        // value and never hear which one. Label then value is what a native
        // <select> announces, and what §5.2's trigger has to announce too.
        aria-labelledby={`${id}-label ${id}-value`}
        onClick={() => setOpen((v) => !v)}
        onKeyDown={(e) => {
          if (e.key !== 'ArrowDown') return
          e.preventDefault()
          // Already open: the options are mounted, so step into them now. Only
          // an opening keystroke has to wait a frame for them to exist — and
          // waiting a frame when they already do is a race, not a courtesy.
          if (open) move('first')
          else { setOpen(true); requestAnimationFrame(() => move('first')) }
        }}
        className={`w-full flex items-center gap-s5 px-s7 py-s5 rounded-button bg-card text-ink text-start cursor-pointer border-hairline ${open ? 'border-coral' : 'border-line'} ${text}`}
      >
        <span
          id={`${id}-value`}
          className={`flex-1 overflow-hidden text-ellipsis whitespace-nowrap ${chosen.length ? '' : 'text-faint'}`}
        >
          {chosen.length ? chosen.map((o) => o.label).join('، ') : placeholder}
        </span>
        {/* chevron-down, 15×15 @2.2 (§5.2) — sized by `--size-chevron`, which
            is the pager's glyph too, rather than by a width attribute that
            would be a second record of it. `Icon` writes no width unless it is
            given a `px`, which is what keeps the class in charge. */}
        <Icon name="chevronDown" stroke={2.2} className="w-chevron h-chevron flex-none text-muted" />
      </button>
      {open && (
        // The popover is a plain <div>. ARIA 1.2 gives `listbox` required owned
        // elements of `option` (or `group` → `option`), so the search field
        // cannot live inside it: assistive tech either skips the field or
        // mis-announces the count of the list. The box carries the paint, the
        // field comes first, and `role="listbox"` sits on the options container
        // underneath — which is also where `aria-multiselectable` belongs,
        // since it describes the list and not the box around it.
        <div
          data-popover
          onKeyDown={onListKey}
          className="absolute top-full mt-s3 start-0 end-0 z-dropdown max-h-popover overflow-auto flex flex-col gap-half p-popover bg-card border border-border-card rounded-card shadow-pop"
        >
          {searchable && (
            <div className="relative mb-s1">
              <input
                ref={search}
                type="search"
                value={query}
                placeholder={searchPlaceholder}
                aria-label={searchPlaceholder}
                onChange={(e) => setQuery(e.target.value)}
                className="w-full box-border ps-search-x-menu pe-s6 py-search-y-menu rounded-control text-fs-sm2 text-ink bg-card border-hairline border-line outline-none focus:border-coral"
              />
              {/* The 34px `ps-search-x-menu` above is room for THIS. The design
                  draws the magnifier inside it (§8); reserving the room and
                  omitting the glyph leaves a third of the field empty for
                  nothing. Pinned to the inline start, which is the edge the
                  design writes physically as `right` in an app whose html is
                  direction:rtl and which never runs ltr. */}
              <Icon
                name="search"
                className="absolute start-search-icon-menu top-1/2 -translate-y-1/2 pointer-events-none w-s7 h-s7 text-faint"
              />
            </div>
          )}
          {/* Stated, never blank — and a SIBLING of the list rather than a
              child of it, because a <p> is not one of `listbox`'s permitted
              owned elements either. */}
          {shown.length === 0 && (
            <p className="m-0 px-s6 py-s7 text-center text-fs-sm2 text-muted">
              {options.length === 0 ? empty ?? noHit : noHit}
            </p>
          )}
          <div
            ref={list}
            id={`${id}-list`}
            role="listbox"
            aria-labelledby={`${id}-label`}
            aria-multiselectable={multiple || undefined}
            className="flex flex-col gap-half"
          >
            {shown.map((o) => {
              const picked = multiple ? values.includes(o.value) : o.value === value
              return (
                <button
                  key={o.value}
                  type="button"
                  role="option"
                  aria-selected={picked}
                  onClick={() => {
                    if (multiple) onToggle?.(o.value)
                    else { onChange?.(o.value); setOpen(false); trigger.current?.focus() }
                  }}
                  className={`${OPTION} ${picked ? 'bg-tile-v2 font-bold' : 'bg-transparent font-semibold'}`}
                >
                  {/* A multi-select option LEADS with its tick and a single-select
                      one TRAILS its check — which is what the design draws at
                      :1386 and :1334 respectively, and why the unpicked row needs
                      no spacer holding a column open. */}
                  {multiple && <TickBox on={picked} rung="nested" />}
                  <span className="min-w-0 flex-1">
                    <span className="block">{o.label}</span>
                    {o.note !== undefined && (
                      <span className="block mt-half text-fs-xs font-normal text-faint">{o.note}</span>
                    )}
                  </span>
                  {!multiple && picked && (
                    <Icon name="check" stroke={3} className="w-s7 h-s7 flex-none text-violet" />
                  )}
                </button>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}
