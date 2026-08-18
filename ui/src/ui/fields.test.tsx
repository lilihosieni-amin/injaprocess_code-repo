import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import postcss from 'postcss'
import tailwind from 'tailwindcss'
import config from '../../tailwind.config.js'
import type { ReactNode } from 'react'
import { expectExpandedHitArea } from '../test/a11y'
import { SurfaceProvider } from './surface'
import { TextField } from './TextField'
import { PasswordField } from './PasswordField'

/* -------------------------------------------------------------------------
   Two halves, and the second is the one that matters.

   jsdom paints nothing, so `toHaveClass('ps-reveal')` proves only that a
   string was written into an attribute: an invented class emits no rule and
   passes exactly the same assertion, while the build still exits 0. That is
   this project's signature defect. So every class this task writes is also
   run through the real `tailwind.config.js` here and asserted by the
   DECLARATION it produces — `padding-inline-start: var(--pad-reveal)` — and
   the surface-scaled one is asserted by the two numbers its role resolves to.

   There is a third defect this file learned about the hard way, and it is not
   a missing assertion — it is two assertions that are each individually true.
   The reveal button was pinned to one edge and its room reserved on the other,
   and this file pinned each side separately and passed. An assertion about a
   RELATIONSHIP cannot be assembled out of two assertions about the parts, so
   `inlinePin` below reads the edge off the compiled sheet and compares it to
   the reserved one rather than restating either.

   The helpers are a deliberate copy of primitives.design.test.tsx's, which
   exports nothing; duplicating thirty lines is cheaper than making one test
   file import another.
   ------------------------------------------------------------------------- */

type Painted = { klass: string; state: string; media: string; decls: string }

/** Compile a class string through the real theme. */
async function paint(classNames: string): Promise<Painted[]> {
  const classes = [...new Set(classNames.split(/\s+/).filter(Boolean))]
  if (classes.length === 0) return []
  const result = await postcss([
    tailwind({ ...config, content: [{ raw: classes.join(' '), extension: 'html' }] }),
  ]).process('@tailwind utilities;', { from: undefined })

  const out: Painted[] = []
  result.root.walkRules((rule) => {
    if (!rule.nodes || rule.nodes.length === 0) return
    const media =
      rule.parent && 'name' in rule.parent ? String((rule.parent as { params: string }).params) : ''
    const decls = rule.nodes
      .filter((n) => n.type === 'decl')
      .map((n) => `${(n as unknown as { prop: string }).prop}: ${(n as unknown as { value: string }).value}`)
      .join('; ')
    for (const sel of rule.selectors) {
      const m = /^\.((?:\\.|[^\s.:>~+,(){}[\]])+)(.*)$/.exec(sel)
      if (!m) continue
      out.push({ klass: m[1].replace(/\\/g, ''), state: m[2], media, decls })
    }
  })
  return out
}

/** The winning value of `prop` in `state` — '' when nothing sets it. */
function winner(painted: Painted[], prop: string, state = ''): string {
  let value = ''
  for (const p of painted) {
    if (p.state !== state || p.media !== '') continue
    for (const d of p.decls.split('; ')) {
      const [name, ...rest] = d.split(': ')
      if (name === prop) value = rest.join(': ')
    }
  }
  return value
}

/**
 * Every custom property the app declares, in cascade order — the four frozen
 * `_ds` files and then `src/styles/tokens.css`.
 */
function declared(): Map<string, string> {
  const entry = resolve(process.cwd(), 'src/styles/tokens.css')
  const files = [
    ...[...readFileSync(entry, 'utf8').matchAll(/@import\s+'([^']+)'/g)]
      .map((m) => resolve(dirname(entry), m[1])),
    entry,
  ]
  const values = new Map<string, string>()
  for (const f of files) {
    for (const m of readFileSync(f, 'utf8').matchAll(/(--[a-z0-9-]+)\s*:\s*([^;{}]+)/g)) {
      values.set(m[1], m[2].trim())
    }
  }
  return values
}

/** What one token is actually worth, so "14px" is a measurement and not a claim. */
function tokenLiteral(token: string): string {
  return declared().get(token) ?? ''
}

