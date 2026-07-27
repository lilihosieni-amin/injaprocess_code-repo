# UI backend (FastAPI) + built frontend (ARD §13). Two-stage build.
# --- stage 1: build the Vite frontend ---
FROM node:20-slim AS ui-build
WORKDIR /ui
COPY ui/package.json ui/package-lock.json /ui/
RUN npm ci
COPY ui/ /ui/
RUN npm run build          # emits /ui/dist and /ui/dist-export (the export templates)

# --- stage 2: backend runtime ---
FROM python:3.11-slim
# `git` for the engine CLIs. `chromium` is the export PDF renderer (spec §11,
# D17): the printed flowchart's diagrams do not exist until the page's own
# JavaScript has measured real Persian glyphs and sliced the bands, so only
# something that executes the page can produce them, and iOS Safari cannot print
# the page itself. `inja_ui_backend.pdf` drives this binary over CDP.
#
# **Why the full `chromium` and not Debian's `chromium-shell`.** The plan asked
# for the headless shell, for a smaller surface. Debian's `chromium-shell` is a
# *content_shell* build with no printing compiled in: it launches, speaks CDP,
# and answers `Page.printToPDF` with
# `{'code': -32601, 'message': "'Page.printToPDF' wasn't found"}` — measured on
# this image, 2026-07-27. It cannot do the one thing it would be here for.
# Google's separate `chrome-headless-shell` build *can* print, but it ships only
# as a version-pinned zip from storage.googleapis.com, with its shared-library
# list curated by hand and no security updates; `chromium` from Debian is
# patched from trixie-security by the same `apt-get upgrade` as everything else
# in this image, which for a browser on a public-facing service is worth ~400 MB.
#
# **Fonts.** None are installed for Persian, and none are needed: both exported
# documents embed Vazirmatn as a `data:` URI (D3 — the export is standalone), so
# the browser never asks the system for an Arabic-script face. Verified rather
# than assumed — a PDF rendered in an image carrying only DejaVu has its Persian
# text extractable and correctly shaped. The transitive `fontconfig` +
# `fonts-dejavu-core` that chromium pulls in cover the Latin fallback.
RUN apt-get update && apt-get install -y --no-install-recommends git chromium \
    && rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY ui-backend/ /app/ui-backend/
COPY engine/ /app/engine/
COPY schemas/ /app/schemas/
RUN pip install --no-cache-dir /app/ui-backend /app/engine
COPY --from=ui-build /ui/dist /app/ui-static
COPY --from=ui-build /ui/dist-export /app/ui-export-templates
# The real ELF, not `/usr/bin/chromium`: that is a shell wrapper which sources
# `/etc/chromium.d/*` and starts the browser as a *child*, so the renderer's
# `terminate()` would reach the wrapper and leave a Chromium behind — a leaked
# browser is 300-400 MB on a 3.7 GB host. Every flag the renderer needs is passed
# explicitly by `pdf.launch_flags`, so the wrapper adds nothing here.
# Unset in a deployment without a browser: the export still publishes its HTML,
# just with no PDF beside it (D21), and the document's print button falls back to
# printing in place.
ENV UI_STATIC_DIR=/app/ui-static \
    SCHEMA_DIR=/app/schemas \
    UI_EXPORT_TEMPLATE_DIR=/app/ui-export-templates \
    CHROMIUM_PATH=/usr/lib/chromium/chromium
EXPOSE 8000
# DATA_ROOT + UI_* secrets via env_file; app:app builds only when DATA_ROOT is set
CMD ["uvicorn", "inja_ui_backend.app:app", "--host", "0.0.0.0", "--port", "8000"]
