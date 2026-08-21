import { constants, readFileSync } from "fs";
import { access, mkdir, writeFile } from "fs/promises";
import os from "os";
import {
  buildJobFolderDownloadFilePath,
  buildResumeDownloadFilePath,
  getSystemDownloadsDir,
  isClientReachableDownloadsDir,
  type ResumeDownloadPaths,
} from "@/lib/pdf-download-paths";

function readProcVersionSafe(): string {
  try {
    return readFileSync("/proc/version", "utf8");
  } catch {
    return "";
  }
}

/**
 * Ensure the Downloads *base* directory already exists and is reachable by a
 * local Windows/WSL user. Do not create `/root/Downloads` (or similar) on a
 * Linux VPS — that path is not the Windows client's Downloads folder.
 */
export async function assertServerDownloadsDirReady(
  env: Record<string, string | undefined> = process.env,
  platform: NodeJS.Platform = process.platform
): Promise<string> {
  const explicitOverride = Boolean(env.RESUME_DOWNLOAD_DIR?.trim());
  const baseDir = getSystemDownloadsDir(
    env,
    platform,
    () => os.homedir(),
    readProcVersionSafe
  );

  try {
    await access(baseDir, constants.W_OK);
  } catch {
    throw new Error(
      `Downloads directory does not exist or is not writable: ${baseDir}`
    );
  }

  if (!isClientReachableDownloadsDir(baseDir, platform, explicitOverride)) {
    throw new Error(
      `Server Downloads path is not usable for Windows clients: ${baseDir}`
    );
  }

  return baseDir;
}

export async function writePdfBase64ToDownloads(
  pdfBase64: string,
  companyName: string,
  jobRole: string,
  personName: string,
  fileName?: string
): Promise<{ savedPath: string; paths: ResumeDownloadPaths }> {
  await assertServerDownloadsDirReady();

  const { paths, absolutePath, dirPath } =
    fileName?.trim()
      ? buildJobFolderDownloadFilePath(companyName, jobRole, fileName.trim())
      : buildResumeDownloadFilePath(companyName, jobRole, personName);

  const pdfBuffer = Buffer.from(pdfBase64, "base64");
  if (pdfBuffer.length === 0) {
    throw new Error("Invalid PDF data");
  }

  // Only create the job subfolder under an already-existing Downloads base.
  await mkdir(dirPath, { recursive: true });
  await writeFile(absolutePath, pdfBuffer);

  return { savedPath: absolutePath, paths };
}
