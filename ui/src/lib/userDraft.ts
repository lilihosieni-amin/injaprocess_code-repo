import { normalisePhone } from './digits'

/**
 * One account as a form holds it, before it is a request.
 *
 * `roleId` is `number | null` because "nothing chosen yet" is a state the create
 * form really is in, and it is not a state the API has a value for — the server
 * answers 400 to `roleId: null` and calls it "a form that lost its value". So
 * the null lives here, where the form can refuse it, and never on the wire.
 *
 * `username` is the raw thing that was typed. Normalisation happens once, at
 * the boundary below, for the reason `_clean_username` gives on the server:
 * validating the raw string checks one value and stores another, and would
 * refuse «۰۹۱۲…» and «+98 912 …», both of which sign-in accepts.
 */
export interface UserDraft {
  displayName: string
  username: string
  roleId: number | null
  scopes: string[]
  canSupervise: boolean
  supervisorId: number | null
}

/** The fields `PATCH /api/users/{id}` accepts. **`supervisorId` is the only one
 *  on which an explicit `null` is a value**; the other five answer 400. */
export interface UserPatch {
  username?: string
  displayName?: string
  roleId?: number
  scopes?: string[]
  supervisorId?: number | null
  canSupervise?: boolean
}

/** The server's twin of this is `phone.USERNAME_RE`. Checked locally as well
 *  because a local check consults no account list and so leaks nothing, which
 *  makes it the only place a person can be told the actual problem (D56). */
const CANONICAL_NUMBER = /^09\d{9}$/

/** The server's floor (`auth.MIN_PASSWORD_LENGTH`, D58). Restated so a value
 *  that cannot possibly be accepted never costs the ~61 ms argon2 hash the
 *  endpoint spends before it can say so — the refusal is answered earlier, not
 *  re-decided. */
export const MIN_PASSWORD = 6

export const NO_DISPLAY_NAME = 'نام کاربر را بنویسید'
export const BAD_NUMBER = 'شمارهٔ موبایل معتبر نیست.'
export const TOO_SHORT = 'گذرواژه باید دست‌کم ۶ نویسه باشد.'
export const NO_ROLE = 'نقش کاربر را انتخاب کنید'
/** Both of these are the server's own sentences, byte for byte
 *  (`routers/users.SUPERVISOR_REFUSALS`), so that a refusal answered here and
 *  the same refusal answered there cannot come to be worded differently. */
export const SUPERVISOR_REQUIRED =
  'برای کاربری که به همهٔ دپارتمان‌ها دسترسی ندارد باید سرپرست انتخاب کنید'
export const SUPERVISOR_NOT_ELIGIBLE = 'این شخص نمی‌تواند سرپرست این کاربر باشد'

/**
 * What is wrong with this draft, or `undefined` when nothing is.
 *
 * **Every answer here is one the server would give anyway.** None of it is a
 * second copy of a rule: the supervisor clause asks whether the chosen id is in
 * the list the server is offering *right now*, which is `eligible_supervisors`
 * itself rather than a restatement of it, and the delegation rule — who may
 * confer what — is not asked at all, because `/api/roles` has already answered
 * it by returning the roles this actor may confer and no others.
 *
 * The point is only *when*: a create request costs a ~61 ms argon2 hash on the
 * shared verify limiter before it can say the password is five characters long.
 *
 * `password` is `undefined` on the edit form, where the password is not one of
 * the fields — setting somebody else's is its own endpoint with its own event
 * and its own revocation rule.
 *
 * `supervisorMoved` is what keeps D14's promise on the edit form. A supervisor
 * who has since been disabled is left where they are and the gap is surfaced,
 * so an unchanged edge must not be re-judged here: doing so would make it
 * impossible to correct somebody's display name until their supervisor had been
 * replaced. It is always `true` on the create form, where the field is always
 * part of the request.
 */
export function draftProblem(draft: UserDraft, opts: {
  password?: string
  eligibleIds: number[]
  supervisorMoved: boolean
}): string | undefined {
  if (draft.displayName.trim() === '') return NO_DISPLAY_NAME
  if (!CANONICAL_NUMBER.test(normalisePhone(draft.username))) return BAD_NUMBER
  if (opts.password !== undefined && opts.password.length < MIN_PASSWORD) return TOO_SHORT
  if (draft.roleId === null) return NO_ROLE
  if (!opts.supervisorMoved) return undefined
  if (draft.supervisorId === null) {
    // D51 — optional only for somebody who sees everything. `supervisor_error`
    // is the authority and answers exactly this.
    return draft.scopes.includes('*') ? undefined : SUPERVISOR_REQUIRED
  }
  return opts.eligibleIds.includes(draft.supervisorId) ? undefined : SUPERVISOR_NOT_ELIGIBLE
}

/** Order-insensitive, because the server stores `sorted(set(raw))`: two drafts
 *  differing only in the order the boxes were ticked are the same scope list,
 *  and sending one as a change would record a `user.modified` nobody made. */
function sameScopes(a: string[], b: string[]): boolean {
  if (a.length !== b.length) return false
  const x = [...a].sort()
  const y = [...b].sort()
  return x.every((s, i) => s === y[i])
}

/**
 * The PATCH body: **the fields that moved, and no others.**
 *
 * Absent is not `null` on this endpoint — the handler reads `model_fields_set`
 * — so an unchanged field left out is "leave it alone" and is the whole reason
 * a display-name correction does not disturb an org-chart edge. Restating every
 * field instead would be accepted by the server and would re-validate the
 * supervisor against the submitted scopes on every save, which is exactly the
 * case D14 refuses to let block an edit.
 *
 * `roleId` is written only when it is a number: `null` here means the select
 * has nothing chosen, which `draftProblem` has already refused, and it is a 400
 * on the wire.
 */
export function draftPatch(draft: UserDraft, was: UserDraft): UserPatch {
  const patch: UserPatch = {}
  const username = normalisePhone(draft.username)
  if (username !== normalisePhone(was.username)) patch.username = username
  const displayName = draft.displayName.trim()
  if (displayName !== was.displayName.trim()) patch.displayName = displayName
  if (draft.roleId !== null && draft.roleId !== was.roleId) patch.roleId = draft.roleId
  if (!sameScopes(draft.scopes, was.scopes)) patch.scopes = draft.scopes
  if (draft.canSupervise !== was.canSupervise) patch.canSupervise = draft.canSupervise
  if (draft.supervisorId !== was.supervisorId) patch.supervisorId = draft.supervisorId
  return patch
}
