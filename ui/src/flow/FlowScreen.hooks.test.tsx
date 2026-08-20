import { describe, it, expect, vi, afterEach } from 'vitest'
import { screen } from '@testing-library/react'
import { FlowScreen } from './FlowScreen'
import { renderAt } from '../test/utils'
import type { SessionDescriptor } from '../auth/session'

afterEach(() => vi.restoreAllMocks())

/**
 * **The flowchart screen changed its own hook order on every load.**
 *
 * Found while applying owner ruling R46, which is the first ruling to unfreeze
 * this file for more than one line. `FlowEditor` returns early while the
 * document is in flight — `if (!ed.doc) return <div className="flex-1 bg-bg" />`
 * — and `const onReader = useSurface()` sat **below** that return. So the first
 * render called sixteen hooks and bailed, and the render after the fetch
 * resolved called seventeen. React notices:
 *
 *   > React has detected a change in the order of Hooks called by FlowEditor.
 *   > This will lead to bugs and errors if not fixed.
 *
 * It is the only `react-hooks/rules-of-hooks` error in `ui/` and the only ESLint
 * **error** of any kind in the tree — `npx eslint .` at this task's merge base
 * reported exactly one, here. It survived because `src/flow/` was frozen by F16
 * for the whole 25-task rebuild: nobody was allowed to open the file that had
 * it, and no test asserted on React's console.
 *
 * Why it matters beyond the lint line: the value being read conditionally is
 * `useSurface()`, which decides whether this toolbar draws a «بازگشت» at all
 * (R44). A hook read out of order is read from the wrong slot, and the failure
 * mode is a reader stranded on a screen with no way off it — R21's defect,
 * arriving by a route no R21 test covers.
 *
 * The assertion is on React's own console rather than on a rendered output,
 * because that is where the defect is reported and there is nothing else to
 * look at: the screen renders, the tests pass, and the warning scrolls by.
 */
const EDITOR: SessionDescriptor = {
  username: '09120000001', displayName: 'مدیر', role: 'editor',
  capabilities: ['view', 'comment', 'export_pdf', 'edit'], scopes: ['dept:cooking'],
  supervisor: null, canSupervise: false, pendingApprovals: 0,
}

const proc = {
  id: 'cooking-001', department: 'cooking', name: 'خرید و پرداخت', summary: '', parent: null,
  idef0: { inputs: [], controls: [], outputs: [], mechanisms: [] }, kpis: [], pending: [],
  nodes: [{
    id: 'cooking-001-n010', type: 'activity', label: 'ثبت درخواست', description: '',
    actor: 'کارپرداز', icom: { inputs: [], controls: [], outputs: [], mechanisms: [] },
    subprocess: null, position: { x: 250, y: 90 }, layout: 'auto',
    source: { created_by: 'x', touched_by: [] },
  }],
  edges: [],
}

describe('FlowScreen — every hook is called on every render', () => {
  it('goes from the in-flight blank to the loaded screen without changing hook order', async () => {
    const complaints: string[] = []
    vi.spyOn(console, 'error').mockImplementation((...args) => { complaints.push(String(args[0])) })

    // **The read is DELAYED, and that is the whole test.** Resolved
    // synchronously the component never takes its early return, both renders
    // call the same hooks and the defect cannot appear — which is exactly why
    // the nine test files already in this directory never saw it.
    vi.spyOn(globalThis, 'fetch').mockImplementation((input) => {
      const url = String(input)
      const body = url.endsWith('/processes') ? [proc] : proc
      return new Promise((resolve) => setTimeout(() => resolve(new Response(
        JSON.stringify(body), { status: 200, headers: { 'Content-Type': 'application/json' } },
      )), 30))
    })

    renderAt('/processes/:pid/flow', <FlowScreen />, '/processes/cooking-001/flow', EDITOR)
    expect(await screen.findByText('ثبت درخواست')).toBeInTheDocument()

    expect(
      complaints.filter((c) => /order of Hooks|more hooks/i.test(c)),
      'the flowchart screen calls a hook below an early return',
    ).toEqual([])
  })
})
