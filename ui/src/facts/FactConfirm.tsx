import { useState } from 'react'
import { BADGE_LABELS, CONFIRMATION_LABELS, SCREEN_LABELS, label } from '../lib/factsLabels'
import { ApiError } from '../api/client'
import { useRevokeFactConfirmation, useSetFactConfirmation } from '../api/hooks'
import { Button } from '../ui/Button'
import { Icon } from '../ui/Icon'
import { Dialog } from '../ui/Overlay'
import { FAILED, GONE, MOVED } from '../write/ConfirmMark'
import type { FactBundle } from '../api/types'
import { PX } from './cards/parts'

/**
 * The tick — `Inja Panel.dc.html:1120-1126`, with the palette of `:5062-5070`.
 *
 * ## Which of the four states is drawn, and why the design's own switch is not
 *
 * The design keys confirmation by *viewer* and carries `universal`, `stub`,
 * `red_disputed` and `red_unknown` through `sfCanTick` (`:5062`) — mock state
 * over a mock fixture. The served shape is one `confirmed` boolean, one
 * `can_confirm` and a `fingerprint` to echo (QF-24/25). The **palette** is still
 * the design's, and it maps onto the served shape like this:
 *
 * | state | drawn |
 * |---|---|
 * | red (`status` is `disputed` or `unknown`) | the disabled control, «قابل تأیید نیست» |
 * | retired, or a stub | **nothing** — the design's `sfCanTick` excludes both |
 * | `can_confirm: false` | **nothing** — a universal entry the reviewer holds no `*` for (QF-27). Appendix D: *no control, no label* |
 * | otherwise | the live tick, green when `confirmed` |
 *
 * Red is read off `entry.status` and not off `can_confirm`, because both a red
 * entry and an out-of-scope one arrive with `can_confirm: false` and they are
 * drawn oppositely: one is a **statement about the data** the reviewer has to
 * act on, the other is a control that should not exist for them. The server
 * partitions them the same way — `set_confirmation` answers 409 for a red entry
 * and the gate refuses the other before the handler runs.
 *
 * ## The fingerprint
 *
 * Echoed, never computed (QF-24) — the same rule, for the same reason, as
 * `ConfirmAction`: canonical JSON here would have to agree with Python's byte
 * for byte over Persian text, and the definition of a confirmation would then
 * live in two languages. The 409 copy is `ConfirmMark`'s own sentence, imported
 * rather than restated, so there is one place in the product where a write says
 * the document moved.
 */
export function FactConfirm({ bundle }: { bundle: FactBundle }) {
  const { entry, confirmation } = bundle
  const set = useSetFactConfirmation(entry.id)
  const revoke = useRevokeFactConfirmation(entry.id)
  const [asking, setAsking] = useState(false)

  const red = entry.status === 'disputed' || entry.status === 'unknown'
  const stub = (entry.data as { stub?: unknown }).stub === true
  if (entry.retired || stub) return null
  if (!red && !confirmation.can_confirm) return null

  const on = confirmation.confirmed
  const failure = set.error ?? revoke.error
  const status = failure instanceof ApiError ? failure.status : 0
  const moved = status === 409

  // :5062 — three palettes, one box. Green when the stored mark is for these
  // bytes; the plain violet box when it is not; the translucent one on a red
  // entry, which is a control the design draws and disables rather than hides.
  const skin = red
    // :5065-5069 — the outer edge and the chip fill are the two translucent
    // whites; the tick box inside stays WHITE (`sfTickBg`'s else-branch) behind
    // a red hairline, so the control reads as present-and-refused rather than
    // as absent.
    ? { outer: 'border-transparent', chip: 'text-line-filter', box: 'border-border-danger bg-card' }
    : on
      ? { outer: 'border-border-ok bg-tile-ok', chip: 'text-green', box: 'border-green bg-green' }
      : { outer: 'border-card bg-card', chip: 'text-violet', box: 'border-border-pick bg-card' }

  const action = red ? label(BADGE_LABELS, 'cannot_confirm')
    : on ? label(CONFIRMATION_LABELS, 'confirmed')
      : label(SCREEN_LABELS, 'confirm')

  return (
    <>
      <button
        type="button"
        data-testid="fact-tick"
        disabled={red}
        title={label(SCREEN_LABELS, on ? 'tick_hint_confirmed' : 'tick_hint_unconfirmed')}
        onClick={() => setAsking(true)}
        style={red ? { ...PX.tick, ...PX.gap9, ...PX.tickRedChip, ...PX.tickRedOuter }
          : { ...PX.tick, ...PX.gap9 }}
        // `max760:self-start` is the design's own ≤760 rule for a button inside
        // `[data-r-stack]`: `width:auto; flex:0 0 auto; align-self:flex-start`.
        // Without it the stacked column's `align-items:stretch` pulls the tick
        // across the whole screen.
        className={`inline-flex items-center flex-none rounded-search border-hairline
                    font-sans font-bold text-fs-sm cursor-pointer max760:self-start
                    disabled:cursor-default ${skin.outer} ${skin.chip}`}
      >
        <span
          aria-hidden
          className={`flex items-center justify-center flex-none w-tick-field h-tick-field
                      rounded-tick border-hairline text-card ${skin.box}`}
        >
          {on && <Icon d={CHECK} px={12} stroke={3} />}
        </span>
        {action}
      </button>

      {asking && (
        <Dialog
          open
          width="xs"
          onClose={() => setAsking(false)}
          title={label(SCREEN_LABELS, on ? 'revoke_dialog_title' : 'confirm_dialog_title')}
          subtitle={label(SCREEN_LABELS, on ? 'revoke_dialog_body' : 'confirm_dialog_body')}
          alert={failure ? (moved ? MOVED : status === 403 ? GONE : FAILED) : undefined}
          footer={
            <div className="flex gap-s5">
              <Button
                variant={on ? 'coral' : 'green'}
                className="flex-1 px-s8 text-fs-menu"
                loading={set.isPending || revoke.isPending}
                onClick={() => {
                  if (on) {
                    revoke.mutate(undefined, { onSuccess: () => setAsking(false) })
                  } else {
                    // QF-24 — the print the server served, straight back.
                    set.mutate({ fingerprint: confirmation.fingerprint },
                      { onSuccess: () => setAsking(false) })
                  }
                }}
              >
                {label(SCREEN_LABELS, on ? 'revoke' : 'confirm_dialog_ok')}
              </Button>
              <Button variant="ghost" className="flex-1 px-s8 text-fs-menu"
                onClick={() => setAsking(false)}>
                {label(SCREEN_LABELS, 'cancel')}
              </Button>
            </div>
          }
        >
          {/* The design's box is a title, a sentence and two buttons and nothing
              else (:1755-1763); `Dialog` puts the sentence in `subtitle`, so
              there is no body to write. */}
          {null}
        </Dialog>
      )}
    </>
  )
}

/** :1123 — the design's own 12px tick at stroke 3, the path `ConfirmMark` draws. */
const CHECK = 'M20 6L9 17l-5-5'