/**
 * What one `--role-*` property resolves to on each surface, read out of
 * src/styles/roles.css and src/styles/tokens.css.
 *
 * A `--role-*` size is TWO numbers, and asserting the class name proves nothing
 * about which. This is the half that does — and it is equally the half that
 * proves a field which must NOT scale is off the role layer: the textarea is on
 * `--role-fs-dense` and reads two numbers here, the input is on the fixed
 * `--fs-body` and reads one.
 */
function readerScaleOf(role: string): { panel: string; reader: string } {
  const roles = readFileSync(resolve(process.cwd(), 'src/styles/roles.css'), 'utf8')
  const block = (selector: string) => new RegExp(`${selector}\\s*\\{([^}]*)\\}`).exec(roles)?.[1] ?? ''
  const target = (body: string) =>
    new RegExp(`(?<![-\\w])${role}\\s*:\\s*var\\((--[a-z0-9-]+)\\)`).exec(body)?.[1] ?? ''

  const values = declared()
  const literal = (token: string) => values.get(token) ?? ''
  return {
    panel: literal(target(block(':root'))),
    reader: literal(target(block("\\[data-surface='reader'\\]"))),
  }
}

type Pin = { el: HTMLElement; edge: 'start' | 'end' }

/**
 * The logical edge an in-field control is pinned to, found on whichever box
 * actually carries the pin — the control itself or a wrapper around it.
 *
 * Walking rather than reading one known element is the point: it makes the
 * assertion about WHERE THE BUTTON ENDS UP, which is what a user sees, and not
 * about which node in this component's tree happens to hold the class today.
 */
async function inlinePin(from: HTMLElement): Promise<Pin | undefined> {
  for (let el: HTMLElement | null = from; el && el !== document.body; el = el.parentElement) {
    if (!el.className || typeof el.className !== 'string') continue
    const p = await paint(el.className)
    const start = winner(p, 'inset-inline-start')
    const end = winner(p, 'inset-inline-end')
    if (start !== '' && end === '') return { el, edge: 'start' }
    if (end !== '' && start === '') return { el, edge: 'end' }
  }
  return undefined
}

/** The logical edge on which the reveal button's room is reserved. */
function reservedEdge(painted: Painted[]): 'start' | 'end' | undefined {
  const room = 'var(--pad-reveal)'
  if (winner(painted, 'padding-inline-start') === room) return 'start'
  if (winner(painted, 'padding-inline-end') === room) return 'end'
  return undefined
}

function on(surface: 'panel' | 'reader', node: ReactNode) {
  return render(<SurfaceProvider surface={surface}>{node}</SurfaceProvider>)
}

describe('the compiler these assertions are made with', () => {
  // Every `winner()` below returns '' both for "nothing sets it" and for "the
  // class was invented", so a sheet that silently came out empty would make
  // the wrong assertions pass. This pins both ends first.
  it('resolves a real utility and nothing at all for an invented one', async () => {
    expect(winner(await paint('ps-reveal'), 'padding-inline-start')).toBe('var(--pad-reveal)')
    expect(winner(await paint('ps-reveal-46'), 'padding-inline-start')).toBe('')
  })
})

