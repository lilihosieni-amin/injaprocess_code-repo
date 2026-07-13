# Bot 2 — claude-code-telegram @ v1.6.0 (ARD §3, §12, §16). The heavy image:
# Python + Node + Claude Code CLI + engine CLIs + git + the pinned bot with patches.
FROM python:3.11-slim

RUN apt-get update && apt-get install -y --no-install-recommends \
      git curl ca-certificates patch nodejs npm \
    && rm -rf /var/lib/apt/lists/*

# Claude Code CLI (the pipeline runs inside this container)
RUN npm install -g @anthropic-ai/claude-code

# uv, for the pinned tool install. Installed from PyPI (the astral.sh install
# script host is not reachable from the build network); uv lands on the default
# PATH at /usr/local/bin. /root/.local/bin is where `uv tool install` puts the
# bot's console script (claude-telegram-bot), so it must be on PATH too.
RUN pip install --no-cache-dir uv
ENV PATH="/root/.local/bin:${PATH}"

# Engine CLIs on PATH — baked, outside APPROVED_DIRECTORY (INV-1/INV-2)
COPY engine/ /opt/engine/
COPY schemas/ /opt/schemas/
RUN pip install --no-cache-dir /opt/engine
ENV SCHEMA_DIR=/opt/schemas

# Pinned bot + SOCKS backend
RUN uv tool install --with socksio \
      "git+https://github.com/RichardAtCT/claude-code-telegram@v1.6.0"

# Apply the two required source patches into the tool's site-packages.
# The diffs target a/src/...; -p1 at the site-packages root resolves them.
COPY control-bot/patches/ /opt/patches/
RUN set -eux; \
    SITE="$(uv tool run --from claude-code-telegram python -c \
      'import os, src.bot.features.registry as r; \
       print(os.path.abspath(os.path.join(os.path.dirname(r.__file__), "..", "..", "..")))')"; \
    patch -p1 --forward -d "$SITE" < /opt/patches/0001-disable-conversation-enhancer.patch; \
    patch -p1 --forward -d "$SITE" < /opt/patches/0002-throttle-progress-updates.patch; \
    grep -q "at most once per 2s\|rate-limit" "$SITE/src/bot/handlers/message.py"

# Runtime: APPROVED_DIRECTORY (data-repo) bind-mounted; env_file supplies the profile;
# claude-credentials volume mounted at /root/.claude for subscription auth.
CMD ["claude-telegram-bot"]
