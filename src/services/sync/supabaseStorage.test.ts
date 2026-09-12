import { describe, expect, it, vi, afterEach } from 'vitest';
import { getBackup, RemoteBackupError } from './supabaseStorage';

const CONFIG = {
  url: 'https://project.supabase.co',
  anonKey: 'anon',
  bucket: 'bayan',
  path: 'state/latest.json',
};

function respondWith(status: number, body: string) {
  vi.stubGlobal(
    'fetch',
    vi.fn().mockResolvedValue({
      ok: status >= 200 && status < 300,
      status,
      text: () => Promise.resolve(body),
    }),
  );
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('getBackup', () => {
  it('returns the dump when one is stored', async () => {
    respondWith(200, '{"schemaVersion":1}');

    expect(await getBackup(CONFIG)).toBe('{"schemaVersion":1}');
  });

  // Supabase answers a missing object with 400 and puts the real status in the
  // body. Reading only the HTTP status turned an empty bucket into a hard
  // error, which is every first-ever backup — the upload reads before it writes.
  it('treats a 400 whose body says 404 as "nothing stored yet"', async () => {
    respondWith(
      400,
      '{"statusCode":"404","error":"not_found","message":"Object not found","code":"NoSuchKey"}',
    );

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
    respondWith(403, '{"statusCode":"403","error":"Unauthorized","message":"new row violates row-level security policy"}');

    await expect(getBackup(CONFIG)).rejects.toBeInstanceOf(RemoteBackupError);
  });

  it('throws on an unparseable failure body', async () => {
    respondWith(500, '<html>gateway error</html>');

    await expect(getBackup(CONFIG)).rejects.toBeInstanceOf(RemoteBackupError);
  });
});
