import { describe, it, expect, afterEach } from 'vitest'
import { pdfHref } from './pdfLink'

/** jsdom's own `location`, put back after every test. Each case below replaces
 *  it with a `URL`, which carries the two fields `pdfHref` reads. */
const REAL_LOCATION = Object.getOwnPropertyDescriptor(window, 'location')!

function openedAt(url: string) {
  Object.defineProperty(window, 'location', {
    configurable: true, enumerable: true, writable: true, value: new URL(url),
  })
}

afterEach(() => { Object.defineProperty(window, 'location', REAL_LOCATION) })

describe('pdfHref', () => {
  it('points at the PDF beside the document when it is served over http', () => {
    openedAt('http://inja.local/exports/dining/flowchart-9f2c8a11d4e6b070.html')
    expect(pdfHref()).toBe('/exports/dining/flowchart-9f2c8a11d4e6b070.pdf')
  })

  it('does the same over https', () => {
    openedAt('https://inja.example.com/exports/cooking/steps-0011aabb22cc33dd.html')
    expect(pdfHref()).toBe('/exports/cooking/steps-0011aabb22cc33dd.pdf')
  })

  it('keeps only the path — a query string or fragment is not part of the name', () => {
    openedAt('https://inja.example.com/exports/dining/flowchart-9f2c.html?v=2#toc')
    expect(pdfHref()).toBe('/exports/dining/flowchart-9f2c.pdf')
  })

  // The case the fallback exists for: an export is handed to staff by email or
  // on a stick and opened by double-click. There is no server beside it, so a
  // link to a sibling `.pdf` would be a dead link.
  it('is null when the document was opened from a file', () => {
    openedAt('file:///home/staff/Downloads/flowchart-9f2c8a11d4e6b070.html')
    expect(pdfHref()).toBeNull()
  })

  it('is null for any other scheme a document can be opened under', () => {
    for (const url of ['about:blank', 'data:text/html,<b>x</b>']) {
      openedAt(url)
      expect(pdfHref()).toBeNull()
    }
  })

  // Only the server's own layout produces the sibling PDF, and that layout ends
  // in `.html`. Anything else is a path this rule cannot reason about — a
  // directory index, a rewritten URL — and guessing there is how a 404 is built.
  it('is null when the served path does not end in .html', () => {
    for (const path of ['/exports/dining/', '/exports/dining/flowchart-9f2c', '/']) {
      openedAt(`https://inja.example.com${path}`)
      expect(pdfHref()).toBeNull()
    }
  })
})
