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
 * What Supabase Storage actually said.
 *
 * The HTTP status is not the answer. Storage routinely replies **400** and puts
 * the real status in the body:
 *
 *   {"statusCode":"404","error":"not_found","message":"Object not found","code":"NoSuchKey"}
 *   {"statusCode":"403","error":"Unauthorized","message":"new row violates row-level security policy","code":"AccessDenied"}
 *
 * Reporting the HTTP status therefore tells the reader "400" for a missing
 * bucket policy, which is neither true nor actionable. Everything below reads
 * the body first and falls back to the status only when there is nothing in it.
 */
interface StorageFailure {
  /** What Supabase means, which is not necessarily response.status. */
  status: number;
  message: string;
  code: string;
}

function parseFailure(status: number, body: string): StorageFailure {
  let parsed: Record<string, unknown> = {};
  try {
    const candidate: unknown = JSON.parse(body);
    if (typeof candidate === 'object' && candidate !== null) {
      parsed = candidate as Record<string, unknown>;
    }
  } catch {
    // Not JSON — a gateway or proxy page. The status is all there is.
  }

  const stated = Number(parsed.statusCode);
  return {
    status: Number.isFinite(stated) && stated > 0 ? stated : status,
    message: typeof parsed.message === 'string' ? parsed.message : body.trim(),
    code: typeof parsed.code === 'string' ? parsed.code : String(parsed.error ?? ''),
  };
}

/**
 * True when a failed response is really "there is nothing stored here".
 *
 * That is every first-ever backup, since the upload reads before it writes to
 * protect an existing dump — so getting this wrong made the very first sync
 * impossible while looking like a hard error.
 *
 * Deliberately narrow: only a body that actually says not-found counts. A 403
 * from a missing storage policy is a different problem and must keep throwing,
 * or a misconfigured bucket would look like an empty one.
 *
 * A missing *bucket* is the same trap wearing the same status. Supabase answers
 * a wrong bucket name with statusCode 404 too, and reading that as an empty
 * bucket tells someone who has mistyped it that they simply have no backup yet
 * — the one message guaranteed to stop them looking for the real cause. It has
 * no NoSuchKey code, and it says so in the message.
 */
function isObjectMissing(failure: StorageFailure): boolean {
  if (/bucket not found/i.test(failure.message)) return false;
  return (
    failure.status === 404 ||
    failure.code === 'NoSuchKey' ||
    failure.code === 'not_found'
  );
}

/**
 * Turns a storage failure into something the reader can act on.
 *
 * Row-level security earns its own sentence because it is the one failure that
 * is both common and entirely fixable, and its raw wording — "new row violates
 * row-level security policy" — describes a Postgres row rather than the bucket
 * the reader has to go and change. The upload upserts, so it needs both
 * policies; naming only insert sends people back for the second one.
 */
function describeFailure(action: string, config: SupabaseBackupConfig, failure: StorageFailure): string {
  if (failure.code === 'AccessDenied' || /row-level security/i.test(failure.message)) {
    return (
      `Supabase refused the ${action}: the "${config.bucket}" bucket has no policy ` +
      'letting this key write to it. Add storage policies for insert and update on ' +
      'that bucket, for the anon role.'
    );
  }

  if (/bucket not found/i.test(failure.message)) {
    return `That Supabase project has no bucket named "${config.bucket}".`;
  }

  if (failure.status === 401 || /jwt|api key/i.test(failure.message)) {
    return `Supabase rejected the key. Check the project URL and anon key in Settings.`;
  }

  const detail = failure.message === '' ? '' : `: ${failure.message}`;
  return `Backup ${action} failed (${failure.status})${detail}`;
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
    const failure = parseFailure(response.status, await response.text().catch(() => ''));
    throw new RemoteBackupError(describeFailure('upload', config, failure), failure.status);
  }
}

/** Returns the stored dump, or null when nothing has been backed up yet. */
export async function getBackup(config: SupabaseBackupConfig): Promise<string | null> {
  const response = await fetch(objectUrl(config), {
    method: 'GET',
    headers: { ...authHeaders(config), 'cache-control': 'no-cache' },
  });

  if (response.ok) return response.text();

  const failure = parseFailure(response.status, await response.text().catch(() => ''));
  if (isObjectMissing(failure)) return null;

  throw new RemoteBackupError(describeFailure('download', config, failure), failure.status);
}
