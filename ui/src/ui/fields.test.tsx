import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import postcss from 'postcss'
import tailwind from 'tailwindcss'
import config from '../../tailwind.config.js'
import type { ReactNode } from 'react'
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

   The helpers are a deliberate copy of primitives.design.test.tsx's, which
   exports nothing; duplicating thirty lines is cheaper than making one test
   file import another.
   ------------------------------------------------------------------------- */

type Painted = { klass: string; state: string; media: string; decls: string }

/** Compile a class string through the real theme. */
async function paint(classNames: string): Promise<Painted[]> {
  const classes = [...new Set(classNames.split(/\s+/).filter(Boolean))]
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
 * What one `--role-*` property resolves to on each surface, read out of
 * src/styles/roles.css and src/styles/tokens.css.
 *
 * R3 scales the field's type in CSS, not in a branch, so both surfaces wear
 * the same class and asserting the class name proves nothing about scaling.
 * This is the half that does: the role behind the class has to be two
 * different numbers.
 */
function readerScaleOf(role: string): { panel: string; reader: string } {
  const roles = readFileSync(resolve(process.cwd(), 'src/styles/roles.css'), 'utf8')
  const block = (selector: string) => new RegExp(`${selector}\\s*\\{([^}]*)\\}`).exec(roles)?.[1] ?? ''
  const target = (body: string) =>
    new RegExp(`(?<![-\\w])${role}\\s*:\\s*var\\((--[a-z0-9-]+)\\)`).exec(body)?.[1] ?? ''

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
  const literal = (token: string) => values.get(token) ?? ''
  return {
    panel: literal(target(block(':root'))),
    reader: literal(target(block("\\[data-surface='reader'\\]"))),
  }
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
    expect(el.className).not.toMatch(/\bring-|\boutline-\[/)

    // §4.3 / §4.6 — the border IS the state machine: 1.5px --line at rest,
    // --coral on focus, and no ring, glow or outline anywhere near it.
    const p = await paint(el.className)
    expect(winner(p, 'border-width')).toBe('var(--border-hairline)')
    expect(winner(p, 'border-color')).toBe('var(--line)')
    expect(winner(p, 'border-color', ':focus')).toBe('var(--coral)')
    expect(winner(p, 'box-shadow')).toBe('')
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

  it('reads at 14px in the panel and 15px in the reader', async () => {
    // R3 — the only thing that moves between the two surfaces is the type
    // size, and roles.css is where it moves (ledger L-41: one semantic layer).
    // So the class is the SAME on both surfaces and the role behind it is not.
    const { unmount } = on('panel', <TextField label="نام" value="" onChange={() => {}} />)
    const panel = screen.getByLabelText('نام')
    expect(panel).toHaveClass('text-role-body')
    expect(winner(await paint(panel.className), 'font-size')).toBe('var(--role-fs-body)')
    unmount()

    on('reader', <TextField label="نام" value="" onChange={() => {}} />)
    const reader = screen.getByLabelText('نام')
    expect(reader).toHaveClass('text-role-body')
    // The attribute roles.css keys the override on, on the same node as the
    // context, so geometry and scale cannot disagree.
    expect(reader.closest('[data-surface]')).toHaveAttribute('data-surface', 'reader')
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

  it('pins a latin island LTR and sets it in mono', async () => {
    // §8 — usernames, ids and IPs are the only latin runs in an RTL app.
    on('panel', <TextField label="نام کاربری" value="" onChange={() => {}} ltr />)
    const el = screen.getByLabelText('نام کاربری')
    expect(el).toHaveAttribute('dir', 'ltr')
    expect(el).toHaveClass('font-mono')
    expect(winner(await paint(el.className), 'font-family')).toBe('var(--font-mono)')
  })

  it('does not pin dir on an ordinary field', () => {
    on('panel', <TextField label="نام" value="" onChange={() => {}} />)
    expect(screen.getByLabelText('نام')).not.toHaveAttribute('dir')
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

  it('reserves the inline-start room the reveal button occupies', async () => {
    // §5.2 — 46px of padding-inline-start for a 32x32 button pinned at left:8px.
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
  })

  it('draws the reveal button the design draws', async () => {
    on('panel', <PasswordField label="گذرواژه" value="" onChange={() => {}} />)
    const b = screen.getByRole('button', { name: 'نمایش گذرواژه' })
    const p = await paint(b.className)
    // 32x32, radius 8 (the ladder runs 7 -> 9, so --radius-reveal exists),
    // transparent, --text-muted, at the inline END — the design writes it as
    // `left:8px`, which is the same edge in an app whose html is direction:rtl.
    expect(winner(p, 'width')).toBe('var(--size-reveal)')
    expect(winner(p, 'height')).toBe('var(--size-reveal)')
    expect(winner(p, 'border-radius')).toBe('var(--radius-reveal)')
    expect(winner(p, 'inset-inline-end')).toBe('var(--space-4)')
    expect(winner(p, 'color')).toBe('var(--text-muted)')
    expect(winner(p, 'background-color', ':hover')).toBe('var(--tile-v2)')
    expect(winner(p, 'color', ':hover')).toBe('var(--violet)')
    expect(winner(p, 'left')).toBe('')

    const glyph = b.querySelector('svg')!
    const g = await paint(glyph.getAttribute('class') ?? '')
    expect(winner(g, 'width')).toBe('var(--size-reveal-glyph)')
    expect(winner(g, 'height')).toBe('var(--size-reveal-glyph)')
  })

  it('carries the design placeholder', () => {
    on('panel', <PasswordField label="گذرواژه" value="" onChange={() => {}} />)
    expect(screen.getByLabelText('گذرواژه')).toHaveAttribute('placeholder', '••••••••')
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
    expect(winner(p, 'font-size')).toBe('var(--role-fs-body)')
    expect(winner(await paint(hint.className), 'color')).toBe('var(--conflict)')
  })
})
