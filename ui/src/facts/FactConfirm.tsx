import { useState } from 'react'
import { CONFIRMATION_LABELS, SCREEN_LABELS, label } from '../lib/factsLabels'
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
 * | retired, or a stub | **nothing** — the design's `sfCanTick` excludes both |
 * | `can_confirm: false` | **nothing** — a universal entry the reviewer holds no `*` for (QF-27). Appendix D: *no control, no label* |
 * | otherwise | the live tick, green when `confirmed` |
 *
 * ## The state that used to be here, and the ruling that removed it
 *
 * A red entry — `status` of `disputed` or `unknown` — was a fourth row: the
 * design's translucent palette (`:5065-5069`) drawn as a DISABLED control
 * labelled «قابل تأیید نیست», because QF-25 had red winning over green and
 * `POST /api/confirmations/{fid}` answering 409 for one.
 *
 * **The owner overturned that on 2026-09-06:** «each of the quantitative items
 * should be confirmable, regardless of whether it has an issue or not.» An
 * `unknown` leaf is a question for the SOURCE, so the refusal blocked the
 * reviewer's signature without moving the thing it was waiting on — and it did
 * so on exactly the entries most in need of a reviewer. The red marks stay
 * drawn beside the tick and say the rest.
 *
 * So `red` is gone from this file entirely, rather than kept and ignored:
 * `can_confirm` now carries one meaning (QF-27 scope) instead of two that were
 * drawn oppositely, and there is no disabled state left for a stale branch to
 * resurrect.
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

  const stub = (entry.data as { stub?: unknown }).stub === true
  if (entry.retired || stub) return null
  // `can_confirm` alone now — **owner ruling, 2026-09-06**, overturning QF-25:
  // «each of the quantitative items should be confirmable, regardless of
  // whether it has an issue or not.» A red entry used to arrive with
  // `can_confirm: false` and be drawn as a disabled control; it now arrives
  // `true` and takes the ordinary road. What is left of the flag is QF-27
  // alone — a caller out of scope — which is still «no control, no label».
  if (!confirmation.can_confirm) return null

  const on = confirmation.confirmed
  const failure = set.error ?? revoke.error
  const status = failure instanceof ApiError ? failure.status : 0
  const moved = status === 409

  // :5062 — two palettes, one box. Green when the stored mark is for these
  // bytes, the plain violet box when it is not. The design's THIRD palette —
  // the translucent one for a red entry, :5065-5069 — goes with the rule that
  // drew it: there is no refused state left for it to paint.
  const skin = on
    ? { outer: 'border-border-ok bg-tile-ok', chip: 'text-green', box: 'border-green bg-green' }
    : { outer: 'border-card bg-card', chip: 'text-violet', box: 'border-border-pick bg-card' }

  const action = on ? label(CONFIRMATION_LABELS, 'confirmed')
    : label(SCREEN_LABELS, 'confirm')

  return (
    <>
      <button
        type="button"
        data-testid="fact-tick"
        title={label(SCREEN_LABELS, on ? 'tick_hint_confirmed' : 'tick_hint_unconfirmed')}
        onClick={() => setAsking(true)}
        style={{ ...PX.tick, ...PX.gap9 }}
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
