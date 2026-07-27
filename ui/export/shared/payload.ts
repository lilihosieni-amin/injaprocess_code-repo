import type { Overview, ReadableProcess } from '../../src/api/types'

/** Everything the file carries — and, because the link is unauthenticated,
 *  everything a reader can see through View Source. `ReadableProcess`, not
 *  `Process`: `inja_ui_backend/exports.py` withholds the process fields neither
 *  document renders, and this type has to say so rather than promise fields the
 *  file does not contain. A node's `icom` and `source` are present but blanked
 *  there, so `ProcNode` stays true of what arrives. */
export type ExportPayload = {
  dept: Overview
  processes: ReadableProcess[]
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
