#!/bin/sh
# =============================================================================
# Entrypoint for chrome-kb bridge container.
#
# Generates pi config files from environment variables so that spawned
# child pi processes (for /kb-add, /kb-query) have the credentials and
# model selection they need.
#
# Environment variables:
#
#   API key env vars (standard pi names):
#     ANTHROPIC_API_KEY, OPENAI_API_KEY, DEEPSEEK_API_KEY,
#     GEMINI_API_KEY, GROQ_API_KEY, MISTRAL_API_KEY, XAI_API_KEY,
#     OPENROUTER_API_KEY, HF_TOKEN, etc.
#     See pi docs/providers.md for the full list.
#
#   PI_DEFAULT_PROVIDER   — default provider name (e.g., "anthropic")
#   PI_DEFAULT_MODEL       — default model ID (e.g., "claude-sonnet-4-20250514")
#   PI_DEFAULT_THINKING    — thinking level (e.g., "high", "medium")
#
#   PORT, HOST            — bridge listen settings (passed through)
#
# Volume mounts (alternative to env vars — for advanced config):
#   -v $HOME/.pi/agent/auth.json:/root/.pi/agent/auth.json:ro
#   -v $HOME/.pi/agent/settings.json:/root/.pi/agent/settings.json:ro
#   -v $HOME/.pi/agent/models.json:/root/.pi/agent/models.json:ro
#   -v kb-data:/root/.pi/agent/kb
#
# If auth.json is mounted (or already exists), it takes priority over
# env vars, matching pi's native resolution order.
# =============================================================================

set -e

PI_AGENT_DIR="${HOME}/.pi/agent"

# ---------------------------------------------------------------------------
# 1. Build auth.json from environment variables
# ---------------------------------------------------------------------------
# Only write auth.json if no file is already present (mounted or inherited)
if [ ! -f "${PI_AGENT_DIR}/auth.json" ]; then
  mkdir -p "${PI_AGENT_DIR}"
  # Use node to build JSON safely — JSON.stringify handles all special
  # character escaping that shell printf / eval cannot.
  count=$(node - "${PI_AGENT_DIR}/auth.json" <<'NODEAUTH'
var fs = require("fs");
var path = process.argv[2];

// Standard pi provider env vars -> auth.json key mapping
// (from pi docs/providers.md)
var map = {
  ANTHROPIC_API_KEY: "anthropic",
  OPENAI_API_KEY: "openai",
  AZURE_OPENAI_API_KEY: "azure-openai-responses",
  DEEPSEEK_API_KEY: "deepseek",
  GEMINI_API_KEY: "google",
  MISTRAL_API_KEY: "mistral",
  GROQ_API_KEY: "groq",
  CEREBRAS_API_KEY: "cerebras",
  XAI_API_KEY: "xai",
  OPENROUTER_API_KEY: "openrouter",
  AI_GATEWAY_API_KEY: "vercel-ai-gateway",
  ZAI_API_KEY: "zai",
  OPENCODE_API_KEY: "opencode",
  HF_TOKEN: "huggingface",
  FIREWORKS_API_KEY: "fireworks",
  TOGETHER_API_KEY: "together",
  KIMI_API_KEY: "kimi-coding",
  MINIMAX_API_KEY: "minimax",
  XIAOMI_API_KEY: "xiaomi"
};

var auth = {};
Object.keys(map).forEach(function(k) {
  var v = process.env[k];
  if (v) auth[map[k]] = { type: "api_key", key: v };
});

var count = Object.keys(auth).length;
if (count > 0) {
  fs.writeFileSync(path, JSON.stringify(auth, null, 2) + "\n");
  fs.chmodSync(path, 0o600);
}
process.stdout.write(String(count));
NODEAUTH
  )
  if [ -n "$count" ] && [ "$count" -gt 0 ]; then
    echo "[entrypoint] Wrote auth.json from env vars ($count provider(s))"
  fi
fi

# ---------------------------------------------------------------------------
# 2. Generate settings.json from PI_DEFAULT_* env vars
# ---------------------------------------------------------------------------
SETTINGS_FILE="${PI_AGENT_DIR}/settings.json"

# Merge PI_DEFAULT_* env vars into settings.json (preserves any existing
# keys like "packages" from pi install or user mounts).
_has_provider=0
_has_model=0
_has_thinking=0
[ -n "${PI_DEFAULT_PROVIDER}" ] && _has_provider=1
[ -n "${PI_DEFAULT_MODEL}" ] && _has_model=1
[ -n "${PI_DEFAULT_THINKING}" ] && _has_thinking=1
_has_defaults=$((_has_provider + _has_model + _has_thinking))

if [ $_has_defaults -gt 0 ]; then
  mkdir -p "${PI_AGENT_DIR}"
  # Use node to merge env vars into settings.json (preserving existing fields)
  node - "$SETTINGS_FILE" "$PI_DEFAULT_PROVIDER" "$PI_DEFAULT_MODEL" "$PI_DEFAULT_THINKING" <<'NODEJS'
var fs = require("fs");
// node - puts "-" at argv[1]; real args start at argv[2]
var file = process.argv[2];
var provider = process.argv[3];
var model = process.argv[4];
var thinking = process.argv[5];
var obj = {};
try { obj = JSON.parse(fs.readFileSync(file, "utf8")); } catch (e) {}
if (provider) obj.defaultProvider = provider;
if (model) obj.defaultModel = model;
if (thinking) obj.defaultThinkingLevel = thinking;
fs.writeFileSync(file, JSON.stringify(obj, null, 2) + "\n");
NODEJS
  echo "[entrypoint] Merged settings.json: ${PI_DEFAULT_PROVIDER:-?} / ${PI_DEFAULT_MODEL:-?}"
fi

# ---------------------------------------------------------------------------
# 3. Ensure KB directory exists (for sync operations)
# ---------------------------------------------------------------------------
mkdir -p "${PI_AGENT_DIR}/kb"

# ---------------------------------------------------------------------------
# 4. Execute the bridge server
# ---------------------------------------------------------------------------
echo "[entrypoint] Starting bridge server..."
exec node src/bridge-server.js
