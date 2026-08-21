import path from "path";
import os from "os";

export interface ResumeDownloadPaths {
  dirName: string;
  fileName: string;
}

export function sanitizePathSegment(value: string, fallback: string): string {
  const cleaned = (value.trim() || fallback)
    .replace(/[<>:"/\\|?*\u0000-\u001f]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 80);

  return cleaned || fallback;
}

export function buildResumeDownloadPaths(
  companyName: string,
  jobRole: string,
  personName: string
): ResumeDownloadPaths {
  const company = sanitizePathSegment(companyName, "company");
  const role = sanitizePathSegment(jobRole, "role");
  const name = sanitizePathSegment(personName, "resume");
  return {
    dirName: `${company}_${role}`,
    fileName: `${name}.pdf`,
  };
}

/** Convert `C:\Users\You` → `/mnt/c/Users/You` for WSL hosts. */
export function windowsPathToWslPath(windowsPath: string): string | null {
  const trimmed = windowsPath.trim();
  const match = trimmed.match(/^([A-Za-z]):[\\/]?(.*)$/);
  if (!match) return null;
  const drive = match[1].toLowerCase();
  const rest = match[2].replace(/\\/g, "/").replace(/^\/+/, "");
  return rest ? `/mnt/${drive}/${rest}` : `/mnt/${drive}`;
}

function isWslEnvironment(
  platform: NodeJS.Platform,
  env: Record<string, string | undefined>,
  readProcVersion: () => string
): boolean {
  if (platform !== "linux") return false;
  if (env.WSL_DISTRO_NAME || env.WSL_INTEROP || env.WSLENV) return true;
  try {
    const version = readProcVersion().toLowerCase();
    return version.includes("microsoft") || version.includes("wsl");
  } catch {
    return false;
  }
}

function resolveWslWindowsDownloadsDir(
  env: Record<string, string | undefined>,
  readProcVersion: () => string
): string | null {
  if (!isWslEnvironment("linux", env, readProcVersion)) return null;

  const fromUserProfile = env.USERPROFILE
    ? windowsPathToWslPath(env.USERPROFILE)
    : null;
  if (fromUserProfile) {
    return path.posix.join(fromUserProfile, "Downloads");
  }

  // Prefer Windows username when present (no filesystem checks — this module
  // is also imported by the browser bundle).
  const winUser = env.USERNAME?.trim() || env.USER?.trim() || "";
  if (winUser && winUser.toLowerCase() !== "root") {
    return `/mnt/c/Users/${winUser}/Downloads`;
  }

  return null;
}

/**
 * Default resume save root for the backend host:
 * - Windows: `%USERPROFILE%\Downloads`
 * - WSL: Windows Downloads under `/mnt/c/Users/…` when detectable
 * - otherwise: `~/Downloads`
 *
 * Keep this module free of Node built-ins like `fs` — it is imported by the frontend.
 */
export function getSystemDownloadsDir(
  env: Record<string, string | undefined> = process.env,
  platform: NodeJS.Platform = process.platform,
  homedir: () => string = () => os.homedir(),
  // Optional hook for tests / server callers; default avoids Node `fs`.
  readProcVersion: () => string = () => ""
): string {
  if (platform === "win32") {
    const userProfile = env.USERPROFILE?.trim() || homedir();
    return path.win32.join(userProfile, "Downloads");
  }

  const wslDownloads = resolveWslWindowsDownloadsDir(env, readProcVersion);
  if (wslDownloads) return wslDownloads;

  const home = env.HOME?.trim() || homedir();
  return path.posix.join(home, "Downloads");
}

export function buildResumeDownloadFilePath(
  companyName: string,
  jobRole: string,
  personName: string
): { paths: ResumeDownloadPaths; absolutePath: string; dirPath: string } {
  const paths = buildResumeDownloadPaths(companyName, jobRole, personName);
  const dirPath = path.join(getSystemDownloadsDir(), paths.dirName);
  const absolutePath = path.join(dirPath, paths.fileName);
  return { paths, absolutePath, dirPath };
}

export function buildJobFolderDownloadPaths(
  companyName: string,
  jobRole: string,
  fileName: string
): ResumeDownloadPaths {
  const company = sanitizePathSegment(companyName, "company");
  const role = sanitizePathSegment(jobRole, "role");
  return {
    dirName: `${company}_${role}`,
    fileName,
  };
}

export function buildJobFolderDownloadFilePath(
  companyName: string,
  jobRole: string,
  fileName: string
): { paths: ResumeDownloadPaths; absolutePath: string; dirPath: string } {
  const paths = buildJobFolderDownloadPaths(companyName, jobRole, fileName);
  const dirPath = path.join(getSystemDownloadsDir(), paths.dirName);
  const absolutePath = path.join(dirPath, paths.fileName);
  return { paths, absolutePath, dirPath };
}

export function buildCoverLetterDownloadPaths(
  companyName: string,
  jobRole: string,
  _personName?: string
): ResumeDownloadPaths {
  return buildJobFolderDownloadPaths(companyName, jobRole, "Cover Letter.pdf");
}

export function buildJobDescriptionDownloadPaths(
  companyName: string,
  jobRole: string
): ResumeDownloadPaths {
  return buildJobFolderDownloadPaths(companyName, jobRole, "Job Description.txt");
}

export function buildJobDescriptionDownloadFilePath(
  companyName: string,
  jobRole: string
): { paths: ResumeDownloadPaths; absolutePath: string; dirPath: string } {
  return buildJobFolderDownloadFilePath(companyName, jobRole, "Job Description.txt");
}

export function buildCoverLetterDownloadFilePath(
  companyName: string,
  jobRole: string,
  _personName: string
): { paths: ResumeDownloadPaths; absolutePath: string; dirPath: string } {
  return buildJobFolderDownloadFilePath(companyName, jobRole, "Cover Letter.pdf");
}

export function formatPdfSaveMessage(savedPath: string, savedToHistory: boolean): string {
  if (savedToHistory) {
    return `Saved to history & PDF saved to ${savedPath}`;
  }
  return `PDF saved to ${savedPath}`;
}
