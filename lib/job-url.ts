/** Strip UTM/query params; same rule as Windows Job Tracker. */
export function normalizeJobUrl(url: string): string {
  let s = String(url).trim().split(/\s+/).join(" ");
  if (s.includes("?")) {
    s = s.split("?", 2)[0] ?? s;
  }
  return s;
}
