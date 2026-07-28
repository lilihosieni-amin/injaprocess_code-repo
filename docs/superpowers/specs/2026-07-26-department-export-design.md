# Department export produces standalone HTML documents built from the app's own flow components

**Date:** 2026-07-26
**Scope:** `code-repo` — a new `ui/export/` frontend build (two entries), a second Vite config,
two optional-prop changes in `ui/src/flow/Canvas.tsx`, one new `ui-backend` router plus a static
mount, an export modal and a ⋯ menu on the department page, and deployment wiring
(`EXPORT_DIR`, `UI_EXPORT_TEMPLATE_DIR`, a named volume, a Dockerfile stage).
**Why:** a department's documented processes are currently readable only inside the editing app,
behind a login. Two audiences need them outside it: management wants an official document with the
flowcharts, and floor staff want a plain step-by-step guide they can read on a phone. Both must be
printable to PDF.
**Depends on:** `2026-07-25-department-process-order-design.md` — the export consumes the curated
order and does not guess placement.
**Out of scope:** per-process export (the menu lives on the department page), export of the
department overview on its own, scheduled/automatic export, and any change to the extraction
pipeline or the data contract. No schema changes.

---

## 1. Decisions

| # | Decision |
|---|---|
| D1 | Two export kinds: **`flowchart`** (the official document, mockup `ui/design/export/dining-export-v2.html`) and **`steps`** (the staff guide, `ui/design/export/dining-steps.html`). |
| D2 | The flowchart export's flow viewer is built from the **app's actual React Flow components**, not a lookalike. Fidelity is structural; there is no second implementation to drift. |
| D3 | Each export is a **fully standalone single HTML file** — JS, CSS, Vazirmatn woff2 and the process data all inlined. It opens offline, by double-click, with no server. |
| D4 | The file is **saved on the server** and reachable at a permanent URL. |
| D5 | **One file per department+kind, overwritten** on regeneration. The link never changes; there is no export history. |
| D6 | The link is **unauthenticated**, guarded only by an unguessable token in the filename. Anyone holding a link reads that whole department. Accepted deliberately: staff have no accounts. |
| D7 | The token is **derived, not stored**: `HMAC-SHA256(session_signing_key, "export:{code}:{kind}")` truncated to 16 hex chars. No state, stable across restarts. |
| D8 | Exports live **outside the data-repo**, under `EXPORT_DIR`. They are build artifacts, not data, and must not clutter the working tree the control-bot agent operates in. |
| D9 | PDF comes from the browser's print dialog (`window.print()` + a print stylesheet), as both mockups already do. No server-side PDF renderer. |
| D10 | In print, each flowchart is re-emitted as **vector SVG bands**, cut only through empty space, so no node or edge label is ever halved across a page. |
| D11 | The exported flow viewer is **read-only and conflict-free**: no ویرایش/undo/redo/چیدمان/ذخیره, and no pending-conflict badges. `pending` is stripped server-side, not hidden in CSS. |
| D12 | Per-process pages carry **name, id, activity/junction counts and the diagram** — as the mockup does. No summary, no A-0 ICOM block, no per-process KPI section. |
| D13 | The department header **keeps** ترتیب فرآیندها as its own button; the ⋯ menu holds only the two exports. |
| D14 | A **loading state is shown from the click until the link is handed back**, in the same modal that later shows the link. |
| D15 | Tombstoned processes are excluded from both exports. |
| D16 | The endpoint returns a **relative** path; the modal displays and copies it as an **absolute** URL built from `window.location.origin`. No base-URL setting to keep in step with the deployment. |

---

## 2. Architecture

Three pieces, communicating only through files:

```
ui/  ── vite.config.export.ts ──> ui/dist-export/flowchart.html   (template, data slot empty)
                                  ui/dist-export/steps.html

ui-backend ── reads template, substitutes the data slot, writes ──>
                                  $EXPORT_DIR/{code}/{kind}-{token}.html

FastAPI StaticFiles("/exports") ──> the browser
```

