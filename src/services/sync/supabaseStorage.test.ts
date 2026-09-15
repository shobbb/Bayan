import { describe, expect, it, vi, afterEach } from 'vitest';
import { getBackup, putBackup, RemoteBackupError } from './supabaseStorage';

const CONFIG = {
  url: 'https://project.supabase.co',
  anonKey: 'anon',
  bucket: 'bayan',
  path: 'state/latest.json',
};

/**
 * Supabase Storage bodies, copied from real responses rather than invented.
 * Every one of these arrives with HTTP 400, which is the whole problem: the
 * status line and the body disagree, and the body is the one telling the truth.
 */
const BODIES = {
  missing: '{"statusCode":"404","error":"not_found","message":"Object not found","code":"NoSuchKey"}',
  rls: '{"statusCode":"403","error":"Unauthorized","message":"new row violates row-level security policy","code":"AccessDenied"}',
  noBucket: '{"statusCode":"404","error":"Bucket not found","message":"Bucket not found"}',
  badKey: '{"statusCode":"401","error":"Unauthorized","message":"Invalid JWT"}',
};

function respondWith(status: number, body: string) {
  const fetchMock = vi.fn().mockResolvedValue({
    ok: status >= 200 && status < 300,
    status,
    text: () => Promise.resolve(body),
  });
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

function request(fetchMock: ReturnType<typeof vi.fn>) {
  const [url, init] = fetchMock.mock.calls[0] as [
    string,
    { method: string; headers: Record<string, string>; body?: string },
  ];
  return { url, ...init };
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('putBackup', () => {
  it('posts the dump to the configured object', async () => {
    const fetchMock = respondWith(200, '');

    await putBackup(CONFIG, '{"schemaVersion":1}');
    const sent = request(fetchMock);

    expect(sent.url).toBe('https://project.supabase.co/storage/v1/object/bayan/state/latest.json');
    expect(sent.method).toBe('POST');
    expect(sent.body).toBe('{"schemaVersion":1}');
  });

  // Without this every backup after the first fails as "object already exists",
  // which is every backup that matters.
  it('replaces the previous dump rather than failing on it', async () => {
    const fetchMock = respondWith(200, '');

    await putBackup(CONFIG, '{}');

    expect(request(fetchMock).headers['x-upsert']).toBe('true');
  });

  it('sends the anon key both ways Supabase wants it', async () => {
    const fetchMock = respondWith(200, '');

    await putBackup(CONFIG, '{}');
    const { headers } = request(fetchMock);

    expect(headers.apikey).toBe('anon');
    expect(headers.authorization).toBe('Bearer anon');
  });

  it('tolerates a project url with a trailing slash', async () => {
    const fetchMock = respondWith(200, '');

    await putBackup({ ...CONFIG, url: 'https://project.supabase.co/' }, '{}');

    expect(request(fetchMock).url).toBe(
      'https://project.supabase.co/storage/v1/object/bayan/state/latest.json',
    );
  });

  // The failure the reader actually hits. Raw, it reads "Backup upload failed
  // (400): new row violates row-level security policy" — a status that is not
  // what Supabase meant, and a sentence about a Postgres row rather than the
  // bucket they have to go and change.
  it('explains a missing storage policy instead of quoting Postgres', async () => {
    respondWith(400, BODIES.rls);

    await expect(putBackup(CONFIG, '{}')).rejects.toThrow(
      /"bayan" bucket has no policy letting this key write/,
    );
  });

  // The upload upserts, so it needs both. Naming only insert sends people back
  // to the dashboard a second time.
  it('names both policies the upload needs', async () => {
    respondWith(400, BODIES.rls);

    await expect(putBackup(CONFIG, '{}')).rejects.toThrow(/insert and update/);
  });

  it('reports the status Supabase meant, not the one it sent', async () => {
    respondWith(400, BODIES.rls);

    await expect(putBackup(CONFIG, '{}')).rejects.toMatchObject({ status: 403 });
  });

  it('names the bucket when the project has no such bucket', async () => {
    respondWith(400, BODIES.noBucket);

    await expect(putBackup(CONFIG, '{}')).rejects.toThrow(/no bucket named "bayan"/);
  });

  it('points a rejected key at Settings, which is where it is entered', async () => {
    respondWith(400, BODIES.badKey);

    await expect(putBackup(CONFIG, '{}')).rejects.toThrow(/rejected the key.*Settings/s);
  });

  it('still reports a failure it has no special reading for', async () => {
    respondWith(500, '<html>gateway error</html>');

    await expect(putBackup(CONFIG, '{}')).rejects.toBeInstanceOf(RemoteBackupError);
    await expect(putBackup(CONFIG, '{}')).rejects.toThrow(/500/);
  });

  // A missing object is not a reason to refuse to write one.
  it('does not mistake a not-found body for success or for nothing to do', async () => {
    respondWith(400, BODIES.missing);

    await expect(putBackup(CONFIG, '{}')).rejects.toBeInstanceOf(RemoteBackupError);
  });
});

describe('getBackup', () => {
  it('returns the dump when one is stored', async () => {
    respondWith(200, '{"schemaVersion":1}');

    expect(await getBackup(CONFIG)).toBe('{"schemaVersion":1}');
  });

  it('reads from the same object the upload writes', async () => {
    const fetchMock = respondWith(200, '{}');

    await getBackup(CONFIG);
    const sent = request(fetchMock);

    expect(sent.url).toBe('https://project.supabase.co/storage/v1/object/bayan/state/latest.json');
    expect(sent.method).toBe('GET');
  });

  // Supabase answers a missing object with 400 and puts the real status in the
  // body. Reading only the HTTP status turned an empty bucket into a hard
  // error, which is every first-ever backup — the upload reads before it writes.
  it('treats a 400 whose body says 404 as "nothing stored yet"', async () => {
    respondWith(400, BODIES.missing);

    expect(await getBackup(CONFIG)).toBeNull();
  });

  it('still treats a plain 404 as nothing stored', async () => {
    respondWith(404, '');

    expect(await getBackup(CONFIG)).toBeNull();
  });

  // A missing storage policy is not an empty bucket, and must not be read as
  // one — otherwise a misconfigured project silently looks fine and the first
  // backup overwrites nothing forever.
  it('throws on a permission failure rather than reporting it empty', async () => {
    respondWith(400, BODIES.rls);

    await expect(getBackup(CONFIG)).rejects.toBeInstanceOf(RemoteBackupError);
  });

  it('does not read a missing bucket as an empty one', async () => {
    respondWith(400, BODIES.noBucket);

    await expect(getBackup(CONFIG)).rejects.toThrow(/no bucket named "bayan"/);
  });

  it('throws on an unparseable failure body', async () => {
    respondWith(500, '<html>gateway error</html>');

    await expect(getBackup(CONFIG)).rejects.toBeInstanceOf(RemoteBackupError);
  });
});
