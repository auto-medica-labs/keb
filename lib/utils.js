// lib/utils.js — Shared utility functions (mirrors pi-kb logic)
//
// Used by the Chrome extension for local caching, URL handling, and hashing.

/**
 * Generate a URL-safe slug from text.
 */
export function slugify(text) {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
}

/**
 * Normalize a URL for dedup comparison: strip trailing slash (unless root),
 * fragment, and default ports (443 for https, 80 for http).
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
 * Current time as ISO 8601 string.
 */
export function isoNow() {
  return new Date().toISOString();
}

/**
 * SHA-256 hash of a string (via SubtleCrypto).
 * Returns hex-encoded hash.
 */
export async function hashContent(content) {
  const encoder = new TextEncoder();
  const data = encoder.encode(content);
  const hashBuffer = await crypto.subtle.digest("SHA-256", data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map((b) => b.toString(16).padStart(2, "0")).join("");
}

/**
 * Escape HTML entities in a string (for safe rendering).
 */
export function escapeHtml(str) {
  const map = {
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;",
  };
  return str.replace(/[&<>"']/g, (ch) => map[ch] || ch);
}

/**
 * Convert a markdown-like text to simple HTML (for summary rendering in side panel).
 * Handles [[links]], **bold**, and basic formatting.
 */
export function renderMarkdown(text) {
  let html = escapeHtml(text);

  // Wiki links: [[summary/doc-name]] or [[concept/slug]]
  html = html.replace(
    /\[\[([a-z]+)\/([^\]]+)\]\]/g,
    '<span class="kb-link kb-link-$1" data-slug="$2">$2</span>',
  );

  // Bold
  html = html.replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>");

  // Italic
  html = html.replace(/\*([^*]+)\*/g, "<em>$1</em>");

  // Inline code
  html = html.replace(/`([^`]+)`/g, "<code>$1</code>");

  // Line breaks
  html = html.replace(/\n/g, "<br>");

  return html;
}
