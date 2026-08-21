import { apiUrl } from "@/lib/api-config";
import { writeFileToLinkedDownloadFolder } from "@/lib/client-folder-download";
import {
  isDownloadPathOutOfSyncWithLink,
  joinClientDownloadPath,
  readCachedDownloadBasePath,
  type ClientDownloadMode,
} from "@/lib/download-settings";
import {
  buildCoverLetterDownloadPaths,
  buildJobFolderDownloadPaths,
  buildResumeDownloadPaths,
  formatPdfSaveMessage,
  type ResumeDownloadPaths,
} from "@/lib/pdf-download-paths";
import type { UpdatedResume } from "@/lib/types/resume";

export type { ResumeDownloadPaths };
export { buildResumeDownloadPaths, formatPdfSaveMessage };

export type ClientSaveResult = {
  paths: ResumeDownloadPaths;
  savedPath: string;
  mode: ClientDownloadMode;
};

type ClientSaveOptions = {
  companyName: string;
  jobRole: string;
  personName?: string;
  fileName?: string;
  /** Profile Settings → default download path (editable). */
  downloadBasePath?: string;
  /** Needed to write into the linked client folder (IndexedDB handle). */
  userId?: string | null;
  accessToken?: string | null;
};

function resolveBasePath(explicit?: string): string {
  const trimmed = explicit?.trim();
  return trimmed || readCachedDownloadBasePath();
}

function linkedSavedPath(
  basePath: string,
  paths: ResumeDownloadPaths
): string {
  return joinClientDownloadPath(basePath, paths.dirName, paths.fileName);
}

function pdfBase64ToBlob(pdfBase64: string): Blob {
  const binary = atob(pdfBase64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) {
    bytes[i] = binary.charCodeAt(i);
  }
  return new Blob([bytes], { type: "application/pdf" });
}

