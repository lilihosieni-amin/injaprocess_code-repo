import type { Overview, Process } from '../../src/api/types'

export type ExportPayload = {
  dept: Overview
  processes: Process[]
  generated_at: string
}

/** Read the JSON the backend substituted into the data slot.
 *
 * Kept in one place because the slot id is a contract with
 * `inja_ui_backend/exports.py` — the backend writes it, both bundles read it.
 */
export function readPayload(): ExportPayload {
  const el = document.getElementById('inja-export-data')
  if (!el?.textContent) throw new Error('export data slot is empty')
  return JSON.parse(el.textContent) as ExportPayload
}

/** The mockup's cover reads a `fullName` the overview schema does not have,
 *  so it is derived here rather than added to a frozen contract. */
export function deptFullName(dept: Overview): string {
  return `دپارتمان ${dept.name}`
}
