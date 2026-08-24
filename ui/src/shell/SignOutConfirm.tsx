import { Button } from '../ui/Button'
import { Dialog } from '../ui/Overlay'

/**
 * «آیا مطمئن هستید؟», before the session goes.
 *
 * Owner ruling: *"when user click on sign out button, it should first see pop up
 * that ask are you sure. then sign out."* Both shells drew a bare
 * `onClick={() => logout.mutate()}`, and the panel drew it on a 34px icon button
 * sitting one 10px gap away from «فهرست» — a mis-tap on a phone ended the
 * session with nothing in between.
 *
 * **One component and not two dialogs.** The panel has three sign-out call
 * sites (top bar, the ≤1080 sheet) and the reader one; a confirmation written at
 * each would be the same box worded four ways, and the mis-tap this exists to
 * catch is the same mis-tap on all of them. The shells own the `open` state
 * because they also own the mutation — this draws the question and nothing else.
 *
 * §3.3's 440 dialog, the rung `DeleteProcessConfirm` already draws: this is the
 * other question in the product whose answer cannot be taken back by pressing
 * the thing again, and the two should not be two sizes.
 *
 * **`violet`, not `danger`.** Nothing is destroyed — the account, its work and
 * its scopes are all still there a moment later — so the destructive skin would
 * be saying something untrue about the act. The commitment is that the next
 * screen is the login form, which is what the copy says.
 */
export function SignOutConfirm({ onConfirm, onClose, pending }: {
  onConfirm: () => void
  onClose: () => void
  pending?: boolean
}) {
  return (
    <Dialog
      open
      onClose={onClose}
      width="xs"
      title="از حساب خود خارج می‌شوید؟"
      footer={
        <div className="flex gap-s5">
          <Button variant="violet" onClick={onConfirm}
            loading={pending} loadingLabel="در حال خروج…"
            className="flex-1 px-s8 text-fs-menu">خروج از حساب</Button>
          <Button variant="ghost" onClick={onClose}
            className="flex-1 px-s8 text-fs-menu">انصراف</Button>
        </div>
      }
    >
      <p className="text-fs-sm text-muted leading-loose m-0">
        نشست شما بسته می‌شود و برای ادامهٔ کار باید دوباره با شمارهٔ موبایل و گذرواژه وارد شوید.
      </p>
    </Dialog>
  )
}
