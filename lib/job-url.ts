/** Store and compare job URLs exactly as provided (no trim, no query stripping). */
export function normalizeJobUrl(url: string): string {
  return String(url ?? "");
}
