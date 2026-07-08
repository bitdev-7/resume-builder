/** Try to pull a posted/reposted date line from raw job page text (LinkedIn, Indeed, etc.). */
export function extractPostedDateFromText(pageContent: string): string {
  const text = pageContent.replace(/\s+/g, " ").trim();
  if (!text) return "";

  const patterns = [
    /\b(?:reposted|posted)\s+(?:on\s+)?(\d+\s+(?:seconds?|minutes?|hours?|days?|weeks?|months?)\s+ago)\b/i,
    /\b(?:reposted|posted)\s+(?:on\s+)?((?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\.?\s+\d{1,2},?\s+\d{4})\b/i,
    /\b(?:reposted|posted)\s+(?:on\s+)?(\d{1,2}[/-]\d{1,2}[/-]\d{2,4})\b/i,
    /\b(?:reposted|posted)\s+(?:on\s+)?(\d{4}-\d{2}-\d{2})\b/i,
    /\b(?:date posted|posting date|posted date)[:\s]+([^|•\n]{4,40})/i,
    /\b(?:reposted|posted)\s+(?:on\s+)?([A-Za-z]+\s+\d{1,2},?\s+\d{4})\b/i,
  ];

  for (const pattern of patterns) {
    const match = text.match(pattern);
    const value = match?.[1]?.trim().replace(/\s+/g, " ");
    if (value && value.length <= 48) {
      return value;
    }
  }

  return "";
}

export function normalizePostedDate(value: unknown): string {
  const normalized = String(value ?? "").trim().replace(/\s+/g, " ");
  if (!normalized) return "";
  if (/^(none|null|n\/a|unknown|not found)$/i.test(normalized)) return "";
  return normalized.slice(0, 64);
}
