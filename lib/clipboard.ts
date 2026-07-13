/**
 * Copy text to the clipboard, working in non-secure contexts.
 *
 * `navigator.clipboard` is only available in a "secure context" (HTTPS or localhost),
 * so over plain HTTP to a LAN IP/hostname it is undefined. Fall back to a hidden
 * <textarea> + document.execCommand("copy"), which works on plain HTTP.
 *
 * Returns true on success, false if copying was not possible.
 */
export async function copyText(text: string): Promise<boolean> {
  if (typeof navigator !== "undefined" && navigator.clipboard?.writeText) {
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch {
      // fall through to the legacy path (e.g. permission denied)
    }
  }

  if (typeof document === "undefined") return false;

  try {
    const textarea = document.createElement("textarea");
    textarea.value = text;
    // Keep it out of view and out of the layout/scroll.
    textarea.style.position = "fixed";
    textarea.style.top = "-9999px";
    textarea.style.left = "-9999px";
    textarea.setAttribute("readonly", "");
    document.body.appendChild(textarea);
    textarea.select();
    textarea.setSelectionRange(0, text.length);
    const ok = document.execCommand("copy");
    document.body.removeChild(textarea);
    return ok;
  } catch {
    return false;
  }
}
