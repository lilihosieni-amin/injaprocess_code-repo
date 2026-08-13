import { ApiError } from '../api/client'

/** Everything that is not the server's own considered refusal: a 5xx, a dropped
 *  connection, a body that would not parse. */
export const FAILED = 'انجام نشد؛ دوباره تلاش کنید.'

/**
 * What a failed write says.
 *
 * **The server's own sentence, for every 4xx.** `routers/users.py` exists to
 * turn each of `delegation.py`'s error keys into a Persian sentence written for
 * whoever is holding the screen — «این تنها ویرایشگر فعال سامانه است…»,
 * «نمی‌توانید دسترسی‌ای بیشتر از دسترسی خودتان به کسی بدهید» — and each of them
 * names the thing to do next. Replacing them with one local «انجام نشد» throws
 * that away and leaves an administrator pressing the same button.
 *
 * This is the opposite call from `write/ConfirmMark`, and deliberately: there,
 * one status covers two causes the server cannot tell apart, so echoing it would
 * assert the wrong one. Here the mapping is one key to one sentence, and the
 * refusals are about the *actor's* rights rather than about somebody else's
 * document.
 *
 * **`detail`, not `message`, and that is the whole of the second condition.**
 * `message` is never empty: when the body carried no `detail` string,
 * `fetchJson` fills it with `res.statusText`, which is English. A 4xx is not a
 * guarantee that a Persian sentence was written — FastAPI answers 422 with
 * `detail` as a **list**, so `/api/users/abc` would put «Unprocessable Entity»
 * on this screen, and a proxy-generated 429 or 413 arrives with no JSON body at
 * all. `ApiError.detail` is `null` in exactly those cases, and this asks for it
 * by name rather than inferring from the status which 4xx the server wrote for.
 *
 * A 5xx is not a refusal at all, so it too gets the local retry line rather than
 * a framework's English `statusText`.
 *
 * It lives in `lib/` rather than beside the first screen that needed it because
 * three surfaces now echo the same server — the record, the create dialog and
 * the edit dialog — and a second copy is how two of them would come to word an
 * outage differently.
 */
export function refusalText(error: unknown): string {
  if (error instanceof ApiError && error.status >= 400 && error.status < 500
      && error.detail !== null) {
    return error.detail
  }
  return FAILED
}
