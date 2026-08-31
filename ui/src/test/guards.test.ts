import { describe, it, expect } from 'vitest'
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'

const SRC = join(process.cwd(), 'src')

/** The only file allowed to hold literal values. */
const ALLOWED = ['src/styles/tokens.css']

/**
 * The one directory this guard does not police, and will not.
 *
 * `src/flow/` is frozen by F16: the flowchart implementation stays as it is, and
 * this exemption is **permanent** rather than pending. `src/screens/` and
 * `src/write/` left this list when the UI-conformance plan rebuilt them (Tasks
 * 14–24); nothing may be added back. A line here is a promise that somebody will
 * come and delete it, and two of them stood for a year.
 *
 * What that exemption is still hiding is recorded rather than forgotten, because
 * an exemption whose contents nobody has read is indistinguishable from a clean
 * directory. As of Task 25 `src/flow/` holds: 14 hex literals, one `rgba()`
 * scrim (`DeleteNodeConfirm.tsx:3`, which also writes `z-[70]` — below every
 * rung of the adopted ladder, latent, nothing collides today), ~60 arbitrary
 * `[…]` lengths, Tailwind's own palette and radii, and ten `dir=` islands
 * (declared in `ISLANDS` below so that list is the whole truth about the app and
 * not the whole truth about what is scanned).
 */
const UNPOLICED = ['src/flow/']

function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name)
    if (statSync(p).isDirectory()) walk(p, out)
    else if (/\.(tsx?|css)$/.test(name)) out.push(p)
  }
  return out
}

function files() {
  return walk(SRC)
    .map((p) => ({ path: p, rel: p.slice(p.indexOf('src/')) }))
    .filter((f) => !ALLOWED.includes(f.rel))
    .filter((f) => !UNPOLICED.some((d) => f.rel.startsWith(d)))
    .filter((f) => !/\.test\.tsx?$/.test(f.rel))
}

/**
 * The source with its comments blanked out, line for line.
 *
 * A comment that *names* a banned value is not one. `Button.tsx:7` explains why
 * it sets no default padding by quoting `px-3 py-[7px]` from src/flow/;
 * `Toast.tsx` explains why its z is a class by quoting the `z-[60]` it is not;
 * `Departments.tsx:73` explains what `getComputedStyle` returns by quoting
 * `rgba(0, 0, 0, 0)`; `base.css:21` quotes the deliverables' own
 * `::-webkit-scrollbar{width:10px}` to justify reading the number from a token
 * instead. Every one of those is the file arguing *against* the thing the guard
 * forbids, and a check that fails on them teaches the next person to delete the
 * explanation. Strip comments before matching, not after — and keep the line
 * count, so a hit still reports the line number it is on.
 */
function stripComments(src: string): string[] {
  let inBlock = false
  return src.split('\n').map((line) => {
    let out = '', i = 0
    while (i < line.length) {
      if (inBlock) {
        const end = line.indexOf('*/', i)
        if (end === -1) { i = line.length } else { i = end + 2; inBlock = false }
      } else if (line.startsWith('//', i)) {
        break
      } else if (line.startsWith('/*', i)) {
        inBlock = true; i += 2
      } else {
        out += line[i]; i++
      }
    }
    return out
  })
}

/** Every code line of every policed file, comments removed, with its number. */
function codeLines() {
  return files().flatMap((f) =>
    stripComments(readFileSync(f.path, 'utf8'))
      .map((line, i) => ({ rel: f.rel, n: i + 1, line })))
}

const report = (hits: { rel: string; n: number; line: string }[]) =>
  hits.map((h) => `${h.rel}:${h.n} ${h.line.trim()}`)

/**
 * The list a later pass must empty, or the owner must name. An entry would be a
 * file holding a value the design genuinely draws that NO token holds.
 *
 * It is EMPTY, and that is the finished state rather than an oversight. It held
 * three files — the two shells and the process summary — because the single
 * minting pass minted from the screens and none of its 23 tokens was a shell
 * value. The shell mint has since named every one of those values
 * (`.superpowers/sdd/ui-shell-mint-report.md`). All three files now write theme
 * classes and none of them needs the exemption.
 *
 * An entry is not a waiver — the point of naming the file is that the list is
 * short, reviewable, and only shrinks. A file comes back onto it only for a
 * value the design draws that nothing holds, with its role and its design line,
 * and it goes to the owner in the same breath. Do NOT resolve one by adding a
 * key to `tailwind.config.js` from inside the task that hit it: that is the
 * piecemeal minting which produced the unreachable-token problem this rebuild
 * exists to fix.
 *
 * The type annotation is load-bearing: an unannotated `[]` infers `never[]` and
 * `UNTOKENISED.includes(f.rel)` above stops compiling.
 */
