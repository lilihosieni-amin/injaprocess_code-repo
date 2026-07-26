import type { Overview, Process } from '../../src/api/types'

export type ExportPayload = {
  dept: Overview
  processes: Process[]
  generated_at: string
}

/** The placeholder the backend substitutes, assembled at runtime.
 *
 *  **Never write that literal contiguously in bundled source.** The backend
 *  substitutes it with Python's `str.replace`, which replaces *every*
 *  occurrence: a second copy anywhere in the bundle would have a department's
 *  JSON spliced into the middle of the JavaScript. `.join` keeps the pieces
 *  apart in the emitted code — string `+` would be constant-folded back
 *  together by the minifier. `scripts/export-dist.mjs check` fails the build
 *  if the built template ever carries the slot more than once. */
const DATA_SLOT = ['__INJA', 'EXPORT', 'DATA__'].join('_')

/** Read the JSON the backend substituted into the data slot.
 *
 * Kept in one place because the slot id is a contract with
 * `inja_ui_backend/exports.py` — the backend writes it, both bundles read it.
 */
export function readPayload(): ExportPayload {
  const el = document.getElementById('inja-export-data')
  const raw = el?.textContent?.trim()
  if (!raw) throw new Error('export data slot is empty')
  if (raw === DATA_SLOT) {
    throw new Error(
      'this file is an unrendered export template, not an export — ' +
        'its data slot was never filled in. Open a document produced by the ' +
        'system instead of the template in dist-export/.',
    )
  }
  return JSON.parse(raw) as ExportPayload
}

/** The mockup's cover reads a `fullName` the overview schema does not have,
 *  so it is derived here rather than added to a frozen contract.
 *
 *  It derives to the stored `name` verbatim. The mockup's sample data used a
 *  bare department («سالن») and prepended «دپارتمان» in the view, but real
 *  `overview.json` stores the *complete* label — the dining department's `name`
 *  is «دپارتمان سالن». Prefixing that again reads «دپارتمان دپارتمان سالن».
 *  (`registry.json` does keep the bare form, but the exports read
 *  `overview.json`.) Treat the stored name as the finished label: any heading
 *  that wants the department renders `dept.name` with nothing in front of it. */
export function deptFullName(dept: Overview): string {
  return dept.name
}