describe('TextField', () => {
  it('binds a real label to the control', () => {
    // F11 — the design labels its fields with a placeholder in several places;
    // a placeholder vanishes on focus and is not announced as a name.
    on('panel', <TextField label="نام و نام خانوادگی" value="" onChange={() => {}} />)
    expect(screen.getByLabelText('نام و نام خانوادگی')).toBeInTheDocument()
  })

  it('reports every keystroke', async () => {
    const seen: string[] = []
    on('panel', <TextField label="نام" value="" onChange={(v) => seen.push(v)} />)
    await userEvent.type(screen.getByLabelText('نام'), 'سحر')
    expect(seen.join('')).toBe('سحر')
  })

  it('rests on the control border and turns coral on focus', async () => {
    on('panel', <TextField label="نام" value="" onChange={() => {}} />)
    const el = screen.getByLabelText('نام')
    expect(el).toHaveClass('border-hairline', 'border-line', 'focus:border-coral')
    // §4.6 — no ring and no DRAWN outline. `outline-none` is the one permitted
    // `outline-*`: it emits a transparent outline to kill the UA default and
    // paints nothing. Written as "any outline-* that is not outline-none"
    // rather than as "any outline-[" — the bracket form let `outline-4
    // outline-coral` through, which is the exact decoration this rule bans.
    expect(el.className).not.toMatch(/\bring-|\boutline-(?!none\b)/)

    // §4.3 / §4.6 — the border IS the state machine: 1.5px --line at rest,
    // --coral on focus, and no ring, glow or outline anywhere near it.
    const p = await paint(el.className)
    expect(winner(p, 'border-width')).toBe('var(--border-hairline)')
    expect(winner(p, 'border-color')).toBe('var(--line)')
    expect(winner(p, 'border-color', ':focus')).toBe('var(--coral)')
    expect(winner(p, 'box-shadow')).toBe('')
    // The compiled half of the same rule, so it holds against a class name this
    // regex has not been taught: the only outline in the sheet is the
    // transparent one, at rest and on focus alike.
    expect(winner(p, 'outline')).toBe('2px solid transparent')
    expect(winner(p, 'outline-width')).toBe('')
    expect(winner(p, 'outline-color')).toBe('')
    expect(winner(p, 'outline-style')).toBe('')
    expect(winner(p, 'outline', ':focus')).toBe('')
    expect(winner(p, 'outline-width', ':focus')).toBe('')
  })

  it('transitions the border at the app duration and nothing else', async () => {
    on('panel', <TextField label="نام" value="" onChange={() => {}} />)
    const p = await paint(screen.getByLabelText('نام').className)
    // Ledger L-18 — .16s, the one duration. There is no `duration-*` class for
    // it: `--duration` is the theme's transitionDuration.DEFAULT, which every
    // transition-* utility already carries.
    expect(winner(p, 'transition-property')).toBe('border-color')
    expect(winner(p, 'transition-duration')).toBe('var(--duration)')
  })

  it('fills its container, keeps its padding inside its width, and takes the app leading', async () => {
    // Three classes that look like scaffolding and are each one line away from a
    // visible break: without `w-full` the field is the browser's ~177px default,
    // without `box-border` 100% + 14px + 14px + 1.5px + 1.5px hangs 31px out of
    // its dialog, and without `leading-normal` the line-height falls back to
    // `normal` and the control loses ~9px of height and stops matching Button.
    on('panel', <TextField label="نام" value="" onChange={() => {}} />)
    const p = await paint(screen.getByLabelText('نام').className)
    expect(winner(p, 'width')).toBe('100%')
    expect(winner(p, 'box-sizing')).toBe('border-box')
    expect(winner(p, 'line-height')).toBe('var(--lh-normal)')
  })

  it('lets invalid beat focus, and turns the hint into the error line', async () => {
    // §5.1.5 — invalid wins over focus, so a field that is wrong stays red while
    // it is being fixed rather than looking accepted the moment it is touched.
    on('panel', <TextField label="نام" value="" onChange={() => {}} invalid hint="این نام قبلاً گرفته شده است" />)
    const el = screen.getByLabelText('نام')
    expect(el).toHaveClass('border-conflict', 'focus:border-conflict')
    expect(el).toHaveAttribute('aria-invalid', 'true')
    const hint = screen.getByText('این نام قبلاً گرفته شده است')
    expect(hint).toHaveClass('text-conflict', 'font-semibold')
    expect(el).toHaveAttribute('aria-describedby', hint.id)

    // Both states of the border, because a colour the two share would prove
    // nothing about `invalid` at all.
    const p = await paint(el.className)
    expect(winner(p, 'border-color')).toBe('var(--conflict)')
    expect(winner(p, 'border-color', ':focus')).toBe('var(--conflict)')

    // §4.6 — the error line is 11.5px/600 --conflict under the control.
    const h = await paint(hint.className)
    expect(winner(h, 'font-size')).toBe('var(--fs-xs)')
    expect(winner(h, 'font-weight')).toBe('var(--fw-semibold)')
    expect(winner(h, 'color')).toBe('var(--conflict)')
    expect(winner(h, 'line-height')).toBe('var(--lh-sub)')
    expect(winner(h, 'margin-top')).toBe('var(--space-1)')
  })

  it('keeps a neutral hint neutral', async () => {
    on('panel', <TextField label="نام" value="" onChange={() => {}} hint="نام کامل، همان‌طور که در فیش حقوقی آمده" />)
    const hint = screen.getByText('نام کامل، همان‌طور که در فیش حقوقی آمده')
    expect(hint).toHaveClass('text-faint')
    const h = await paint(hint.className)
    expect(winner(h, 'color')).toBe('var(--text-faint)')
    expect(winner(h, 'font-weight')).toBe('')
  })

  it('sets its value at a fixed 14px on both surfaces, not on the body role', async () => {
    // R1 — the deliverable beats the plan. The plan put this on `text-role-body`,
    // which is 14px on the panel and 15px on the reader; both deliverables were
    // then re-measured and both draw an input at 14px, the reader's own profile
    // fields included. A form control's value is also not body copy. So the
    // field is on a FIXED step and the class is the same one on both surfaces
    // because the size is, not because the surface will change it.
    const { unmount } = on('panel', <TextField label="نام" value="" onChange={() => {}} />)
    const panel = screen.getByLabelText('نام')
    expect(panel).toHaveClass('text-fs-body')
    expect(winner(await paint(panel.className), 'font-size')).toBe('var(--fs-body)')
    unmount()

    on('reader', <TextField label="نام" value="" onChange={() => {}} />)
    const reader = screen.getByLabelText('نام')
    // The attribute roles.css keys its overrides on, on the same node as the
    // context, so geometry and scale cannot disagree — the reader really is the
    // reader here, and the field still resolves to the same fixed token.
    expect(reader.closest('[data-surface]')).toHaveAttribute('data-surface', 'reader')
    expect(winner(await paint(reader.className), 'font-size')).toBe('var(--fs-body)')
    expect(reader.className).not.toMatch(/\btext-role-/)

    // Both ends of the decision, measured rather than asserted: the fixed step
    // is 14px, and the role it is deliberately NOT on is two different numbers.
    expect(tokenLiteral('--fs-body')).toBe('14px')
    expect(readerScaleOf('--role-fs-body')).toEqual({ panel: '14px', reader: '15px' })
  })

  it('takes the same 12px 14px padding on both surfaces', async () => {
    // Measured, not assumed: the reader deliverable's own inputs are
    // `padding:12px 14px`, identical to the panel's (3 uses each). R3 scales
    // where the design scales and nowhere else.
    const { unmount } = on('panel', <TextField label="نام" value="" onChange={() => {}} />)
    const panel = screen.getByLabelText('نام').className
    unmount()
    on('reader', <TextField label="نام" value="" onChange={() => {}} />)
    const reader = screen.getByLabelText('نام').className

    for (const cls of [panel, reader]) {
      const p = await paint(cls)
      expect(winner(p, 'padding-top')).toBe('var(--space-6)')   // 12px
      expect(winner(p, 'padding-left')).toBe('var(--space-7)')  // 14px
    }
    // The label does not scale either — 12.5px in both deliverables.
    expect(screen.getAllByText('نام')[0]).toHaveClass('text-fs-sm2')
  })

  it('labels the control the way the design labels it', async () => {
    // 12.5px/600 --violet, 6px above the control — and the same on both
    // surfaces: neither deliverable labels a field at any other size.
    on('panel', <TextField label="نقش" value="" onChange={() => {}} />)
    const label = screen.getByText('نقش')
    const p = await paint(label.className)
    expect(winner(p, 'font-size')).toBe('var(--fs-sm2)')
    expect(winner(p, 'font-weight')).toBe('var(--fw-semibold)')
    expect(winner(p, 'color')).toBe('var(--violet)')
    expect(winner(p, 'margin-bottom')).toBe('var(--space-3)')
    expect(winner(p, 'display')).toBe('block')
  })

  it('stands on the card ground, and nothing else pins that', async () => {
    // Nothing else in this file names the control's own background, so
    // `bg-card` -> `bg-tile-v2` would turn every field in the product lilac and
    // every other assertion here would still be green.
    on('panel', <TextField label="نام" value="" onChange={() => {}} />)
    const p = await paint(screen.getByLabelText('نام').className)
    expect(winner(p, 'background-color')).toBe('var(--card)')
  })

  it('moves to the sub-panel ground when a screen asks', async () => {
    // §1.2 — the reader's profile block and the panel's tinted dialog sections
    // are `--surface-sub`, and a field welded to `--card` draws a white box on a
    // near-white ground. Task 22 cannot ship without this.
    on('panel', <TextField label="نام" value="" onChange={() => {}} ground="sub" />)
    const p = await paint(screen.getByLabelText('نام').className)
    expect(winner(p, 'background-color')).toBe('var(--surface-sub)')
  })

  it('renders a textarea on the tinted surface when multiline', async () => {
    on('panel', <TextField label="توضیح" value="" onChange={() => {}} multiline rows={5} />)
    const el = screen.getByLabelText('توضیح')
    expect(el.tagName).toBe('TEXTAREA')
    expect(el).toHaveAttribute('rows', '5')
    expect(el).toHaveClass('bg-surface-sub', 'resize-y')

    // §5.2 — the textarea is the one part of the field that falls off the
    // padding ladder: `11px 12px`, which is why --pad-textarea-y exists.
    const p = await paint(el.className)
    expect(winner(p, 'background-color')).toBe('var(--surface-sub)')
    expect(winner(p, 'resize')).toBe('vertical')
    expect(winner(p, 'padding-top')).toBe('var(--pad-textarea-y)')
    expect(winner(p, 'padding-left')).toBe('var(--space-6)')
  })

  it('lets a textarea take the card ground when a screen asks', async () => {
    // The default is the sub-panel because that is where the design always
    // draws a textarea — but the prop is honoured in BOTH branches, so it is a
    // default and not a hard-coding with a different value.
    on('panel', <TextField label="توضیح" value="" onChange={() => {}} multiline ground="card" />)
    const p = await paint(screen.getByLabelText('توضیح').className)
    expect(winner(p, 'background-color')).toBe('var(--card)')
  })

  it('sets a textarea one step down, on the role that scales', async () => {
    // The panel's three dialog textareas are 13px against its 14px inputs, and
    // the reader draws the same relationship — so this one IS a role:
    // --role-fs-dense, 13px panel / 14.5px reader, the ledger's "list, table and
    // hint copy". Two sizes in one dialog is the design being consistent, not
    // drift to normalise away.
    on('panel', <TextField label="توضیح" value="" onChange={() => {}} multiline />)
    const el = screen.getByLabelText('توضیح')
    expect(el).toHaveClass('text-role-dense')
    expect(winner(await paint(el.className), 'font-size')).toBe('var(--role-fs-dense)')
    expect(readerScaleOf('--role-fs-dense')).toEqual({ panel: '13px', reader: '14.5px' })
  })

  it('pins a latin island LTR and sets it in mono', async () => {
    // §8 — usernames, ids and IPs are the only latin runs in an RTL app.
    on('panel', <TextField label="نام کاربری" value="" onChange={() => {}} ltr />)
    const el = screen.getByLabelText('نام کاربری')
    expect(el).toHaveAttribute('dir', 'ltr')
    expect(el).toHaveClass('font-mono')
    expect(winner(await paint(el.className), 'font-family')).toBe('var(--font-mono)')
  })

  it('pins the island in a textarea too, rather than swallowing the prop', async () => {
    // The island is a property of the VALUE, not of the tag that holds it. The
    // first cut applied `ltr` to the input branch only and discarded it on the
    // other — accepted, type-checked, and silently dropped, which is worse than
    // rejecting it, because the caller has no way to find out.
    on('panel', <TextField label="نام کاربری" value="" onChange={() => {}} multiline ltr />)
    const el = screen.getByLabelText('نام کاربری')
    expect(el.tagName).toBe('TEXTAREA')
    expect(el).toHaveAttribute('dir', 'ltr')
    expect(winner(await paint(el.className), 'font-family')).toBe('var(--font-mono)')
  })

  it('does not pin dir on an ordinary field', () => {
    on('panel', <TextField label="نام" value="" onChange={() => {}} />)
    expect(screen.getByLabelText('نام')).not.toHaveAttribute('dir')
  })

  it('does not pin dir on an ordinary textarea either', () => {
    on('panel', <TextField label="توضیح" value="" onChange={() => {}} multiline />)
    expect(screen.getByLabelText('توضیح')).not.toHaveAttribute('dir')
  })

  it('fades when disabled and stops being a pointer target', async () => {
    on('panel', <TextField label="نام" value="" onChange={() => {}} disabled />)
    const el = screen.getByLabelText('نام')
    expect(el).toBeDisabled()
    // §4.6 — "disabled keeps its surface and fades"; asserted against BOTH
    // states, because a value the two share proves nothing about `disabled`.
    const p = await paint(el.className)
    expect(winner(p, 'opacity', ':disabled')).toBe('0.6')
    expect(winner(p, 'opacity')).toBe('')
    expect(winner(p, 'cursor', ':disabled')).toBe('default')
  })
})

