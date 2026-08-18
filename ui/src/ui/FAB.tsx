import { Icon } from './Icon'
import { toFa } from '../lib/format'

/**
 * §6.15 — the comment FAB. 52x52 in the panel, 56x56 in the reader (R3): the
 * one control whose size the two deliverables genuinely disagree about, and the
 * disagreement is deliberate rather than drift.
 *
 * The box is `w-fab h-fab` on both surfaces and nothing here branches on the
 * surface: those read `--role-fab`, which is `--size-fab` under `:root` and
 * `--size-fab-reader` under `[data-surface='reader']`. That is R3's whole
 * arrangement — the config's own comment puts it as "one class is 48/40/52 in
 * the panel and 54/42/56 in the reader without a single call site knowing which
 * surface it is in" — so this component does not call `useSurface()` at all.
 *
 * The badge's 2px ring is `--ink` on both surfaces. The reader deliverable
 * rings it in cream over an ink field — §6.17 calls that a stray light halo,
 * and R8 says a deliverable contradicting itself is a defect, not a spec.
 *
 * §8 — `bottom:22px; right:22px; left:auto` is one of the physical pins the
 * design keeps, reproduced as written; the 22px is `--space-10`, so the pin is
 * named without its spelling changing. `z-floating` is L-42's rung for a
 * floating control (1030), which is what the ladder says and not what the
 * deliverable's own `z-index:40` says.
 */
export function FAB({
  label, count = 0, onClick, className = '',
}: {
  label: string
  count?: number
  onClick: () => void
  className?: string
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={count > 0 ? `${label}، ${toFa(count)} مورد` : label}
      className={`fixed bottom-s10 right-s10 left-auto z-floating w-fab h-fab inline-flex items-center justify-center rounded-round bg-coral text-card border-0 cursor-pointer shadow-fab ${className}`}
    >
      {/* The deliverable's own speech-bubble path, at its own 2.2 stroke, now
          held once in src/ui/icons/index.tsx as `comment` — where it was quoted
          FROM this file rather than redrawn.

          The box stays an attribute. The panel draws it 22px and the reader
          24px, and that surface pair has no role of its own, so there is no
          class to write; when one is minted the `px` comes off and a class
          goes on, the way the pager's and the dropdown's already have. */}
      <Icon name="comment" px={22} stroke={2.2} />
      {count > 0 && (
        <span
          data-fab-badge
          aria-hidden
          className="absolute -top-half -start-half min-w-count h-count px-s3 inline-flex items-center justify-center rounded-pill bg-violet text-card text-fs-xxs font-bold border-2 border-ink"
        >
          {toFa(count)}
        </span>
      )}
    </button>
  )
}
