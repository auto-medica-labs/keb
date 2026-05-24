# =============================================================================
# Dockerfile for chrome-kb bridge
#
# Build:
#   docker build -f packages/bridge/Dockerfile -t chrome-kb-bridge .
#
# Run (recommended: env file — keeps secrets out of shell history):
#   cp .env.example .env   # then fill in your API keys
#   docker run -d \
#     --name chrome-kb-bridge \
#     -p 9876:9876 \
#     --env-file .env \
#     -v kb-data:/root/.pi/agent/kb \
#     chrome-kb-bridge
#
# Run (mount host pi config):
#   docker run -d \
#     --name chrome-kb-bridge \
#     -p 9876:9876 \
#     -v ~/.pi/agent/auth.json:/root/.pi/agent/auth.json:ro \
#     -v ~/.pi/agent/settings.json:/root/.pi/agent/settings.json:ro \
#     -v kb-data:/root/.pi/agent/kb \
#     chrome-kb-bridge
#
# Environment variables:
#   PORT                   — WebSocket listen port (default: 9876)
#   HOST                   — Listen address (default: 0.0.0.0; set to 127.0.0.1
#                            for local-only access when binding to host network)
#
#   LLM provider API keys (standard pi names):
#     ANTHROPIC_API_KEY    — Anthropic Claude
#     OPENAI_API_KEY       — OpenAI
#     DEEPSEEK_API_KEY     — DeepSeek
#     GEMINI_API_KEY       — Google Gemini
#     ... (see pi docs/providers.md for full list)
#
#   PI_DEFAULT_PROVIDER    — default provider name (e.g. "anthropic")
#   PI_DEFAULT_MODEL       — default model ID (e.g. "claude-sonnet-4-20250514")
#   PI_DEFAULT_THINKING    — default thinking level ("off"|"low"|"medium"|"high"|"xhigh")
#
# Volume mounts:
#   auth.json              — mount host's ~/.pi/agent/auth.json for credentials
#   settings.json          — mount for default provider/model selection
#   models.json            — mount for custom provider/model definitions
#   kb-data                — persistent volume for KB documents (recommended)
# =============================================================================

FROM node:22-slim AS base

# Install system dependencies needed by pi (git for extension installs)
RUN apt-get update && apt-get install -y --no-install-recommends \
    git \
    ca-certificates \
    && rm -rf /var/lib/apt/lists/*

# ---------------------------------------------------------------------------
# pi CLI layer — install globally once
# ---------------------------------------------------------------------------
FROM base AS pi-layer

# TODO: pin to a specific version for reproducible builds
ARG PI_VERSION=latest

RUN npm install -g --ignore-scripts @earendil-works/pi-coding-agent@${PI_VERSION} && \
    pi install git:github.com/dheerapat/pi-kb

# ---------------------------------------------------------------------------
# Bridge dependencies layer — install npm deps
# ---------------------------------------------------------------------------
FROM base AS deps-layer

WORKDIR /app

# Copy only the bridge package manifest
COPY packages/bridge/package.json /app/bridge/package.json

# Install production dependencies (only `ws` at runtime)
WORKDIR /app/bridge
RUN npm install --omit=dev

# ---------------------------------------------------------------------------
# Final stage — minimal runtime image
# ---------------------------------------------------------------------------
FROM node:22-slim

# Install only ca-certificates and git for pi extension checks
RUN apt-get update && apt-get install -y --no-install-recommends \
    git \
    ca-certificates \
    && rm -rf /var/lib/apt/lists/*

# Copy pi CLI + pi-kb from the pi-layer
COPY --from=pi-layer /usr/local/lib/node_modules/@earendil-works/pi-coding-agent \
    /usr/local/lib/node_modules/@earendil-works/pi-coding-agent
# Don't COPY pi directly — it's a symlink in the pi-layer and Docker
# COPY follows symlinks, resolving to the file content, which breaks
# its relative imports (./config.js, ./core/*). Instead, create the
# symlink manually so Node resolves imports relative to the package dir.
RUN ln -sf ../lib/node_modules/@earendil-works/pi-coding-agent/dist/cli.js /usr/local/bin/pi

# Copy pi-kb extension + installed packages manifest from the pi-layer.
# pi-layer ran `pi install git:github.com/dheerapat/pi-kb` which cloned
# the extension to ~/.pi/agent/git/ and wrote a settings.json with the
# packages list. The entrypoint merges PI_DEFAULT_* env vars into this.
COPY --from=pi-layer /root/.pi/agent /root/.pi/agent

# Copy bridge node_modules from deps-layer
COPY --from=deps-layer /app/bridge/node_modules /app/bridge/node_modules

# Copy entrypoint and bridge source code
COPY packages/bridge/entrypoint.sh /app/bridge/entrypoint.sh
COPY packages/bridge/src /app/bridge/src
COPY packages/bridge/package.json /app/bridge/package.json

WORKDIR /app/bridge

# Expose the WebSocket port
EXPOSE 9876

# Health check — verify the bridge is responding
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
    CMD node -e "new (require('ws').WebSocket)('ws://127.0.0.1:'+(process.env.PORT||9876)+'/').on('open',function(){process.exit(0)}).on('error',function(){process.exit(1)})"

# Default listen on all interfaces (inside the container) so Docker
# port mapping works. Override HOST=127.0.0.1 for host-network mode.
ENV HOST=0.0.0.0
ENV PORT=9876

ENTRYPOINT ["/bin/sh", "entrypoint.sh"]
CMD []