The backend performs a string substitution over a pre-built template. All rendering intelligence
lives in the frontend bundle, so the backend stays thin (ARD §1) and no engine CLI is involved —
an export is a view, not a data transformation.

### 2.1 Build

New `ui/vite.config.export.ts`:

- inputs: `ui/export/flowchart.html`, `ui/export/steps.html`
- `outDir: dist-export`
- `vite-plugin-singlefile` (new dev dependency) inlines JS and CSS into each HTML
- `build.assetsInlineLimit: Infinity` folds the Vazirmatn woff2 into the CSS as a `data:` URI

`npm run build` becomes `tsc -b && vite build && vite build -c vite.config.export.ts`.

Each template carries exactly one data slot:

```html
<script id="inja-export-data" type="application/json">__INJA_EXPORT_DATA__</script>
```

Expected sizes: `flowchart.html` ≈ 1.5–2 MB (React + React Flow + font), `steps.html` ≈ 200 KB.

### 2.2 Endpoint

`POST /api/departments/{code}/exports/{kind}` — session-guarded like every other write.
`kind` ∈ `flowchart` | `steps`; anything else is a 404.

Payload assembled from existing storage helpers:

```jsonc
{
  "dept": { /* overview.json verbatim */ },
  "processes": [ /* curated order, tombstones dropped, `pending` emptied */ ],
  "generated_at": "2026-07-26T09:12:00Z"
}
```

Reuses the ordering logic already in `departments.list_processes` — extracted to a shared helper so
the export and the list screen cannot disagree about what a department's process sequence is.

`dept` is `overview.json` verbatim. Note that the mockup's cover reads a `fullName` field that the
overview schema does not have; the export derives it client-side as `دپارتمان {name}` rather than
adding a field to the frozen data contract.

Substitution replaces every `<` in the serialised JSON with its six-character JSON escape
(`\u003c`), so no summary or activity description containing `</script>` can close the data block
and inject markup. `JSON.parse` turns the escape back into `<`, so rendered text is unaffected.

Response: `{"url": "/exports/dining/flowchart-7f3a9c2e1b4d5a60.html", "generated_at": "…"}`.

Errors: 404 unknown department, 404 unknown kind, 503 when `EXPORT_DIR` or the template directory
is missing, 500 on write failure.

### 2.3 Storage and the link

Path: `$EXPORT_DIR/{code}/{kind}-{token}.html`, token per D7.

Writing is atomic — temp file then `os.replace`, the same pattern as `storage.write_json_atomic` —
so the link never serves a truncated document. Before renaming into place the writer deletes any
other `{kind}-*.html` in that department folder, which handles both regeneration (D5) and orphans
left behind if the session signing key is ever rotated.

`EXPORT_DIR` is optional. Unset, the feature is simply off: the endpoint returns 503 and the modal
shows that message in its failed state. There is no capability-probe endpoint and no pre-disabled
menu — one fewer mechanism to keep in step, and the failure is legible at the moment it matters. In
deployment it is a named `ui-exports` volume mounted at `/exports`.

### 2.4 Serving

```python
if cfg.export_dir:
    app.mount("/exports", StaticFiles(directory=str(cfg.export_dir)), name="exports")
# … then, last:
app.mount("/", SPAStaticFiles(directory=str(cfg.static_dir), html=True), name="static")
```

Mount order is load-bearing. The SPA catch-all at `/` swallows everything mounted after it, and its
404 fallback would answer `/exports/...` with `index.html`. A test pins the ordering.

No auth dependency on this mount — that is D6.

---

## 3. The flowchart export

`ui/export/flowchart.html` and `ui/export/flowchart/`:

| File | Role |
|---|---|
| `main.tsx` | reads the data slot, seeds the query cache, mounts the app |
| `Document.tsx` | cover, TOC, intro + sub-units, roles, KPIs, legend |
| `ProcessSheets.tsx` | the print-only per-process pages |
| `FlowViewer.tsx` | the flow overlay |
| `document.module.css` | the document chrome's styles |

### 3.1 Reuse from the app

