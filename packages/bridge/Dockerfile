# =============================================================================
# Dockerfile for chrome-kb bridge
#
# Build:
#   docker build -f packages/bridge/Dockerfile -t chrome-kb-bridge .
#
# Run (recommended: env file with custom provider — keeps secrets out of
# shell history):
#   cp .env.example .env   # fill in LLM_PROVIDER, LLM_BASE_URL, LLM_MODEL, etc.
#   docker run -d \
#     --name chrome-kb-bridge \
#     -p 9876:9876 \
#     --env-file .env \
#     -v kb-data:/root/.pi/agent/kb \
#     chrome-kb-bridge
#
# Run (mount host pi config files directly):
#   docker run -d \
#     --name chrome-kb-bridge \
#     -p 9876:9876 \
#     -v ~/.pi/agent/models.json:/root/.pi/agent/models.json:ro \
#     -v kb-data:/root/.pi/agent/kb \
#     chrome-kb-bridge
#
# Environment variables:
#
#   Primary — custom provider via models.json (recommended):
#     LLM_PROVIDER   — Provider name/slug (e.g., "ollama", "my-provider")
#     LLM_BASE_URL   — API base URL
#     LLM_MODEL      — Model ID (e.g., "llama3.1:8b", "gpt-4")
#     LLM_API        — API type (default: "openai-completions"; see pi
#                      docs/models.md for "anthropic-messages", etc.)
#     LLM_API_KEY    — API key (can be dummy for local models like Ollama)
#     LLM_MODEL_NAME — Optional human-readable model name
#     LLM_REASONING  — Set "true" for reasoning-capable models
#
#   Legacy — native pi providers (auth.json + PI_DEFAULT_*):
#     ANTHROPIC_API_KEY, OPENAI_API_KEY, DEEPSEEK_API_KEY, GEMINI_API_KEY,
#     ... (see pi docs/providers.md for full list)
#     PI_DEFAULT_PROVIDER, PI_DEFAULT_MODEL, PI_DEFAULT_THINKING
#
#   Bridge mode:
#     KEB_MODE  — "hosted" (default, requires auth) or "local"
#     JWT_SECRET — required in hosted mode; generate with:
#                  node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
#
#   Network:
#     PORT  — WebSocket listen port (default: 9876)
#     HOST  — Listen address (default: 0.0.0.0; set to 127.0.0.1 for
#             local-only access when binding to host network)
#
# Volume mounts:
#   models.json            — mount host's ~/.pi/agent/models.json (overrides
#                            LLM_* env vars when present)
#   auth.json              — legacy: mount host's ~/.pi/agent/auth.json
#   settings.json          — mount for additional settings overrides
#   kb-data                — persistent volume for KB documents and user database
#                            (recommended — stores both workspace content and
#                            users.db with registered accounts)
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

# Install ALL dependencies (including devDeps like typescript for pi-kb build)
WORKDIR /app/bridge
RUN npm install

# ---------------------------------------------------------------------------
# pi-kb standalone build layer — compile adapter files
# ---------------------------------------------------------------------------
FROM deps-layer AS pi-kb-build

# Copy the pi-kb source files needed for compilation (preserve dir structure)
COPY packages/pi-kb/extensions /app/pi-kb/extensions

# Copy the bridge's pi-kb build tsconfig
COPY packages/bridge/tsconfig.build-pi-kb.json /app/bridge/tsconfig.build-pi-kb.json

# Compile pi-kb standalone adapter to JS
WORKDIR /app/bridge
RUN npx tsc -p tsconfig.build-pi-kb.json && \
    node -e "require('fs').writeFileSync('../pi-kb/dist/standalone/package.json', JSON.stringify({type:'module'})+String.fromCharCode(10))"

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
# packages list. The entrypoint merges LLM_* or PI_DEFAULT_* env vars
# into this settings.json to set defaultProvider/defaultModel.
COPY --from=pi-layer /root/.pi/agent /root/.pi/agent

# Copy bridge node_modules (production) from deps-layer
# Use a fresh npm install --omit=dev to keep the image small
COPY packages/bridge/package.json /app/bridge/package.json
WORKDIR /app/bridge
RUN npm install --omit=dev

# Copy pi-kb compiled standalone output from pi-kb-build stage
COPY --from=pi-kb-build /app/pi-kb/dist/standalone /app/pi-kb/dist/standalone

# Copy entrypoint and bridge source code
COPY packages/bridge/entrypoint.sh /app/bridge/entrypoint.sh
COPY packages/bridge/src /app/bridge/src

WORKDIR /app/bridge

# Expose the WebSocket port
EXPOSE 9876

# Health check — verify the bridge is responding
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
    CMD node -e "new (require('ws').WebSocket)('ws://127.0.0.1:'+(process.env.PORT||9876)+'/').on('open',function(){process.exit(0)}).on('error',function(){process.exit(1)})"

# Default to hosted mode (auth with JWT required).
# Override KEB_MODE=local for local-only deployments.
ENV KEB_MODE=hosted

# Default listen on all interfaces (inside the container) so Docker
# port mapping works. Override HOST=127.0.0.1 for host-network mode.
ENV HOST=0.0.0.0
ENV PORT=9876

ENTRYPOINT ["/bin/sh", "entrypoint.sh"]
CMD []
