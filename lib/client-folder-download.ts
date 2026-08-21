/**
 * Client-side folder writes via the File System Access API (Chrome/Edge).
 * Requires a secure context (HTTPS or localhost). A typed path alone cannot write.
 */

const DB_NAME = "cubi-client-downloads";
const STORE_NAME = "directory-handles";
const DB_VERSION = 1;

function handleKey(userId: string): string {
  return `download-dir:${userId}`;
}

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME);
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () =>
      reject(request.error ?? new Error("Failed to open download folder DB"));
  });
}

async function idbGet(userId: string): Promise<FileSystemDirectoryHandle | null> {
  const db = await openDb();
  try {
    return await new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, "readonly");
      const req = tx.objectStore(STORE_NAME).get(handleKey(userId));
      req.onsuccess = () =>
        resolve((req.result as FileSystemDirectoryHandle | undefined) ?? null);
      req.onerror = () =>
        reject(req.error ?? new Error("Failed to read folder handle"));
    });
  } finally {
    db.close();
  }
}

async function idbSet(
  userId: string,
  handle: FileSystemDirectoryHandle
): Promise<void> {
  const db = await openDb();
  try {
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, "readwrite");
      tx.objectStore(STORE_NAME).put(handle, handleKey(userId));
      tx.oncomplete = () => resolve();
      tx.onerror = () =>
        reject(tx.error ?? new Error("Failed to store folder handle"));
    });
  } finally {
    db.close();
  }
}

async function idbDelete(userId: string): Promise<void> {
  const db = await openDb();
  try {
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, "readwrite");
      tx.objectStore(STORE_NAME).delete(handleKey(userId));
      tx.oncomplete = () => resolve();
      tx.onerror = () =>
        reject(tx.error ?? new Error("Failed to clear folder handle"));
    });
  } finally {
    db.close();
  }
}

/** HTTPS / localhost required for showDirectoryPicker. */
export function isSecureDownloadContext(): boolean {
  return typeof window !== "undefined" && window.isSecureContext === true;
}

export function isClientFolderPickerSupported(): boolean {
  return (
    isSecureDownloadContext() &&
    typeof window.showDirectoryPicker === "function"
  );
}

export async function hasLinkedDownloadFolder(userId: string): Promise<boolean> {
  if (!userId || !isClientFolderPickerSupported()) return false;
  try {
    return Boolean(await idbGet(userId));
  } catch {
    return false;
  }
}

/** Prompt the user to pick the folder that matches their Settings path. */
export async function linkDownloadFolder(userId: string): Promise<string> {
  if (!isSecureDownloadContext()) {
    throw new Error(
      "Folder linking needs HTTPS (or localhost). This HTTP LAN origin cannot access local folders."
    );
  }
  if (typeof window.showDirectoryPicker !== "function") {
    throw new Error(
      "This browser cannot link a folder. Use Chrome or Edge on desktop."
    );
  }
  const handle = await window.showDirectoryPicker({
    id: "cubi-resume-downloads",
    mode: "readwrite",
  });
  await idbSet(userId, handle);
  return handle.name;
}

export async function clearLinkedDownloadFolder(userId: string): Promise<void> {
  if (!userId) return;
  await idbDelete(userId);
}

async function ensureReadWrite(
  handle: FileSystemDirectoryHandle
): Promise<boolean> {
  const withPermission = handle as FileSystemDirectoryHandle & {
    queryPermission?: (desc: { mode: "readwrite" }) => Promise<PermissionState>;
    requestPermission?: (desc: { mode: "readwrite" }) => Promise<PermissionState>;
  };

  if (typeof withPermission.queryPermission === "function") {
    let state = await withPermission.queryPermission({ mode: "readwrite" });
    if (state === "granted") return true;
    if (typeof withPermission.requestPermission === "function") {
      state = await withPermission.requestPermission({ mode: "readwrite" });
      return state === "granted";
    }
    return false;
  }
  return true;
}

/**
 * Write a file under linkedRoot/dirName/fileName.
 * Returns true when written into the linked folder; false if no link / no permission.
 */
export async function writeFileToLinkedDownloadFolder(
  userId: string,
  dirName: string,
  fileName: string,
  data: Blob | string
): Promise<boolean> {
  if (!userId || !isClientFolderPickerSupported()) return false;

  const root = await idbGet(userId);
  if (!root) return false;

  const allowed = await ensureReadWrite(root);
  if (!allowed) return false;

  const folder = await root.getDirectoryHandle(dirName, { create: true });
  const fileHandle = await folder.getFileHandle(fileName, { create: true });
  const writable = await fileHandle.createWritable();
  try {
    await writable.write(data);
  } finally {
    await writable.close();
  }
  return true;
}
