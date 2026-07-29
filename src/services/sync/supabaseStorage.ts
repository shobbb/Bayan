/**
 * Remote backup transport over Supabase Storage's REST API. Raw fetch, in
 * keeping with services/llm/client.ts — a whole client library would be a lot
 * of bundle for two calls.
 *
 * Only the anon key is ever accepted. It is publishable by design: it carries
 * no privileges of its own, and access is decided by row-level security on the
 * project. The service_role key bypasses every policy and would grant full
 * control of the entire project to anyone who can read the bundle, so it is
 * never read here.
 */

export interface SupabaseBackupConfig {
  url: string;
  anonKey: string;
  bucket: string;
  path: string;
}

export class RemoteBackupError extends Error {
  readonly status: number | undefined;

  constructor(message: string, status?: number) {
    super(message);
    this.name = 'RemoteBackupError';
    this.status = status;
  }
}

function objectUrl(config: SupabaseBackupConfig): string {
  const base = config.url.replace(/\/+$/, '');
  return `${base}/storage/v1/object/${config.bucket}/${config.path}`;
}

function authHeaders(config: SupabaseBackupConfig): Record<string, string> {
  return {
    apikey: config.anonKey,
    authorization: `Bearer ${config.anonKey}`,
  };
}

/** Uploads the dump, replacing any previous one at the same path. */
export async function putBackup(config: SupabaseBackupConfig, json: string): Promise<void> {
  const response = await fetch(objectUrl(config), {
    method: 'POST',
    headers: {
      ...authHeaders(config),
      'content-type': 'application/json',
      'cache-control': 'no-cache',
      // Replace rather than fail when the object already exists.
      'x-upsert': 'true',
    },
    body: json,
  });

  if (!response.ok) {
    const body = await response.text().catch(() => '');
    throw new RemoteBackupError(
      `Backup upload failed (${response.status}): ${body}`,
      response.status,
    );
  }
}

/** Returns the stored dump, or null when nothing has been backed up yet. */
export async function getBackup(config: SupabaseBackupConfig): Promise<string | null> {
  const response = await fetch(objectUrl(config), {
    method: 'GET',
    headers: { ...authHeaders(config), 'cache-control': 'no-cache' },
  });

  if (response.status === 404) return null;

  if (!response.ok) {
    const body = await response.text().catch(() => '');
    throw new RemoteBackupError(
      `Backup download failed (${response.status}): ${body}`,
      response.status,
    );
  }

  return response.text();
}
