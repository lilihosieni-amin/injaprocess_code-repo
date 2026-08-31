import { useState } from 'react'
import { useSession } from '../auth/useSession'
import { useCan } from '../auth/can'
import { useSetConfirmation, useRevokeConfirmation } from '../api/hooks'
import { ApiError } from '../api/client'
import { jalali, toFa } from '../lib/format'
import { StatusPill } from '../ui/StatusPill'
import { Button } from '../ui/Button'
import { Icon } from '../ui/Icon'
import { IconButton } from '../ui/IconButton'
import { Dialog } from '../ui/Overlay'
import type { Confirmation } from '../api/types'

/** What a 409 means, in the words it means it in.
 *
 *  Not a failure and not phrased as one. The request was well formed, the
 *  caller is permitted, and the server's answer is that the document moved
 *  under them since they read it — so the instruction is *look again*, never
 *  *try again*, which would send the editor back at the very bytes that were
 *  refused. Written here rather than echoed from the response body so the
 *  distinction is this component's and can be tested as this component's. */
export const MOVED = 'این محتوا از زمانی که آن را دیدید تغییر کرده است؛ دوباره بررسی کنید.'
/** What a 403 means — settled too, and for the same reason not phrased as a retry.
 *
 *  Two things answer 403 on these routes and the status cannot tell them apart:
 *  the target is tombstoned and may no longer be vouched for
 *  (`routers/confirmations.set_confirmation`), or the caller's role has stopped
 *  holding `confirm` (`access.requires`). Both are the server's settled answer
 *  about a control that should not be on this screen at all, and pressing the
 *  same button again cannot change either — «دوباره تلاش کنید» is therefore the
 *  wrong instruction, the very mistake the 409 branch exists to avoid.
 *
 *  Deliberately does not name the tombstone. Echoing the server's own sentence
 *  would tell an editor their process was deleted when in fact their permissions
 *  moved; reloading is the one act that is right for both. */
export const GONE = 'این مورد دیگر قابل تأیید نیست؛ صفحه را تازه کنید.'
/** Everything else: a 5xx, a dropped connection, a body that would not parse. */
export const FAILED = 'انجام نشد؛ دوباره تلاش کنید.'

/**
 * Whether an Editor has vouched for this exact document, and the two acts that
 * change it (spec D20, D61).
 *
 * **Drawn for nobody but a holder of `confirm` on this department.** Not a
 * disabled button and not a greyed mark: a non-editor is only ever served
 * content that *is* confirmed (D22), so a mark would state something true of
 * everything they can see and therefore say nothing at all. Cosmetic either way
 * — the endpoints re-derive the capability and refuse regardless (D48).
 *
 * **The fingerprint comes from the server and goes straight back.** The client
 * computes none: canonical JSON here would have to agree with Python's byte for
 * byte over Persian text, and the definition of a confirmation would then live
 * in two languages. Echoing it is also what makes a stale screen fail loudly —
 * the POST answers 409 when the document moved, rather than marking bytes
 * nobody read as reviewed.
 *
 * `row.confirmed` is therefore "the stored mark is for *these* bytes", not "a
 * mark exists": a document edited after being confirmed arrives false, which is
 * the whole reason a fingerprint is stored instead of a boolean.
 */
export function ConfirmMark({ row, department }:
  { row: Confirmation | undefined; department: string }) {
  const can = useCan(useSession().data)
  // Hooks first, then the early return: an early return above them would change
  // hook order between renders the moment the row arrives.
  if (!row || !can('confirm', `dept:${department}`)) return null

  // Both, and both non-null: `_row` only fills the pair when the stored
  // fingerprint still matches, so on an unconfirmed row they are null and
  // «توسط null · NaN/NaN/NaN» is what an unguarded line would print.
  const by = row.confirmed_by
  const at = row.confirmed_at

  return (
    <span data-testid="confirm-mark" className="inline-flex items-center gap-s4">
      <StatusPill tone={row.confirmed ? 'ok' : 'warn'}
        label={row.confirmed ? 'تأیید شده' : 'تأیید نشده'} />
      {by !== null && typeof at === 'number' && (
        // `at` is unix **seconds** — `int(time.time())` on the server, not the
        // ISO string every other timestamp in this app carries. Handed to
        // `jalali` raw it is read as milliseconds and prints ۱۳۴۸/…, five
        // decades off and perfectly plausible-looking.
        //
        // `--role-subtitle-on-field` and NOT `--text-muted`, which is what F4
        // asked for. Both call sites — `Summary`'s badge row and `Overview`'s
        // title row — are inside a `bg-ink` screen root, so this line is drawn
        // on the `--ink` field and never on cream. Measured against the field:
        // `--text-faint` 5.88:1, `--text-muted` 3.93:1, this 8.6:1. F4's 2.33
        // is the faint/cream pair, which is a surface neither call site uses,
        // and taking its prescription would have made the byline *less* legible
        // at both. Recorded in this task's report.
        <span data-testid="confirm-by" className="text-fs-xs text-role-subtitle-on-field">
          توسط {toFa(by)} · {jalali(new Date(at * 1000).toISOString())}
        </span>
      )}
    </span>
  )
}