describe('PasswordField', () => {
  it('hides the value until the reveal is pressed, and says which state it is in', () => {
    on('panel', <PasswordField label="گذرواژهٔ فعلی" value="hunter2" onChange={() => {}} />)
    expect(screen.getByLabelText('گذرواژهٔ فعلی')).toHaveAttribute('type', 'password')
    expect(screen.getByRole('button', { name: 'نمایش گذرواژه' })).toHaveAttribute('aria-pressed', 'false')
  })

  it('reveals and re-hides', async () => {
    on('panel', <PasswordField label="گذرواژهٔ فعلی" value="hunter2" onChange={() => {}} />)
    await userEvent.click(screen.getByRole('button', { name: 'نمایش گذرواژه' }))
    expect(screen.getByLabelText('گذرواژهٔ فعلی')).toHaveAttribute('type', 'text')
    const hide = screen.getByRole('button', { name: 'پنهان کردن گذرواژه' })
    expect(hide).toHaveAttribute('aria-pressed', 'true')
    await userEvent.click(hide)
    expect(screen.getByLabelText('گذرواژهٔ فعلی')).toHaveAttribute('type', 'password')
  })

  it('shows the struck eye only while the value is showing', async () => {
    // aria-pressed and the label carry the state for everyone who is not
    // looking at it, so swapping the two glyphs misleads sighted users ONLY —
    // and no assertion about the accessible name can see it. The strike is the
    // whole difference between the two paths, so it is what gets asserted.
    on('panel', <PasswordField label="گذرواژه" value="hunter2" onChange={() => {}} />)
    const struck = (b: HTMLElement) =>
      [...b.querySelectorAll('path')].some((n) => n.getAttribute('d') === 'M3 3l18 18')

    const show = screen.getByRole('button', { name: 'نمایش گذرواژه' })
    expect(struck(show)).toBe(false)
    await userEvent.click(show)
    const hide = screen.getByRole('button', { name: 'پنهان کردن گذرواژه' })
    expect(struck(hide)).toBe(true)
  })

  it('reserves the inline-start room the reveal button occupies', async () => {
    // §5.2 — 46px of padding-inline-start for a 32x32 button. The 46 is
    // 8 + 32 + 6: the button's inset, the button, and the gap to the value. It
    // can only be the button's own edge, which is what the second half asserts.
    on('panel', <PasswordField label="گذرواژه" value="" onChange={() => {}} />)
    const el = screen.getByLabelText('گذرواژه')
    expect(el).toHaveClass('ps-reveal')
    const p = await paint(el.className)
    expect(winner(p, 'padding-inline-start')).toBe('var(--pad-reveal)')
    // The reserved edge must not be undone by a physical px-* landing after it
    // — in RTL both resolve to padding-right and Tailwind's output order, not
    // the class string's, decides which wins. So there is no padding-right.
    expect(winner(p, 'padding-right')).toBe('')
    expect(winner(p, 'padding-inline-end')).toBe('var(--space-7)')

    // …and the button is ON that edge. This is the assertion this file did not
    // have: the room was reserved at the inline start while the button was
    // pinned to the inline end, and the two separate assertions that pinned
    // each side were both green while the eye sat over the last 25px of the
    // value and 46px of empty room sat on the other side of the field.
    const reserved = reservedEdge(p)
    expect(reserved).toBe('start')
    const pin = await inlinePin(screen.getByRole('button', { name: 'نمایش گذرواژه' }))
    expect(pin?.edge).toBe(reserved)
  })

  it('draws the reveal button the design draws', async () => {
    on('panel', <PasswordField label="گذرواژه" value="" onChange={() => {}} />)
    const b = screen.getByRole('button', { name: 'نمایش گذرواژه' })
    const p = await paint(b.className)
    // 32x32, radius 8 (the ladder runs 7 -> 9, so --radius-reveal exists),
    // transparent, --text-muted.
    expect(winner(p, 'width')).toBe('var(--size-reveal)')
    expect(winner(p, 'height')).toBe('var(--size-reveal)')
    expect(winner(p, 'border-radius')).toBe('var(--radius-reveal)')
    expect(winner(p, 'color')).toBe('var(--text-muted)')
    expect(winner(p, 'background-color', ':hover')).toBe('var(--tile-v2)')
    expect(winner(p, 'color', ':hover')).toBe('var(--violet)')

    // The pin, on whichever box carries it: 8px from the inline start and
    // centred on the control's own axis. Without the centring the eye jumps to
    // the top edge of the field and sits half over the border.
    const pin = await inlinePin(b)
    const q = await paint(pin!.el.className)
    expect(winner(q, 'inset-inline-start')).toBe('var(--space-4)')
    expect(winner(q, 'inset-inline-end')).toBe('')
    expect(winner(q, 'left')).toBe('')
    expect(winner(q, 'top')).toBe('50%')
    expect(winner(q, '--tw-translate-y')).toBe('-50%')

    const glyph = b.querySelector('svg')!
    const g = await paint(glyph.getAttribute('class') ?? '')
    expect(winner(g, 'width')).toBe('var(--size-reveal-glyph)')
    expect(winner(g, 'height')).toBe('var(--size-reveal-glyph)')
  })

  it('gives the 32px reveal the 44px hit area F11 asks for', () => {
    // The plan's one rule for every rung of the design's 30/32/34/36/40/42
    // ladder, which supersedes any per-task treatment: the DRAWN control keeps
    // the design's size and a transparent `::before` grows the TARGET to 44.
    // 32 + 2x6, the same arithmetic src/ui/Overlay.tsx's close control does.
    // The shared helper measures it rather than pattern-matching one literal,
    // so a 5px inset copied off the 34px pager button is caught here.
    on('panel', <PasswordField label="گذرواژه" value="" onChange={() => {}} />)
    expectExpandedHitArea(screen.getByRole('button', { name: 'نمایش گذرواژه' }))
  })

  it('carries the design placeholder, and lets a screen draw its own', () => {
    // The reader draws eight bullets; the panel draws Persian copy. Task 21 had
    // no way to reach the second.
    const { unmount } = on('panel', <PasswordField label="گذرواژه" value="" onChange={() => {}} />)
    expect(screen.getByLabelText('گذرواژه')).toHaveAttribute('placeholder', '••••••••')
    unmount()
    on('panel', <PasswordField label="گذرواژه" value="" onChange={() => {}} placeholder="گذرواژهٔ فعلی" />)
    expect(screen.getByLabelText('گذرواژه')).toHaveAttribute('placeholder', 'گذرواژهٔ فعلی')
  })

  it('stands on the card ground, and moves to the sub-panel one when asked', async () => {
    const { unmount } = on('panel', <PasswordField label="گذرواژه" value="" onChange={() => {}} />)
    expect(winner(await paint(screen.getByLabelText('گذرواژه').className), 'background-color'))
      .toBe('var(--card)')
    unmount()
    // R3 — the reader's profile draws its password trio on the sub-panel skin.
    on('reader', <PasswordField label="گذرواژه" value="" onChange={() => {}} ground="sub" />)
    expect(winner(await paint(screen.getByLabelText('گذرواژه').className), 'background-color'))
      .toBe('var(--surface-sub)')
  })

  it('wears the same frame and the same error line as TextField', async () => {
    on('panel', <PasswordField label="گذرواژه" value="" onChange={() => {}} invalid hint="گذرواژه کوتاه است" />)
    const el = screen.getByLabelText('گذرواژه')
    expect(el).toHaveAttribute('aria-invalid', 'true')
    const hint = screen.getByText('گذرواژه کوتاه است')
    expect(el).toHaveAttribute('aria-describedby', hint.id)
    const p = await paint(el.className)
    expect(winner(p, 'border-color')).toBe('var(--conflict)')
    expect(winner(p, 'border-color', ':focus')).toBe('var(--conflict)')
    expect(winner(p, 'font-size')).toBe('var(--fs-body)')
    expect(winner(p, 'width')).toBe('100%')
    expect(winner(p, 'box-sizing')).toBe('border-box')
    expect(winner(p, 'line-height')).toBe('var(--lh-normal)')
    expect(winner(await paint(hint.className), 'color')).toBe('var(--conflict)')
  })
})
