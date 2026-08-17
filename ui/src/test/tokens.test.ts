import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const css = readFileSync(join(process.cwd(), 'src/styles/tokens.css'), 'utf8')

/** The last declaration of a token wins, exactly as the cascade resolves it. */
function token(name: string): string {
  const all = [...css.matchAll(new RegExp(`^\\s*${name}\\s*:\\s*([^;]+);`, 'gm'))]
  return all.length ? all[all.length - 1][1].trim() : ''
}

/** How many times the file declares a token at the start of a line. */
function declarations(name: string): number {
  return [...css.matchAll(new RegExp(`^\\s*${name}\\s*:\\s*([^;]+);`, 'gm'))].length
}

describe('the reader this file is asserted with', () => {
  // Everything below compares `token(x)` to a literal. If `token()` returned the
  // first declaration instead of the last, every correction that overrides an
  // @import'ed value would read as uncorrected and this file would be theatre in
  // the other direction: it would fail on correct work and pass on a revert of
  // the F7 block. If it returned its argument, or never returned '', the
  // assertions would pass over a file with no corrections in it at all.
  it('returns nothing for a name the file does not declare', () => {
    expect(token('--voilet')).toBe('')
    expect(token('--not-a-token-at-all')).toBe('')
    // Declared in the frozen _ds imports, never in this file: the reader must
    // not silently reach through the @import and report a value from there.
    expect(token('--fs-body')).toBe('')
  })

  it('takes the last declaration, not the first', () => {
    // --shadow-card-hover is the one token this file declares twice on purpose:
    // F7's neutral two-layer recut, then §9.2's correction of its final alpha.
    // A first-wins reader would report the F7 value here.
    expect(declarations('--shadow-card-hover')).toBe(2)
    expect(token('--shadow-card-hover')).toContain('rgba(16, 10, 40, .7)')
    expect(token('--shadow-card-hover')).not.toContain('rgba(16, 10, 40, .6)')
  })
})

