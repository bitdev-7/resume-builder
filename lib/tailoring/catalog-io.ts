import fs from "fs/promises";
import fsSync from "fs";
import path from "path";

export const CATALOG_FILE_NAMES = [
  "catalog-version.json",
  "skill-aliases.json",
  "skill-relationships.json",
  "alternative-groups.json",
  "role-skill-catalog.json",
] as const;

export type CatalogFileName = (typeof CATALOG_FILE_NAMES)[number];

export function getCatalogDir(): string {
  if (process.env.CATALOG_DIR) return process.env.CATALOG_DIR;
  const local = path.join(process.cwd(), "data", "tailoring");
  if (fsSync.existsSync(local)) return local;
  return path.join(process.cwd(), "..", "data", "tailoring");
}

export function catalogFilePath(name: CatalogFileName): string {
  return path.join(getCatalogDir(), name);
}

export async function readCatalogFileRaw(name: CatalogFileName): Promise<string> {
  return fs.readFile(catalogFilePath(name), "utf8");
}

export async function readAllCatalogFilesRaw(): Promise<Record<CatalogFileName, string>> {
  const out = {} as Record<CatalogFileName, string>;
  for (const name of CATALOG_FILE_NAMES) {
    out[name] = await readCatalogFileRaw(name);
  }
  return out;
}

export async function backupCatalogDir(): Promise<string> {
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const backupDir = path.join(getCatalogDir(), ".backups", stamp);
  await fs.mkdir(backupDir, { recursive: true });
  for (const name of CATALOG_FILE_NAMES) {
    await fs.copyFile(catalogFilePath(name), path.join(backupDir, name));
  }
  return backupDir;
}

async function writeFileAtomic(filePath: string, content: string): Promise<void> {
  const tmpPath = `${filePath}.tmp`;
  await fs.writeFile(tmpPath, content, "utf8");
  await fs.rename(tmpPath, filePath);
}

export async function writeCatalogFilesAtomic(
  files: Record<CatalogFileName, string>
): Promise<void> {
  for (const name of CATALOG_FILE_NAMES) {
    const content = files[name];
    if (content === undefined) {
      throw new Error(`Missing catalog file content: ${name}`);
    }
    await writeFileAtomic(catalogFilePath(name), content);
  }
}
