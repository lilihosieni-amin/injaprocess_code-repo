import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MemoryRouter, Routes, Route } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { readFileSync } from 'node:fs'
import { join, dirname, resolve } from 'node:path'
import { SurfaceProvider, useSurface } from './surface'
import { AppShell } from '../shell/AppShell'
import type { Capability, SessionDescriptor } from '../auth/session'

afterEach(() => vi.restoreAllMocks())

function Probe() {
  return <span data-testid="surface">{useSurface()}</span>
}

describe('R3 — the scale layer', () => {
  it('reports the surface it was given', () => {
    render(<SurfaceProvider surface="reader"><Probe /></SurfaceProvider>)
    expect(screen.getByTestId('surface').textContent).toBe('reader')
  })

  it('is panel outside a provider, so nothing renders at the wrong scale by accident', () => {
    render(<Probe />)
    expect(screen.getByTestId('surface').textContent).toBe('panel')
  })

  it('marks the tree so CSS can scale it without a prop reaching every component', () => {
    const { container } = render(<SurfaceProvider surface="reader"><Probe /></SurfaceProvider>)
    expect(container.querySelector('[data-surface="reader"]')).not.toBeNull()
    expect(container.querySelector('[data-surface="panel"]')).toBeNull()
  })

  it('puts the attribute and the context on one node, so they cannot disagree', () => {
    // The whole point of the wrapper. If the attribute said `reader` while the
    // context said `panel`, half the component would scale and half would not —
    // and every test that renders one of the two alone would still be green.
    const { container } = render(
      <SurfaceProvider surface="panel"><Probe /></SurfaceProvider>,
    )
    const node = container.querySelector('[data-surface]')
    expect(node?.getAttribute('data-surface')).toBe('panel')
    expect(node?.querySelector('[data-testid="surface"]')?.textContent).toBe('panel')
  })

  it('adds no box: the wrapper is display:contents', () => {
    const { container } = render(<SurfaceProvider surface="panel"><Probe /></SurfaceProvider>)
    expect(container.querySelector('[data-surface]')?.className).toBe('contents')
  })
})

describe('R3 — the surface is chosen where the shell is', () => {
  function session(capabilities: Capability[]): SessionDescriptor {
    return {
      username: '09123456789', displayName: 'سحر بیات', role: 'reader',
      capabilities, scopes: ['dept:dining'], supervisor: '09120000000',
      canSupervise: false, pendingApprovals: 0,
    }
  }

  function renderApp(capabilities: Capability[]) {
    vi.spyOn(globalThis, 'fetch').mockImplementation(() =>
      Promise.resolve(
        new Response('[]', { status: 200, headers: { 'Content-Type': 'application/json' } }),
      ),
    )
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    return render(
      <QueryClientProvider client={qc}>
        <MemoryRouter initialEntries={['/']}>
          <Routes>
            <Route element={<AppShell session={session(capabilities)} />}>
              <Route path="/" element={<Probe />} />
            </Route>
          </Routes>
        </MemoryRouter>
      </QueryClientProvider>,
    )
  }

  it('scales a reader session at reader size', () => {
    const { container } = renderApp(['view', 'comment', 'export_pdf'])
    expect(screen.getByTestId('surface').textContent).toBe('reader')
    expect(container.querySelector('[data-surface="reader"]')).not.toBeNull()
  })

  it('scales a panel session at panel size', () => {
    const { container } = renderApp(['view', 'comment', 'edit'])
    expect(screen.getByTestId('surface').textContent).toBe('panel')
    expect(container.querySelector('[data-surface="panel"]')).not.toBeNull()
  })

  it('never disagrees with the shell it drew', () => {
    // data-shell is F8's type density and ships already; data-surface is R3's
    // geometry and is new. They are chosen from one call to selectShell, so a
    // reader shell can never be drawn at panel scale — the exact failure a
    // second, independent decision would eventually produce.
    for (const caps of [
      ['view'], ['view', 'comment', 'export_pdf'],
      ['view', 'edit'], ['view', 'manage_users'], ['view', 'view_audit'],
    ] as Capability[][]) {
      const { container, unmount } = renderApp(caps)
      const shell = container.querySelector('[data-shell]')?.getAttribute('data-shell')
      const surface = container.querySelector('[data-surface]')?.getAttribute('data-surface')
      expect(surface).toBe(shell)
      unmount()
    }
  })
})

