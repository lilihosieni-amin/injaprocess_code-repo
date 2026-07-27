/** The signal a headless renderer waits on before it prints the page.
 *
 *  Neither exported document is finished when `load` fires. The flowchart's
 *  printed diagrams are built *in the page*: a hidden flow is measured, edge
 *  geometry is taken from the app's own functions, and the result is sliced
 *  into SVG bands — work that only starts once `document.fonts.ready` resolves,
 *  because Persian glyph metrics decide how a node label wraps, which decides
 *  the box height, which decides where a page break may legally fall. A printer
 *  that fires on `load` captures blank diagram pages. So the document says when
 *  it has settled instead, and the renderer waits for that.
 *
 *  This module carries the *name* of the flag and nothing else. What counts as
 *  settled has exactly one definition — `diagramsComplete` in `print/complete`
 *  — and the flag is raised behind it. Two notions of "done" that could
 *  disagree is precisely how a blank page reaches a PDF.
 */
declare global {
  interface Window {
    /** `true` once the document is complete. Absent until then, never written
     *  as `false`: a renderer that reads it early must find nothing rather than
     *  an answer it could mistake for a final one. */
    __INJA_PRINT_READY__?: boolean
  }
}

export function markPrintReady(): void {
  window.__INJA_PRINT_READY__ = true
}
