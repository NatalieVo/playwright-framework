import { Page } from '@playwright/test';
import { execSync } from 'child_process';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

export async function waitForNetworkIdle(page: Page, timeout: number = 5000): Promise<void> {
  await page.waitForLoadState('networkidle', { timeout });
}

export function formatDate(date: Date): string {
  return date.toISOString().split('T')[0];
}

export function currentTimestamp(): string {
  return new Date().toISOString().replace(/[:.]/g, '-');
}

export function createTempTextFile(fileName: string, content: string): string {
  const filePath = path.join(os.tmpdir(), fileName);
  fs.writeFileSync(filePath, content);
  return filePath;
}

export function deleteTempFile(filePath: string): void {
  if (fs.existsSync(filePath)) {
    fs.unlinkSync(filePath);
  }
}

export async function retryAction<T>(
  action: () => Promise<T>,
  maxRetries: number = 3,
  delayMs: number = 500,
): Promise<T> {
  let lastError: unknown;
  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      return await action();
    } catch (err) {
      lastError = err;
      if (attempt < maxRetries - 1) {
        await new Promise(r => setTimeout(r, delayMs));
      }
    }
  }
  throw lastError;
}

// os.tmpdir() resolves to the Windows user temp folder, which on this machine's C: drive can be
// near-full — large generated test assets (multi-GB files, thousands of small files) must not land
// there. Use the project's own drive instead, under a gitignored folder.
const LARGE_ASSETS_DIR = path.resolve(__dirname, '..', '..', 'test-data', '_large-assets');

function ensureLargeAssetsDir(): string {
  fs.mkdirSync(LARGE_ASSETS_DIR, { recursive: true });
  return LARGE_ASSETS_DIR;
}

// Creates a single sparse file of the given size filled with zeros via `fsutil` — orders of
// magnitude faster than writing real bytes for multi-GB files, and content doesn't matter for
// upload/download/share/delete UI testing, only size.
export function createLargeBinaryFile(fileName: string, sizeBytes: number): string {
  const dir = ensureLargeAssetsDir();
  const filePath = path.join(dir, fileName);
  execSync(`fsutil file createnew "${filePath}" ${sizeBytes}`);
  return filePath;
}

// Creates `count` tiny files inside a fresh subfolder under LARGE_ASSETS_DIR, named
// `<prefix>_0001.txt`, `<prefix>_0002.txt`, ... — for bulk-upload stress tests.
export function createManySmallFiles(prefix: string, count: number): string[] {
  const dir = ensureLargeAssetsDir();
  const batchDir = path.join(dir, `${prefix}_batch`);
  fs.mkdirSync(batchDir, { recursive: true });
  const paths: string[] = [];
  const width = String(count).length;
  for (let i = 1; i <= count; i++) {
    const filePath = path.join(batchDir, `${prefix}_${String(i).padStart(width, '0')}.txt`);
    fs.writeFileSync(filePath, `${prefix} file #${i}`);
    paths.push(filePath);
  }
  return paths;
}

export function deleteLargeAsset(filePathOrDir: string): void {
  fs.rmSync(filePathOrDir, { recursive: true, force: true });
}
