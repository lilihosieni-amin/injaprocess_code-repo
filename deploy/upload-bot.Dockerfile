# Bot 1 — raw voice/file intake (ARD §11). Minimal Python image.
FROM python:3.11-slim
WORKDIR /app
COPY upload-bot/ /app/upload-bot/
RUN pip install --no-cache-dir "/app/upload-bot[socks]"
# data-repo bind-mounted at runtime; DATA_ROOT + ALLOWED_USER_IDS via env_file
CMD ["upload-bot"]
