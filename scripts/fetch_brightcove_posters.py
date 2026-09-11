#!/usr/bin/env python3
"""
Resolves poster images for the Brightcove videos in the article bundle.

    python3 scripts/fetch_brightcove_posters.py src/assets/articles/articles.json \
        src/assets/articles/posters.json

Run it on a machine with ordinary internet access, then re-run
import_aljazeera.py — it picks up posters.json automatically if it is there and
carries on without it if it is not.

Why this is a separate step rather than part of the import: a Brightcove still
is not derivable from a video id. It lives behind their Playback API, and the
saved article HTML cannot supply it because the poster is set by the player's
own JavaScript at runtime. YouTube needs none of this — img.youtube.com serves a
still straight from the video id, which is why those articles already have one.

Nothing is downloaded. This writes URLs, which the app references the same way
it references the publisher's article images.
"""
import json
import re
import sys
import time
import urllib.error
import urllib.request
from pathlib import Path

PLAYER = re.compile(r'players\.brightcove\.net/(\d+)/([^/]+)/index\.html\?videoId=(\d+)')
POLICY_KEY = re.compile(r'policyKey\s*:\s*"([^"]+)"')
UA = 'BayanImporter/0.1 (personal language-learning reader)'


def fetch(url: str, accept: str | None = None) -> bytes:
    request = urllib.request.Request(url, headers={'User-Agent': UA})
    if accept:
        request.add_header('Accept', accept)
    with urllib.request.urlopen(request, timeout=30) as response:
        return response.read()


def discover_policy_key(account: str, player: str) -> str:
    """
    The key is compiled into the player bundle. It is not a secret — every
    visitor's browser downloads it — but it is not in the article HTML either,
    so it has to be read from the player itself.
    """
    js = fetch(f'https://players.brightcove.net/{account}/{player}/index.min.js').decode(
        'utf-8', 'replace'
    )
    match = POLICY_KEY.search(js)
    if not match:
        raise SystemExit(
            'Could not find a policy key in the player bundle. Brightcove may have '
            'changed its packaging; read the pk= value from a playback request in '
            'devtools and pass it as a third argument.'
        )
    return match.group(1)


def main(bundle_path: Path, out_path: Path, policy_key: str | None = None):
    bundle = json.loads(bundle_path.read_text(encoding='utf-8'))

    wanted = {}
    for article in bundle['articles']:
        match = PLAYER.search(article.get('videoUrl') or '')
        if match and not article.get('imageUrl'):
            account, player, video_id = match.groups()
            wanted[video_id] = (account, player)

    if not wanted:
        print('No Brightcove videos are missing a poster.')
        return

    account, player = next(iter(wanted.values()))
    key = policy_key or discover_policy_key(account, player)
    print(f'account {account}, {len(wanted)} videos to resolve')

    posters, failed = {}, []
    for index, (video_id, (acct, _)) in enumerate(sorted(wanted.items()), start=1):
        url = f'https://edge.api.brightcove.com/playback/v1/accounts/{acct}/videos/{video_id}'
        try:
            data = json.loads(fetch(url, accept=f'application/json;pk={key}'))
            poster = data.get('poster') or data.get('thumbnail')
            if poster:
                posters[video_id] = poster
            else:
                failed.append(video_id)
        except urllib.error.HTTPError as error:
            failed.append(f'{video_id} (HTTP {error.code})')
        except Exception as error:  # noqa: BLE001 - report and continue
            failed.append(f'{video_id} ({error})')
        print(f'  {index}/{len(wanted)}', end='\r', flush=True)
        time.sleep(1)  # the same courtesy the article crawl used

    out_path.write_text(json.dumps(posters, indent=2), encoding='utf-8')
    print(f'\nresolved {len(posters)} posters -> {out_path}')
    if failed:
        print(f'unresolved ({len(failed)}): {", ".join(map(str, failed[:8]))}')


if __name__ == '__main__':
    main(
        Path(sys.argv[1]),
        Path(sys.argv[2]),
        sys.argv[3] if len(sys.argv) > 3 else None,
    )
