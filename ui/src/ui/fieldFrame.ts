/**
 * The frame every field in the product shares (§5.2).
 *
 * The border carries the whole state machine and nothing else does: `1.5px`
 * `--line` at rest, `--coral` on focus, `--conflict` when invalid. There is no
 * ring, no glow and no outline — focus is a `--coral` border in 15 of 15
 * uses in the deliverable (§4.6), and adding a ring here would be the one
 * decoration the design refuses. (No literal is quoted in this file: the
 * guard scans comments too, and a hex in prose is still a second record.)
 *
 * `outline-none` is not an exception to that: it emits a transparent outline to
 * kill the UA's default, and it is the ONLY `outline-*` allowed anywhere near a
 * field. fields.test.tsx pins both halves — no drawn outline in the class
 * string, and nothing but the transparent one in the compiled sheet.
 *
 * Split out of TextField.tsx so PasswordField can share it without either file
 * exporting a non-component (react-refresh/only-export-components), the same
 * reason dismissibleStack.ts sits beside Overlay.tsx rather than inside it.
 *
 * Four of these classes look like scaffolding and are load-bearing, so each is
 * asserted by the DECLARATION it paints rather than by its presence:
 * `w-full` (without it a field is the browser's ~177px default), `box-border`
 * (without it `100%` + padding + border overflows its dialog), `leading-normal`
 * (without it the field falls to `normal` and stops matching Button's height),
 * and the type size below.
 */
export const FIELD_FRAME =
  'block w-full box-border text-ink leading-normal ' +
  'rounded-button border-hairline outline-none transition-[border-color] ' +
  // §4.6 — "disabled keeps its surface and fades", the same treatment Button
  // gives it. A control that is off is never hidden and never a pointer target.
  'disabled:opacity-60 disabled:cursor-default'

/**
 * The single-line control's type: a FIXED step, not a `--role-*` one.
 *
 * The plan reached for `text-role-body`, whose role is 14px on the panel and
 * 15px on the reader. Both deliverables were then re-measured and both draw an
 * input at 14px — the reader's profile fields included — so the role would have
 * grown the reader's fields past what the design draws. R1 makes the
 * deliverable win over the plan, and a form control's value is not body copy:
 * it is a control, and the design scales it with neither.
 *
 * This is why the size is here and not in FIELD_FRAME: the textarea takes a
 * different one (below), and two `text-*` classes on one element race in
 * Tailwind's OUTPUT order, not the class string's — the trap FIELD_PAD_REVEAL
 * documents. One element, one type class, decided in TypeScript.
 */
export const FIELD_TYPE = 'text-fs-body'

/**
 * The textarea's type, and the one place in this file that DOES scale.
 *
 * The panel's three dialog textareas are 13px against its 14px inputs, which is
 * `--role-fs-dense` exactly (13px panel / 14.5px reader — the ledger's "list,
 * table and hint copy"). Two sizes in one dialog looked like drift when the
 * plan was written; it is not, because the design draws the same relationship
 * in both deliverables. A long free-text answer sets smaller than a one-line
 * value on purpose.
 */
export const FIELD_TYPE_TEXTAREA = 'text-role-dense'

/**
 * `12px 14px`, on BOTH surfaces.
 *
 * The plan assumed the reader took a larger field padding. It does not: the
 * reader deliverable's own inputs are `padding:12px 14px` (3 uses, its profile
 * screen), identical to the panel's (6 uses). R3 scales where the design
 * scales and nowhere else, so this is one constant rather than a branch —
 * exactly as Button carries one size for both surfaces.
 */
export const FIELD_PAD = 'py-s6 px-s7'

/**
 * The same box with the reveal button's room reserved (§5.2 — the design
 * writes `padding:12px 14px; padding-inline-start:46px`).
 *
 * Spelled without `px-*` on purpose: `ps-reveal` and `px-s7` resolve to the
 * same physical edge in RTL, and which one wins is decided by Tailwind's
 * output order, not by the order of the class attribute. Naming the two
 * edges logically is the only spelling that cannot lose that race.
 *
 * The 46px is `8 + 32 + 6` — the button's inset, the button, and the gap to the
 * value — so it belongs on the button's own edge and nowhere else. PasswordField
 * pins the button to the INLINE START to match, and fields.test.tsx relates the
 * two edges in one assertion rather than pinning each independently: the first
 * cut of this component reserved one edge and pinned the button to the other,
 * and two independent assertions both passed while the eye sat over the value.
 */
export const FIELD_PAD_REVEAL = 'py-s6 ps-reveal pe-s7'

/**
 * `11px 12px` — the one part of the field that falls off the spacing ladder,
 * which is why Task 2 minted `--pad-textarea-y` for it.
 */
export const FIELD_PAD_TEXTAREA = 'py-textarea-y px-s6'

/**
 * `12.5px/600 --violet`, `6px` above the control — and it does NOT scale with
 * the surface either: both deliverables label every field at 12.5px.
 */
export const FIELD_LABEL = 'block font-semibold text-violet text-fs-sm2 mb-s3'

/**
 * Which ground the control sits on.
 *
 * §1.2's sub-panel surface is not decoration: the reader's profile password
 * trio and the panel's dialog textareas sit on it, and a field hard-coded to
 * `--card` draws a white box on a near-white ground with only the hairline
 * between them. The textarea defaults to the sub-panel ground because that is
 * where the design always puts it; every other field defaults to the card and
 * a caller inside a sub-panel asks for the other.
 */
export type FieldGround = 'card' | 'sub'

export function fieldGround(ground: FieldGround): string {
  return ground === 'sub' ? 'bg-surface-sub' : 'bg-card'
}

/**
 * §5.1.5 — invalid beats focus. A field that is wrong must not look accepted
 * the moment the cursor lands in it, so the focus colour is restated rather
 * than left to fall through to `--coral`.
 */
export function fieldEdge(invalid: boolean): string {
  return invalid
    ? 'border-conflict focus:border-conflict'
    : 'border-line focus:border-coral'
}

/**
 * The rule statement under the control, and the error line it becomes.
 *
 * §4.6: "there is no field-level error style in S1; errors are stated in copy"
 * — a `11.5px/600 --conflict` line 4px under the offending control. Neutral it
 * is `--text-faint` at the same size, on ledger L-17's sub-copy leading (1.8),
 * which is the role this line is.
 */
export function fieldHint(invalid: boolean): string {
  return `m-0 mt-s1 text-fs-xs leading-sub ${invalid ? 'font-semibold text-conflict' : 'text-faint'}`
}
