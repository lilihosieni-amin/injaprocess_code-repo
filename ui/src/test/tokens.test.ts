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

  it('§5.2 — carries the control geometry the spacing scale has no rung for', () => {
    // Same reason as the block above: a token no test reads is a token the next
    // task can revert by accident. These eleven are the empty-state card's two
    // axes, the dialog scrim's inset and the search field's three scales, none
    // of which lands on the _ds ladder (4·5·6·8·10·12·14·16·18·22·26·30·38·40).
    const control = {
      '--pad-empty-y': '48px', '--pad-empty-x': '20px',
      '--pad-modal': '24px',
      '--pad-search-y': '13px', '--pad-search-x': '44px',
      '--pad-search-x-dialog': '42px',
      '--pad-search-y-menu': '9px', '--pad-search-x-menu': '34px',
      '--inset-search-icon-dialog': '14px', '--inset-search-icon-menu': '11px',
      '--size-search-glyph': '17px',
    }
    for (const [name, value] of Object.entries(control)) expect(token(name)).toBe(value)
    // …and none of them duplicates the large field's own inset, which already
    // had a token: three insets, three different numbers.
    expect(token('--inset-search-icon')).toBe('15px')
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

  it('§5.2 — carries every value the twelve primitives draw and no token held', () => {
    // The whole point of minting these in one pass. Five tasks build the twelve
    // primitives in parallel against one working tree; if each minted its own
    // values, the second write to this file would silently drop the first and
    // the build would still be green. Every value they need is pinned here, so
    // a task that "helpfully" re-values one turns this red instead.
    //
    // Grouped exactly as .superpowers/sdd/ui-primitives-tokens-report.md is, so
    // the two can be read side by side. SectionCard is absent on purpose: every
    // value its two skins draw already had a token before this pass.
    const primitives = {
      // TextField / Textarea
      '--pad-textarea-y': '11px', '--pad-compose': '13px',
      // PasswordField
      '--pad-reveal': '46px', '--size-reveal': '32px',
      '--size-reveal-glyph': '17px', '--radius-reveal': '8px',
      // Checkbox — the two boxes are --size-tick / --size-tick-nested (L-10);
      // these are the radius and the check glyph each of them carries.
      '--radius-tick': '6px', '--radius-tick-nested': '5px',
      '--size-tick-glyph': '13px', '--size-tick-glyph-nested': '11px',
      '--gap-tick-row': '11px', '--pad-tick-row-y': '13px',
      '--pad-tick-nested-y': '11px',
      // Radio
      '--pad-radio-x': '15px',
      // Dropdown
      '--pad-dropdown-y-dialog': '11px', '--pad-dropdown-y-filter': '9px',
      '--pad-dropdown-x-filter': '13px', '--pad-popover': '7px',
      '--gap-option': '9px', '--pad-option-y': '11px',
      '--size-chevron': '15px', '--height-popover': '280px',
      // DataTable
      '--grid-users': '16px 1.4fr 1fr 1.1fr 1fr 34px',
      '--grid-audit': '1.5fr .7fr .7fr 1.1fr 1.1fr 1fr',
      '--grid-activity': '.9fr 1.4fr 1.4fr .9fr 1fr .6fr',
      '--pad-table-row-y': '13px', '--pad-empty-y-inline': '44px',
      // Pager
      '--size-pager': '34px', '--width-page-label': '74px',
      // StatTile
      '--lh-none': '1', '--pad-stat-x': '20px', '--width-stat': '96px',
      '--pad-stat-y-grid': '15px', '--pad-stat-x-grid': '17px',
      '--space-stat-grid': '20px', '--space-stat-label': '7px',
      // NavTabTray
      '--pad-tab-y-audit': '9px', '--width-tab': '132px',
      '--gap-tab-flow': '3px',
      // Timeline
      '--pad-note-y': '9px', '--pad-note-x': '11px',
      // FAB
      '--size-count': '21px',
    }
    for (const [name, value] of Object.entries(primitives)) {
      expect(token(name), name).toBe(value)
    }
    // 42 is the whole pass, not a floor with room under it: the report, the
    // config, the probe and theme.test.ts's pairing table all carry the same
    // 42, so a token dropped from one of them has to be dropped from this line
    // too before anything goes green.
    expect(Object.keys(primitives).length).toBe(42)
  })

  it('§5.2 — declares each of them exactly once', () => {
    // The failure mode this pass exists to prevent, asserted rather than
    // trusted. Two parallel tasks appending to this file both "work": the file
    // ends with two declarations of one name, the later one wins, and the
    // earlier task's screens quietly move. --shadow-card-hover is the only
    // token this file may declare twice (F7, then §9.2's alpha correction) and
    // the reader test at the top of this file already pins that at two.
    const once = [
      '--pad-textarea-y', '--pad-compose', '--pad-reveal', '--size-reveal',
      '--size-reveal-glyph', '--radius-reveal', '--radius-tick',
      '--radius-tick-nested', '--size-tick-glyph', '--size-tick-glyph-nested',
      '--gap-tick-row', '--pad-tick-row-y', '--pad-tick-nested-y',
      '--pad-radio-x', '--pad-dropdown-y-dialog', '--pad-dropdown-y-filter',
      '--pad-dropdown-x-filter', '--pad-popover', '--gap-option',
      '--pad-option-y', '--size-chevron', '--height-popover', '--grid-users',
      '--grid-audit', '--grid-activity', '--pad-table-row-y',
      '--pad-empty-y-inline', '--size-pager', '--width-page-label', '--lh-none',
      '--pad-stat-x', '--width-stat', '--pad-stat-y-grid', '--pad-stat-x-grid',
      '--space-stat-grid', '--space-stat-label', '--pad-tab-y-audit',
      '--width-tab', '--gap-tab-flow', '--pad-note-y', '--pad-note-x',
      '--size-count',
    ]
    expect(once.filter((n) => declarations(n) !== 1)).toEqual([])
    expect(once.length).toBe(42)
  })

  it('§5.2 — keeps a number that already had an owner off its owner’s token', () => {
    // Four of the twelve's values are numbers a token already carries under a
    // different role. Minting a second name is only correct if the FIRST one
    // still holds its own value, so this asserts both ends: had this pass
    // "corrected the nearest token" instead, --size-close would be the reveal
    // button's box and ledger L-23's close would have moved with it.
    expect(token('--size-close')).toBe('32px')          // L-23's close button
    expect(token('--size-search-glyph')).toBe('17px')   // the magnifier
    expect(token('--pad-search-y')).toBe('13px')        // the search field
    expect(token('--pad-empty-x')).toBe('20px')         // the empty-state card
    expect(token('--pad-empty-y')).toBe('48px')         // …and its 48px, which
    // --pad-empty-y-inline (44px) deliberately does not touch.
    expect(token('--pad-empty-y-inline')).toBe('44px')
  })

  it('cites the section of the spec that overrules the token', () => {
    for (const section of ['§9.8', '§9.9', '§9.2', '§4.3', '§9.4', 'L-20', 'R3']) {
      expect(css).toContain(section)
    }
  })
})