/**
 * The design's own two glyphs for this decision, taken from the deliverable
 * rather than approximated from the icon set.
 *
 * `Inja Panel.dc.html:3605` switches ONE `<path d>` between them: a tick when
 * the press would confirm, a warning triangle when it would take a confirmation
 * away. `src/ui/icons` holds the tick (`check`) and nothing shaped like the
 * triangle, and `Icon`'s `d` prop exists for exactly this — the nine department
 * paths reach it the same way (§5.1.2). Neither string is a colour, a size or a
 * radius, so nothing about them is a value a token could hold.
 */
const CHECK = 'M20 6L9 17l-5-5'
const WARN = 'M12 9v4M12 17h.01M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3'
  + 'L13.7 3.9a2 2 0 0 0-3.4 0z'

/**
 * What the confirm-content dialog says, in the deliverable's own words
 * (`Inja Panel.dc.html:3594-3599`).
 *
 * `WHY` is the consequence — who can see the content afterwards — and `RULE` is
 * FR-V2 / FR-V3 / AC-18 stated to the person it binds: a confirmation is for a
 * VERSION, not a name, and *any* later change invalidates it. This dialog is the
 * only place in the product where that is said, which is why it is quoted rather
 * than paraphrased.
 */
const WHY = {
  confirm: 'با تأیید، این محتوا برای هر کاربری که دسترسی این دپارتمان را دارد '
    + 'قابل مشاهده می‌شود و در گزارش‌ها می‌آید.',
  revoke: 'با برداشتن تأیید، این محتوا فوراً از دید همهٔ کاربران غیر از ادیتور '
    + 'خارج می‌شود و در گزارش‌های دپارتمان نمایش داده نمی‌شود.',
} as const
const RULE = {
  confirm: 'هر تغییر بعدی — ویرایش در پنل، دستور در تلگرام، اجرای پردازش، یا '
    + 'جابه‌جایی گره‌ها — تأیید را باطل می‌کند و باید دوباره تأیید شود.',
  revoke: 'این کار با تأیید مجدد قابل بازگشت است.',
} as const

/**
 * The two acts the mark used to carry, moved off the title line.
 *
 * **Why it is a separate component.** A 44px control cannot live in a 22px badge
 * row, and shrinking it below the touch floor is not the trade to make: the
 * design's own answer is a `34x34` icon button in the row's action group (§5.2,
 * `--size-tool` "toolbar icon button") with the decision itself behind §6.15's
 * confirm-content dialog. So the mark states and this acts, and the row's height
 * is the row's business again.
 *
 * The 44px hit target survives as padding around a 34px drawn box — the app's
 * touch floor is a real accessibility commitment (`--size-touch`), and the
 * design's 34px is what is *painted*, not what is pressable. `IconButton` owns
 * both halves of that, so neither is written here.
 *
 * **FR-I3 — the default mode is view-only and nothing is written by arriving.**
 * The press opens a question; the write happens on the answer. Drawn for nobody
 * but a holder of `confirm` on this department (R5): not a disabled button and
 * not a greyed mark, because a non-editor is only ever served content that *is*
 * confirmed (D22), so a mark would state something true of everything they can
 * see and therefore say nothing at all. Cosmetic either way — the endpoints
 * re-derive the capability and refuse regardless (D48).
 */
