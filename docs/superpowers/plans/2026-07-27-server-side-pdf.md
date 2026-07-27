# Server-Side PDF Rendering — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Render each export's PDF on the server with headless Chromium at export time, and let the exported document's «چاپ / PDF» button hand it to the reader — so the flowchart PDF works on iOS Safari, where the client-side print path does not.

**Architecture:** After the export HTML is written, the backend drives `chromium-headless-shell` over CDP against that file, waits for the page's own band-completeness signal, and writes `<kind>-<token>.pdf` beside it. The app's export modal is unchanged — it still shows one link. Inside the document, the print button links to the neighbouring PDF when served, and falls back to `window.print()` when opened from `file://`.

**Tech Stack:** Python 3.11 / FastAPI, `chromium-headless-shell` driven as a subprocess over CDP; React 19 / TypeScript / Vite for the two export bundles.

**Spec:** `docs/superpowers/specs/2026-07-26-department-export-design.md` §11 (addendum). Decision ids D17–D24 below refer to it.

## Global Constraints

- **A failed PDF render must never fail the export** (D21). The HTML is the product. The endpoint returns success with the HTML link and logs the failure.
- **The server's paper box must exactly match the in-page `@page`** (D23): portrait, 13 mm sides, 8 mm top/bottom. `bands.ts` derives `PRINT.W 675` / `PRINT.H 965` from it and the bands are planned in-page *before* the server prints. A different box silently mis-slices every diagram.
- `displayHeaderFooter: false` and `printBackground: true` are set explicitly (D24).
- **Renders are serialised** — one at a time, process-wide (D22). Peak ~300–400 MB against 3.7 GB shared with the bots.
- **Wait for the page's completeness signal, not the load event.** Bands are built after `document.fonts.ready` and re-verified against "every node appears in some band" (spec §5.4). Printing on load captures empty diagrams.
- **No Playwright or Puppeteer** — they pull a Node runtime into a Python image. Subprocess + CDP only.
- The exported HTML stays **standalone** (D3): the build's checker fails on any external reference, and the PDF link must not break the offline case.
- Do not change `ui/export/print/bands.ts`, the `@page` margins, the portrait orientation, or `linearize.ts`.
- Do not weaken `ui/export/flowchart/parity.test.tsx`.
- Persian strings stay byte-exact, including ZWNJ. Never write the literal `__INJA_EXPORT_DATA__` contiguously in TS/JS source.
- Tests: `.venv/bin/pytest` (backend), `npm --prefix ui test`, `npm --prefix ui run build`. Baselines at the start of this plan: **361 frontend across 68 files**, **453 backend / 1 skipped**.
- Work on `main` in the main checkout. **Another person's work may be in progress there — stage only your own files** and never commit `deploy/local/` or `control-bot/chathistorylog.txt`.

---

## File Structure

**Created**

| Path | Responsibility |
|---|---|
| `ui-backend/inja_ui_backend/pdf.py` | Drive Chromium over CDP: launch, open the file, await the completeness signal, `Page.printToPDF`, write atomically. No FastAPI imports. |
| `ui-backend/tests/test_pdf.py` | Unit tests for the module's pure parts and its failure handling. |

**Modified**

| Path | Change |
|---|---|
| `ui-backend/inja_ui_backend/config.py` | `chromium_path` setting (`CHROMIUM_PATH`), optional — unset means no PDF. |
| `ui-backend/inja_ui_backend/exports.py` | Expose the PDF path beside the HTML path; prune `.pdf` siblings alongside `.html`. |
| `ui-backend/inja_ui_backend/routers/exports.py` | After the HTML write, render the PDF; never fail the request on render failure. |
| `ui-backend/tests/test_exports_api.py` | Endpoint still succeeds when rendering fails or is unconfigured. |
| `ui/export/flowchart/Document.tsx`, `ui/export/steps/StepsApp.tsx` | The «چاپ / PDF» / «چاپ» button resolves to the PDF when served, `window.print()` when not. |
| `ui/export/shared/pdfLink.ts` *(new)* | The one place that decides served-vs-offline and builds the sibling `.pdf` URL. |
| `deploy/ui-backend.Dockerfile` | Install `chromium-headless-shell` + fonts; set `CHROMIUM_PATH`. |
| `deploy/docker-compose.yml`, `deploy/docker-compose.local.yml` | Nothing required — `CHROMIUM_PATH` is baked. Confirm and note. |

