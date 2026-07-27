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