/** Render a resume to a PDF (base64) without saving/downloading. Used for the preview. */
export async function renderResumePdfBase64(
  resume: UpdatedResume | Record<string, unknown>,
  template: string | undefined,
  accessToken: string
): Promise<string> {
  const response = await fetch(apiUrl("/api/generate-pdf"), {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${accessToken}`,
    },
    body: JSON.stringify({ resume, template }),
  });

  if (!response.ok) {
    const err = await response.json().catch(() => ({}));
    throw new Error(typeof err.error === "string" ? err.error : "Failed to generate PDF");
  }

  const { pdfBase64 } = (await response.json()) as { pdfBase64?: string };
  const normalized = pdfBase64 ? String(pdfBase64).trim() : "";
  if (!normalized) throw new Error("PDF generation returned empty data");
  return normalized;
}

export function downloadPdfViaBrowser(pdfBase64: string, fileName: string): void {
  const blob = pdfBase64ToBlob(pdfBase64);
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = fileName;
  link.rel = "noopener";
  document.body.appendChild(link);
  link.click();
  window.setTimeout(() => {
    link.remove();
    URL.revokeObjectURL(url);
  }, 2_000);
}

export function downloadTextFile(content: string, fileName: string): void {
  const blob = new Blob([content], { type: "text/plain;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = fileName;
  link.rel = "noopener";
  document.body.appendChild(link);
  link.click();
  window.setTimeout(() => {
    link.remove();
    URL.revokeObjectURL(url);
  }, 2_000);
}

async function tryWriteLinkedFolder(
  userId: string | null | undefined,
  basePath: string,
  paths: ResumeDownloadPaths,
  data: Blob | string
): Promise<boolean> {
  if (!userId) return false;
  // Path was edited after linking — do not claim the Settings path was used.
  if (isDownloadPathOutOfSyncWithLink(basePath)) return false;

  try {
    return await writeFileToLinkedDownloadFolder(
      userId,
      paths.dirName,
      paths.fileName,
      data
    );
  } catch (error) {
    console.warn("Linked-folder write failed; using browser download:", error);
    return false;
  }
}

/**
 * Never writes to the server disk. Saves into the linked client folder when
 * available; otherwise triggers a normal browser download.
 * `savedPath` always describes where the file actually went.
 */
export async function savePdfToDownloadsFolder(
  pdfBase64: string,
  options: ClientSaveOptions & { personName: string }
): Promise<ClientSaveResult> {
  const paths = options.fileName?.trim()
    ? buildJobFolderDownloadPaths(
        options.companyName,
        options.jobRole,
        options.fileName.trim()
      )
    : buildResumeDownloadPaths(
        options.companyName,
        options.jobRole,
        options.personName
      );

  const basePath = resolveBasePath(options.downloadBasePath);
  const browserFileName = `${paths.dirName} - ${paths.fileName}`;
  const blob = pdfBase64ToBlob(pdfBase64);

  const written = await tryWriteLinkedFolder(
    options.userId,
    basePath,
    paths,
    blob
  );
  if (written) {
    return {
      paths,
      savedPath: linkedSavedPath(basePath, paths),
      mode: "linked",
    };
  }

  downloadPdfViaBrowser(pdfBase64, browserFileName);
  return { paths, savedPath: browserFileName, mode: "browser" };
}

export async function saveResumePdfToDownloadsFolder(
  resume: UpdatedResume | Record<string, unknown>,
  options: ClientSaveOptions & {
    personName: string;
    template?: string;
  }
): Promise<ClientSaveResult> {
  return saveGeneratedResumeToDownloads(resume, undefined, options);
}

/** Render PDF on server, then download only on the client (never server disk). */
export async function saveGeneratedResumeToDownloads(
  resume: UpdatedResume | Record<string, unknown>,
  _pdfBase64: string | undefined,
  options: ClientSaveOptions & {
    personName: string;
    template?: string;
  }
): Promise<ClientSaveResult> {
  if (!options.accessToken) {
    throw new Error("You must be signed in to download a resume");
  }

  const pdfBase64 = await renderResumePdfBase64(
    resume,
    options.template,
    options.accessToken
  );

  return savePdfToDownloadsFolder(pdfBase64, {
    companyName: options.companyName,
    jobRole: options.jobRole,
    personName: options.personName,
    fileName: options.fileName,
    downloadBasePath: options.downloadBasePath,
    userId: options.userId,
  });
}

export async function saveCoverLetterPdfToDownloadsFolder(
  text: string,
  options: ClientSaveOptions & {
    accessToken?: string | null;
  }
): Promise<ClientSaveResult> {
  const paths = buildCoverLetterDownloadPaths(options.companyName, options.jobRole);

  const response = await fetch(apiUrl("/api/generate-cover-letter-pdf"), {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(options.accessToken ? { Authorization: `Bearer ${options.accessToken}` } : {}),
    },
    body: JSON.stringify({ text }),
  });

  if (!response.ok) {
    const err = await response.json().catch(() => ({}));
    throw new Error(err.error || response.statusText || "Failed to generate cover letter PDF");
  }

  const { pdfBase64 } = (await response.json()) as { pdfBase64: string };

  return savePdfToDownloadsFolder(pdfBase64, {
    companyName: options.companyName,
    jobRole: options.jobRole,
    personName: "cover-letter",
    fileName: paths.fileName,
    downloadBasePath: options.downloadBasePath,
    userId: options.userId,
  });
}

export async function saveTextToDownloadsFolder(
  content: string,
  options: ClientSaveOptions
): Promise<ClientSaveResult> {
  const fileName = options.fileName?.trim() || "Cover Letter.txt";
  const paths = buildJobFolderDownloadPaths(
    options.companyName,
    options.jobRole,
    fileName
  );

  const basePath = resolveBasePath(options.downloadBasePath);
  const browserFileName = `${paths.dirName} - ${paths.fileName}`;

  const written = await tryWriteLinkedFolder(
    options.userId,
    basePath,
    paths,
    content
  );
  if (written) {
    return {
      paths,
      savedPath: linkedSavedPath(basePath, paths),
      mode: "linked",
    };
  }

  downloadTextFile(content, browserFileName);
  return { paths, savedPath: browserFileName, mode: "browser" };
}
