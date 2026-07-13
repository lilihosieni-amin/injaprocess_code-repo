# UI backend (FastAPI) + built frontend (ARD §13). Two-stage build.
# --- stage 1: build the Vite frontend ---
FROM node:20-slim AS ui-build
WORKDIR /ui
COPY ui/package.json ui/package-lock.json /ui/
RUN npm ci
COPY ui/ /ui/
RUN npm run build          # emits /ui/dist

# --- stage 2: backend runtime ---
FROM python:3.11-slim
RUN apt-get update && apt-get install -y --no-install-recommends git \
    && rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY ui-backend/ /app/ui-backend/
COPY engine/ /app/engine/
COPY schemas/ /app/schemas/
RUN pip install --no-cache-dir /app/ui-backend /app/engine
COPY --from=ui-build /ui/dist /app/ui-static
ENV UI_STATIC_DIR=/app/ui-static \
    SCHEMA_DIR=/app/schemas
EXPOSE 8000
# DATA_ROOT + UI_* secrets via env_file; app:app builds only when DATA_ROOT is set
CMD ["uvicorn", "inja_ui_backend.app:app", "--host", "0.0.0.0", "--port", "8000"]
