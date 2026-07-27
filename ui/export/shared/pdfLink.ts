/** Where the reader's PDF comes from — decided by where the document itself is.
 *
 *  Printing the flowchart document from the browser is broken on iOS Safari:
 *  every printed node is the app's own DOM lifted into a `<foreignObject>`, and
 *  WebKit mis-resolves its position and its clipping inside a viewBox-scaled
 *  `<svg>`, so nodes land away from their edges or vanish. The server prints a
 *  correct PDF at export time and leaves it beside the HTML, same stem, `.pdf`
 *  extension (`exports.export_pdf_path`), and the button hands that over.
 *
 *  It can only hand it over when there is a server, though. An export is
 *  deliberately standalone (D3): it opens offline by double-click, which is how
 *  it reaches staff who have no account, and a copy on a phone or a stick has no
 *  sibling `.pdf` to link to. So this decides on the document's own location and
 *  the caller falls back to `window.print()` on `null` — the path that has always
 *  been there and is still correct everywhere but iOS.
 *
 *  One helper for both documents on purpose (D20). Two copies of this rule would
 *  drift, and the shape they would drift into is a button that links to nothing.
 */
const HTML = '.html'
const PDF = '.pdf'

/** The sibling PDF's URL, or `null` when there is nobody to serve it.
 *
 *  Returned root-relative rather than absolute: the PDF is served by whoever
 *  served this document, so the browser resolving it against the current origin
 *  is exactly right, and nothing about the deployment's host is baked in — the
 *  export build's checker fails on any absolute URL in the markup, and this is
 *  the reason it never sees one.
 */
export function pdfHref(): string | null {
  const loc = window.location
  // `file:` is the case the fallback exists for. `blob:`, `data:` and `about:`
  // are the rest of the ways a document can be open with no server behind it —
  // the rule is a whitelist, so a scheme nobody thought of falls back too.
  if (loc.protocol !== 'http:' && loc.protocol !== 'https:') return null
  // Only the server's own layout puts a PDF beside the HTML, and that layout
  // ends in `.html`. A path that does not is one this rule cannot reason about
  // — a directory index, a rewrite — and guessing there is how a dead link is
  // built. `pathname` is already percent-encoded, so the swap keeps it valid.
  if (!loc.pathname.endsWith(HTML)) return null
  return loc.pathname.slice(0, -HTML.length) + PDF
}

/** The sibling PDF's URL once it is known to be *there*, or `null`.
 *
 *  `pdfHref` says where the PDF would be; this says whether to offer it. The two
 *  are not the same question, because the render is best-effort by design (D21):
 *  the HTML is written first and published whatever happens next, so an unset
 *  `CHROMIUM_PATH`, a browser that crashed, and a render that ran out of time all
 *  leave a served document whose sibling `.pdf` does not exist. The href is still
 *  correct-by-construction — it is the file that is missing — and the document
 *  cannot be told at build time: it is generated *before* the render runs, and
 *  the export response carries no PDF field by design (D18).
 *
 *  So the one thing left is to look. A `HEAD` request, because the answer is one
 *  bit and the document may be megabytes; same-origin, so nothing about the
 *  deployment is baked in and the export build's no-external-reference checker
 *  still passes. Anything but a definite 200 — a 404, a 5xx, a rejected request,
 *  a browser with no `fetch` — falls back to `window.print()`, which is the path
 *  that has always been there.
 *
 *  The offline case never reaches the probe: `pdfHref` has already returned
 *  `null` for `file:` and friends, so a document opened by double-click makes no
 *  request at all (D20 unchanged).
 */
export async function servedPdfHref(): Promise<string | null> {
  const href = pdfHref()
  if (href === null) return null
  if (typeof fetch !== 'function') return null
  try {
    // `no-store`: the answer is about a file that is rewritten on every export,
    // and a cached 404 from a previous visit would outlive the render that fixed
    // it.
    const res = await fetch(href, { method: 'HEAD', cache: 'no-store' })
    return res.ok ? href : null
  } catch {
    // A network failure is not a reason to offer a link, and it is certainly not
    // a reason to throw out of a document's first render.
    return null
  }
}