---

## Task 1: The completeness signal the renderer waits on

Today the band builder verifies "every node of every process appears in some band" internally and retries. Nothing outside the page can observe when it has settled — so a headless renderer has nothing to wait for but the load event, which fires too early.

**Files:** Modify `ui/export/flowchart/Document.tsx`; test `ui/export/flowchart/Document.test.tsx`.

**Interfaces produced:** `window.__INJA_PRINT_READY__ === true` once the diagrams are complete; absent or `false` until then. The steps guide sets it immediately after mount (it has no diagrams to build).

- [ ] **Step 1: Write the failing test** — assert the flag is not set on first render and becomes `true` once the completeness invariant passes; and that the steps document sets it on mount.
- [ ] **Step 2: Run it, confirm it fails** for the stated reason.
- [ ] **Step 3: Set the flag** where the existing rebuild loop already concludes the diagrams are complete. Do not add a second notion of completeness — reuse `diagramsComplete`.
- [ ] **Step 4: Run the tests.**
- [ ] **Step 5: Commit** — `feat(export): the document signals when its diagrams are complete`.

---

## Task 2: The PDF renderer

**Files:** Create `ui-backend/inja_ui_backend/pdf.py`, `ui-backend/tests/test_pdf.py`; modify `ui-backend/inja_ui_backend/config.py`, `ui-backend/tests/test_config.py`.

**Interfaces produced:**
- `Settings.chromium_path: Optional[Path]` from `CHROMIUM_PATH`; `None` disables PDF rendering.
- `render_pdf(chromium: Path, html_path: Path, out_path: Path, *, timeout_s: float = 90) -> None` — raises `PdfRenderError` on any failure.
- `PdfRenderError(Exception)`.

- [ ] **Step 1: Write the failing tests.** Cover what is testable without a browser: an unset `CHROMIUM_PATH` yields `None`; a missing binary raises `PdfRenderError`; the CDP paper parameters are exactly portrait / 13 mm sides / 8 mm top-bottom with `displayHeaderFooter` false and `printBackground` true (assert against the built parameter dict, not by launching); a render that never signals readiness times out rather than hanging; renders are serialised (two concurrent calls do not overlap).
- [ ] **Step 2: Run them, confirm they fail.**
- [ ] **Step 3: Implement.** Launch `chromium-headless-shell` with `--headless=new --remote-debugging-port=0 --no-sandbox --disable-dev-shm-usage --disable-gpu`, read the chosen port from its stderr, connect over CDP, `Page.navigate` to the `file://` URL, poll `Runtime.evaluate` for the readiness flag until the timeout, then `Page.printToPDF`, decode, and write via the existing atomic helper. Kill the browser in a `finally`. Serialise with a module-level lock.
  - `--no-sandbox` is required because the container runs as root; note why in a comment.
  - `--disable-dev-shm-usage` matters in Docker, where `/dev/shm` is 64 MB by default and Chromium crashes without it.
- [ ] **Step 4: Run the tests.**
- [ ] **Step 5: Verify against a real browser** if one is available in the dev environment — render an existing export and confirm the page count and that text is extractable. If not available, say so plainly; Task 5 verifies on the server.
- [ ] **Step 6: Commit** — `feat(export): render a PDF from an export with headless Chromium`.

---

## Task 3: Wire it into the export endpoint

**Files:** Modify `ui-backend/inja_ui_backend/exports.py`, `ui-backend/inja_ui_backend/routers/exports.py`; tests in `ui-backend/tests/test_exports.py`, `ui-backend/tests/test_exports_api.py`.

**Interfaces produced:** `exports.export_pdf_path(export_dir, code, kind, token) -> Path`. `write_export` prunes stale `{kind}-*.pdf` alongside `{kind}-*.html`.