Unchanged: `flow/Canvas`, `flow/nodes/{Activity,Start,End,Junction}Node`, `flow/edges/LabeledEdge`
and `flow/edges/floating`, `flow/adapt`, `flow/DetailDrawer`, `lib/format`, `ui/Chip`, `api/types`.

Two changes in app code enable it:

1. `Canvas`'s `onCommitPositions`, `onSetEdgeLabel` and `onDeleteEdge` become optional with no-op
   defaults. Backward compatible; `FlowScreen` is untouched.
2. The export mounts a `QueryClientProvider` whose cache is pre-seeded from the embedded payload —
   `['overview', code]`, `['processes', code]`, and `['process', pid]` per process — with
   `retry: false`, `staleTime: Infinity`, and a default `queryFn` that throws. `DetailDrawer` calls
   `useProcesses` internally; without seeding it would fire a doomed fetch from a `file://` page.

### 3.2 CSS isolation

The document chrome ships as a **CSS module**, so Vite hashes its class names. The mockup's
stylesheet defines `.chip`, `.card` and `.id-badge`; `ui/src/index.css` defines `.chip` and
`.id-badge` differently under `@layer components`. In one document they would silently fight and the
flowchart's id badges would lose. Hashed names make the collision impossible.

The flow viewer keeps plain Tailwind plus `@xyflow/react/dist/style.css` — identical cascade to the
site.

### 3.3 Fidelity boundary

Identical to the site, because it is the same components: node markup, sizes, colours, shadows,
highlight rings, the dotted background, edge curves and arrow markers, the zoom `Controls`, the
XOR/AND/OR legend box, the read-only detail drawer, and click-through from a purple node into its
subprocess.

Deliberately different: the site's flow page sits inside `AppShell`, whose `TopBar` carries the
logo, صندوق بازبینی and the user avatar. A document has neither an inbox nor a logged-in user, so
the export's viewer sits under the document's own top bar with a بازگشت button and the subprocess
breadcrumb. The edit controls (ویرایش, undo/redo, چیدمان, انصراف, ذخیره) are absent per D11.

### 3.4 Document content

Cover, table of contents, معرفی واحد + واحدها و زون‌ها, موجودیت‌ها و نقش‌ها, اهداف عملکردی (KPI),
راهنمای نمادهای فلوچارت — wired to `overview.json` (`description`, `sub_units`, `personnel[].duties`,
`personnel[].kpi`). Per-process pages per D12.

On screen, clicking a process in the TOC opens the flow viewer directly. In print, the viewer is
hidden and the per-process sheets become visible.

---

## 4. The step-by-step export

`ui/export/steps.html` and `ui/export/steps/`. No React Flow, so the bundle stays small — this file
is for staff on phones.

### 4.1 `linearize.ts`

The mockup's `graphOf` / `mergePoint` / `linearize` moves out of inline JS into a typed, pure
`Process → Block[]` function: DFS back-edge detection, Kahn topological ranking with stable
tie-breaking on original node index, and first-common-descendant merge points per branch set.

Same input ⇒ byte-identical output. No randomness, no dates, no text rewriting.

Unit tests: straight chain; XOR split that re-merges; AND with three branches; a branch nested
inside a branch; a loop producing a «برگرد به مرحلهٔ ن» back-reference with the correct number; a
branch set with no merge point; disconnected nodes appended in stable order; determinism across
repeated runs.

### 4.2 Rendering

Home list of processes with step counts; a page per process with numbered step cards expanding to
مجری and توضیح کار; coral branch groups titled by junction type; back-jump chips that scroll to and
flash their target; amber subprocess cards that push a new page with a breadcrumb trail.

This export intentionally does not resemble the site — 17px base type, wide cards, no diagram. D2
applies to the flowchart document only.

### 4.3 Print

A static, always-present, print-only document built once at load: a فهرست کارها index, then one
portrait section per process with steps flattened into compact rows, `break-inside: avoid` per row.

---

## 5. Print engine for the flowchart

### 5.1 Why it is needed

React Flow paints nodes as absolutely-positioned HTML inside a CSS-transformed viewport, with edges
in an overlay SVG sized to that viewport. Printed directly, Chrome clips at the viewport, slices
nodes at page boundaries and drops fragments.