describe('R1 — the deliverable wins over the extracted token', () => {
  it('§9.8 — corrects the four values both deliverables paint', () => {
    expect(token('--border-ok')).toBe('#BFE5D0')
    expect(token('--steps-group-bg')).toBe('#FDF1F0')
    expect(token('--steps-group-border')).toBe('#F8DDDA')
    expect(token('--tile-v5')).toBe('#F3EEFC')
    expect(token('--line-divider')).toBe('#D9CEF0')
  })

  it('§9.9 — re-points the three tokens named for a role they do not serve', () => {
    expect(token('--text-body')).toBe('#5a5175')
    expect(token('--violet-on-dark-body')).toBe('#C9BEEE')
    expect(token('--border-pick')).toBe('#C9B8EC')
  })

  it('§9.2 — carries the shadows S1 actually paints', () => {
    expect(token('--shadow-card-hover'))
      .toBe('0 3px 6px rgba(16, 10, 40, .2), 0 26px 52px -22px rgba(16, 10, 40, .7)')
    expect(token('--shadow-modal'))
      .toBe('0 4px 10px rgba(16, 10, 40, .28), 0 44px 90px -30px rgba(16, 10, 40, .8)')
    expect(token('--shadow-pop')).toBe('0 20px 45px -20px rgba(74, 37, 169, .45)')
  })

  it('§4.3 / §1.2 — names the values S1 introduces and no token holds', () => {
    expect(token('--border-card')).toBe('rgba(42, 29, 94, .07)')
    expect(token('--surface-sub')).toBe('#FBF9FE')
    expect(token('--line-row')).toBe('#F4F0FA')
    expect(token('--line-filter')).toBe('#E9E0F7')
  })

  it('§5.1.9 — names the department card’s two chevron discs', () => {
    expect(token('--disc-coral')).toBe('#FFF0EE')
    expect(token('--disc-violet')).toBe('#F3EDFC')
  })

  it('§4.2 — names the FAB’s own two-layer coral shadow', () => {
    expect(token('--shadow-fab'))
      .toBe('0 6px 14px rgba(16, 10, 40, .22), 0 18px 40px -14px rgba(250, 90, 82, .9)')
  })

  it('§9.4 — closes the panel type scale; twelve steps, not ten', () => {
    const added = {
      '--fs-numeral': '46px', '--fs-stat': '27px', '--fs-steps-title': '26px',
      '--fs-display-hand': '25px', '--fs-stat-sm': '21px', '--fs-dialog': '18px',
      '--fs-body-lead': '14.5px', '--fs-menu': '13.5px', '--fs-caption': '12px',
      '--fs-nano': '10px', '--fs-badge-sm': '9.5px', '--fs-tag': '9px',
    }
    for (const [name, value] of Object.entries(added)) expect(token(name)).toBe(value)
  })

  it('ledger L-17 — names the sub-copy leading', () => {
    expect(token('--lh-sub')).toBe('1.8')
  })

  it('ledger L-20 — a pill is 999px, the radius both deliverables write', () => {
    expect(token('--radius-pill')).toBe('999px')
  })

  it('R3 — carries the reader scale, so a component can be surface-aware', () => {
    expect(token('--width-reader')).toBe('720px')
    expect(token('--pad-reader-x')).toBe('24px')
    expect(token('--pad-reader-bottom')).toBe('60px')
    expect(token('--size-tile-reader')).toBe('54px')
    expect(token('--size-iconbtn')).toBe('40px')
    expect(token('--size-iconbtn-reader')).toBe('42px')
    expect(token('--size-fab')).toBe('52px')
    expect(token('--size-fab-reader')).toBe('56px')
    expect(token('--fs-h1-reader-list')).toBe('30px')
    expect(token('--fs-body-reader')).toBe('15px')
  })

  it('ledger L-10 — two tick sizes by role, not four by screen', () => {
    expect(token('--size-tick')).toBe('19px')
    expect(token('--size-tick-nested')).toBe('16px')
  })

  it('§3.3 / §3.4 — carries the rest of the geometry the ruling’s table gives', () => {
    // The assertions above are the plan's own list, and it leaves nineteen of
    // this task's tokens named by nothing. A token no test reads is a token the
    // next task can revert by accident, so every value this task writes is
    // pinned somewhere in this file.
    const rest = {
      '--width-profile': '700px', '--width-steps': '760px',
      '--width-access': '820px', '--width-audit': '980px',
      '--width-dialog-wide': '640px', '--width-dialog-lg': '540px',
      '--width-dialog': '520px', '--width-dialog-sm': '460px',
      '--width-dialog-xs': '440px',
      '--pad-departments-top': '38px', '--pad-departments-bottom': '48px',
      '--size-glyph': '24px', '--size-glyph-reader': '26px',
      '--size-close': '32px', '--inset-search-icon': '15px',
      '--fs-h1-reader-home': '26px', '--fs-h1-reader-dept': '24px',
    }
    for (const [name, value] of Object.entries(rest)) expect(token(name)).toBe(value)
  })
})

describe('R1 — a correction records what it overrode and why', () => {
  // The ruling is not "the value changes"; it is "the value changes **and the
  // reason is recorded**". Ten tokens here already held a value, so a reader who
  // meets one of them later has to be able to see what it was and which section
  // of the spec overruled it. Without this, a correction is indistinguishable
  // from a typo that happened to land on the design's number.
  const OVERRIDDEN: [string, string][] = [
    ['--border-ok', '#C4E7D3'],
    ['--steps-group-bg', '#FFF4F3'],
    ['--steps-group-border', '#F5CFCB'],
    ['--text-body', '#4A3F6B'],
    ['--violet-on-dark-body', '#B7A6E0'],
    ['--radius-pill', '20px'],
    ['--shadow-modal', '0 40px 90px -30px rgba(0,0,0,.6)'],
    ['--shadow-pop', '0 18px 40px -16px rgba(74,37,169,.5)'],
    ['--shadow-card-hover', 'rgba(16, 10, 40, .6)'],
  ]

  it('writes the value it replaced beside every token it re-values', () => {
    const undocumented = OVERRIDDEN.filter(([, old]) => !css.includes(`was ${old}`))
    expect(undocumented.map(([name, old]) => `${name} (was ${old})`)).toEqual([])
  })

  it('replaced a value that really was the one in force', () => {
    // The list above is prose until something proves the "old" value was real.
    // Every entry must differ from the corrected value, so a row cannot be
    // satisfied by recording the new value as the old one.
    const same = OVERRIDDEN.filter(([name, old]) => token(name).includes(old))
    expect(same.map(([name]) => name)).toEqual([])
  })

  it('cites the section of the spec that overrules the token', () => {
    for (const section of ['§9.8', '§9.9', '§9.2', '§4.3', '§9.4', 'L-20', 'R3']) {
      expect(css).toContain(section)
    }
  })
})
