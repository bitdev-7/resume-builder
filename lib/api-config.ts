/**
 * Base URL for the standalone API server (no trailing slash).
 *
 * NEXT_PUBLIC_API_URL accepts three forms:
 *  - empty        -> use Next.js rewrites to the backend (see frontend/next.config.js)
 *  - full origin  -> e.g. https://api.example.com (used verbatim)
 *  - ":<port>"    -> e.g. ":9999" resolves to the SAME host the page was opened from,
 *                    on that port, at runtime in the browser. This lets the app be reached
 *                    from any laptop by IP/hostname with no rebuild when the IP changes.
 */
export function getApiBaseUrl(): string {
  const raw = (process.env.NEXT_PUBLIC_API_URL || "").trim().replace(/\/+$/, "");
  if (!raw) return "";

  if (raw.startsWith(":")) {
    // Resolve against the current host in the browser. During SSR there is no host,
    // so fall back to a relative path — the real fetch runs client-side anyway.
    if (typeof window === "undefined") return "";
    return `${window.location.protocol}//${window.location.hostname}${raw}`;
  }

  return raw;
}

/** Build a full API path. Paths should start with /api/… */
export function apiUrl(path: string): string {
  const normalized = path.startsWith("/") ? path : `/${path}`;
  const base = getApiBaseUrl();
  return base ? `${base}${normalized}` : normalized;
}
