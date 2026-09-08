import { describe, it, expect } from 'vitest'
import { pathLabel, redPath, refTitle, resolvedTitle, rowCount, rowTitle } from './bundle'
import { bundleOf } from './cards/fixture'

const B = bundleOf('record', { medium: 'sheet', role: 'reference', location: {} }, {
  resolved: {
    'F-00016': { kind: 'record', title: 'گزارش مرکزی',
      fields: { grams: 'گرم', c_j: 'c_j' } },
    ing_1: { kind: 'item', title: 'پنیر پیتزا', code: '##1' },
    hidden: { restricted: true },
  },
  row_titles: { a: 'ردیف الف', b: { restricted: true } },
  path_labels: { 'data/expr': 'فرمول', 'data/x': { restricted: true } },
  red_paths: { unknown: ['data/u'], disputed: ['data/d'] },
})

describe('reading the bundle’s name maps', () => {
  it('puts an item’s estate code beside its title, and gives an id its own id back', () => {
    // The code is a FIELD of its own, never joined into the title: joined, the
    // browser draws «پنیر پیتزا ##1» as «پنیر پیتزا 1##» — note 6's defect in a
    // second place.
    expect(resolvedTitle(B, 'ing_1'))
      .toEqual({ text: 'پنیر پیتزا', code: '##1', restricted: false })
    expect(resolvedTitle(B, 'F-00016'))
      .toEqual({ text: 'گزارش مرکزی', restricted: false, id: 'F-00016' })
  })

  it('answers «خارج از دسترسی شما» for a masked neighbour, in all three maps', () => {
    const masked = { text: 'خارج از دسترسی شما', restricted: true }
    expect(resolvedTitle(B, 'hidden')).toEqual(masked)
    expect(rowTitle(B, 'b')).toEqual(masked)
    expect(pathLabel(B, 'data/x')).toEqual(masked)
  })

  it('gives a masked neighbour no id, so nothing can offer to open it', () => {
    expect(resolvedTitle(B, 'hidden')!.id).toBeUndefined()
  })

  it('answers undefined for a target the store dropped — the orphan case', () => {
    expect(resolvedTitle(B, 'F-99999')).toBeUndefined()
    expect(refTitle(B, { ref: 'F-99999' })).toBeUndefined()
    expect(refTitle(B, undefined)).toBeUndefined()
  })

  it('names the column a `{ref, field}` edge reads, and the record alone without one', () => {
    // The owner's question of 2026-09-08: «گزارش مرکزی» does not say WHICH
    // column. A served `fields` map answers it; an unlisted field does not
    // invent one, and the id stays what it was so the link still opens.
    expect(refTitle(B, { ref: 'F-00016', field: 'grams' }))
      .toEqual({ text: 'گزارش مرکزی — گرم', restricted: false, id: 'F-00016' })
    expect(refTitle(B, { ref: 'F-00016' })!.text).toBe('گزارش مرکزی')
    expect(refTitle(B, { ref: 'F-00016', field: 'no_such' })!.text).toBe('گزارش مرکزی')
    // A masked neighbour has no label to read a column out of.
    expect(refTitle(B, { ref: 'hidden', field: 'grams' })!.text)
      .toBe('خارج از دسترسی شما')
  })

  it('reads red out of `red_paths` and out of nothing else', () => {
    expect(redPath(B, 'data/d')).toBe('disputed')
    expect(redPath(B, 'data/u')).toBe('unknown')
    expect(redPath(B, 'data/anything')).toBeUndefined()
  })

  it('counts rows in Persian, and says how many are live only when some are not', () => {
    expect(rowCount(4, 4)).toBe('۴ ردیف')
    expect(rowCount(4, 3)).toBe('۳ فعال از ۴ ردیف')
  })
})
