# Bot 1 — raw voice/file intake (ARD §11) + automatic transcription (design 2026-08-25).
FROM python:3.11-slim
WORKDIR /app
# ffmpeg/libopus: every audio is transcoded to mono Opus before the Vertex call (D1).
RUN apt-get update && apt-get install -y --no-install-recommends ffmpeg \
    && rm -rf /var/lib/apt/lists/*
COPY upload-bot/ /app/upload-bot/
# The engine CLIs are baked in so `transcribe` is on PATH; the bot invokes it as a
# subprocess rather than importing it (the two stay separate installs).
COPY engine/ /opt/engine/
RUN pip install --no-cache-dir "/app/upload-bot[socks]" "/opt/engine[vertex]"
# data-repo bind-mounted at runtime; DATA_ROOT + ALLOWED_USER_IDS via env_file
CMD ["upload-bot"]