### 5.2 Bands

Each process's diagram is re-emitted at print time as one or more `<svg>` bands. An `<svg>` is
atomic to the printer: Chrome never drops its children the way it drops overflowing
absolutely-positioned HTML. Each band covers a horizontal slice; slices are cut only where nothing
is painted.

Geometry sources — this is what keeps print identical to screen:

- **Node boxes**: a single hidden measuring host, laid out (`position:absolute; left:-99999px`) but
  never `display:none`, because a `display:none` subtree measures as zero. Each process is rendered
  into it in turn as a real `<ReactFlow>` instance — not the node components standalone, since
  `Handle` requires the flow's store context and throws outside it. Each node's `outerHTML` then
  goes into a `<foreignObject>` at its true position, carrying its real Tailwind classes.
- **Edges**: `getEdgeParams()` from `flow/edges/floating.ts` and `getBezierPath()` from
  `@xyflow/react` — the same functions `LabeledEdge` calls, so the printed curve is the drawn curve.
  Plus the white exit nub (`r=4`, stroke `#9B86D9`) and an arrow marker matching
  `MarkerType.ArrowClosed` at `#9B86D9`, 18×18.
- **Labels**: `foreignObject` carrying the same `bg-white/90 text-ink text-[11px]` markup.

### 5.3 Splitting

`freeCuts` → `maxChunk` → `bandSplit`, ported to TypeScript as pure functions over rectangle lists.

Policy, unchanged from the mockup: prefer the whole diagram on the heading page when that costs
little size; otherwise keep full page width and break across pages, because a readable diagram over
two pages beats a complete but illegible one. Hard floor at 34% scale — below that it bands instead
of shrinking. Page budget ≈ 930×620 CSS px, the smaller of A4 and Letter landscape minus margins, so
one build is correct on both.

Unit tests: a diagram that fits under its heading stays one band; a tall one splits only at gaps; a
diagram with no legal cut scales down rather than splitting; a first run taller than the heading
page allows gets its own page.

### 5.4 Timing and the completeness invariant

Persian glyph metrics decide how labels wrap inside nodes, which decides box heights, which decides
where cuts are legal. Measuring before Vazirmatn loads yields a wrong diagram.

Bands are built after mount and rebuilt on `document.fonts.ready`, on `load`, and on `beforeprint`.
Each build is checked by the invariant **every node of every process appears in some band**; a
failing check retries, up to four attempts. A diagram is never printed with a node silently missing.

### 5.5 Known limits

- `foreignObject` printing is a Chrome path. It is well-supported there and proven by the mockup;
  Firefox and Safari are less reliable and are not verified.
- Rendering ~30 hidden React Flow instances sequentially costs a second or two at file open. If that
  proves slow, the fallback is to build lazily on first print, trading a beat's delay when the print
  dialog opens.

---

## 6. UI

### 6.1 Menu

The department header keeps its four existing controls (D13) and gains a 42px ⋯ button in ghost
styling, opening the mockup's 288px dropdown pinned to `inset-inline-end: 0`:

- **خروجی مستندات کامل** — سند رسمی با فلوچارت تعاملی
- **خروجی راهنمای گام‌به‌گام** — فهرست ساده و خوانا برای پرسنل

Closes on outside click, on Esc, and on choosing an item.

`ProcessList` wraps its content in a `dir="ltr"` scroll container with an inner `dir="rtl"` — the
same trap commit 61cb036 fixed for modals — so the dropdown sets its direction explicitly rather
than inheriting it.

### 6.2 Export modal

Designed in `ui/design/Inja Responsive.dc.html` (the `hasExportReady` block). Choosing a menu item
closes the dropdown and opens the modal immediately (D14). One surface, three states — the ready
state is the mockup verbatim; pending and failed reuse its frame.