- [ ] **Step 1: Write the failing tests.** The endpoint still returns 200 with the HTML link when: `CHROMIUM_PATH` is unset; the renderer raises. In both cases a warning is logged and no `.pdf` is left behind. When rendering succeeds, the `.pdf` sits beside the `.html` with the same stem. Regenerating prunes the previous `.pdf` as well as the previous `.html`.
- [ ] **Step 2: Run them, confirm they fail.**
- [ ] **Step 3: Implement.** Render after the HTML is written and before returning. Catch `PdfRenderError` and `OSError`, log at warning with the department and kind, and continue. The response shape is unchanged — no PDF field (D18).
- [ ] **Step 4: Run the backend suite.**
- [ ] **Step 5: Commit** — `feat(export): write the PDF beside the HTML at export time`.

---

## Task 4: The button inside the document

**Files:** Create `ui/export/shared/pdfLink.ts`; modify `ui/export/flowchart/Document.tsx`, `ui/export/steps/StepsApp.tsx`; tests alongside each.

**Interfaces produced:** `pdfHref(): string | null` — the sibling `.pdf` URL when the document is being served over http(s), `null` when it is not (so the caller falls back to printing).

- [ ] **Step 1: Write the failing tests.** Served over http(s) → the button is a link to the same path with `.pdf`; opened from `file://` → the button still calls `window.print()` and renders no dead link. Persian label unchanged in both cases.
- [ ] **Step 2: Run them, confirm they fail.**
- [ ] **Step 3: Implement.** One helper, used by both documents, deciding on `location.protocol`. Keep the button's existing appearance and Persian text exactly.
- [ ] **Step 4: Run the frontend suite and the build.**
- [ ] **Step 5: Commit** — `feat(export): the print button hands over the server's PDF when served`.

---

## Task 5: Image, deployment, and verification on the server

**Files:** Modify `deploy/ui-backend.Dockerfile`; check `deploy/docker-compose.yml` and `deploy/docker-compose.local.yml`; update `docs/runbooks/00-overview.md` and `ui-backend/README.md` for the new env var and the image's new dependency.

- [ ] **Step 1: Install the browser in the image.** `chromium-headless-shell` (not full Chrome) plus the font packages its rendering needs — the documents embed Vazirmatn as a data URI, so no system Persian font is required, but confirm that rather than assume. Set `ENV CHROMIUM_PATH=…`.
- [ ] **Step 2: Report the image size delta** before and after.
- [ ] **Step 3: Build and deploy** per `docs/runbooks/03-deploy.md`.
- [ ] **Step 4: Verify on the server.** Export both kinds for a real department; confirm each `.pdf` appears beside its `.html`; download and check the flowchart PDF has the expected page count, no browser header/footer, colour preserved, text extractable, **0 node/edge-label straddles and 0 gaps** — the same guarantees the client-side path was held to.
- [ ] **Step 5: Measure the cost** — render wall-clock per document, and peak container memory during a render, against the 3.7 GB host.
- [ ] **Step 6: Verify on an actual iPhone** — this is the whole point of the work. Open the export link in mobile Safari, tap «چاپ / PDF», and confirm the downloaded PDF is correct. If no device is available, say so plainly rather than declaring success.
- [ ] **Step 7: Commit** — `build(export): headless Chromium in the ui-backend image`.

---

## Risks

| Risk | Handling |
|---|---|
| Memory pressure on a 3.7 GB host shared with the bots. | Serialised renders (D22); measured in Task 5 Step 5. If peak is uncomfortable, the fallback is rendering on demand with a queue, or a memory limit on the browser process. |
| A long export request — render adds 10–30 s. | The modal already has a pending state built for this. If it proves too slow, the follow-up is to return the HTML link immediately and render in the background. |
| The paper box drifting from `@page`. | D23; pinned by a test asserting the CDP parameters match the stylesheet's values. |
| Chromium in a production image is a security-update surface that did not exist before. | Accepted and recorded; `chromium-headless-shell` keeps the surface smaller than full Chrome. |
| The readiness flag never sets on a pathological document, hanging the render. | Hard timeout (Task 2), and a failed render never fails the export (D21). |
