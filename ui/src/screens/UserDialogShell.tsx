import { type FormEvent, type ReactNode } from 'react'
import { retryQuery } from '../api/client'
import { Button } from '../ui/Button'
import { Dialog } from '../ui/Overlay'
import { ErrorState } from '../ui/states'

/** The one form both dialogs submit, named once so the footer's submit button
 *  can sit outside it. §5.2 pins the footer, and a pinned footer is a sibling of
 *  the scrolling body rather than a child of the form inside it. */
const FORM = 'user-dialog-form'

/**
 * The skeleton both user dialogs are, written once (F44).
 *
 * They were the same thirty lines twice — `Dialog` → `form.flex-col.gap-s8` →
 * `UserFields` → optional alert → action row — plus the same twelve-line
 * `readFailure` block twice. Any fix to the footer, the failure surface or the
 * shape had to be applied in both, which is how two dialogs come to disagree
 * about what a dialog is.
 *
 * **The failure surface is `ErrorState inline`, not `LoadFailedScreen`.** The
 * latter is a *page*: a 40px screen gutter, a 920px column that can never reach
 * its width inside 520, and a bordered, shadowed card inside a bordered,
 * shadowed dialog. Whether the retry is worth drawing stays `retryQuery`'s
 * decision, exactly as it is on the full-page surface — a settled 4xx will
 * answer the same way every time, and a button that re-runs it is furniture
 * that wastes the press (R5).
 *
 * **The footer does not scroll**, and neither does the title. `Overlay` used to
 * scroll the whole box, so on a nine-department registry the submit button sat
 * below 2207px of content in an 850px window (F37).
 */
export function UserDialogShell({
  open, onClose, title, submitLabel, submitting, alert, failure, onRetry,
  onSubmit, children,
}: {
  open: boolean
  onClose: () => void
  title: string
  submitLabel: string
  submitting: boolean
  alert?: string
  /** A read that produced neither data nor a refusal. The form is not drawn
   *  over one: three lists that did not arrive make three false claims. */
  failure?: { message: string; error: unknown }
  onRetry: () => void
  onSubmit: (e: FormEvent) => void
  children: ReactNode
}) {
  if (failure) {
    // No footer: there is nothing to submit, and «ایجاد کاربر» drawn over a
    // failed read is a control this dialog would refuse (R5).
    return (
      <Dialog open={open} onClose={onClose} title={title} width="md">
        <ErrorState
          inline
          message={failure.message}
          onRetry={retryQuery(0, failure.error) ? onRetry : undefined}
        />
      </Dialog>
    )
  }
  return (
    <Dialog
      open={open}
      onClose={onClose}
      title={title}
      width="md"
      // Owner ruling — the refusal goes under the header, where it cannot
      // scroll away from the footer button that produced it. See `alert` on
      // `Overlay`; the reasoning belongs to that layout, not to this form.
      alert={alert}
      footer={
        <div data-testid="dialog-footer" className="flex-none flex gap-s5">
          {/* §5.2 — two equal-width buttons at `padding:13px; radius 12px;
              13.5px/700`. The radius is `Button`'s own `rounded-button`, and the
              13px is NOT written: no token holds a dialog-footer padding (the
              five that hold 13px are the search field, the compose textarea, the
              tick row, the table row and the inbox button), and `min-h-touch`
              gives this button the same 44px the design's 13 + 18 + 13 does.
              Reported rather than minted.

              §6.14 keeps the *commit* violet; coral is the new-affordance role
              and it is spent on «کاربر جدید», the control on the users screen
              that opened this box (ledger L-36). */}
          <Button
            type="submit" form={FORM} variant="violet"
            className="flex-1 px-s8 text-fs-menu"
            loading={submitting} loadingLabel="در حال ثبت…"
          >
            {submitLabel}
          </Button>
          <Button
            type="button" variant="ghost"
            className="flex-1 px-s8 text-fs-menu"
            onClick={onClose}
          >
            انصراف
          </Button>
        </div>
      }
    >
      {/* §4.6 states errors "in copy: a 11.5px/600 --conflict line under the
          offending control", and the line that used to sit at the foot of this
          form was that rule read as "at the end of the form". The refusals this
          dialog reports are not about one control — «شمارهٔ موبایل معتبر نیست»,
          «این شخص نمی‌تواند سرپرست این کاربر باشد», a 409 from the server — so
          they belong to the BOX, and the box now has a place for them that
          cannot scroll away. */}
      <form id={FORM} onSubmit={onSubmit} className="flex flex-col gap-s6">
        {children}
      </form>
    </Dialog>
  )
}
