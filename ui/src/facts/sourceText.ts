import { SCREEN_LABELS, label } from '../lib/factsLabels'
import { toFa } from '../lib/format'
import type { FactSource } from '../api/types'

/**
 * Where a source was read, in the design's own five phrases (`sfSources`,
 * `Inja Panel.dc.html:4807`, and an account's `srcAt`, :5038 — one composition,
 * used twice).
 *
 * Which locator applies is decided by `type`, which is why the schema makes all
 * seven optional: a sheet has `sheet`/`cell`, a script has `lines`/`function`, a
 * PDF has `page`, a process has `node`. A source with none of them answers `''`
 * and the caller draws nothing rather than an empty line.
 *
 * `toFa` on the line and page numbers because they are Persian-facing counts,
 * which is the one thing QF-42 sends through it — the file name beside them is
 * the LTR island, not this.
 */
export function sourceAt(s: FactSource): string {
  const L = (k: string, n: string) => label(SCREEN_LABELS, k).replace('{n}', n)
  if (s.sheet !== undefined) {
    return s.cell === undefined
      ? L('source_at_sheet', s.sheet)
      : label(SCREEN_LABELS, 'source_at_sheet_cell')
        .replace('{n}', s.sheet).replace('{m}', s.cell)
  }
  if (s.lines !== undefined) return L('source_at_lines', toFa(s.lines))
  if (s.node !== undefined) return L('source_at_node', s.node)
  if (s.function !== undefined) return L('source_at_function', s.function)
  if (s.page !== undefined) return L('source_at_page', toFa(s.page))
  return ''
}

/** The file's own name — the design shows the last segment of the stored path
 *  and keeps the whole path for the download (`:4806`). */
export function sourceFile(s: FactSource): string {
  return (s.ref ?? '').split('/').pop() ?? ''
}

/**
 * The five source types that are neither a file nor a process.
 *
 * QF-39 names the file-backed ones one by one — «کاربرگ», «اسکریپت»,
 * «یادداشت سلول», «اعتبارسنجی», «قالب‌بندی شرطی», «عکس», «PDF», «سند Word» and
 * «جلسه» — then says *"a `process` source navigates to the process; a `chat`
 * source is inert"*. So the split is by type and not by whether a `ref` happens
 * to be there: a `chat` row carries `ref: null` and there is nothing to fetch.
 */
export const isDownloadable = (s: FactSource) => s.type !== 'process' && s.type !== 'chat'
  && s.ref !== null && s.ref !== ''

/** `departments/cooking/processes/cooking-001.json` → `cooking-001`. */
export function processIdOf(s: FactSource): string | undefined {
  const name = sourceFile(s)
  const id = name.replace(/\.json$/, '')
  return /^[a-z_]+-\d+$/.test(id) ? id : undefined
}