Frame, in all three states: 520px wide, `#FBF7F1`, 20px radius, `shadow-modal`, on an
`rgba(36,17,82,.45)` backdrop with a 3px blur. A white header strip carries a 40px status tile, a
title, and the export's name as a subtitle — «خروجی مستندات کامل — سند رسمی» or «راهنمای گام‌به‌گام
کار — برای پرسنل».

- **pending** — violet tile with an indeterminate spinner, «در حال آماده‌سازی خروجی…». No progress
  bar: the backend has nothing honest to report a percentage from.
- **ready** — green tile (`#E4F6EC` / `#1F8A5B`) with a check, «خروجی آماده شد». Body: the label
  «لینک فایل HTML خروجی:», the URL in a read-only `dir="ltr"` monospace field, and a **کپی لینک**
  button that flips to «کپی شد» for 1.8s (`navigator.clipboard`, falling back to a hidden textarea
  and `execCommand('copy')` for non-secure contexts). Beneath it: «این فایل کاملاً مستقل است و بدون
  اینترنت هم باز می‌شود.» and a second line noting the link opens without login and is replaced by
  the next export — D6 is a deliberate trade-off and the person about to share the link should know
  it. Footer: **بستن** (ghost) and **باز کردن خروجی** (violet anchor, `target="_blank"`,
  `rel="noopener"`).
- **failed** — coral tile, the backend's message, and **تلاش دوباره** re-firing the same request in
  place.

**The URL is absolute.** The endpoint returns a relative path; the modal displays
`window.location.origin + url`, which is what makes the field worth copying and stays correct on the
IP host today and on a real domain later, with no server-side base-URL config.

While the mutation is in flight the ⋯ button and both menu items are disabled, so a second click
cannot start a competing export — which matters, since both writes target the same filename. The
modal is dismissible by outside click and Esc in the ready and failed states (as the mockup has it);
while pending, only Esc closes it, and the server-side write is left to finish, because a
half-written file would be worse than an unwanted one.

The mockup's `runExport` shows the wait as a toast. That is superseded by the pending state above:
`ToastProvider` auto-dismisses after 2.6s and always draws a green check, so on a slow export the
message would disappear mid-wait while claiming success for something that had not succeeded.

---

## 7. Testing

**Backend** (`ui-backend/tests/test_exports.py`):

- token stable across repeated calls; different per department and per kind
- regeneration replaces the file and deletes the previous one
- payload carries no `pending` and no tombstoned processes
- a summary containing `</script>` cannot break out of the data block
- unknown department → 404; unknown kind → 404; missing `EXPORT_DIR` or template → 503
- `/exports/...` serves with no session cookie, while `/api/...` still 404s as JSON (mount ordering)

**Frontend** (vitest):

- ⋯ menu opens, closes on outside click and Esc
- each item posts the right kind
- the modal appears in pending state on click and the menu is disabled during the request
- the modal transitions to ready and shows the URL as an absolute link (origin prepended)
- کپی لینک copies and flips to «کپی شد», then back
- outside click is ignored while pending and closes the modal once ready
- failure shows the message and تلاش دوباره re-fires

**Pure functions:** `linearize` (§4.1) and the band splitter (§5.3).

**Parity guard:** one test renders `ActivityNode` through the app and through the export and asserts
identical markup — cheap insurance that the export never quietly grows its own node styling, which
is the exact failure D2 exists to prevent.

---

## 8. Deployment

- `deploy/ui-backend.Dockerfile`: the ui-build stage runs both Vite builds; stage 2 copies
  `dist-export/` to `/app/ui-export-templates`.
- `ENV UI_EXPORT_TEMPLATE_DIR=/app/ui-export-templates`
- `deploy/docker-compose.yml`: `EXPORT_DIR: /exports` on the ui-backend service, backed by a new
  named volume `ui-exports`.
- `deploy/docker-compose.local.yml`: the same wiring for local test runs.
- `config/`: sample env entries for `EXPORT_DIR` and `UI_EXPORT_TEMPLATE_DIR`.

---

## 9. Risks

