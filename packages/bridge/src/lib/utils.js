// @ts-check

// ---------------------------------------------------------------------------
// Shared helpers: logging, JSON, URL manipulation
// ---------------------------------------------------------------------------

/**
 * Safely JSON-stringify an object. Returns "{}" on circular references / errors.
 * @param {unknown} obj
 * @returns {string}
 */
export function safeStringify(obj) {
  try {
    return JSON.stringify(obj);
  } catch {
    return "{}";
  }
}

/**
 * Write a timestamped log line to stdout.
 * @param {string} msg
 * @returns {void}
 */
export function log(msg) {
  const ts = new Date().toISOString().slice(11, 19);
  process.stdout.write(`[${ts}] ${msg}\n`);
}

/**
 * Normalize a URL for dedup comparison.
 * Strips trailing slash (unless root), fragment, and default ports (443/80).
 * @param {string} url - Raw URL string
 * @returns {string} Normalized URL
 */
export function normalizeUrl(url) {
  try {
    const parsed = new URL(url);
    parsed.hash = "";
    if (parsed.pathname.length > 1 && parsed.pathname.endsWith("/")) {
      parsed.pathname = parsed.pathname.slice(0, -1);
    }
    if (
      (parsed.protocol === "https:" && parsed.port === "443") ||
      (parsed.protocol === "http:" && parsed.port === "80")
    ) {
      parsed.port = "";
    }
    return parsed.toString();
  } catch {
    return url;
  }
}

/**
 * Quick check: does a string look like an HTTP URL?
 * @param {string} str
 * @returns {boolean}
 */
export function isUrl(str) {
  return /^https?:\/\//i.test(str);
}

/**
 * Check if a normalized URL is already in a registry.
 * @param {string} url - Raw URL
 * @param {import('../ports/kb-store.js').Registry} registry
 * @returns {boolean}
 */
export function isUrlInRegistry(url, registry) {
  const normalized = normalizeUrl(url);
  return Object.values(registry).some((e) => normalizeUrl(e.originalPath) === normalized);
}

/**
 * Find a registry entry by URL (normalized comparison).
 * @param {string} url - Raw URL
 * @param {import('../ports/kb-store.js').Registry} registry
 * @returns {import('../ports/kb-store.js').RegistryEntry|null}
 */
export function findByUrl(url, registry) {
  const normalized = normalizeUrl(url);
  return Object.values(registry).find((e) => normalizeUrl(e.originalPath) === normalized) ?? null;
}
