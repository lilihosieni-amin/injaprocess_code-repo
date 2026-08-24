import { describe, it, expect } from 'vitest'
import {
  EVERY_DEPARTMENT, NO_DEPARTMENT, REPORT_KINDS, parseScope, reportLabel,
  scopeLabel, scopesLabel,
} from './scopes'

/**
 * **Where these came from, and why they are here now.**
 *
 * Every branch of `scopeLabel` used to be exercised through the supervisor
 * picker's option labels, because that was the one screen that rendered all four
 * shapes of the grammar. The owner's ruling took the scope off those options —
 * *"the person's name and role should be displayed. There's no need to display
 * their department."* — and the assertions would have gone with it, leaving a
 * function with three remaining callers (the record's chips, the users table's
 * department column, the scope fieldset's undrawable notice) and no test of its
 * own.
 *
 * They belong here anyway. They were always claims about a pure function, and
 * the picker was only where somebody had a rendered string to read them off.
 */
const NAMES = { dining: 'سالن', warehouse: 'انبار', cashier: 'صندوق' }

describe('scopeLabel', () => {
  it('names `*` as everything, and never as a list of today’s departments', () => {
    // `*` is not "all nine departments today" — it covers whatever is added
    // tomorrow, and a list would quietly stop being true.
    expect(scopeLabel('*', NAMES)).toBe(EVERY_DEPARTMENT)
  })

  it('translates a whole-department scope', () => {
    expect(scopeLabel('dept:dining', NAMES)).toBe('سالن')
  })

  it('falls back to the stored code when the registry has no name for it', () => {
    // A department removed from the registry, or a name that has not arrived
    // yet. Rendered as nothing it would read as "no access" beside a name.
    expect(scopeLabel('dept:gone', NAMES)).toBe('gone')
  })

  it('names a report scope in Persian rather than quoting the stored string', () => {
    // It used to render as «سالن/report:steps» — the department translated and
    // the report left in the stored spelling, half a sentence in each language.
    expect(scopeLabel('dept:dining/report:steps', NAMES)).toBe('سالن (فقط راهنمای گام‌به‌گام)')
  })

  it('parenthesises the narrowing, so a joined list reads back as one scope', () => {
    // `scopesLabel` joins with «، », and «سالن، فقط X، صندوق» cannot be read
    // back as two scopes.
    expect(scopeLabel('dept:dining/report:flowchart', NAMES)).toMatch(/^سالن \(.*\)$/)
  })

  it('keeps the stored spelling of a report kind this build has no wording for', () => {
    // Quoted is legible; dropped is a person shown as reaching a whole
    // department they do not.
    expect(scopeLabel('dept:dining/report:audit', NAMES)).toBe('سالن/report:audit')
  })

  /**
   * **The one whose mutant is an escalation on screen.**
   *
   * `user_scopes.scope` is `TEXT NOT NULL` with no CHECK, so `''`, `dept:Dining`
   * and a bare `admin` — the shape a role name written into the scope column
   * takes — are all storable today. A refused branch answering
   * `EVERY_DEPARTMENT` would write «همهٔ دپارتمان‌ها» beside an account covered
   * by nothing at all, in the lists an administrator grants access from.
   */
  it('quotes a scope the grammar refuses, rather than calling it everything', () => {
    for (const refused of ['admin', '', 'dept:Dining', 'dept:dining/report:']) {
      expect(scopeLabel(refused, NAMES), refused).toBe(refused)
      expect(scopeLabel(refused, NAMES), refused).not.toBe(EVERY_DEPARTMENT)
    }
  })
})

describe('scopesLabel', () => {
  it('names every scope a person holds, not just the first', () => {
    // A head of two departments shown as covering one is somebody an
    // administrator will believe reaches less than they do — and the
    // single-scope majority makes `scopes[0]` look right everywhere else.
    expect(scopesLabel(['dept:cashier', 'dept:dining'], NAMES)).toBe('صندوق، سالن')
  })

  it('says so when there are none', () => {
    expect(scopesLabel([], NAMES)).toBe(NO_DEPARTMENT)
  })
})

describe('parseScope', () => {
  it('takes the three shapes apart and refuses the rest', () => {
    expect(parseScope('*')).toEqual({ shape: 'every' })
    expect(parseScope('dept:dining')).toEqual({ shape: 'department', code: 'dining' })
    expect(parseScope('dept:dining/report:steps'))
      .toEqual({ shape: 'report', code: 'dining', report: 'steps' })
    expect(parseScope('admin')).toEqual({ shape: 'refused' })
  })
})

describe('reportLabel', () => {
  it('answers undefined for a kind this build has never heard of', () => {
    // NOT a fallback to the raw kind: the caller has to be able to tell "a kind
    // I can draw a control for" from "a kind I can only quote", and a function
    // that always answers a string cannot say so. `ScopePicker`'s undrawable
    // notice is the caller that depends on it.
    expect(reportLabel('audit')).toBeUndefined()
    for (const kind of REPORT_KINDS) expect(reportLabel(kind)).toBeTypeOf('string')
  })
})