| Risk | Handling |
|---|---|
| An unauthenticated link leaks a department's processes to anyone who obtains the URL. | Accepted per D6 — the alternative blocks the staff audience the steps export exists for. Mitigated by an unguessable token and by stripping `pending` so unreviewed internal notes never ride along. |
| `vite-plugin-singlefile` with two entries is unverified in this repo. | Verified early in implementation. Fallback: a ~40-line Node post-build script that inlines the referenced assets, with no new dependency. |
| `foreignObject` print fidelity outside Chrome. | Documented limit (§5.5); Chrome is the supported PDF path. |
| A 2 MB file feels heavy on a phone over a weak connection. | Only the flowchart export is large; the staff-facing steps export is ~200 KB. Served over HTTP it is gzipped. |
| The mockups' CSS drifts from the app's tokens over time. | The flow viewer cannot drift (D2 + the parity guard). The document chrome can, and is accepted — it is document styling, not app styling. |

---

## 10. Implementation order

Four stages, each ending somewhere usable:

1. **Pipe** — the second Vite config, a trivial template that renders only its embedded JSON, the
   endpoint, storage, the static mount, the ⋯ menu and the three-state modal. End state: clicking an
   export yields a working link to a real file. Proves the plumbing before any rendering work.
2. **Steps export** — `linearize.ts` with its unit tests, the screen rendering, the print document.
   End state: the staff guide is finished and shippable on its own.
3. **Flowchart document** — the document chrome, the flow viewer with the reused components, the
   query-cache seeding, the `Canvas` optional props, the parity guard. End state: everything works
   on screen; printing is not yet correct.
4. **Print engine** — the measuring host, band geometry, the splitter with its unit tests, the
   completeness invariant, print stylesheets. End state: PDF matches the screen.

Stage 1 also settles the `vite-plugin-singlefile` risk in §9 before anything is built on top of it.

---

## 11. Addendum (2026-07-27): the PDF is rendered on the server

### Why this reverses §1's rejection of approach B

§1 rejected "headless Chromium on the server" because, as framed then, it meant the backend driving
the live SPA — reproducing auth, app state and navigation — to snapshot a page. That judgement stands
for that design. It does not describe what is now needed.

Two things changed:

1. **The input is no longer the SPA.** The standalone export HTML already exists on disk. Rendering
   it means opening a local file, not reproducing the application.
