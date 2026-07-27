import { describe, it, expect } from 'vitest'
import { render } from '@testing-library/react'
import { ReactFlowProvider } from '@xyflow/react'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { ActivityNode } from '../../src/flow/nodes/ActivityNode'
import type { ProcNode } from '../../src/api/types'

const HERE = dirname(fileURLToPath(import.meta.url))
const PRINT_CSS = readFileSync(join(HERE, 'print.css'), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '')

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
  it('leaves the label itself untouched — print restyles no part of the node', () => {
    // The printed node is meant to be pixel-identical to the node on the site.
    // A print-only background once lived on this label; it was the wrong element
    // (the *edge* label is the one that is unreadable at print scale) and it was
    // reverted. Nothing may reach into the node's own text again without the
    // hook set below being widened deliberately.
    const c = node(false)
    expect(c.querySelector('[data-node-label]')).toBeNull()
    const label = [...c.querySelectorAll('div')].find((d) => d.textContent === 'ثبت درخواست')
    expect(label, 'the node still renders its label').toBeDefined()
    expect(label!.getAttributeNames().sort()).toEqual(['class'])
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
  it('restyles nothing inside the printed node’s own card', () => {
    // The whole point of copying the app's node markup into the band is that the
    // printed node *is* the site's node. The subprocess pill swap below is a swap
    // between two elements the component already renders, not a restyling; apart
    // from it, `.pf-band` may not paint, size or space anything within the card.
    // every selector that descends *into* a band (`.pf-band + .pf-band` is a
    // sibling combinator, not a descendant, and frames the band itself)
    const inside = [...PRINT_BLOCK.matchAll(/([^{}]+)\{([^{}]*)\}/g)]
      .flatMap((m) => m[1].split(',').map((s) => s.trim()))
      .filter((s) => /^\.pf-band\s+(?![+>~])/.test(s))
    expect([...new Set(inside)].sort()).toEqual([
      '.pf-band [data-edge-label]',
      '.pf-band [data-subprocess-cta]',
      '.pf-band [data-subprocess-id]',
    ])
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

  it('targets exactly these hooks and no other', () => {
    // `parity.test.tsx` bans a `react-flow__` selector outright; these `data-`
    // hooks are the sanctioned way in, so the set of them is pinned here. A fourth
    // one appearing is a restyling nobody asked for.
    //
    // `data-node-label` was one of them and is gone: it painted the *node* label,
    // which was the wrong element — the node must print exactly as it renders on
    // the site — and its background moved to `data-edge-label`.
    const hooks = [...PRINT_CSS.matchAll(/\[data-[a-z-]+\]/g)].map((m) => m[0])
    expect([...new Set(hooks)].sort()).toEqual(
      ['[data-edge-label]', '[data-subprocess-cta]', '[data-subprocess-id]'],
    )
  })
})
