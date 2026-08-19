import { useEffect, useId, useRef, useState, type ReactNode } from 'react'
// I7 — the dismissible stack Menu.tsx also joins. Kept in its own module
// (rather than defined and exported directly here) so this file's exports stay
// components-only — a named non-component export from a component file trips
// react-refresh/only-export-components, which the same rule already flags on
// the two hooks-beside-a-provider files (Toast.tsx, write/ToastProvider.tsx);
// this file doesn't need to grow a third instance of that warning.
import { pushDismissible, popDismissible, isTopDismissible } from './dismissibleStack'

const FOCUSABLE =
  'a[href],button:not([disabled]),textarea:not([disabled]),input:not([disabled]),select:not([disabled]),[tabindex]:not([tabindex="-1"])'

// FIX 2 — a module-level stack of open overlays. Escape only acts on the topmost;
// depth (index in the stack) drives z-index so later overlays paint above earlier
// ones. FIX 8 piggybacks on the same stack to lock body scroll only while at least
// one overlay is open, and unlock only once the last one closes. Scoped to Overlay
// instances only — a Menu opening must not lock page scroll or shift another
// Overlay's z-index depth.
let openOverlays: symbol[] = []
let savedBodyOverflow: string | null = null


/** §3.3 — the five dialog widths S1 uses. 520px is the standard dialog. */
const WIDTH = {
  wide: 'max-w-dialog-wide',  // 640 — conflict inbox
  lg: 'max-w-dialog-lg',      // 540 — change supervisor
  md: 'max-w-dialog',         // 520 — new user, views
  sm: 'max-w-dialog-sm',      // 460 — confirm content
  xs: 'max-w-dialog-xs',      // 440 — confirm comment
} as const

/**
 * Ledger **L-44**, under owner ruling R9's adopted scale: *"a dialog takes
 * `--role-z-modal` (`$zindex-modal` 1055) and a drawer, bottom sheet or
 * full-bleed pane takes `--role-z-drawer` (`$zindex-offcanvas` 1045). That maps
 * one-for-one onto the `presentation` prop `ui/src/ui/Overlay.tsx` already
 * carries."* This is that map, and until now it did not exist: the scrim wrote
 * a raw `50 + depth * 10`.
 *
 * **50 is BELOW `--role-z-chrome` (1020).** With any overlay open, the panel's
 * top bar, the comment FAB (`--role-z-floating`, 1030) and every anchored
 * popover (`--role-z-dropdown`, 1000) painted *above* the scrim and stayed
 * hit-testable, while `aria-modal="true"` told assistive technology the rest of
 * the page was inert. Measured in Chrome with the nav Sheet open:
 * `document.elementFromPoint` over the middle of the top bar returned the
 * `<header>`, not the scrim. That is the L-41 defect the ledger itself names —
 * a semantic layer nothing reads — one property along, and it inverted the
 * stack rather than merely failing to express it.
 *
 * Two spellings of one rung, and they must never drift apart:
 *
 *   `klass`  the utility, which is what paints for a lone overlay — so the two
 *            rungs finally have a component consumer and `theme.test.ts` is no
 *            longer the only thing keeping them alive.
 *   `token`  the same rung as a token, for the nesting ordinal below. A static
 *            utility cannot express "this rung plus n", which is the one and
 *            only reason an inline style survives on this element at all.
 */
const RUNG = {
  dialog: { klass: 'z-modal', token: '--role-z-modal' },
  sheet: { klass: 'z-drawer', token: '--role-z-drawer' },
} as const

/**
 * Ledger L-23 — the one close control: 32x32, --tile-v2, --radius-sm, an 18px
 * glyph in --text-muted.
 *
 * Written here rather than as `<IconButton className="bg-tile-v2 …"/>` because
 * that does not work. Compiled through the real theme, three of the four
 * utilities the skin would pass in are beaten by IconButton's own:
 * `bg-transparent`, `text-violet` and `min-h-touch`/`min-w-touch` are emitted
 * after `bg-tile-v2`, `text-muted` and `w-close`/`h-close` (and `min-height`
 * beats `height` regardless of order), so the fill, the glyph colour and the
 * size would all have been written and never painted. The one that would have
 * survived is `rounded-tool`: Tailwind sorts a plugin's utilities by class name
 * and `rounded-control` sorts BEFORE it, so the radius is the exception, not an
 * instance of the rule. Either way the order of the class *string* is
 * irrelevant — the same trap Button.tsx's `I5` comment documents.
 *
 * It keeps IconButton's accessibility contract exactly: `label` is the
 * accessible name (the mockups rely on `title`, which never reaches a keyboard
 * user), and the glyph is hidden from assistive technology.
 *
 * The drawn box is the design's 32x32 and the 44px touch target (F11) is a
 * transparent `::before` around it — the plan's one rule for every control on
 * the design's 30/32/34/36/40/42 ladder, which supersedes any per-task
 * treatment: never inflate a drawn control to 44px. 32 + 2x6 = 44, so the
 * inset is 6px here where a 34px box takes 5px. Nothing about the `::before`
 * paints, which is why the design has no opinion about it.
 */