/* ------------------------------------------------------------------------- */

const UI = process.cwd()
const ROLES_PATH = join(UI, 'src/styles/roles.css')
const roles = readFileSync(ROLES_PATH, 'utf8')

/** The body of one top-level rule in roles.css, selected by its own selector. */
function blockOf(selector: string): string {
  return new RegExp(`^${selector}\\s*\\{([^}]*)\\}`, 'm').exec(roles)?.[1] ?? ''
}

const rootBlock = blockOf(':root')
const readerBlock = blockOf("\\[data-surface='reader'\\]")

/** `--role-x: var(--token);` -> the declared value, '' when the block omits it. */
function declared(block: string, name: string): string {
  return new RegExp(`(?<![-\\w])${name}\\s*:\\s*([^;]+);`).exec(block)?.[1].trim() ?? ''
}

/** Every `--role-*` name a block declares, in source order. */
function names(block: string): string[] {
  return [...block.matchAll(/^\s*(--role-[a-z0-9-]+)\s*:/gm)].map((m) => m[1])
}

/**
 * Every token the app can see, resolved to the literal it ends at, so the two
 * scales are compared as NUMBERS and not as two spellings of a var().
 */
const tokenValues = (() => {
  const entry = join(UI, 'src/styles/tokens.css')
  const src = readFileSync(entry, 'utf8')
  const files = [
    ...[...src.matchAll(/@import\s+'([^']+)'/g)].map((m) => resolve(dirname(entry), m[1])),
    entry,
  ]
  const values = new Map<string, string>()
  for (const f of files) {
    for (const m of readFileSync(f, 'utf8').matchAll(/(--[a-z0-9-]+)\s*:\s*([^;{}]+)/g)) {
      values.set(m[1], m[2].trim())
    }
  }
  return values
})()

function literal(value: string): string {
  let v = value.trim()
  for (let hop = 0; hop < 8; hop++) {
    const m = /^var\((--[a-z0-9-]+)\)$/.exec(v)
    if (!m) return v
    const next = tokenValues.get(m[1])
    if (next === undefined) return ''
    v = next
  }
  return ''
}

/**
 * R3's table. Every row is a value the two surfaces genuinely DIFFER on — that
 * is the whole point of the layer, and a row whose two sides agreed would let a
 * `useSurface()` pinned to one constant pass.
 */
const SCALE: { role: string; panel: string; reader: string; panelPx: string; readerPx: string }[] = [
  { role: '--role-column', panel: 'var(--width-list)', reader: 'var(--width-reader)', panelPx: '920px', readerPx: '720px' },
  { role: '--role-pad-x', panel: 'var(--pad-screen-x)', reader: 'var(--pad-reader-x)', panelPx: '40px', readerPx: '24px' },
  { role: '--role-pad-bottom', panel: 'var(--pad-screen-y)', reader: 'var(--pad-reader-bottom)', panelPx: '30px', readerPx: '60px' },
  { role: '--role-dept-gap', panel: 'var(--space-9)', reader: 'var(--space-7)', panelPx: '18px', readerPx: '14px' },
  { role: '--role-tile', panel: 'var(--size-tile)', reader: 'var(--size-tile-reader)', panelPx: '48px', readerPx: '54px' },
  { role: '--role-tile-radius', panel: 'var(--radius-tile)', reader: 'var(--radius-card)', panelPx: '14px', readerPx: '16px' },
  { role: '--role-tile-glyph', panel: 'var(--size-glyph)', reader: 'var(--size-glyph-reader)', panelPx: '24px', readerPx: '26px' },
  { role: '--role-fs-title', panel: 'var(--fs-h2)', reader: 'var(--fs-h1-reader-list)', panelPx: '22px', readerPx: '30px' },
  { role: '--role-fs-hero', panel: 'var(--fs-display)', reader: 'var(--fs-h1-reader-home)', panelPx: '34px', readerPx: '26px' },
  { role: '--role-fs-body', panel: 'var(--fs-body)', reader: 'var(--fs-body-reader)', panelPx: '14px', readerPx: '15px' },
  // Owner ruling R12 removed --role-fs-dense from this table: a matched-element
  // comparison over 70 pairs found the reader draws the panel's five 13px
  // elements at 13px x3 and 13.5px x2 and at 14.5px never, so it is one size on
  // both surfaces and no longer a row. --role-fs-textarea is the row that
  // carries the real per-surface difference the dense role was standing in for:
  // a panel textarea is one step BELOW its 14px input, a reader textarea one
  // step above it.
  { role: '--role-fs-textarea', panel: 'var(--fs-sm)', reader: 'var(--fs-doc-body)', panelPx: '13px', readerPx: '16px' },
  { role: '--role-iconbtn', panel: 'var(--size-iconbtn)', reader: 'var(--size-iconbtn-reader)', panelPx: '40px', readerPx: '42px' },
  { role: '--role-fab', panel: 'var(--size-fab)', reader: 'var(--size-fab-reader)', panelPx: '52px', readerPx: '56px' },
]

