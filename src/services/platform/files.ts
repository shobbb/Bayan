/**
 * Export/import of the state dump (§12, §14) — the only backup path
 * (REQ-37). Domain and UI never touch Filesystem/Share directly (REQ-P5).
 */
import { Filesystem, Directory, Encoding } from '@capacitor/filesystem';
import { Share } from '@capacitor/share';

export async function writeExportFile(filename: string, contents: string): Promise<string> {
  const result = await Filesystem.writeFile({
    path: filename,
    data: contents,
    directory: Directory.Cache,
    encoding: Encoding.UTF8,
  });
  return result.uri;
}

export async function shareExportFile(uri: string, title: string): Promise<void> {
  await Share.share({ title, url: uri });
}

export async function readImportFile(uri: string): Promise<string> {
  const result = await Filesystem.readFile({ path: uri, encoding: Encoding.UTF8 });
  return typeof result.data === 'string' ? result.data : '';
}

/**
 * Browser-surface equivalents. On a hosted build the Filesystem plugin writes
 * to origin-private storage rather than anywhere the user can reach, so the
 * dump has to leave through a real download. Keeping both here is this layer
 * doing its job (REQ-P5) rather than a fork in the code above it.
 */
export async function copyToClipboard(text: string): Promise<void> {
  await navigator.clipboard.writeText(text);
}

export function downloadFile(filename: string, contents: string): void {
  const url = URL.createObjectURL(new Blob([contents], { type: 'application/json' }));
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  // Revoke on the next frame: revoking synchronously can cancel the download.
  setTimeout(() => URL.revokeObjectURL(url), 0);
}
