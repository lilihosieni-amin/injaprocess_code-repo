import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { EVENT_LABEL } from './events'

/** The record's catalogue (`store/activity.py`), read from the cwd as `factsLabels.test.ts` reads the schemas. */
const py = readFileSync(join(process.cwd(), '..', 'ui-backend', 'inja_ui_backend', 'store', 'activity.py'), 'utf8')
const block = py.slice(py.indexOf('CATALOGUE:'), py.indexOf('}', py.indexOf('CATALOGUE:')))
const catalogued = [...block.matchAll(/"([a-z_.]+)":/g)].map((m) => m[1])

describe('EVENT_LABEL', () => {
  it('names in Persian every event the record catalogues, so no screen shows a raw action', () => {
    expect(catalogued.length).toBeGreaterThan(30)
    expect(catalogued.filter((a) => !(a in EVENT_LABEL))).toEqual([])
  })
})
