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

/**
 * True when a failed response is really "there is nothing stored here".
 *
 * Supabase Storage does not answer a missing object with HTTP 404. It answers
 * **400**, carrying the real status in the body:
 *
 *   {"statusCode":"404","error":"not_found","message":"Object not found","code":"NoSuchKey"}
 *
 * Checking the HTTP status alone therefore turns an empty bucket into a hard
 * error — which is every first-ever backup, since the upload reads before it
 * writes to protect an existing dump. The body is the authority here.
 *
 * Deliberately narrow: only a body that actually says not-found counts. A 403
 * from a missing storage policy is a different problem and must keep throwing,
 * or a misconfigured bucket would look like an empty one.
 */
function isObjectMissing(status: number, body: string): boolean {
  if (status === 404) return true;
  try {
    const parsed: unknown = JSON.parse(body);
    if (typeof parsed !== 'object' || parsed === null) return false;
    const { statusCode, error, code } = parsed as Record<string, unknown>;
    return statusCode === '404' || statusCode === 404 || error === 'not_found' || code === 'NoSuchKey';
  } catch {
    return false;
  }
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

  if (response.ok) return response.text();

  const body = await response.text().catch(() => '');
  if (isObjectMissing(response.status, body)) return null;

  throw new RemoteBackupError(
    `Backup download failed (${response.status}): ${body}`,
    response.status,
  );
}