describe('R3 — the two scales differ where the ruling says they differ', () => {
  it('reads two real blocks out of roles.css, so nothing below passes vacuously', () => {
    // Every assertion in this describe reads one of the two blocks. If the
    // regex missed — a renamed selector, a comment with a brace in it — both
    // would be '' and a `.toBe('')` table would sail through.
    expect(declared(rootBlock, '--role-field')).toBe('var(--ink)')
    expect(readerBlock.trim().length).toBeGreaterThan(0)
    expect(names(readerBlock).length).toBeGreaterThan(0)
    expect(literal('var(--width-list)')).toBe('920px')
    expect(literal('var(--nonesuch)')).toBe('')
  })

  it('gives the panel every row of the table, on :root', () => {
    const wrong = SCALE.filter((r) => declared(rootBlock, r.role) !== r.panel)
    expect(wrong.map((r) => `${r.role}: ${declared(rootBlock, r.role)} (want ${r.panel})`)).toEqual([])
  })

  it('overrides exactly the rows of R3’s table, and nothing else', () => {
    const wrong = SCALE.filter((r) => declared(readerBlock, r.role) !== r.reader)
    expect(wrong.map((r) => `${r.role}: ${declared(readerBlock, r.role)} (want ${r.reader})`)).toEqual([])
    expect(names(readerBlock).sort()).toEqual(SCALE.map((r) => r.role).sort())
  })

  it('resolves each row to the two different numbers the design gives', () => {
    const wrong = SCALE.filter(
      (r) =>
        literal(declared(rootBlock, r.role)) !== r.panelPx ||
        literal(declared(readerBlock, r.role)) !== r.readerPx,
    )
    expect(
      wrong.map(
        (r) =>
          `${r.role}: panel ${literal(declared(rootBlock, r.role))} / reader ` +
          `${literal(declared(readerBlock, r.role))} (want ${r.panelPx} / ${r.readerPx})`,
      ),
    ).toEqual([])
  })

  it('makes every row a real difference — a row the two surfaces share proves nothing', () => {
    const same = SCALE.filter((r) => r.panelPx === r.readerPx || r.panel === r.reader)
    expect(same.map((r) => r.role)).toEqual([])
    // Still 13, and it stayed 13 by a swap rather than by standing still: R12
    // took --role-fs-dense out and the minting pass put --role-fs-textarea in.
    expect(SCALE).toHaveLength(13)
  })

  it('leaves the padding the two surfaces share on :root alone', () => {
    // R3 gives both surfaces a 30px top pad. It belongs to the shared half, so
    // it is declared once and must NOT appear in the reader block — an override
    // there would be a second place to keep a shared value in step.
    expect(declared(rootBlock, '--role-pad-y')).toBe('var(--pad-screen-y)')
    expect(literal(declared(rootBlock, '--role-pad-y'))).toBe('30px')
    expect(declared(readerBlock, '--role-pad-y')).toBe('')
  })

  it('shares every foundation — the reader block redefines no colour, shadow or motion', () => {
    const shared = readerBlock.match(
      /--role-(field|canvas|surface|scrim|focus|hover|shadow|lift|duration|border|ink|link|primary|new|confirmed|danger|awaiting|info|dead|title-on|subtitle-on|eyebrow|radius-|fw-|lh-|tracking-)[a-z0-9-]*\s*:/g,
    )
    expect(shared).toBeNull()
  })
})
