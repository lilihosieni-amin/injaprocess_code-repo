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

  it('ledger L-10, owner ruling R36 — four tick sizes, one per rung the design draws', () => {
    // R36 reverses the provisional normalisation this test used to assert. The
    // design draws four boxes and the owner kept all four: the rung comes from
    // what the SITE is, and the two the build had collapsed into `--size-tick`
    // get their own names rather than borrowing a number that means a row.
    //
    //   19  the policy row (panel 1764) and the confirmed toggle (panel 579, 600)
    //   18  the supervisor flag (panel 1344) and «whole system» (panel 1356)
    //   17  the department scope cell (panel 1369)
    //   16  the view option nested in that cell's popover (panel 1386)
    expect(token('--size-tick')).toBe('19px')
    expect(token('--size-tick-field')).toBe('18px')
    expect(token('--size-tick-scope')).toBe('17px')
    expect(token('--size-tick-nested')).toBe('16px')
  })

  it('owner ruling R36 — each rung carries the radius and the check the design pairs with it', () => {
    // Read off the design rather than interpolated. The radius does NOT track
    // the size: three of the four rungs are drawn at 6 and only the nested one
    // at 5, which is why there is no third radius token — a tick in a row, a
    // form field or a scope cell is `--radius-tick`, and one inside another
    // option is `--radius-tick-nested`.
    expect(token('--radius-tick')).toBe('6px')          // 1764, 1344, 1356, 1369
    expect(token('--radius-tick-nested')).toBe('5px')   // 1386
    // The check inside each box, which the design shrinks with the box.
    expect(token('--size-tick-glyph')).toBe('13px')       // 1765, in the 19px box
    expect(token('--size-tick-glyph-field')).toBe('12px') // 1345/1357, in the 18px box
    expect(token('--size-tick-glyph-nested')).toBe('11px')// 1370/1387, in 17 and 16
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

  it('the single minting pass — carries every value it minted, once each', () => {
    // Minted in ONE pass for the same reason §5.2's forty-two were: unfreezing
    // this file, roles.css and tailwind.config.js needs a quiet tree, and four
    // separate passes would need four of them. The block is appended rather than
    // folded into §5.2's, whose 42 is the record of a different pass and is
    // cross-referenced from four places.
    const minted = {
      // L-42..L-47 — the stacking ladder, Bootstrap 5's published $zindex-* scale.
      // --z-canvas-overlay is owner ruling R15's rung: the value is the 15 that
      // src/flow/DetailDrawer.tsx already wrote as a literal, so naming it moved
      // nothing on screen and gave the ladder a real consumer instead of a
      // permanent entry on theme.test.ts's PENDING.
      '--z-canvas-overlay': '15',
      '--z-dropdown': '1000', '--z-chrome': '1020', '--z-floating': '1030',
      '--z-drawer': '1045', '--z-modal': '1055', '--z-popover': '1070',
      '--z-tooltip': '1080', '--z-toast': '1090',
      // the values the Tasks 12-25 utility sweep found unnamed
      '--radius-bar': '2px',
      '--shadow-feature':
        '0 2px 4px rgba(16, 10, 40, .18), 0 22px 46px -20px rgba(16, 10, 40, .65)',
      '--duration-row': '.14s', '--ease-css': 'ease',
      '--width-subtitle': '440px', '--size-chiprow': '24px',
      '--size-menu-more': '36px', '--width-login': '380px',
      '--size-dot': '9px', '--size-chev': '30px',
      '--warn-edge': '#F0DDBB', '--warn-fg': '#8A5A00',
      '--width-intro': '600px', '--size-glyph-tile': '42px',
      // Task 9's one un-named value
      '--gap-table-row-mobile': '11px',
      // §5.2 StatTile — the numeral's gap to its conflict dot, minted by owner
      // ruling rather than borrowed. Asserted beside its two same-valued
      // siblings below, which is the check that no role took another's number.
      '--gap-stat-dot': '7px',
    }
    for (const [name, value] of Object.entries(minted)) expect(token(name), name).toBe(value)
    expect(Object.keys(minted).length).toBe(25)
    // Declared once each — the failure mode the one-pass rule exists to prevent.
    expect(Object.keys(minted).filter((n) => declarations(n) !== 1)).toEqual([])
    // …and none of them moved a number that already had an owner. --warn keeps
    // the awaiting amber (ledger L-05, still an open veto), --line-dashed keeps
    // the dashed-affordance lilac, and the eight 11px tokens keep their roles.
    expect(token('--warn')).toBe('')          // declared in the frozen _ds, not here
    expect(token('--gap-tick-row')).toBe('11px')
    expect(token('--pad-note-x')).toBe('11px')
    // …and the two 7px tokens --gap-stat-dot was minted BESIDE rather than
    // borrowed from. Three roles, three names, one number: if a later pass
    // "tidies" them into one, this is the line that objects.
    expect(token('--pad-popover')).toBe('7px')       // the popover's inset
    expect(token('--space-stat-label')).toBe('7px')  // the 4-up label's margin-top
    expect(declarations('--gap-stat-dot')).toBe(1)
  })

  it('the shell mint — the nine values the pass above could not have named', () => {
    // The pass above minted from the SCREENS. Not one of its 25 tokens is a
    // shell value, and the sweep of Tasks 12-25 that followed found the two
    // shells holding 91 of the project's 95 remaining arbitrary `[…]` values
    // between them. These nine are the names those leftovers needed.
    const shell = {
      '--width-menu': '265px',       // the anchored menu popover, panel 140
      '--space-hint': '3px',         // a hint line under its label, 7 uses
      '--lh-lockup': '1.25',         // the brand lockup's two lines, panel 120
      '--size-count-chrome': '19px', // the chrome's count badge, panel 156 / reader 145
      '--pad-inbox-x': '13px',       // the inbox button, panel 152
      '--pad-crumb-y': '9px',        // the breadcrumb strip, panel 174
      '--pad-back-y': '7px',         // its «بازگشت» button, panel 176
      '--pad-topbar-reader': '20px', // the reader's chrome gutter, reader 133 / 156
      '--grid-idef0': '1fr 1.4fr 1fr', // the A-0 IDEF0 grid, panel 414
    }
    for (const [name, value] of Object.entries(shell)) expect(token(name), name).toBe(value)
    expect(Object.keys(shell).length).toBe(9)
    expect(Object.keys(shell).filter((n) => declarations(n) !== 1)).toEqual([])

    // …and every number here that already had an owner left that owner alone.
    // Six of the nine are values some other role already carries, which is the
    // whole reason they were minted rather than borrowed; if a later pass
    // "tidies" any pair into one name, this is the line that objects.
    expect(token('--gap-tab-flow')).toBe('3px')       // 3px — the flow nav group's gap
    expect(token('--size-count')).toBe('21px')        // the FAB's badge, not the chrome's
    expect(token('--size-tick')).toBe('19px')         // L-10's tick box, not the badge
    expect(token('--pad-dropdown-x-filter')).toBe('13px') // the filter chip, not the inbox
    expect(token('--pad-tab-y-audit')).toBe('9px')    // the audit tab, not the crumb strip
    expect(token('--pad-popover')).toBe('7px')        // the popover's inset, not the button
    expect(token('--gap-stat-dot')).toBe('7px')       // the stat dot's gap, likewise
    expect(token('--pad-empty-x')).toBe('20px')       // the empty-state card, not the chrome
    // The one this mint is most likely to be collapsed into, and the one the
    // plan actually got wrong: --pad-reader-x is the reader's CONTENT gutter and
    // --pad-topbar-reader its CHROME gutter, four pixels apart.
    expect(token('--pad-reader-x')).toBe('24px')
    expect(token('--pad-topbar-reader')).not.toBe(token('--pad-reader-x'))
    // --lh-tight keeps the 1.2 that every title step pairs with; the lockup is
    // its own role at 1.25 and does not move it.
    expect(token('--lh-tight')).toBe('')              // declared in the frozen _ds, not here
  })

  it('the reader-chrome mint — the three the ruling on ReaderShell needed', () => {
    // The owner's ruling (2026-08-18): PanelShell matches the design at all 22
    // values it draws; ReaderShell writes the PANEL's numbers in eleven places,
    // and R1 plus R3 give the reader its own. Eight of the eleven were already
    // writable. These three were not.
    const readerChrome = {
      '--gap-button-icon': '7px',       // a button's icon-to-label gap, reader 157
      '--pad-button-x': '15px',         // a standard button's inline padding, 10 sites
      '--size-menu-more-reader': '38px', // the reader's home square, reader 162
    }
    for (const [name, value] of Object.entries(readerChrome)) expect(token(name), name).toBe(value)
    expect(Object.keys(readerChrome).length).toBe(3)
    expect(Object.keys(readerChrome).filter((n) => declarations(n) !== 1)).toEqual([])

    // All three are numbers that already had an owner, which is the whole reason
    // they are minted and not borrowed. The FIVE 7px roles in this file are now
    // asserted together: if a later pass collapses any of them, this is the line.
    expect(token('--pad-popover')).toBe('7px')        // the popover's inset
    expect(token('--space-stat-label')).toBe('7px')   // the 4-up label's margin-top
    expect(token('--gap-stat-dot')).toBe('7px')       // the stat numeral's dot gap
    expect(token('--pad-back-y')).toBe('7px')         // the PANEL back button's padding-y
    // …and 15px and 38px keep theirs too. --size-logo-bar is the trap here: it is
    // 38px and sits on the same bar as the button, and it is the logo IMAGE.
    expect(token('--pad-radio-x')).toBe('15px')       // the radio CARD, not a button
    expect(token('--pad-stat-y-grid')).toBe('15px')   // the 4-up tile's padding-y
    expect(token('--size-chevron')).toBe('15px')      // the chevron glyph
    expect(token('--inset-search-icon')).toBe('15px') // the magnifier's offset
    expect(token('--size-menu-more')).toBe('36px')    // the PANEL's square, 3 uses
    expect(token('--size-logo-bar')).toBe('')         // declared in the frozen _ds, at 38px
  })

  it('gives the toast its own 20px, and does not let it borrow one of the four', () => {
    // The toast mint (Task 25), the last token added to this file. The design
    // draws the toast `position:fixed; bottom:26px; padding:12px 20px`
    // (reader 978). Three of those numbers had names; the inline padding did
    // not, and two components wrote Tailwind's own `px-5` — a t-shirt name off
    // the rem scale the `s` prefix exists to keep out, which no guard in this
    // repo could see because it is not an arbitrary value and not a hex.
    expect(token('--pad-toast-x')).toBe('20px')
    expect(declarations('--pad-toast-x')).toBe(1)
    // …and the four 20px roles it must never collapse into. Every one of them
    // paints identically today and moves a different element tomorrow.
    expect(token('--pad-empty-x')).toBe('20px')        // the empty-state card
    expect(token('--pad-stat-x')).toBe('20px')         // the header stat tile
    expect(token('--space-stat-grid')).toBe('20px')    // the 4-up grid's margin
    expect(token('--pad-topbar-reader')).toBe('20px')  // the reader's chrome gutter
    // The other two numbers the toast draws are NOT minted, because they are on
    // the ladder already: this is what says so.
    expect(token('--space-11')).toBe('')               // frozen _ds, 26px — `bottom-s11`
    expect(token('--space-6')).toBe('')                // frozen _ds, 12px — `py-s6`
  })

  it('the lockup leading is a per-surface pair, not one value and not two names', () => {
    // The owner's ruling on the shell mint's one over-reach. The mint collapsed
    // the panel's 1.25 and the reader's 1.3 onto 1.25, reading roles.css rule 1
    // as forbidding the second value; a role WITH a per-surface value is not a
    // second name for one role, it is what the role layer is for.
    //
    // Both ends live here, as the two ends of a scale; --role-lh-lockup in
    // roles.css switches between them and `leading-lockup` is the only class.
    // src/ui/surface.test.tsx holds the pair against the design's two numbers.
    expect(token('--lh-lockup')).toBe('1.25')          // panel 120
    expect(token('--lh-lockup-reader')).toBe('1.3')    // reader 136
    expect(declarations('--lh-lockup')).toBe(1)
    expect(declarations('--lh-lockup-reader')).toBe(1)
    // …and the four leadings that really are shared did not follow it apart.
    // --lh-tight keeps the 1.2 that every title step pairs with, and it is the
    // token the lockup would have borrowed had R8 not forbidden it.
    expect(token('--lh-sub')).toBe('1.8')
    expect(token('--lh-none')).toBe('1')
    expect(token('--lh-tight')).toBe('')               // frozen _ds, 1.2
    expect(token('--lh-lockup')).not.toBe(token('--lh-lockup-reader'))
  })

  it('the flow-bar mint (R47) — the nine names the flowchart screen needed', () => {
    // Owner ruling R47. `src/flow/` was frozen for the whole 25-task rebuild
    // (F16), so the flowchart is the one screen that never had a conformance
    // pass; R46 did it and stopped at eight values this file held no name for.
    // Every one is read out of ui/design/** and cited by line, and every one is
    // a number that ALREADY has an owner here under another role — which is why
    // each is minted again rather than borrowed, the rule this whole file
    // states.
    const flowBar = {
      '--pad-flowbar-y': '11px',          // panel 558 — the panel flow bar's padding-y
      '--pad-flowbar-y-mobile': '9px',    // panel 93, reader 99 — the same bar at ≤760
      '--pad-confirm-y': '7px',           // panel 599, reader 359 — the confirm box
      '--pad-flowbar-action-y': '9px',    // panel 607, reader 367 — its «ویرایش»
      '--width-menu-flow': '225px',       // panel 576, reader 336 — the ⋯ popover's floor
      '--pad-flowback-y': '9px',          // reader 313 — the reader's flow-back button
      '--pad-flowback-x': '13px',         // reader 313 — …and its inline half
      '--text-crumb-sep': '#DCD3EC',      // reader 318 — the crumb separator's ink
      '--width-flowback-mobile': '38px',  // reader 104 — that button, squared at ≤760
    }
    for (const [name, value] of Object.entries(flowBar)) expect(token(name), name).toBe(value)
    expect(Object.keys(flowBar).length).toBe(9)
    expect(Object.keys(flowBar).filter((n) => declarations(n) !== 1)).toEqual([])

    // …and every owner the nine numbers already had still holds its own value.
    // This is the half that makes minting different from "correcting the nearest
    // token": had any of these been re-pointed instead, the assertion above
    // would still pass and another screen would have moved.
    expect(token('--pad-option-y')).toBe('11px')       // 11px — the large dropdown option
    expect(token('--pad-note-x')).toBe('11px')         // 11px — the timeline note
    expect(token('--gap-table-row-mobile')).toBe('11px') // 11px — the ≤760 table row gap
    expect(token('--pad-crumb-y')).toBe('9px')         // 9px  — the PANEL breadcrumb strip
    expect(token('--pad-tab-y-audit')).toBe('9px')     // 9px  — an audit tab
    expect(token('--gap-option')).toBe('9px')          // 9px  — the option row's gap
    expect(token('--pad-note-y')).toBe('9px')          // 9px  — the timeline note
    expect(token('--pad-back-y')).toBe('7px')          // 7px  — the PANEL back button
    expect(token('--pad-popover')).toBe('7px')         // 7px  — the popover's own inset
    expect(token('--pad-inbox-x')).toBe('13px')        // 13px — the conflict-inbox button
    expect(token('--pad-dropdown-x-filter')).toBe('13px') // 13px — the filter dropdown
    expect(token('--pad-table-row-y')).toBe('13px')    // 13px — a table row
    expect(token('--width-menu')).toBe('265px')        // the ANCHORED menu's floor, unmoved
    expect(token('--size-menu-more-reader')).toBe('38px') // 38px — the reader's home square
    expect(token('--space-14')).toBe('')               // frozen _ds, 38px

    // The two deferred mints this file had already WRITTEN DOWN, and which R46
    // was correctly forbidden from doing. Both comments named the exact design
    // lines; neither may still read as an unfinished job.
    expect(css, '--pad-back-y still defers the confirm box').toContain('--pad-confirm-y')
    expect(css, '--width-menu still defers the flow menu').toContain('--width-menu-flow')
    // `225` may no longer appear in this file as a number a later screen will
    // mint: it IS minted. The sentence that promised it is gone.
    expect(css).not.toContain('mints its own name; it does not re-value this one')
  })
})
