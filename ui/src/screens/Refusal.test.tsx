import { describe, it, expect } from 'vitest'
import { render, screen, cleanup } from '@testing-library/react'
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { RefusalScreen } from './Refusal'
import { LoadFailedScreen } from '../ui/states'
import { appRoutes } from '../routes'

/** R5 — «Never draw what you would refuse.»
 *
 *  The rule has two halves and they pull in opposite directions, which is why
 *  both are pinned here rather than assumed:
 *
 *  1. The refusal surfaces **stay**. A person can type a URL, and `access.requires`
 *     answers 404 out of scope and 403 for a refused action on a visible resource.
 *     Those two must stay distinct — collapsing them would either leak the
 *     existence of something out of scope, or hide that a visible thing was
 *     refused.
 *  2. **Nothing inside the app may navigate to one.** A refusal reached by a
 *     typed URL is correct; a refusal reached by clicking is a bug in the screen
 *     that drew the control.
 *
 *  Half 2 cannot be proved by rendering, because it is a claim about every
 *  control on every screen. What *can* be proved, and is what actually goes
 *  wrong, is that the refusal is never a **destination**: no route resolves to
 *  it, and no component renders it from anything but a server answer.
 */

describe('the two refusals stay distinct', () => {
  it('404 says nothing about what might exist', () => {
    render(<RefusalScreen status={404} />)
    expect(screen.getByText('چیزی اینجا نیست')).toBeInTheDocument()
    expect(screen.queryByText('اجازهٔ این کار را ندارید')).not.toBeInTheDocument()
  })

  it('403 names the act, not the resource', () => {
    render(<RefusalScreen status={403} />)
    expect(screen.getByText('اجازهٔ این کار را ندارید')).toBeInTheDocument()
    expect(screen.queryByText('چیزی اینجا نیست')).not.toBeInTheDocument()
  })

  it('stands in the same slot as a failed read, at the same width and gutters', () => {
    // P10 — `LoadFailedScreen` documents itself as "laid out like RefusalScreen"
    // and then used a different width and a different gutter. A failed read and
    // a refused read land in the same place; they may not land at two sizes.
    const { container } = render(<RefusalScreen status={404} />)
    const wrap = container.firstElementChild!
    expect(wrap.className).toContain('py-screen-y')
    expect(wrap.className).toContain('px-screen-x')
    expect(wrap.firstElementChild!.className).toContain('max-w-list')
  })

  it('paints the violet field itself, as every other screen root does', () => {
    // Not in the task brief, and the brief's own browser check asserts it:
    // `expect(getComputedStyle([data-screen]).backgroundColor).toBe(FIELD)`.
    // This root declared no background at all, so that assertion reads
    // `rgba(0, 0, 0, 0)` and fails. It LOOKS right in a browser only because
    // `[data-shell]` two ancestors up is `bg-ink` and the transparency lets it
    // through — which is exactly the accident `Users.tsx` and `Visibility.tsx`
    // do not rely on: both write `bg-ink` on their own `[data-screen]`, and the
    // harness grades the field off that element and no other.
    const { container } = render(<RefusalScreen status={404} />)
    expect(container.firstElementChild!.className).toContain('bg-ink')
  })

  it('is the same wrapper as a failed read, string for string', () => {
    // The three assertions above name three classes, so P10's claim — "a failed
    // read and a refused read stand in the same slot" — has to be re-made by
    // hand every time either wrapper grows a fourth. That is how these two came
    // apart in the first place: `LoadFailedScreen`'s docstring said "laid out
    // like RefusalScreen" while it used a different width AND a different
    // gutter, and every assertion either file had still passed.
    //
    // So the strings are compared instead, as sets. `data-screen` and
    // `data-col` are attributes rather than classes and are deliberately not
    // part of this: the refusal is a destination a typed URL can land on and is
    // measured by a browser; a failed read is a state any screen can enter.
    const refusal = render(<RefusalScreen status={404} />).container.firstElementChild!.className
    cleanup()
    const failed = render(
      <LoadFailedScreen message="نشد" error={null} onRetry={() => {}} />,
    ).container.firstElementChild!.className
    const set = (s: string) => [...new Set(s.split(/\s+/).filter(Boolean))].sort()
    expect(set(refusal)).toEqual(set(failed))
  })
})

