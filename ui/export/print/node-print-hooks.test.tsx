import { describe, it, expect } from 'vitest'
import { render } from '@testing-library/react'
import { ReactFlowProvider } from '@xyflow/react'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { ActivityNode } from '../../src/flow/nodes/ActivityNode'
import type { ProcNode } from '../../src/api/types'

const HERE = dirname(fileURLToPath(import.meta.url))
const UI = dirname(dirname(HERE))
const PRINT_CSS = readFileSync(join(HERE, 'print.css'), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '')
const TAILWIND = readFileSync(join(UI, 'tailwind.config.js'), 'utf8')

/** The wording the reader sees on screen, byte for byte. A print rule that leaked
 *  onto the screen, or a component that started rendering the id everywhere, would
 *  change this — which is the one regression these hooks could cause. */
const CLICK_WORDING = 'زیرفرآیند — برای ورود کلیک کنید'

const SUB = 'cooking-014'
const act = {
  id: 'cooking-001-n010', type: 'activity', label: 'ثبت درخواست', description: '', actor: 'کارپرداز',
  icom: { inputs: [], controls: [], outputs: [], mechanisms: [] }, subprocess: SUB,
  position: { x: 0, y: 0 }, layout: 'auto', source: { created_by: 'x', touched_by: [] },
} as unknown as ProcNode

function node(hasSub: boolean) {
  return render(
    <ReactFlowProvider>
      <ActivityNode
        id="cooking-001-n010" data={{ node: act, conflicts: 0, hasSub }} selected={false}
        type="activity" dragging={false} zIndex={0} isConnectable
        positionAbsoluteX={0} positionAbsoluteY={0} deletable draggable selectable
      />
    </ReactFlowProvider> as never,
  ).container
}

// The printed node is the app's node: `PrintDiagrams` copies the live node's
// `innerHTML` into a `<foreignObject>`. So anything print wants to say about a
// node has to be reachable from that markup — which means a stable hook on the
// element, not a guess at which Tailwind utility happens to be on it today.
describe('the app’s node carries the hooks the print stylesheet targets', () => {
  it('marks the label with an appearance-neutral attribute', () => {
    const label = node(false).querySelector('[data-node-label]') as HTMLElement
    expect(label).not.toBeNull()
    expect(label.textContent).toBe('ثبت درخواست')
    // appearance-neutral: the hook adds no colour, no box and no inline style, so
    // the same element renders identically on screen before and after it was added
    expect(label.getAttribute('style')).toBeNull()
    expect(label.className).not.toMatch(/\bbg-|\brounded|\bp[xy]?-|\bborder/)
  })

  it('renders the subprocess id beside the click wording, not instead of it', () => {
    const c = node(true)
    const cta = c.querySelector('[data-subprocess-cta]') as HTMLElement
    const id = c.querySelector('[data-subprocess-id]') as HTMLElement
    expect(cta).not.toBeNull()
    expect(id).not.toBeNull()
    expect(cta.textContent).toContain(CLICK_WORDING)
    expect(id.textContent).toBe(SUB)
    // neither variant carries the other's text, so whichever the medium picks is
    // the whole of what that medium says
    expect(cta.textContent).not.toContain(SUB)
    expect(id.textContent).not.toContain('زیرفرآیند')
  })

  it('keeps the print variant out of the document’s flow by default', () => {
    // `hidden` is Tailwind's display:none — so in the app, and in the exported
    // document's interactive viewer, the id element occupies nothing at all
    const id = node(true).querySelector('[data-subprocess-id]') as HTMLElement
    expect(id.className.split(/\s+/)).toContain('hidden')
    expect(id.className).not.toContain('flex ')
  })

  it('renders neither pill when the node has no subprocess', () => {
    const c = node(false)
    expect(c.querySelector('[data-subprocess-cta]')).toBeNull()
    expect(c.querySelector('[data-subprocess-id]')).toBeNull()
  })

  it('still reads the clickable wording on screen', () => {
    // the guard against change 3 leaking out of print: on screen the pill says
    // what it has always said, and says nothing else
    const cta = node(true).querySelector('[data-subprocess-cta]') as HTMLElement
    expect(cta.textContent?.replace(/[‹›]/g, '').trim()).toBe(CLICK_WORDING)
  })
})

/** Every declaration a selector makes, from the first rule that names it exactly. */
function ruleFor(css: string, selector: string): Record<string, string> | undefined {
  for (const m of css.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
    if (!m[1].split(',').map((s) => s.trim()).includes(selector)) continue
    const out: Record<string, string> = {}
    for (const d of m[2].split(';')) {
      const [k, ...v] = d.split(':')
      if (k.trim()) out[k.trim().toLowerCase()] = v.join(':').trim()
    }
    return out
  }
  return undefined
}

const PRINT_BLOCK = PRINT_CSS.slice(PRINT_CSS.indexOf('@media print'))
const SCREEN_BLOCK = PRINT_CSS.slice(0, PRINT_CSS.indexOf('@media print'))

describe('the print stylesheet’s two sanctioned deviations', () => {
  it('gives the label the app’s own tile colour, and no box of its own', () => {
    const tile = TAILWIND.match(/'tile-v2':\s*'(#[0-9A-Fa-f]{6})'/)
    expect(tile, 'tailwind defines the tile-v2 token').not.toBeNull()
    const rule = ruleFor(PRINT_BLOCK, '.pf-band [data-node-label]')
    expect(rule).toBeDefined()
    expect(rule!.background?.toUpperCase()).toBe(tile![1].toUpperCase())
    // The node's box is measured under screen media, where this rule does not
    // apply. Anything that changed the label's size here — padding, a border, a
    // font — would paint a card larger than the band reserved space for.
    expect(Object.keys(rule!).sort()).toEqual(['background', 'border-radius'])
  })

  it('swaps the pill for the id in the band, and in the host that measures it', () => {
    // the band is painted under print media...
    expect(ruleFor(PRINT_BLOCK, '.pf-band [data-subprocess-cta]')!.display).toBe('none')
    expect(ruleFor(PRINT_BLOCK, '.pf-band [data-subprocess-id]')!.display).toBe('flex')
    // ...but the offscreen host is laid out under *screen* media, and it is what
    // fixes each node's printed box. Measured around the click wording and painted
    // around the short id, every subprocess node would reserve more height than it
    // paints, and its edges would land off the card's centre.
    expect(ruleFor(SCREEN_BLOCK, '.pf-measure [data-subprocess-cta]')!.display).toBe('none')
    expect(ruleFor(SCREEN_BLOCK, '.pf-measure [data-subprocess-id]')!.display).toBe('flex')
  })

  it('deviates from the app’s node in exactly these two places and no other', () => {
    // `parity.test.tsx` bans a `react-flow__` selector outright; these `data-`
    // hooks are the sanctioned way in, so the set of them is pinned here. A third
    // one appearing is a restyling nobody asked for.
    const hooks = [...PRINT_CSS.matchAll(/\[data-[a-z-]+\]/g)].map((m) => m[0])
    expect([...new Set(hooks)].sort()).toEqual(
      ['[data-node-label]', '[data-subprocess-cta]', '[data-subprocess-id]'],
    )
  })
})
