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
# Standard pi provider env vars -> auth.json key mapping
# (from pi docs/providers.md)
env_to_auth() {
  case "$1" in
    ANTHROPIC_API_KEY)            echo "anthropic" ;;
    OPENAI_API_KEY)               echo "openai" ;;
    AZURE_OPENAI_API_KEY)         echo "azure-openai-responses" ;;
    DEEPSEEK_API_KEY)             echo "deepseek" ;;
    GEMINI_API_KEY)               echo "google" ;;
    MISTRAL_API_KEY)              echo "mistral" ;;
    GROQ_API_KEY)                 echo "groq" ;;
    CEREBRAS_API_KEY)             echo "cerebras" ;;
    XAI_API_KEY)                  echo "xai" ;;
    OPENROUTER_API_KEY)           echo "openrouter" ;;
    AI_GATEWAY_API_KEY)           echo "vercel-ai-gateway" ;;
    ZAI_API_KEY)                  echo "zai" ;;
    OPENCODE_API_KEY)             echo "opencode" ;;
    HF_TOKEN)                     echo "huggingface" ;;
    FIREWORKS_API_KEY)            echo "fireworks" ;;
    TOGETHER_API_KEY)             echo "together" ;;
    KIMI_API_KEY)                 echo "kimi-coding" ;;
    MINIMAX_API_KEY)              echo "minimax" ;;
    XIAOMI_API_KEY)               echo "xiaomi" ;;
    *)                            echo "" ;;
  esac
}

# Only write auth.json if no file is already present (mounted or inherited)
if [ ! -f "${PI_AGENT_DIR}/auth.json" ]; then
  # Collect provider entries from env vars
  # shellcheck disable=SC2012
  auth_keys=""
  for var in $(env | cut -d= -f1); do
    key=$(env_to_auth "$var")
    if [ -n "$key" ] && eval [ -n "\"\${$var+x}\"" ]; then
      value=$(eval echo "\"\${$var}\"")
      if [ -n "$value" ]; then
        if [ -z "$auth_keys" ]; then
          auth_keys="$key"
        else
          auth_keys="${auth_keys} ${key}"
        fi
        # Export each value for later use
        eval "auth_val_${key}=\"\${value}\""
      fi
    fi
  done

  if [ -n "$auth_keys" ]; then
    mkdir -p "${PI_AGENT_DIR}"
    # Write JSON with proper formatting using a heredoc
    {
      printf '{\n'
      _count=0
      for _key in $auth_keys; do
        eval "_val=\"\${auth_val_${_key}}\""
        if [ $_count -gt 0 ]; then
          printf ',\n'
        fi
        printf '    "%s": { "type": "api_key", "key": "%s" }' "$_key" "$_val"
        _count=$((_count + 1))
      done
      printf '\n}\n'
    } > "${PI_AGENT_DIR}/auth.json"
    chmod 600 "${PI_AGENT_DIR}/auth.json"
    echo "[entrypoint] Wrote auth.json from env vars ($_count provider(s))"
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