describe('nothing in the app leads here', () => {
  it('is not a destination: no route resolves to it', () => {
    const flat = (rs: typeof appRoutes): string[] =>
      rs.flatMap((r) => [String(r.path ?? ''), ...flat(r.children ?? [])])
    const paths = flat(appRoutes)
    expect(paths).not.toContain('/403')
    expect(paths).not.toContain('/404')
    expect(paths).not.toContain('/denied')
    expect(paths).not.toContain('/forbidden')
    // `join(process.cwd(), …)` and not `new URL('../routes.tsx',
    // import.meta.url)`: the jsdom environment installs its own `URL`
    // constructor as the global, so the object `new URL` builds here is not the
    // one `node:fs` recognises and readFileSync rejects it outright — "must be
    // of type string or an instance of Buffer or URL. Received an instance of
    // URL". Every entry point runs from `ui/`, which is what the scan below
    // relies on too.
    const src = readFileSync(join(process.cwd(), 'src', 'routes.tsx'), 'utf8')
    expect(src).not.toMatch(/RefusalScreen/)
  })

  it('is rendered only from an answer the server gave, never from a click', () => {
    // Every consumer must reach it through `refusalStatus(error)` — the one
    // place the status→surface mapping lives — with one declared exception.
    const SRC = join(process.cwd(), 'src')
    const walk = (d: string, out: string[] = []): string[] => {
      for (const n of readdirSync(d)) {
        const p = join(d, n)
        if (statSync(p).isDirectory()) walk(p, out)
        else if (/\.tsx?$/.test(n) && !/\.test\.tsx?$/.test(n)) out.push(p)
      }
      return out
    }
    /** `Visibility.tsx` renders 403 from `administrationRefusal(session)` rather
     *  than from a response, and that is correct: `/visibility` is drawn in the
     *  chrome only for a holder of `set_visibility`, so the only way to arrive
     *  without it is to type the URL — which is precisely the case R5 keeps the
     *  surface for. The screen states the refusal locally instead of firing a
     *  request it knows will be refused. */
    const DECLARED = ['screens/Refusal.tsx', 'screens/Visibility.tsx']
    const offenders = walk(SRC)
      .filter((p) => !DECLARED.some((d) => p.endsWith(d)))
      .filter((p) => {
        const s = readFileSync(p, 'utf8')
        return s.includes('<RefusalScreen') && !s.includes('refusalStatus(')
      })
    expect(offenders).toEqual([])
    // The scan above compares a derived list to `[]`, so it also passes over a
    // walk that found nothing at all — a renamed component, a moved directory,
    // a `walk` that silently stopped recursing. This states that the set it
    // ranged over is the real one and holds the consumers it is there to judge.
    const consumers = walk(SRC).filter((p) => readFileSync(p, 'utf8').includes('<RefusalScreen'))
    expect(consumers.length).toBeGreaterThan(3)
  })

  it('offers no way out of itself', () => {
    // A «برگرد به خانه» button here would be a control on a refusal surface, and
    // the 404's copy is pinned whole in errors.test.tsx for the harder reason:
    // any sentence added to it has to be argued for.
    const { container } = render(<RefusalScreen status={404} />)
    expect(container.querySelectorAll('button, a')).toHaveLength(0)
    expect(container.textContent).toBe('چیزی اینجا نیستنشانی را بررسی کنید یا به خانه برگردید.')
  })

  it('offers no way out of the 403 either', () => {
    // Not in the task brief, which pins the control count on the 404 alone. The
    // two states are separate components — a «تماس با سرپرست» link added to
    // `DeniedState` would pass every assertion above, and a refused person
    // pressing a control that fires a second refused request is the exact shape
    // R5 names. The copy is left to states.test.tsx; this is the affordance
    // count only.
    const { container } = render(<RefusalScreen status={403} />)
    expect(container.querySelectorAll('button, a')).toHaveLength(0)
  })
})