function CloseButton({ onClick }: { onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label="بستن"
      title="بستن"
      className={
        'relative before:absolute before:content-[""] before:-inset-[6px] ' +
        'inline-flex items-center justify-center shrink-0 w-close h-close ' +
        'border-0 cursor-pointer bg-tile-v2 rounded-tool text-muted transition hover:bg-tile-v'
      }
    >
      <svg aria-hidden focusable="false" viewBox="0 0 24 24" fill="none"
        stroke="currentColor" strokeWidth="2.2" width="18" height="18">
        <path d="M6 6l12 12M18 6L6 18" strokeLinecap="round" />
      </svg>
    </button>
  )
}

interface OverlayProps {
  open: boolean
  onClose: () => void
  title: string
  children: ReactNode
  /** §5.2 — 12.5px --text-muted at lh 1.8. Every screen and dialog explains itself. */
  subtitle?: ReactNode
  /** A leading node in the header — an inline SVG today, <Icon/> from Task 11. */
  icon?: ReactNode
  /** A pinned action bar. Its children go `flex:1`, as the design's do. */
  footer?: ReactNode
  /** §3.3 — one of the five widths. Ignored by `sheet`, which is --width-drawer. */
  width?: keyof typeof WIDTH
  /** §4.5 — `blur(3px)`. The export dialog is the only case in the design. */
  blurScrim?: boolean
  /** 'dialog' centres above the breakpoint; 'sheet' anchors to the inline start. */
  presentation?: 'dialog' | 'sheet'
}