export function ConfirmAction({
  row, department, open, onOpenChange, render = 'both', shape = 'tool',
}: {
  row: Confirmation | undefined
  department: string
  /**
   * **Controlled mode — owner ruling R47, and it exists because the design's
   * own dialog is app-level state.**
   *
   * `Inja Panel.dc.html:3563` is `mConfirm: () => set({flowMenu:false,
   * confirmDialog:true})`: the question is reached from the toolbar's control
   * AND from the ⋯ menu's row, and the menu closes behind it. A dialog owned by
   * whichever control was pressed cannot do that — closing the menu would
   * unmount the dialog the menu had just opened.
   *
   * Omit both and the component is uncontrolled, exactly as it was: `Overview`
   * and every existing call site pass neither and are unchanged.
   */
  open?: boolean
  onOpenChange?: (open: boolean) => void
  /**
   * Which half to draw. `'both'` is the default and is every call site but one.
   *
   * The flow bar needs them apart because the panel hides its whole action
   * group at ≤760 (`Inja Panel.dc.html:99`) and `display:none` takes a `fixed`
   * descendant with it — so the TRIGGER belongs inside that group and the
   * DIALOG must not. Splitting is not a second component: both halves read the
   * same row, the same capability gate and the same label, and a `'trigger'`
   * that drifted from its `'dialog'` would be two answers to one question.
   */
  render?: 'both' | 'trigger' | 'dialog'
  /**
   * Which control the press is offered on — **owner ruling R48.**
   *
   * `'tool'` is the default and is §6.3's settled answer: a `--size-tool` icon
   * button, which is what every action GROUP in this app draws and what
   * `Overview` has drawn since it was rebuilt. Nothing about that call site
   * moves.
   *
   * `'pill'` is the flow bar's, and it is the deliverable's own control there
   * (panel 599, reader 359): a `7px 12px` box carrying a 19px tick, the word
   * «تأییدشده» and the press. R47 measured that box and would not draw it,
   * because the design's label ink lands at 3.72:1 unconfirmed and 3.86:1
   * confirmed on that white toolbar, against the 4.5:1 `e2e/flow.spec.ts`
   * grades every run of text on it. The owner ruled for the readable ink, so
   * the label is drawn in `--ink` — the ink `Checkbox` gives every tick's label
   * in this app — and the STATE is left to the three things that still switch
   * with it: the tick's fill, the box's fill and the box's edge.
   *
   * One prop and not a second component: both shapes ask one question, of one
   * row, behind one dialog, and a copy of this that drifted would be two
   * answers to it.
   */
  shape?: 'tool' | 'pill'
}) {
  const can = useCan(useSession().data)
  const set = useSetConfirmation(department)
  const revoke = useRevokeConfirmation(department)
  const [selfAsking, setSelfAsking] = useState(false)
  // Hooks first, then the early return — the same rule `ConfirmMark` keeps.
  const controlled = onOpenChange !== undefined
  const asking = controlled ? open === true : selfAsking
  const setAsking = controlled ? onOpenChange : setSelfAsking
  if (!row || !can('confirm', `dept:${department}`)) return null

  const failure = set.error ?? revoke.error
  const status = failure instanceof ApiError ? failure.status : 0
  const moved = status === 409
  // **The alert goes when the condition does.** A 409 is a statement about one
  // fingerprint, not about the button: `useSetConfirmation`'s `onSettled`
  // refetches the listing, so a row carrying a *fresh* fingerprint arrives
  // moments later and the complaint stops being true. Left alone it sat beside
  // an up-to-date row telling the editor to look again at something they were
  // now looking at, cleared only by the next click. `set.variables` is what was
  // submitted, so this compares the refused fingerprint against the one on
  // screen and says nothing once they differ.
  const outlived = moved && set.variables !== undefined
    && set.variables.fingerprint !== row.fingerprint
  const confirming = !row.confirmed
  const label = confirming ? 'تأیید محتوا' : 'لغو تأیید'
  const tone = confirming ? 'confirm' : 'revoke'

  return (
    <>
      {render !== 'dialog' && (shape === 'pill' ? (
        // **The deliverable's own control on the flow bar (panel 599, reader
        // 359), drawn as of owner ruling R48.** `padding:7px 12px`, radius 12,
        // a 1.5px edge, and inside it a 19px tick and the word «تأییدشده».
        //
        // The 44px touch floor is a transparent `::before` AROUND the drawn box
        // and never `min-h-touch` on the box itself: `min-height` beats
        // `height` whatever order the two are emitted in, so the second spelling
        // repaints the design's control at 44 and passes every class-name
        // assertion while doing it. The flow bar's own ⋯ trigger keeps the same
        // idiom for the same reason, and at the same `--space-2` rung — the box
        // is 35 tall as Chrome paints it (measured, see the e2e), and 35 + 2×5
        // clears the floor where 35 + 2×4 does not.
        //
        // `aria-label` and not the visible word: «تأییدشده» is a constant, and
        // the ACT is «تأیید محتوا» or «لغو تأیید» depending on the row. The
        // state has lived in this control's accessible name since R46 measured
        // that the byline is not legible on this bar, and the specs that press
        // it press it by that name.
        <button
          type="button"
          data-testid="confirm-box"
          aria-label={label}
          title={label}
          onClick={() => setAsking(true)}
          className={
            'relative before:absolute before:content-[""] before:-inset-s2 '
            + 'inline-flex items-center gap-confirm px-s6 py-confirm-y rounded-button '
            + 'border-hairline cursor-pointer transition '
            + (confirming ? 'bg-card border-line' : 'bg-tile-ok border-border-ok')
          }
        >
          {/* Its own tick and NOT `TickBox`: ledger L-48 makes every `TickBox`
              in this app violet and reserves green for this element by name.
              `--border-pick`'s own token comment names "unchecked tick" as one
              of its three roles, and the ⋯ menu's row — the other route to this
              same question — draws the identical box. */}
          <span
            data-testid="confirm-tick"
            aria-hidden
            className={
              'flex items-center justify-center flex-none w-tick h-tick rounded-tick '
              + 'border-hairline text-card '
              + (confirming ? 'bg-card border-border-pick' : 'bg-green border-green')
            }
          >
            {!confirming && <Icon d={CHECK} px={13} stroke={3} />}
          </span>
          {/* **The run of text this whole ruling is about.** The design paints
              it muted when the mark is off and green when it is on; measured on
              this white bar those are 3.72:1 and 3.86:1, and the bar is graded
              at 4.5:1. `--ink` is what `Checkbox.tsx` gives a tick's label
              throughout this app, and what the ⋯ menu's own «تأییدشده» row has
              been drawn at since R47 measured it at 14.63:1 here. */}
          <span data-testid="confirm-label" className="text-fs-sm2 font-bold text-ink">
            تأییدشده
          </span>
        </button>
      ) : (
        <IconButton
          label={label}
          onClick={() => setAsking(true)}
          icon={
            <span
              data-testid="confirm-box"
              className={
                'flex items-center justify-center w-tool h-tool rounded-button '
                + 'border-hairline transition '
                + (confirming
                  ? 'border-line text-violet'
                  : 'border-border-danger text-conflict')
              }
            >
              <Icon d={confirming ? CHECK : WARN} px={18} stroke={2.6} />
            </span>
          }
        />
      ))}

      {render !== 'trigger' && asking && (
        // §6.15 `confirmDialog` — `width:460px`, radius 24, padding 26, and a
        // 42x42 radius-14 tinted glyph tile beside the title. `Dialog` takes the
        // width by NAME (`sm` is `--width-dialog-sm`, 460) rather than as a
        // number: `Overlay`'s prop is `keyof typeof WIDTH`, so a literal 460
        // would not compile.
        <Dialog
          open
          onClose={() => setAsking(false)}
          width="sm"
          title={label}
          icon={
            <span
              data-testid="confirm-glyph"
              className={
                'flex items-center justify-center shrink-0 w-glyph-tile h-glyph-tile '
                + 'rounded-tile '
                + (confirming ? 'bg-tile-ok text-green' : 'bg-tile-c text-conflict')
              }
            >
              <Icon d={confirming ? CHECK : WARN} px={20} stroke={2.4} />
            </span>
          }
          subtitle={WHY[tone]}
          // The same pinned band every dialog uses now — see `alert` on
          // `Overlay`. This box is short enough that the old inline line was
          // visible, and it is routed here anyway: one place in the product
          // where a dialog says a write failed, not two that drift apart.
          alert={failure && !outlived
            ? (moved ? MOVED : status === 403 ? GONE : FAILED)
            : undefined}
          footer={
            <div className="flex gap-s5">
              <Button
                variant={confirming ? 'green' : 'coral'}
                className="flex-1 px-s8 text-fs-menu"
                loading={set.isPending || revoke.isPending}
                loadingLabel="در حال ثبت…"
                onClick={() => {
                  if (confirming) {
                    set.mutate({ target: row.target, fingerprint: row.fingerprint },
                      { onSuccess: () => setAsking(false) })
                  } else {
                    revoke.mutate(row.target, { onSuccess: () => setAsking(false) })
                  }
                }}
              >
                {label}
              </Button>
              <Button variant="ghost" className="flex-1 px-s8 text-fs-menu"
                onClick={() => setAsking(false)}>انصراف</Button>
            </div>
          }
        >
          {/* §6.15's `confDlgNote` — 12.5px `--text-muted` at lh 1.8. This is
              where FR-V2 is stated, so it is body copy and not a footnote. */}
          <p className="text-fs-sm2 text-muted leading-sub m-0">{RULE[tone]}</p>
        </Dialog>
      )}
    </>
  )
}
