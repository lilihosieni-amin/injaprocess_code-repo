# Reports — Reading in the Application, Withdrawn

| | |
|---|---|
| **Date** | 2026-09-26 |
| **Status** | Approved by lili, 2026-09-26, after reviewing P2 running locally |
| **Amends** | `2026-08-04-multi-user-rbac-design.md` — withdraws the reading half of **D25**, removes **`report.viewed`** from D42's catalogue, and retires **§11 test 23** with its subject |
| **Unchanged** | D24, D26, D27, D28, D29 and the rest of §6; the download, the registry, the cache key and the retirement of the export credential all stand as approved |
| **Architecture** | `ARD.md` §13.2, §13.3, §13.4 record the same withdrawal |

---

## 1. Why

D25 split one feature in two: **reading** a report — the payload rendered by the
application — authorised by `view`, and **downloading** the built single file,
authorised by `export_pdf`. Both halves were built and both were reviewed.

Seeing it running, the owner withdrew the reading half. Her reason is the one the
spec could not have known: the application **already** shows a department's
content, through the flowchart screen and the step-by-step screen it has always
had. A second surface rendering the same processes as a *document* was a second
way to read the same thing, and the menu had to offer «مشاهده» beside «دریافت
فایل» to reach it.

This is a product decision, not a defect. What D25 was protecting — that the
ability to download may be withheld from someone who may still read — is still
protected, and by the surface that always carried it: `view` governs the process
screens, `export_pdf` governs the file, and they remain separate capabilities at
separate scopes.

## 2. What is withdrawn

**D25's reading half.** `GET /api/departments/{code}/reports/{kind}` is deleted,
with the frontend route, the screen and the two lazily-loaded renderers that
existed only to serve it. A report is the downloadable file; the application
shows content through its own screens.

**The `⋯` menu returns to two rows**, one per report, each starting its download:
«دانلود گام‌به‌گام» and «دانلود فلوچارتی». The labels are the registry's `name`
field, so D26 is untouched — one server-side list still drives the menu, and
adding a report is still one registry entry plus its renderer.

**`report.viewed` leaves D42's catalogue.** It had exactly one writer, inside the
deleted handler. This matters for §11 **test 16c** — *every catalogued event has
a writer* — which P3 will implement over the catalogue: left in, `report.viewed`
would fail that test forever, and the failure would look like a missing feature
rather than a withdrawn one. `report.downloaded` is unaffected and still carries
its `format`.

**§11 test 23 retires with its subject.** *"A role holding `view` without
`export_pdf` receives the rendered payload and never the single-file artifact's
bytes"* described a comparison between two responses; there is now one response.
What it was really guarding — that the artifact's bytes reach only an
`export_pdf` holder — is asserted where the artifact is served, in
`test_reports_download.py`: a `reader_no_download` holder gets 403 and an
`access.denied` row, and an out-of-scope caller gets the bare 404.

## 3. What is not withdrawn

- **D24** — the shared export credential, its cookie, its login page and the
  public `/exports` route stay deleted. One account, one login.
- **D26** — the backend registry, and grants that reference its ids.
- **D27** — the fingerprint-keyed cache, including the policy version in the key.
- **D28** — no permanent link; the key moves with the content.
- **D29** — one flowchart renderer, pinned by `parity.test.tsx`.

## 4. A consequence worth recording

The viewer required the export bundles' stylesheets to be importable by the
application, which meant moving each document's background off `body` onto its
own wrapper. `ui/export/print/print.css` whitens `body` for print — so while the
viewer existed, **every generated flowchart PDF carried the desk colour across
the empty area of each page.** The owner caught it in a generated file.

Withdrawing the viewer removed the reason for that scoping, and the stylesheets
are byte-identical to their pre-P2 versions again. The lesson is worth keeping:
a stylesheet written for a standalone document has global rules by design, and
lifting it into an application is not free — the print half is where the cost
showed up, one layer away from anything the change appeared to touch.

## 5. The design deliverables

`ui/design/Inja Panel.dc.html` and `Inja Reader.dc.html` still draw the
«نمایش‌های دپارتمان» dialog with «مشاهده» beside «دریافت فایل». They are the
design of record for this system, and the product now deliberately differs from
them on this one surface. That divergence is deliberate and is recorded here;
whether the deliverables are annotated is the owner's call.
