import { describe, it, expect, afterEach, vi } from 'vitest'
import { pdfHref, servedPdfHref } from './pdfLink'

/** jsdom's own `location`, put back after every test. Each case below replaces
 *  it with a `URL`, which carries the two fields `pdfHref` reads. */
const REAL_LOCATION = Object.getOwnPropertyDescriptor(window, 'location')!

/**
 * **Where a SERVED document actually sits** — the download route, not a folder.
 *
 * These fixtures said `/exports/dining/flowchart-{fingerprint}.html`, which was
 * the publicly mounted folder D24 retired: over `http(s)` that is a path this
 * deployment cannot serve any more, so the http cases were pinning the rule
 * against a URL shape that no longer occurs. The rule itself is unchanged and
 * still right — swap `.html` for `.pdf` beside the document — and it lands on
 * `…/reports/{kind}/file.pdf`, which is exactly the download route's own
 * `file.{ext}`.
 *
 * The `file:` cases below keep their `~/Downloads/flowchart-….html` paths on
 * purpose: a downloaded copy on a stick or in a mail attachment is named however
 * the person who saved it named it, and that is the case the whole fallback
 * exists for.
 */
const SERVED = '/api/departments/dining/reports/flowchart/file'
const SERVED_STEPS = '/api/departments/cooking/reports/steps/file'

function openedAt(url: string) {
  Object.defineProperty(window, 'location', {
    configurable: true, enumerable: true, writable: true, value: new URL(url),
  })
}

afterEach(() => { Object.defineProperty(window, 'location', REAL_LOCATION) })

describe('pdfHref', () => {
  it('points at the PDF beside the document when it is served over http', () => {
    openedAt(`http://inja.local${SERVED}.html`)
    expect(pdfHref()).toBe(`${SERVED}.pdf`)
  })

  it('does the same over https', () => {
    openedAt(`https://inja.example.com${SERVED_STEPS}.html`)
    expect(pdfHref()).toBe(`${SERVED_STEPS}.pdf`)
  })

  it('keeps only the path — a query string or fragment is not part of the name', () => {
    openedAt(`https://inja.example.com${SERVED}.html?v=2#toc`)
    expect(pdfHref()).toBe(`${SERVED}.pdf`)
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
    // The route's own directory, the route with no extension, and the site root.
    for (const path of ['/api/departments/dining/reports/flowchart/', SERVED, '/']) {
      openedAt(`https://inja.example.com${path}`)
      expect(pdfHref()).toBeNull()
    }
  })
})

// The document is written to disk *before* the server prints it, and the render
// is best-effort by design (D21) — an unset `CHROMIUM_PATH`, a crashed browser or
// a render that timed out all publish the HTML with no PDF beside it. The href is
// derived, so it is the right href either way; the file is what may be missing.
// Nothing in the document can know that at build time, so the only honest answer
// is to look.
describe('servedPdfHref', () => {
  const REAL_FETCH = globalThis.fetch

  function servesPdf(ok: boolean | Error) {
    const f = vi.fn(() => (ok instanceof Error
      ? Promise.reject(ok)
      : Promise.resolve({ ok } as Response)))
    globalThis.fetch = f as unknown as typeof fetch
    return f
  }

  afterEach(() => { globalThis.fetch = REAL_FETCH })

  it('is the sibling PDF when the server actually has one', async () => {
    openedAt(`https://inja.example.com${SERVED}.html`)
    const f = servesPdf(true)
    await expect(servedPdfHref()).resolves.toBe(`${SERVED}.pdf`)
    // HEAD, not GET: the document may be several megabytes and the answer is one bit.
    expect(f).toHaveBeenCalledWith(`${SERVED}.pdf`,
                                   expect.objectContaining({ method: 'HEAD' }))
  })

  // The case this whole function exists for: the render failed, so the reader's
  // primary action would 404. Fall back to the button that has always worked.
  it('is null when the sibling PDF is not there', async () => {
    openedAt(`https://inja.example.com${SERVED}.html`)
    servesPdf(false)
    await expect(servedPdfHref()).resolves.toBeNull()
  })

  // Offline, a flaky connection, a blocked request: none of them is a reason to
  // show a link, and none of them may throw out of here.
  it('is null when the probe itself fails', async () => {
    openedAt(`https://inja.example.com${SERVED}.html`)
    servesPdf(new TypeError('Failed to fetch'))
    await expect(servedPdfHref()).resolves.toBeNull()
  })

  // D20 unchanged: a copy on a stick has no server to ask, and asking would be a
  // request to nowhere on a document that is meant to work with no network at all.
  it('never probes when the document was opened from a file', async () => {
    openedAt('file:///home/staff/Downloads/flowchart-9f2c.html')
    const f = servesPdf(true)
    await expect(servedPdfHref()).resolves.toBeNull()
    expect(f).not.toHaveBeenCalled()
  })

  // A browser too old for `fetch` cannot be asked, and guessing is what builds
  // the dead link.
  it('is null when the browser has no fetch', async () => {
    openedAt(`https://inja.example.com${SERVED}.html`)
    globalThis.fetch = undefined as unknown as typeof fetch
    await expect(servedPdfHref()).resolves.toBeNull()
  })
})
