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