2. **The client-side print path is unreachable for the audience it was built for.** Each printed node
   is the app's real DOM lifted into a `<foreignObject>` — the mechanism that makes the printed
   diagram identical to the site's (D2). WebKit mis-resolves `foreignObject` position and clipping
   inside a `viewBox`-scaled `<svg>`, so on iOS Safari nodes land away from their edges or vanish,
   while the native SVG paths render correctly. §5.5 recorded this as a known limit ("a Chrome
   path… Firefox and Safari are less reliable and are not verified"); field use on staff phones has
   turned it from a limit into a defect. The staff guide is unaffected — it has no `foreignObject`.

Reproducing the diagram without a browser is not an option: the bands do not exist until JavaScript
runs. A non-executing renderer (WeasyPrint) emits blank diagram pages; a primitives library
(ReportLab) means a second implementation of the node renderer, which is what the parity guard exists
to prevent. Computing bands server-side needs measured node heights, and Persian glyph metrics decide
those — which needs a layout engine. The circle only breaks with a browser.

### Decisions

| # | Decision |
|---|---|
| D17 | The PDF is rendered **on the server by headless Chromium**, from the already-written export HTML. Approach B is adopted for this narrow job only; the backend still does not drive the SPA. |
| D18 | The PDF link is **not surfaced in the app**. The export modal keeps showing exactly one link, the HTML. The PDF is reached from the **«چاپ / PDF» button inside the exported document**. |
| D19 | The PDF is rendered **at export time**, beside the HTML and sharing its name (`<kind>-<token>.pdf`). Not on demand: a reader must not wait 10–30s, and concurrent renders must not stack browsers on a 3.7 GB host. Storage stays bounded because exports overwrite in place. |
| D20 | When the document is opened from `file://` — a downloaded or emailed copy — the button **falls back to `window.print()`**. D3 (standalone, opens offline) is preserved; the served copy gets the good PDF. |
| D21 | A failed PDF render **must not fail the export**. The HTML is the product; the PDF is an enhancement. The endpoint returns success with the HTML link and logs the render failure. |
| D22 | Renders are **serialised** — one at a time, process-wide. Peak memory per render is 300–400 MB against 3.7 GB shared with the bots. |
| D23 | The server's print parameters must **match the in-page `@page` box exactly** (portrait, 13 mm sides, 8 mm top/bottom). `bands.ts`'s budget (`PRINT.W 675`, `PRINT.H 965`) is derived from it, and the bands are planned in-page before the server prints. A different paper box silently mis-slices every diagram. |
| D24 | `displayHeaderFooter: false` and `printBackground: true` are set explicitly. The 8 mm margin heuristic that suppresses Chrome's header/footer stays for the in-browser path, but server-side the setting is stated outright. |

### What the browser is, and is not

`chromium-headless-shell`, not full Chrome, and driven as a **subprocess over CDP** — no Playwright or
Puppeteer, which would pull a Node runtime and its dependency tree into a Python image. This keeps the
shape `ui-backend` already has: it shells out to the engine CLIs, and now to one more binary.

The render must wait for the page's own completeness signal, not the load event: the bands are built
after `document.fonts.ready` and re-verified against the invariant that every node appears in some
band (§5.4). Printing on load would capture empty or half-built diagrams.

---

## 12. Addendum (2026-07-28): exports sit behind a shared password

### Why this reverses D6

D6 made the export link unauthenticated because *staff have no accounts*, and the 16-hex-char token
in the filename was the only guard. The trade was recorded and accepted at the time. In use, the
concern that actually matters is a forwarded link: anyone who obtains a URL reads that department's
whole process set, and there is no way to withdraw it short of rotating the signing key.

The requirement now is that the link alone is not enough.

**What this cannot do, and is not meant to:** an export is a standalone file (D3). A copy someone has
already downloaded opens forever, offline, with no server involved. This closes *"someone forwards
the link"*, not *"someone forwards the file"*.

### Decisions

| # | Decision |
|---|---|
| D25 | `/exports` is served **behind authentication**. The filename token stays as a second layer — it costs nothing and it keeps the URL unguessable even to someone holding a valid session. |
| D26 | Authentication is **one shared credential for the whole export system**, not per-person accounts. There is no attribution requirement, and per-person accounts would mean an ops burden and a role system this does not otherwise need. |
| D27 | That credential **cannot reach the main panel**, and this is structural rather than a check that can be forgotten: the export session is signed with a **different salt** from the admin session, so neither token can ever verify as the other, and its cookie is scoped to `path=/exports` so it is not even transmitted to the API. |
| D28 | The credential lives in its own settings (`EXPORT_USERNAME`, `EXPORT_PASSWORD_HASH`, argon2 as `ui-users.json` already uses), **separate from `cfg.users`**, so it structurally cannot authenticate against any admin endpoint. |
| D29 | An **admin session also opens exports**. Admins should not have to know the shared password to view what they just generated. The reverse is never true. |
| D30 | Unset export credentials mean the gate is **closed, not open** — `/exports` returns 401 rather than falling back to the pre-D25 open behaviour. A misconfiguration must not silently republish every department. |
| D31 | The login surface is a **small server-rendered page**, not the SPA. The SPA is the admin application; the staff entry point should not load it, and a Persian form on a standalone page is a few lines. |

### What must not break

- **Range requests.** `StaticFiles` supports them today and iOS Safari's PDF viewer relies on them.
  A hand-rolled file handler that ignores `Range` will break PDF viewing on exactly the device this
  feature exists for. `FileResponse` handles it; a naive `Response(body)` does not.
- **The PDF is at the same path** and must be gated identically, or `.html` → `.pdf` walks past the gate.
- **Mount ordering** (§2.4) stays load-bearing, and its existing test must keep passing.
- **The in-document «چاپ / PDF» button** navigates same-origin, so the cookie rides along automatically —
  provided the cookie's `path` covers the PDF as well as the HTML.
