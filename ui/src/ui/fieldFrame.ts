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
 * Split out of TextField.tsx so PasswordField can share it without either file
 * exporting a non-component (react-refresh/only-export-components), the same
 * reason dismissibleStack.ts sits beside Overlay.tsx rather than inside it.
 *
 * `text-role-body` rather than a per-surface branch: R3's scale layer is
 * roles.css, where `--role-fs-body` is 14px on the panel and 15px on the
 * reader, keyed on the same `data-surface` attribute SurfaceProvider sets.
 * Ledger L-41 decided that roles.css is the SINGLE semantic layer for type; a
 * function here returning `text-fs-body` or `text-fs-lg` would be a second
 * place the same step is written down, and the two would drift silently.
 */
export const FIELD_FRAME =
  'block w-full box-border text-ink text-role-body leading-normal ' +
  'rounded-button border-hairline outline-none transition-[border-color] ' +
  // §4.6 — "disabled keeps its surface and fades", the same treatment Button
  // gives it. A control that is off is never hidden and never a pointer target.
  'disabled:opacity-60 disabled:cursor-default'

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
 */
export const FIELD_PAD_REVEAL = 'py-s6 ps-reveal pe-s7'

/**
 * `11px 12px` — the one part of the field that falls off the spacing ladder,
 * which is why Task 2 minted `--pad-textarea-y` for it. The type size stays
 * the field's own: the deliverables draw four different textarea sizes
 * (13 / 13.5 / 15.5 / 16px) with no rule behind them, and a 13px textarea
 * beside a 14px input in the same dialog is drift, not design.
 */
export const FIELD_PAD_TEXTAREA = 'py-textarea-y px-s6'

/**
 * `12.5px/600 --violet`, `6px` above the control — and it does NOT scale with
 * the surface either: both deliverables label every field at 12.5px.
 */
export const FIELD_LABEL = 'block font-semibold text-violet text-fs-sm2 mb-s3'

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
