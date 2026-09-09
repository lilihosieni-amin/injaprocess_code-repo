import type { FactBundle, FactEntry, FactKind } from '../../api/types'

/**
 * The bundle builder every card test draws from.
 *
 * Typed as `FactBundle` rather than assembled ad hoc, so a change to the served
 * shape — a renamed map, a widened union — is a `tsc -b` error in eight test
 * files at once instead of eight screens rendering `undefined` under assertions
 * that still pass. The values are trimmed out of
 * `ui/design/mock/facts/api/entries.json`, which is the design's own fixture.
 */
export function bundleOf(
  kind: FactKind,
  data: Record<string, unknown>,
  over: Partial<FactBundle> = {},
  entryOver: Partial<FactEntry> = {},
): FactBundle {
  return {
    entry: {
      id: 'F-00014', kind, key: 'k', title: 'عنوان', statement: 'بیان',
      scope: { departments: [], branches: [] },
      status: 'confirmed', retired: false, updated_at: '2026-09-16T14:05:00Z',
      data,
      ...entryOver,
    },
    confirmation: { confirmed: false, can_confirm: true, fingerprint: 'sha256:abc' },
    red_paths: { unknown: [], disputed: [] },
    resolved: {},
    row_titles: {},
    path_labels: {},
    workbook_titles: {},
    unit_titles: {},
    binding_labels: {},
    consumers: [],
    processes: [],
    // The route always sends the key; `null` is «no original», which is
    // every fixture here but the one that is about the original.
    original: null,
    ...over,
  }
}
