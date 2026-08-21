import type { DefaultSettings } from "@/lib/supabase/database.types";

/** Fallback label when the user has not set a download path yet. */
export const DEFAULT_DOWNLOAD_BASE_PATH = "Downloads";

const LOCAL_CACHE_KEY = "cubi.download_base_path";
/** Path string that was active when the user last linked a folder. */
const LINKED_FOR_PATH_KEY = "cubi.download_linked_for_path";

export type ClientDownloadMode = "linked" | "browser";

export function parseDownloadBasePath(
  settings: DefaultSettings | null | undefined
): string {
  const raw = settings?.download_base_path;
  if (typeof raw === "string" && raw.trim()) return raw.trim();
  return DEFAULT_DOWNLOAD_BASE_PATH;
}

export function downloadBasePathToDefaultSettings(
  current: DefaultSettings | null | undefined,
  downloadBasePath: string
): DefaultSettings {
  const trimmed = downloadBasePath.trim() || DEFAULT_DOWNLOAD_BASE_PATH;
  return {
    ...(current ?? {}),
    download_base_path: trimmed,
  };
}

/** Cache the path on this browser so download helpers can resolve the toast path. */
export function cacheDownloadBasePath(path: string): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(
      LOCAL_CACHE_KEY,
      path.trim() || DEFAULT_DOWNLOAD_BASE_PATH
    );
  } catch {
    // ignore quota / private mode
  }
}

export function readCachedDownloadBasePath(): string {
  if (typeof window === "undefined") return DEFAULT_DOWNLOAD_BASE_PATH;
  try {
    const cached = window.localStorage.getItem(LOCAL_CACHE_KEY)?.trim();
    return cached || DEFAULT_DOWNLOAD_BASE_PATH;
  } catch {
    return DEFAULT_DOWNLOAD_BASE_PATH;
  }
}

export function rememberLinkedDownloadPath(path: string): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(
      LINKED_FOR_PATH_KEY,
      path.trim() || DEFAULT_DOWNLOAD_BASE_PATH
    );
  } catch {
    // ignore
  }
}

export function readLinkedDownloadPath(): string | null {
  if (typeof window === "undefined") return null;
  try {
    return window.localStorage.getItem(LINKED_FOR_PATH_KEY)?.trim() || null;
  } catch {
    return null;
  }
}

export function clearLinkedDownloadPathMemory(): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.removeItem(LINKED_FOR_PATH_KEY);
  } catch {
    // ignore
  }
}

/** True when Settings path no longer matches the path used at link time. */
export function isDownloadPathOutOfSyncWithLink(downloadBasePath: string): boolean {
  const linkedFor = readLinkedDownloadPath();
  if (!linkedFor) return false;
  return (
    (downloadBasePath.trim() || DEFAULT_DOWNLOAD_BASE_PATH) !== linkedFor
  );
}

/** Join a Windows- or POSIX-style base path with job folder + file name. */
export function joinClientDownloadPath(
  basePath: string,
  dirName: string,
  fileName: string
): string {
  const base = (basePath.trim() || DEFAULT_DOWNLOAD_BASE_PATH).replace(
    /[/\\]+$/,
    ""
  );
  const sep = base.includes("\\") || /^[A-Za-z]:/.test(base) ? "\\" : "/";
  return `${base}${sep}${dirName}${sep}${fileName}`;
}