const UNTOKENISED: string[] = []

describe('F6 — tokens are the only source of values', () => {
  it('no component contains a hex colour', () => {
    const hits = files().flatMap((f) =>
      readFileSync(f.path, 'utf8')
        .split('\n')
        .map((line, i) => ({ rel: f.rel, n: i + 1, line }))
        .filter(({ line }) => /#[0-9a-fA-F]{3,8}\b/.test(line)),
    )
    expect(hits.map((h) => `${h.rel}:${h.n} ${h.line.trim()}`)).toEqual([])
  })

  it('no component names an arbitrary LENGTH', () => {
    // Was `(text|rounded|shadow)-\[` — three utilities out of all of them, so
    // `px-[0.6em]`, `max-w-[560px]`, `gap-[11px]` and every other `x-[…]`
    // passed. The escape hatch is now closed by name rather than by which
    // utility happened to be listed.
    //
    // STRUCTURAL is not an escape hatch: none of these is a value off the
    // design's ladder that somebody declined to tokenise.
    //   `content-[""]`      the one declaration that makes a `::before` render
    //                       at all. `content-none` is NOT a substitute — it sets
    //                       `content:none` and the pseudo-element vanishes;
    //                       `src/ui/table.test.tsx` has a test that says so.
    //   `transition-[a,b]`  a property LIST. `transitionProperty` carries no
    //                       keys and a CSS property name is not a design value.
    //   `[prop:value]`      an arbitrary PROPERTY, e.g. `[text-wrap:pretty]`.
    //                       Matched by the absence of a length: there is no
    //                       number to have come off a ladder.
    //   `-[…em]`            sized against the text, so it tracks its label —
    //                       `Button`'s spinner.
    //   `-[…vh|vw]`         bounded by the viewport, not by the token scale —
    //                       `Overlay`'s caps.
    //   `-[…%]`             a proportion of a parent; no token can hold one.
    //   `-[var(--x)]`       reads a token. This is the token system, not a
    //                       bypass of it — `Overlay`'s `w-[var(--width-drawer)]`.
    //   `before:-inset-[…]` the hit expander. It is DERIVED, not drawn: the
    //                       painted box stays the design's and the `::before`
    //                       grows the target to F11's 44px floor, so the number
    //                       is `(44 - box) / 2` and differs per component —
    //                       4px round a 36px `⋯`, 5px round a 34px `w-tool`,
    //                       6px round a 32px `w-close`. No single token could
    //                       hold it, and each site computed its own. `-inset-s2`
    //                       is written where the rung happens to be exact; this
    //                       covers the rest.
    const ARBITRARY = /\b[a-z-]+-\[/
    const STRUCTURAL = new RegExp([
      /content-\[""\]/, /transition-\[[a-z,\- ]+\]/, /before:-inset-\[[\d.]+px\]/,
      /-\[(?:[\d.]+(?:em|vh|vw|%)|var\(--[a-z0-9-]+\))\]/,
      /\[[a-z-]+:[^\]]*\]/,
    ].map((r) => r.source).join('|'))

    const hits = codeLines()
      .filter((f) => !UNTOKENISED.includes(f.rel))
      .filter(({ line }) => ARBITRARY.test(line) && !STRUCTURAL.test(line))
    expect(report(hits)).toEqual([])
  })

  it('the untokenised list only ever shrinks', () => {
    // A file on that list is exempt from the check above, so the list is the one
    // place a new arbitrary value could hide. Pin its length: adding a file to
    // it is then a deliberate edit with a number beside it, not a quiet append.
    // The pin is 0 because the shell mint emptied the list — see its
    // declaration. Raising this number is the edit that needs an argument
    // beside it.
    expect(UNTOKENISED.length).toBeLessThanOrEqual(0)
    // …and every entry still has one, so the list cannot rot into a set of names
    // that stopped meaning anything. Vacuous while the list is empty, and kept
    // deliberately: it is the rule the next entry has to satisfy.
    for (const rel of UNTOKENISED) {
      const f = files().find((x) => x.rel === rel)
      expect(f, `${rel} is on UNTOKENISED but not in files()`).toBeDefined()
      expect(/\b[a-z-]+-\[/.test(readFileSync(f!.path, 'utf8')), rel).toBe(true)
    }
  })

  it('no component contains an rgb/rgba literal', () => {
    // The hex check never saw `rgba(36,17,82,.45)` — the scrim five write
    // dialogs each hand-rolled — because it is not a hex. Comments are stripped
    // first: three screens explain that a transparent scrolling region computes
    // to `rgba(0, 0, 0, 0)` however violet the shell behind it is, and that
    // sentence is the reason those screens do NOT paint one.
    expect(report(codeLines().filter(({ line }) => /\brgba?\(/.test(line)))).toEqual([])
  })

  it('no stylesheet outside the token files carries a raw px value', () => {
    // `.css` files were scanned for hex and for Tailwind class names, neither of
    // which a stylesheet writes — so `src/styles/base.css`'s raw px went by
    // untouched (P15). `tokens.css` and `roles.css` are where px belongs.
    const ALLOWED_CSS = ['src/styles/roles.css']

    /**
     * The two literals `src/styles/base.css` keeps, declared rather than left to
     * a regex that could not see them. Each is one VALUE in one file: it is
     * removed from the line and the scan re-runs on what is left, so a second
     * raw number on the same line still fires.
     */
    const CSS_LITERALS: { rel: string; value: string; why: string }[] = [
      // F11's focus ring. The radius ladder has no 3px rung and the two 3px
      // spacing tokens are a hint's offset and the flow nav group's gap; naming
      // a third would be minting from inside the check that exists to catch
      // exactly that. Reported by Task 25 instead.
      { rel: 'src/styles/base.css', value: '3px', why: "F11's focus-ring width" },
      // The two login orbs' diameters, byte-faithful to the design system's own
      // Login.jsx. F10's scan below carries the same decision for the same two
      // lines, and for the same reason: widening a guard to reach them would
      // force a ruling rather than a fix. Their four physical offsets are all
      // negative and the regex below cannot reach a `-140px` — recorded here so
      // that whoever closes that hole knows what it will surface.
      { rel: 'src/styles/base.css', value: '420px', why: 'login orb A diameter' },
      { rel: 'src/styles/base.css', value: '300px', why: 'login orb B diameter' },
    ]
    const withoutDeclared = (rel: string, line: string) =>
      CSS_LITERALS.filter((d) => d.rel === rel)
        .reduce((s, d) => s.split(d.value).join(''), line)

    // `var(--x)` is stripped rather than skipping the whole LINE: a line that
    // reads one token and writes one literal — `outline: 3px solid var(--coral)`
    // was exactly that — escaped its predecessor entirely.
    const raw = (line: string) => line.replace(/var\(--[a-z0-9-]+\)/g, '')
    // `0px` is not a value, it is a zero.
    const PX = /(?<![\w-])(?!0px)\d*\.?\d+px/

    const hits = files()
      .filter((f) => f.rel.endsWith('.css') && !ALLOWED_CSS.includes(f.rel))
      .flatMap((f) =>
        stripComments(readFileSync(f.path, 'utf8'))
          .map((line, i) => ({ rel: f.rel, n: i + 1, line }))
          .filter(({ rel, line }) => PX.test(withoutDeclared(rel, raw(line)))))
    expect(report(hits)).toEqual([])

    // The list is the only way past this check, so it may not grow quietly: an
    // entry whose file no longer writes it is an exception nobody is paying for.
    const idle = CSS_LITERALS.filter((d) => {
      const f = files().find((x) => x.rel === d.rel)
      return !f || !readFileSync(f.path, 'utf8').includes(d.value)
    })
    expect(idle, 'these css literals are declared but no longer written — delete the line')
      .toEqual([])
  })

  it('catches Tailwind\'s own built-in palette, type scale and radii, not just arbitrary values', () => {
    // I1 — everything above lives under theme.extend, so bg-sky-600, text-lg and
    // rounded-lg all compile and violate F6/F8 while the two checks above stay
    // silent (they only catch arbitrary `[...]` values and hex literals). This
    // scans the same policed set for Tailwind's shipped defaults instead.
    const PALETTE = /\b(bg|text|border|ring|from|to|via)-(slate|gray|zinc|neutral|stone|red|orange|amber|yellow|lime|emerald|teal|cyan|sky|blue|indigo|purple|fuchsia|pink|rose)-\d{2,3}\b/
    const TYPE_SCALE = /\btext-(xs|sm|base|lg|xl|[2-9]xl)\b/
    const RADII = /\brounded(-[tblrse]{1,2})?-(sm|md|lg|xl|2xl|3xl|full)\b/
    const BAD = new RegExp([PALETTE.source, TYPE_SCALE.source, RADII.source].join('|'))
    const hits = files().flatMap((f) =>
      readFileSync(f.path, 'utf8')
        .split('\n')
        .map((line, i) => ({ rel: f.rel, n: i + 1, line }))
        .filter(({ line }) => BAD.test(line)),
    )
    expect(hits.map((h) => `${h.rel}:${h.n} ${h.line.trim()}`)).toEqual([])
  })

  it('is actually scanning files, not vacuously passing over an empty list', () => {
    // Every assertion in this file compares a derived list to `[]`, so a scan
    // that finds nothing "passes" for the wrong reason — if UNPOLICED ever grew
    // a line broad enough to exclude everything (even 'src/' itself) every test
    // here would go green while policing zero files. This test has no such blind
    // spot: it asserts the scan is over a real, sizeable set, and names the
    // three directories that left UNPOLICED so that putting one back is a
    // failure here rather than a silent loss of coverage.
    const scanned = files()
    expect(
      scanned.length,
      `files() returned only ${scanned.length} entries — the guards above would pass ` +
        `vacuously with a list this small. Check UNPOLICED hasn't grown broad ` +
        `enough to exclude nearly everything under src/.`,
    ).toBeGreaterThan(15)
    for (const dir of ['src/ui/', 'src/screens/', 'src/write/', 'src/shell/', 'src/styles/']) {
      expect(
        scanned.some((f) => f.rel.startsWith(dir)),
        `files() did not include anything under ${dir} — the scan isn't looking at the ` +
          'files it should be. src/screens/ and src/write/ were exempt for the whole of ' +
          'this rebuild and are not exempt again.',
      ).toBe(true)
    }
    expect(UNPOLICED, 'src/flow/ is the only permanent exemption').toEqual(['src/flow/'])
  })
})

describe('F10 — RTL is structural', () => {
  it('no component uses a physical direction property', () => {
    // I2 — widened past the original four cases: it needed a CSS colon or a
    // trailing digit, so text-right (the commonest physical-direction mistake)
    // matched nothing. Now also catches the bare left/right text-align utility,
    // ml/mr/pl/pr-auto, physical border/rounded corners, float, and the inline
    // JS style properties (margin/paddingLeft/Right).
    //
    // I2b — `-\d` was a hole the width of this project's whole spacing scale.
    // Every step is `s`-prefixed (`s1`…`s16`), so the mirror bug this line exists
    // for is spelled **`left-s10`**, not `left-10`, and the regex could not match
    // it. Confirmed by mutation: replacing `end-s10` with `left-s10` at
    // `src/screens/Departments.tsx:191` left this scan and its per-file copy in
    // `Departments.test.tsx` both green. `s?\d` closes it for the physical insets
    // and for `ml`/`mr`/`pl`/`pr` alike.
    //
    // Deliberately still not matching a bare `left:`/`right:` CSS declaration:
    // `src/styles/base.css`'s two login orbs are byte-faithful to the design
    // system's own `Login.jsx`, which renders under the same RTL document, and
    // widening this to catch them would force a ruling rather than a fix.
    const BAD =
      /(margin|padding)-(left|right)|text-align:\s*(left|right)|\b(ml|mr|pl|pr|left|right)-s?\d|\btext-(left|right)\b|\b(ml|mr|pl|pr)-(auto|s?\d)|\bborder-[lr]\b|\brounded-[lr]-|\bfloat-(left|right)\b|margin(Left|Right)|padding(Left|Right)/

    /**
     * §8's declared physical pins — the ONE the DESIGN keeps, uncovered the
     * moment `s?\d` closed the hole above and named here rather than left to a
     * regex that could not see it.
     *
     * Each is one TOKEN in one file, not a file-wide pass: the token is removed
     * from the line and the scan is re-run on what is left, so a genuine mirror
     * bug on the same line still fires. It is not being endorsed here — it
     * carries a `§8` rationale at its own call site and would be a different
     * picture in an LTR locale that does not exist yet; what this list does is
     * make it *visible*, which the hole did not.
     *
     * It held two. Task 25 was told to judge them properly rather than let two
     * documented §8 decisions stand because a regex fix had surfaced them, and
     * `src/shell/PanelShell.tsx`'s `-left-s3` did not survive that. The inbox
     * badge hangs off the button's inline END; under RTL `inset-inline-end`
     * resolves to `left`, so `-end-s3` is byte-identical today, and the
     * rationale the pin was declared on ("mirroring it would move it onto the
     * label") is true of `start` and false of `end`. `src/ui/FAB.tsx`'s own
     * badge already wrote the logical form. The FAB's own pin is different in
     * kind and survives: the design puts the FAB bottom-RIGHT in an RTL
     * document, which is `start`, so `end-s10` would move it across the screen.
     */
    const PHYSICAL_PINS: { rel: string; pin: string }[] = [
      // The comment FAB. `FAB.tsx`: "`bottom:22px; right:22px; left:auto` is one
      // of the physical pins the design keeps, reproduced as written."
      { rel: 'src/ui/FAB.tsx', pin: 'right-s10' },
      { rel: 'src/ui/FAB.tsx', pin: 'left-auto' },
    ]
    const withoutPins = (rel: string, line: string) =>
      PHYSICAL_PINS.filter((p) => p.rel === rel)
        .reduce((s, p) => s.split(p.pin).join(''), line)

    const hits = files().flatMap((f) =>
      readFileSync(f.path, 'utf8')
        .split('\n')
        .map((line, i) => ({ rel: f.rel, n: i + 1, line }))
        .filter(({ rel, line }) => BAD.test(withoutPins(rel, line))),
    )
    expect(hits.map((h) => `${h.rel}:${h.n} ${h.line.trim()}`)).toEqual([])

    // The list is the only way past this guard, so it must not be able to grow
    // quietly: a pin whose file no longer writes it is an exception nobody is
    // paying for. Same idle check F4/F8's EXCEPTIONS carries below.
    const idle = PHYSICAL_PINS.filter((p) => {
      const f = files().find((x) => x.rel === p.rel)
      return !f || !readFileSync(f.path, 'utf8').includes(p.pin)
    })
    expect(idle, 'these physical pins are declared but no longer written — delete the line')
      .toEqual([])
  })

  it('only the declared islands pin dir', () => {
    // Every element in the app that pins `dir` — declared here, so that a new
    // one is a deliberate decision rather than something a reviewer has to
    // notice. Every entry pins `ltr` on the same class of thing: a latin run
    // inside RTL prose that must keep the order it was stored in.
    //
    // The list this replaces held sixteen entries above a comment claiming it
    // was complete "precisely so that deleting that line is a one-line change
    // and not a hunt for the islands nobody wrote down". Deleting the line found
    // it wrong in both directions: five of its entries — `UserFields`,
    // `SupervisorPicker`, `Users`, and (in the brief that specified this task)
    // `SessionsCard` and `flow/FlowScreen` — no longer pin `dir` or no longer
    // exist, and four files that DO pin it were not on it. This list is derived
    // from a scan of the tree, not copied forward, and the assertion under it is
    // what keeps that true.
    const ISLANDS = [
      // Process and node ids — the design's own first `dir="ltr"` case (§2.7).
      'src/ui/IdBadge.tsx',
      // TextField pins `dir="ltr"` when its CALLER asks for a latin island — a
      // username, a process id, an IP, and the mobile number on the sign-in
      // form. Declared here rather than worked around inside the component,
      // because the workaround (spreading a `{ dir: 'ltr' }` object so the
      // string `dir=` never appears) would defeat the guard without changing the
      // markup it exists to police. `SignIn.tsx` below is one such caller: its
      // `dir="ltr"` is a PROP, not an attribute, and it is declared all the same
      // — this scan reads the text, and so does a reviewer.
      'src/ui/TextField.tsx',
      'src/screens/SignIn.tsx',
      // **Every password box, by owner ruling** — *"the password input should
      // also be left-to-right (LTR), just like the mobile number field."* A
      // password is a latin token, never Persian prose, so `PasswordField` pins
      // the direction on its own input with no prop for a caller to get wrong.
      // Only the input: the wrapper stays RTL, which is what keeps the reveal
      // button on the edge the design draws it on.
      'src/ui/PasswordField.tsx',
      // The crumb strip pins a process id LTR and monospaced — §8's rule for
      // every latin island in an RTL app, and the only `dir=` in either shell.
      // `src/shell/crumbs.ts`, which decides WHICH crumb is one, is deliberately
      // not on this list and must not join it: it renders nothing, and its
      // docstring says so without spelling the attribute, because this scan
      // reads comments too and a file that merely describes the island would
      // otherwise have to be declared as one.
      'src/shell/PanelShell.tsx',
      // A username — a mono latin run beside Persian prose, on the signed-in
      // account's own page and on one person's record.
      'src/screens/Profile.tsx',
      'src/screens/UserDetail.tsx',
      // Summary pins `ltr` on one thing: the mono `A-0 · {id}` line inside the
      // IDEF0 centre box (§8 — every mono id run is an LTR island). NOT on its
      // scrolling region: that is `[data-r-pad]`, whose direction pair lives in
      // `src/styles/base.css` with every other screen's.
      'src/screens/Summary.tsx',
      // The facts list's id cell — `F-00011`, a mono latin run in an otherwise
      // Persian row, pinned exactly as the design pins it
      // (`Inja Panel.dc.html:1056`). The screen's other latin content is the
      // filter machinery's stored values, none of which is rendered.
      'src/facts/FactsList.tsx',
      // The fact detail's TWO islands, and only two — every mono run on that
      // screen (a key, a code, a value, a formula, a file path, an id) goes
      // through `Mono`, and an account's verbatim `statement` through
      // `Statement`, which picks the direction from whether the string holds
      // Persian (`Inja Panel.dc.html:1687`). Eight card files draw those runs
      // and not one of them writes the attribute, which is the point of routing
      // them through one module.
      'src/facts/cards/parts.tsx',
      // The policy version digest, a mono latin run that can hold a `-` or a `_`
      // and bidi-reorders inside the Persian sentence around it. Not the label
      // beside it — that used to sit inside the same `font-mono` span and fell
      // through to whatever the OS substituted for Persian glyphs.
      'src/screens/Visibility.tsx',
      // The two write islands, each a mono latin run several levels inside an
      // RTL dialog — which is precisely what §8's scroll-box rule is written NOT
      // to reach: the id the server will allocate, previewed before it exists,
      // and the absolute URL of a finished export in its copy field.
      'src/write/CreateProcessModal.tsx',
      'src/write/ExportModal.tsx',
      // §8 — the flow canvas is laid out left-to-right and re-flips its own
      // nodes. Declared even though `src/flow/` is unpolicedso that this list is
      // the whole truth about the app rather than the whole truth about what is
      // scanned. `FlowScreen.tsx` is NOT among them, though the brief for this
      // task named it as the one flow island: it pins nothing.
      'src/flow/Canvas.tsx',
      'src/flow/DetailDrawer.tsx',
      'src/flow/nodes/ActivityNode.tsx',
      'src/flow/nodes/StartNode.tsx',
      'src/flow/nodes/EndNode.tsx',
      // `src/screens/ProcessList.tsx` is deliberately NOT here, and the absence
      // is the finding rather than an omission: that screen used to pin the
      // direction twice — once on its scrolling region, once back on the single
      // child somebody remembered — and it now pins it nowhere. §8's intent
      // moved into `[data-r-pad]{direction:ltr}` / `[data-r-pad] > *{direction:
      // rtl}` in `src/styles/base.css`, where the rule reaches every child
      // instead, so the five re-pins under `src/write/` that existed to undo the
      // second half have nothing left to undo. Anyone re-adding the attribute to
      // that file has re-opened O1 and must not add a line here to quiet this.
    ]
    const hits = files()
      .filter((f) => !ISLANDS.includes(f.rel))
      .flatMap((f) =>
        readFileSync(f.path, 'utf8')
          .split('\n')
          .map((line, i) => ({ rel: f.rel, n: i + 1, line }))
          .filter(({ line }) => /\bdir=/.test(line)),
      )
    expect(hits.map((h) => `${h.rel}:${h.n} ${h.line.trim()}`)).toEqual([])

    // The assertion the old list lacked, and the reason it was wrong in five
    // places. A list that only ever grows is a list that stops describing the
    // app: this fails when an island is renamed, when its `dir=` is removed and
    // the entry is left behind, or when a screen is deleted out from under it.
    // It reads `walk(SRC)` and not `files()` so the `src/flow/` entries above
    // are checked too.
    const scanned = new Map(walk(SRC).map((p) => [p.slice(p.indexOf('src/')), p]))
    const stale = ISLANDS.filter((rel) => {
      const p = scanned.get(rel)
      return p === undefined || !/\bdir=/.test(readFileSync(p, 'utf8'))
    })
    expect(stale, 'these islands are declared but no longer pin dir — delete the line')
      .toEqual([])
  })
})

describe("X3/X4 — form controls are drawn, not the operating system's", () => {
  it('leaves no native control for the OS to draw', () => {
    // The nine screens introduced one `<select>` with no `appearance-none` and
    // ~35 `<input type=checkbox|radio>` carrying nothing but `accent-violet`, at
    // two sizes 2.75× apart. Every one of them agreed with the token file, and
    // no regex in this file could see any of it.
    //
    // The rule is not "no `<input>`" and not "no `<button>`", which is what the
    // brief for this task asked for and what the tree cannot satisfy: `<button>`
    // draws no OS chrome once it is given a class, and ~20 of them are the
    // correct element for what they do. Nor is it "no `<input>`": ScopePicker
    // and Visibility each render a native checkbox `sr-only` BEHIND a drawn
    // `TickBox`, which is the design's pattern and the opposite of the defect.
    //
    // The rule is that nothing the operating system PAINTS reaches the screen.
    const hits: { rel: string; n: number; line: string }[] = []
    for (const f of files().filter((x) => !x.rel.startsWith('src/ui/'))) {
      const lines = stripComments(readFileSync(f.path, 'utf8'))
      lines.forEach((line, i) => {
        // A `<select>` or a `<textarea>` outside src/ui/. `Dropdown` and
        // `TextField` are the drawn ones; the design has no native select
        // anywhere ("The design has no native `<select>` anywhere: every choice
        // in the product is…", src/ui/Dropdown.tsx:49).
        if (/<(select|textarea)\b/.test(line)) hits.push({ rel: f.rel, n: i + 1, line })
        // A tick the OS paints. The element runs over several lines, so the
        // check reads the whole tag: a native checkbox or radio outside src/ui/
        // is legal only when it is `sr-only` and something drawn sits on top.
        if (/<input\b/.test(line)) {
          const tag = lines.slice(i, i + 12).join(' ')
          const end = tag.indexOf('/>')
          const el = end === -1 ? tag : tag.slice(0, end)
          if (/type=["'](checkbox|radio)["']/.test(el) && !/\bsr-only\b/.test(el)) {
            hits.push({ rel: f.rel, n: i + 1, line })
          }
        }
      })
    }
    expect(report(hits)).toEqual([])

    // `accent-color` is the ONE hook a native tick offers, so writing it is the
    // signature of having given up on drawing one. Nothing in the app may.
    expect(report(codeLines().filter(({ line }) => /\baccent-/.test(line)))).toEqual([])

    // …and a `<button>` with no class at all is a UA-drawn button, whatever the
    // paragraph above says about the ones that have one.
    const bare = codeLines().filter(({ line }) => /<button\s*>/.test(line))
    expect(report(bare)).toEqual([])
  })

  it("no component uses Tailwind's own numeric spacing scale", () => {
    // `tailwind.config.js` carries an explicit comment that the `s` prefix
    // exists so the design's dense scale (4,5,6,8,10…) does not collide with
    // Tailwind's sparser rem one (4,8,12,16,20…). `ConfirmMark`'s `px-3` was
    // 12px where every sibling button was `px-s8` = 16px, and no regex saw it.
    //
    // `-0` is excluded for the reason the stylesheet check above excludes `0px`:
    // a zero is not a value off anybody's ladder, and `m-0` is how this codebase
    // spells "the browser's default margin is wrong here" in ~60 places.
    // `var(--space-4)` is excluded because the `\b` before `space` matches after
    // a hyphen, so the custom property that DEFINES the scale read as a use of
    // Tailwind's.
    const BAD = /\b(p|m|gap|space)[xytrbles]?-\d/
    const hits = codeLines()
      .map(({ rel, n, line }) => ({ rel, n, line: line.replace(/--space-[\w-]+/g, '') }))
      .filter(({ line }) => BAD.test(line.replace(/\b(p|m|gap|space)[xytrbles]?-0(?![.\d])/g, '')))
    expect(report(hits)).toEqual([])
  })
})

describe('F4/F8 — density comes from the shell', () => {
  it('no shared component accepts a density or size prop', () => {
    // I3 — was three literal names scoped to src/ui/ alone. Broadened to the
    // names an actual density prop is likely to be spelled (compact/dense/roomy
    // join size/scale/density; variant covers a style-variant prop smuggling a
    // density choice) and to every policed directory, not just src/ui/.
    // (?<!-) keeps kebab-case CSS declarations like `font-size:` out of a scan
    // that broadened past src/ui/ into src/styles/ — a TS/JSX prop name is never
    // preceded by a hyphen, so this excludes only the false positive.
    // The `(?!\p{Script=Arabic})` after the quote is the second narrowing, and it
    // is narrower than the file-level exemption it replaced. `factsLabels.ts`
    // maps the value the store holds to the word a Persian screen shows, and
    // two of those stored values are `scale` (`issues[].kind`) and `size`
    // (`pack.size`) — keys that cannot be renamed to please a scan, because the
    // key IS the stored value (QF-32). A density prop is never a Persian string
    // literal, so excluding that one right-hand side costs this guard nothing
    // and keeps the whole file policed for a real prop, which exempting it by
    // name would not have.
    const BAD = /(?<!-)\b(density|size|scale|compact|dense|roomy|variant)\??:\s*(['"](?!\p{Script=Arabic})|[A-Za-z])/u
    // Button's own `variant` selects a colour theme (coral/violet/green/ghost) —
    // a real, load-bearing axis distinct from density, not a size in disguise.
    // Allowlisted by file, the same pattern F10 below uses for IdBadge's
    // dir="ltr": one named, commented exception rather than loosening the
    // pattern (and so this guard's ability to catch a real one) for everyone.
    // `variant` on EmptyState selects a *visual form* the design defines —
    // a card, a dashed block, a line inside a table — not a density. Named here
    // rather than loosening the pattern for every file, exactly as Button's
    // colour `variant` is.
    // `api/types.ts` is the same stored key at the other end of the wire, and it
    // needs the exemption because its right-hand side is a TYPE, not a Persian
    // string: `ItemData` writes `pack?: { size: number }`. The authority for
    // that key is **spec §7's `item` payload**
    // (`docs/superpowers/specs/2026-08-29-quantitative-facts-design.md:756`),
    // not `facts.schema.json` — which types `data` as an unconstrained object
    // (`:104`) and names no `pack` at all. The file declares no component prop
    // of any kind, which is what this guard is about.
    const EXCEPTIONS = ['src/ui/Button.tsx', 'src/ui/states/index.tsx', 'src/api/types.ts']
    const hits = files()
      .filter((f) => !EXCEPTIONS.includes(f.rel))
      .flatMap((f) =>
        readFileSync(f.path, 'utf8')
          .split('\n')
          .map((line, i) => ({ rel: f.rel, n: i + 1, line }))
          .filter(({ line }) => BAD.test(line)),
      )
    expect(hits.map((h) => `${h.rel}:${h.n} ${h.line.trim()}`)).toEqual([])

    // The list is the only way past this guard, so it must not be able to grow
    // quietly: an entry for a file that no longer trips the pattern (or no
    // longer exists) is an exception nobody is paying for, and the next file
    // added beside it inherits the same absence of scrutiny. Each entry has to
    // earn its place by still matching.
    const idle = EXCEPTIONS.filter((rel) => {
      const f = files().find((x) => x.rel === rel)
      return !f || !readFileSync(f.path, 'utf8').split('\n').some((line) => BAD.test(line))
    })
    expect(
      idle,
      'these files are excepted from F4/F8 but no longer trip it — delete the line',
    ).toEqual([])
  })
})
