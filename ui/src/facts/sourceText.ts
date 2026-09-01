import { SCREEN_LABELS, label } from '../lib/factsLabels'
import { toFa } from '../lib/format'
import type { FactSource } from '../api/types'

/**
 * Where a source was read, in the design's own five phrases (`sfSources`,
 * `Inja Panel.dc.html:5050`, and an account's `srcAt`, :5033 — one composition,
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
 *
 * **The sentence and its values, not the two joined.** A locator is as often
 * latin as Persian — `A1:G2`, `cooking-001-n010`, `getValueById`, and a sheet
 * that is `Pizza` here and «پیتزا» there — so substituting it into «برگهٔ {n}»
 * as text puts a latin run inside Persian prose. `Filled` decides that per
 * value; this function's job is to say which sentence and which values, and the
 * caller's is to draw them.
 */
export function sourceAt(s: FactSource): { text: string; values: Record<string, string> } | undefined {
  const at = (k: string, values: Record<string, string>) =>
    ({ text: label(SCREEN_LABELS, k), values })
  if (s.sheet !== undefined) {
    return s.cell === undefined
      ? at('source_at_sheet', { n: s.sheet })
      : at('source_at_sheet_cell', { n: s.sheet, m: s.cell })
  }
  if (s.lines !== undefined) return at('source_at_lines', { n: toFa(s.lines) })
  if (s.node !== undefined) return at('source_at_node', { n: s.node })
  if (s.function !== undefined) return at('source_at_function', { n: s.function })
  if (s.page !== undefined) return at('source_at_page', { n: toFa(s.page) })
  return undefined
}

/** The file's own name — the design shows the last segment of the stored path
 *  and keeps the whole path for the download (`:5051`). */
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
  // Truthiness, not `!== null`: `ref` is `string | null` in the schema, and a
  // body that omitted it altogether would reach `download('')` — a press that
  // asks the gated route for the empty path.
  && !!s.ref

/** `departments/cooking/processes/cooking-001.json` → `cooking-001`. */
export function processIdOf(s: FactSource): string | undefined {
  const name = sourceFile(s)
  const id = name.replace(/\.json$/, '')
  return /^[a-z_]+-\d+$/.test(id) ? id : undefined
}