function Overlay({
  open, onClose, title, children, subtitle, icon, footer,
  width = 'md', blurScrim = false, presentation = 'dialog',
}: OverlayProps) {
  const box = useRef<HTMLDivElement>(null)
  const restoreTo = useRef<HTMLElement | null>(null)
  const identity = useRef(Symbol('overlay')).current
  const titleId = useId()
  const [depth, setDepth] = useState(0)

  useEffect(() => {
    if (!open) return
    restoreTo.current = document.activeElement as HTMLElement | null

    if (openOverlays.length === 0) {
      savedBodyOverflow = document.body.style.overflow
      document.body.style.overflow = 'hidden'
    }
    setDepth(openOverlays.length)
    openOverlays = [...openOverlays, identity]
    pushDismissible(identity)

    box.current?.querySelector<HTMLElement>(FOCUSABLE)?.focus()

    return () => {
      openOverlays = openOverlays.filter((id) => id !== identity)
      popDismissible(identity)
      if (openOverlays.length === 0) {
        document.body.style.overflow = savedBodyOverflow ?? ''
      }
      // FIX 6 — a delete confirmation's trigger is often the row it just deleted;
      // focusing a detached element is a silent no-op in some browsers but not
      // guaranteed, so check it's still attached before trying.
      if (restoreTo.current && document.contains(restoreTo.current)) {
        restoreTo.current.focus()
      }
    }
  }, [open, identity])

  useEffect(() => {
    if (!open) return
    function onKey(e: KeyboardEvent) {
      // FIX 2 / I7 — with dismissibles stacked (Overlay or Menu), only the
      // topmost responds. Checked against the shared stack, not the
      // Overlay-only one, so a Menu opened on top of this Dialog is correctly
      // seen as topmost and this Dialog defers to it.
      if (!isTopDismissible(identity)) return

      if (e.key === 'Escape') { onClose(); return }
      if (e.key !== 'Tab' || !box.current) return
      // F11 — Tab wraps inside the overlay rather than escaping to the page behind it.
      const items = Array.from(box.current.querySelectorAll<HTMLElement>(FOCUSABLE))
      const first = items[0]
      const last = items[items.length - 1]
      const active = document.activeElement

      // FIX 1 — a mousedown on non-focusable chrome (the title, the padding) blurs
      // to <body>, which is neither `first` nor `last`. Without this branch, Tab from
      // there walks into the page behind the scrim even though aria-modal says it's inert.
      if (!box.current.contains(active)) {
        e.preventDefault()
        ;(e.shiftKey ? last : first).focus()
        return
      }
      if (!e.shiftKey && active === last) { e.preventDefault(); first.focus() }
      if (e.shiftKey && active === first) { e.preventDefault(); last.focus() }
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [open, onClose, identity])

  if (!open) return null

  // §5.2 — above 760px a centred dialog at one of five widths; at or below it,
  // every modal in the design becomes a bottom sheet: the scrim loses its
  // padding and aligns to the end, the box goes full width, 92vh tall, and
  // rounds only its top corners. The breakpoint is the design's 760px, not
  // Tailwind's md (768px).
  // FIX 5 — only what differs between the two presentations lives here; the
  // shared shape (full width, the panel radius, flat-bottomed below 760px) is
  // on the box below so it cannot be mistaken for something that tells them apart.
  //
  // **Both branches are keyed on `max760:` and the sheet's was not.** It carried
  // `md:` — Tailwind's 768 — against a scrim whose `max760:p-0 max760:items-end`
  // is the design's 760, which left a seven-pixel band (761–767) where the box
  // was neither: full width and 88vh tall like a bottom sheet, but inside a
  // centred, padded scrim and radiused on all four corners. Measured in Chrome
  // on `PanelShell`'s nav Sheet, the product's only `presentation="sheet"`:
  // at 760 it is a bottom sheet, at 768 an inline-start drawer, and at **764** a
  // centred rounded card 716px wide. Reachable at every width ≤1080, which is
  // where its «فهرست» opener is drawn. The drawer is now the BASE shape and the
  // bottom sheet the `max760:` override, because that is the only arrangement in
  // which one breakpoint governs both branches.
  //
  // The two top corners are each presentation's OWN number and are therefore
  // here rather than on the shared box:
  //   dialog — §5.2 writes `[data-r-modalbox]{…border-radius: 20px 20px 0 0}`
  //     inside the ≤760 block and both deliverables carry it verbatim
  //     (`Inja Panel.dc.html:108`). The corner SHRINKS as the dialog fills the
  //     width; it does not keep the desktop dialog's 24. `rounded-feature` is
  //     that step, named for it in tailwind.config.js.
  //   sheet — §5.2 gives the drawer-as-bottom-sheet `border-radius: 22px 22px
  //     0 0`, and the ladder (6·7·9·10·11·12·13·14·16·18·20·24) has no 22 rung,
  //     so it drew 24 by default. **Owner ruling R35** («do like design») minted
  //     `--radius-sheet` for it; `rounded-t-sheet` is that rung.
  // One class for both would state one sheet's rule about a box the design
  // measures separately. Both are pinned by compiled value below, never by
  // class name: `rounded-panel` sets all four corners and each of these has to
  // BEAT it inside the media query.
  const shape =
    presentation === 'sheet'
      ? 'max-w-drawer h-full me-auto ms-0 ' +
        'max760:max-w-full max760:h-auto max760:max-h-[88vh] max760:rounded-t-sheet'
      : `${WIDTH[width]} max-h-[86vh] max760:max-w-full max760:max-h-[92vh] ` +
        'max760:rounded-t-feature'

  const rung = RUNG[presentation]

  return (
    <div
      className={`fixed inset-0 flex items-center justify-center bg-scrim p-modal max760:p-0 max760:items-end ${rung.klass} ${blurScrim ? 'backdrop-blur-scrim' : ''}`}
      // L-42 — "Nesting adds **1** inside the rung's own band rather than 10
      // across bands", so fifteen stacked overlays still fit beneath the
      // reserved `--role-z-popover` (1070) where the deliverables reached two.
      // Written as a calc over the SAME token `rung.klass` compiles to, and only
      // when there is an ordinal to add: at depth 0 — every overlay in the
      // product today — nothing is written here and the utility is what paints,
      // so this cannot become a class that is named and never drawn.
      style={depth === 0 ? undefined : { zIndex: `calc(var(${rung.token}) + ${depth})` }}
      onMouseDown={(e) => { if (e.target === e.currentTarget) onClose() }}
    >
      <div
        ref={box}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className={`bg-card border border-border-card shadow-modal flex flex-col p-s11 w-full rounded-panel max760:rounded-b-none ${shape}`}
      >
        {/* §5.2's Modal is a flex COLUMN — a `flex:none` header, a `flex:1`
            scrolling body and a `flex:none` footer — and this box used to carry
            `overflow-auto` itself, scrolling all three together. On a real
            registry that put the new-user dialog's title above the top of the
            window and its submit button thousands of pixels down (F37): the one
            control a person opens the box to press was the one they could not
            find. The scroll belongs to the body alone. */}
        <div className="flex-none flex items-start gap-s6 mb-s8">
          {icon}
          <div className="flex-1 min-w-0">
            {/* Ledger L-16 — 18px/800, the one dialog title size. */}
            <h2 id={titleId} className="text-fs-dialog font-extrabold text-ink m-0">{title}</h2>
            {subtitle && (
              <p className="text-fs-sm2 text-muted leading-sub mt-half mb-0 [text-wrap:pretty]">{subtitle}</p>
            )}
          </div>
          <CloseButton onClick={onClose} />
        </div>
        <div data-testid="dialog-body" className="flex-1 overflow-auto">{children}</div>
        {footer && (
          // §5.2 — "two equal buttons" is the footer's doing here, not every
          // caller's: gap 10px, each child flex:1.
          <div className="flex-none flex gap-s5 mt-s10 [&>*]:flex-1">{footer}</div>
        )}
      </div>
    </div>
  )
}

export function Dialog(props: Omit<OverlayProps, 'presentation'>) {
  return <Overlay {...props} presentation="dialog" />
}

export function Sheet(props: Omit<OverlayProps, 'presentation' | 'width'>) {
  return <Overlay {...props} presentation="sheet" />
}
