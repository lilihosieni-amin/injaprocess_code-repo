import type { Icom, Process } from '../api/types'

/**
 * What a screen may say about a process's three **switchable** fields.
 *
 * `summary`, `idef0` and `kpis` are the only fields `visibility.filtered` blanks
 * rather than drops (`visibility.py`'s `_PROCESS_SWITCH` maps them to
 * `process_summary`, `process_idef0` and `process_kpis`). Blanked and never
 * recorded arrive as the same bytes, so no caller can separate them — which is
 * why the answer here is never "empty", only "nothing came".
 *
 * **This module exists so the rule has one spelling.** `Summary` decides whether
 * §6.3's «نمایش داده نمی‌شوند» card is the whole screen; `ProcessList` decides
 * whether to offer a button that leads to that screen (R39). Those are one
 * question asked twice, and the two answers must not be able to drift: a list
 * that offered the door on a screen that refuses is R5, and a list that withdrew
 * it on a screen that would have drawn something is worse.
 */

/** Whether the A-0 block has a single term in it. */
export function hasIcom(icom: Icom): boolean {
  return icom.inputs.length + icom.controls.length
    + icom.outputs.length + icom.mechanisms.length > 0
}

/** Whether the response carried any of the three switchable fields.
 *
 *  **This is an OR, and it decides one thing only: whether §6.3's card is the
 *  whole screen** — and, since R39, whether the list offers a door to it. It
 *  used to gate the three empty states as well, and that was the AC-25 defect
 *  Task 16 existed to remove, one level down. The three policy switches are
 *  INDEPENDENT and `/visibility` sets each separately, so the ordinary mixed
 *  case is summary shown, KPIs withheld: the OR was true, the detail block was
 *  drawn, and the screen printed «شاخصی برای این فرآیند ثبت نشده است» — *nobody
 *  recorded one* — about a list the policy had withheld. Each field answers for
 *  itself now, and this OR is asked only about the whole page.
 *
 *  **It discloses nothing.** It reads the document the caller was already
 *  served: `GET /api/departments/{code}/processes` runs the same
 *  `Disclosure.redact` over every row that `GET /api/processes/{pid}` runs over
 *  one, so the bytes this reads are bytes the caller holds. It is not a count
 *  and not a signal — false is returned for "withheld" and for "never recorded"
 *  alike, which is the only way a client-side predicate can stay inside
 *  NFR-12 / AC-25.
 *
 *  Never on its own: every caller pairs it with `!mayEdit`, because an editor is
 *  served the document untouched and a blank one of theirs is genuinely blank. */
export function hasPublishedDetail(p: Process): boolean {
  return p.summary.trim() !== '' || p.kpis.length > 0 || hasIcom(p.idef0)
}
