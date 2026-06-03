#!/bin/sh
# =============================================================================
# Entrypoint for chrome-kb bridge container.
#
# Generates pi config files from environment variables so that spawned
# child pi processes (for /kb-add, /kb-query) have the credentials and
# model selection they need.
#
# Primary (recommended) — custom provider via ~/.pi/agent/models.json:
#
#   LLM_PROVIDER   — Provider name/slug (e.g., "ollama", "my-provider")
#   LLM_BASE_URL   — API base URL (e.g., "http://host.docker.internal:11434/v1")
#   LLM_MODEL      — Model ID (e.g., "llama3.1:8b", "gpt-4")
#
#   Optional:
#     LLM_API        — API type (default: "openai-completions")
#                      See pi docs/models.md for supported APIs:
#                      "anthropic-messages", "google-generative-ai",
#                      "openai-responses"
#     LLM_API_KEY    — API key (required by pi, can be dummy for local models)
#     LLM_MODEL_NAME — Human-readable model name (defaults to LLM_MODEL)
#     LLM_REASONING  — Set "true" for reasoning-capable models
#
# Example .env:
#   LLM_PROVIDER=ollama
#   LLM_BASE_URL=http://host.docker.internal:11434/v1
#   LLM_MODEL=llama3.1:8b
#   LLM_API_KEY=ollama
#
# Legacy — native pi providers via auth.json + PI_DEFAULT_*:
#   ANTHROPIC_API_KEY, OPENAI_API_KEY, etc.
#   PI_DEFAULT_PROVIDER, PI_DEFAULT_MODEL, PI_DEFAULT_THINKING
#   See pi docs/providers.md for the full list.
#
# Volume mounts (alternative to env vars — for advanced config):
#   -v $HOME/.pi/agent/models.json:/root/.pi/agent/models.json:ro
#   -v $HOME/.pi/agent/auth.json:/root/.pi/agent/auth.json:ro
#   -v $HOME/.pi/agent/settings.json:/root/.pi/agent/settings.json:ro
#   -v kb-data:/root/.pi/agent/kb
# =============================================================================

set -e

PI_AGENT_DIR="${HOME}/.pi/agent"
mkdir -p "${PI_AGENT_DIR}"
SETTINGS_FILE="${PI_AGENT_DIR}/settings.json"

# ---------------------------------------------------------------------------
# 1. Build models.json from LLM_* environment variables (primary)
# ---------------------------------------------------------------------------
# Generates ~/.pi/agent/models.json with a custom provider + model.
# This is the recommended way to configure LLM access in Docker.
# If models.json is already mounted, this step is skipped.
#
# Required: LLM_PROVIDER, LLM_BASE_URL, LLM_MODEL
# Optional: LLM_API (default: openai-completions), LLM_API_KEY,
#           LLM_MODEL_NAME, LLM_REASONING
if [ -n "$LLM_PROVIDER" ] && [ -n "$LLM_BASE_URL" ] && [ -n "$LLM_MODEL" ] && [ ! -f "${PI_AGENT_DIR}/models.json" ]; then
  MODELS_FILE="${PI_AGENT_DIR}/models.json"
  node - "$MODELS_FILE" "$LLM_PROVIDER" "${LLM_API:-openai-completions}" "$LLM_BASE_URL" "${LLM_API_KEY:-}" "$LLM_MODEL" "${LLM_MODEL_NAME:-}" "${LLM_REASONING:-false}" <<'NODEMODELS'
var fs = require("fs");
var file = process.argv[2];
var provider = process.argv[3];
var api = process.argv[4];
var baseUrl = process.argv[5];
var apiKey = process.argv[6];
var model = process.argv[7];
var modelName = process.argv[8];
var reasoning = process.argv[9] === "true";

var obj = {};
try { obj = JSON.parse(fs.readFileSync(file, "utf8")); } catch (e) {}
if (!obj.providers) obj.providers = {};

var modelEntry = { id: model };
if (modelName) modelEntry.name = modelName;
if (reasoning) modelEntry.reasoning = true;

obj.providers[provider] = {
  baseUrl: baseUrl,
  api: api,
  apiKey: apiKey,
  models: [modelEntry]
};

fs.writeFileSync(file, JSON.stringify(obj, null, 2) + "\n");
NODEMODELS
  echo "[entrypoint] Wrote models.json: provider=${LLM_PROVIDER}, model=${LLM_MODEL}"
fi

# ---------------------------------------------------------------------------
# 2. Build auth.json from environment variables (legacy fallback)
# ---------------------------------------------------------------------------
# Only write auth.json if no file is already present (mounted or inherited).
# Not needed when using LLM_* env vars above — the API key goes in models.json.
if [ ! -f "${PI_AGENT_DIR}/auth.json" ]; then
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
# 3. Generate settings.json with default provider/model
# ---------------------------------------------------------------------------
# Tries LLM_* env vars (primary) first, then PI_DEFAULT_* (legacy fallback).
# Merges into existing settings.json, preserving keys like "packages".
_DEFAULT_PROVIDER="${LLM_PROVIDER:-${PI_DEFAULT_PROVIDER:-}}"
_DEFAULT_MODEL="${LLM_MODEL:-${PI_DEFAULT_MODEL:-}}"
_DEFAULT_THINKING="${LLM_THINKING:-${PI_DEFAULT_THINKING:-}}"

_has_provider=0; _has_model=0; _has_thinking=0
[ -n "$_DEFAULT_PROVIDER" ] && _has_provider=1
[ -n "$_DEFAULT_MODEL" ] && _has_model=1
[ -n "$_DEFAULT_THINKING" ] && _has_thinking=1
_has_defaults=$((_has_provider + _has_model + _has_thinking))

if [ $_has_defaults -gt 0 ]; then
  node - "$SETTINGS_FILE" "$_DEFAULT_PROVIDER" "$_DEFAULT_MODEL" "$_DEFAULT_THINKING" <<'NODESETTINGS'
var fs = require("fs");
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
NODESETTINGS
  echo "[entrypoint] Merged settings.json: ${_DEFAULT_PROVIDER:-?} / ${_DEFAULT_MODEL:-?}"
fi

# ---------------------------------------------------------------------------
# 4. Ensure KB directory exists (for sync operations)
# ---------------------------------------------------------------------------
mkdir -p "${PI_AGENT_DIR}/kb"

# ---------------------------------------------------------------------------
# 5. Execute the bridge server
# ---------------------------------------------------------------------------
echo "[entrypoint] Starting bridge server..."
exec node src/bridge-server.js
