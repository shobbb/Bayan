#!/usr/bin/env python3
"""
Converts a saved dump of learning.aljazeera.net lesson pages into the bundled
article asset the app reads.

Run offline, against a directory of saved HTML:

    python3 scripts/import_aljazeera.py <dump-dir> src/assets/articles/articles.json

The app never crawls. Articles are static third-party content, so they ship as
a build asset rather than being fetched at runtime — which also keeps the
reader working offline (REQ-D4) and means no request leaves the device to a
third party while reading.

Everything here parses by container and class, never by rendered-text
heuristics: the markup carries explicit classes for every field worth having.

Dump layout expected:
    <dump-dir>/<level>/*.html          articles, one per file
    <dump-dir>/<level>/manifest.json   [{url, title}, ...]
"""
import html as H
import json
import re
import sys
from pathlib import Path

STRIP_SCRIPTS = re.compile(r'(?is)<(script|style)[^>]*>.*?</\1>')
H1 = re.compile(r'<h1[^>]*>(.*?)(?:<span class="lang">(.*?)</span>)?</h1>', re.S)
# Two body containers ship on every lesson: the plain one, and a hidden fully
# vowelled one the page's tashkeel toggle swaps in. The vowelled one is what
# this app exists to render (§5.2), so it wins whenever it is present.
BODY = re.compile(
    r'<div class="(formilized|original)-body[^"]*"[^>]*>(.*?)'
    r'(?=<div class="(?:original-body|formilized-body|section-body-locale)|</article>)',
    re.S,
)
PARA_BREAK = re.compile(r'(?i)</\s*(?:p|div|li|h[1-6])\s*>|<\s*br\s*/?>')
PHRASE_BLOCK = re.compile(r'id="block-views-block-phrases-sidebar-block-(\d)"(.*?)(?=<section |</aside>)', re.S)
PHRASE_ROW = re.compile(
    r'<div class="phrases-row">\s*<span class="arabic">(.*?)</span>\s*<span class="locale lang">(.*?)</span>',
    re.S,
)
OG_IMAGE = re.compile(r'property="og:image"\s+content="([^"]+)"')
YOUTUBE = re.compile(r'(?:youtube\.com/embed/|youtu\.be/)([A-Za-z0-9_-]{6,})')
IFRAME_SRC = re.compile(r'<iframe[^>]*\ssrc="([^"]+)"', re.I)
# Only these two hosts carry lessons' video. The site also embeds its own
# interactive exercises in iframes — 391 of them across this dump — and those
# are not video and must not be mistaken for it.
VIDEO_HOSTS = ('players.brightcove.net', 'www.youtube.com', 'youtube.com', 'youtu.be')

# "(جَمْعُ بائِع)" is the plural of a listed singular -> a forms note.
# "(=خُضْراوات)" is a synonym, which is a different thing and is not forms.
PLURAL_OF = re.compile(r'^(.*?)\s*\(\s*(?:جَمْعُ|جمع)\s+(.*?)\s*\)\s*$')
SYNONYM_OF = re.compile(r'^(.*?)\s*\(\s*=\s*(.*?)\s*\)\s*$')


def text(fragment: str) -> str:
    # &nbsp; unescapes to U+00A0, which \s does not match in a bytes-ish sense
    # but does in Python's re with str — normalised here anyway so downstream
    # tokenisation never meets a non-breaking space.
    return re.sub(r'[\s ]+', ' ', H.unescape(re.sub(r'<[^>]+>', ' ', fragment))).strip()


def paragraphs_of(body_html: str) -> list[str]:
    """
    Splits a body into paragraphs without assuming which tag carries them.

    Roughly a quarter of these lessons wrap paragraphs in <div> rather than <p>
    (some nest both), so keying on <p> alone silently drops them — it lost 78 of
    325 articles before this was written as a boundary split instead.
    """
    SENTINEL = '\n@@PARA@@\n'
    marked = PARA_BREAK.sub(SENTINEL, body_html)
    return [p for p in (text(chunk) for chunk in marked.split('@@PARA@@')) if p]


def parse_pairs(block: str):
    out = []
    for arabic, gloss in PHRASE_ROW.findall(block):
        term, forms = text(arabic), None
        plural = PLURAL_OF.match(term)
        synonym = SYNONYM_OF.match(term)
        if plural:
            term, forms = plural.group(1).strip(), f'{plural.group(2)} / {plural.group(1).strip()}'
        elif synonym:
            # Keep the synonym as a forms note; it is useful, but it is not an
            # inflection and must not be presented as one.
            term, forms = synonym.group(1).strip(), f'= {synonym.group(2)}'
        if term and text(gloss):
            out.append({'term': term, 'gloss': text(gloss), 'forms': forms})
    return out


def video_url(raw: str):
    """The lesson's video embed, as the publisher's own iframe src."""
    for src in IFRAME_SRC.findall(raw):
        unescaped = H.unescape(src)
        if any(host in unescaped for host in VIDEO_HOSTS):
            return unescaped
    return None


BRIGHTCOVE_VIDEO_ID = re.compile(r'players\.brightcove\.net/\d+/[^/]+/index\.html\?videoId=(\d+)')


def thumbnail(raw: str, posters: dict):
    """Article image, or a video still where one can be derived. None otherwise."""
    og = OG_IMAGE.search(raw)
    if og:
        # Served as http://, which a page on https:// refuses to load as mixed
        # content. The same file answers over https.
        return re.sub(r'^http://', 'https://', og.group(1))
    tube = YOUTUBE.search(raw)
    if tube:
        # YouTube serves a still straight from the video id, no API needed.
        return f'https://img.youtube.com/vi/{tube.group(1)}/hqdefault.jpg'

    # Brightcove stills are not derivable from a video id — they come from the
    # Playback API, which scripts/fetch_brightcove_posters.py resolves into
    # posters.json. Absent that file the app draws its own title tile rather
    # than inventing a URL that would 404.
    brightcove = BRIGHTCOVE_VIDEO_ID.search(raw)
    if brightcove:
        return posters.get(brightcove.group(1))
    return None


def parse_article(path: Path, level: str, manifest: dict, posters: dict):
    raw = path.read_text(encoding='utf-8', errors='replace')
    clean = STRIP_SCRIPTS.sub('', raw)

    heading = H1.search(clean)
    if not heading:
        return None
    title_ar = text(heading.group(1))
    title_en = text(heading.group(2) or '') or None

    bodies = {m.group(1): m.group(2) for m in BODY.finditer(clean)}
    chosen = bodies.get('formilized') or bodies.get('original') or ''
    paragraphs = paragraphs_of(chosen)
    if not paragraphs:
        # Listening lessons carry a video and no transcript. There is nothing
        # for a word-tap reader to render, so they are not articles here.
        return None

    blocks = {d: b for d, b in PHRASE_BLOCK.findall(clean)}
    url = manifest.get(title_ar, {}).get('url', '')
    series = (
        'languageofmedia' if '/languageofmedia/' in url
        else 'generallanguage' if '/generallanguage/' in url
        else 'other'
    )

    return {
        'id': path.stem,
        'level': level,
        'series': series,
        'sourceUrl': url,
        'titleAr': title_ar,
        'titleEn': title_en,
        'vowelled': 'formilized' in bodies,
        'paragraphs': paragraphs,
        'imageUrl': thumbnail(raw, posters),
        'videoUrl': video_url(raw),
        'vocab': parse_pairs(blocks.get('1', '')),
        'expressions': parse_pairs(blocks.get('2', '')),
    }


def main(dump: Path, out: Path):
    # Optional: resolved Brightcove stills, keyed by video id. Produced by
    # scripts/fetch_brightcove_posters.py, which needs network access this
    # import does not.
    posters_path = out.parent / 'posters.json'
    posters = json.loads(posters_path.read_text(encoding='utf-8')) if posters_path.exists() else {}

    articles, skipped = [], 0
    for level_dir in sorted(d for d in dump.iterdir() if d.is_dir()):
        manifest_path = level_dir / 'manifest.json'
        manifest = {}
        if manifest_path.exists():
            manifest = {e['title']: e for e in json.loads(manifest_path.read_text(encoding='utf-8'))}
        for path in sorted(level_dir.glob('*.html')):
            article = parse_article(path, level_dir.name, manifest, posters)
            if article:
                articles.append(article)
            else:
                skipped += 1

    out.parent.mkdir(parents=True, exist_ok=True)
    payload = {
        'source': {
            'name': 'Al Jazeera Learning Arabic',
            'nameAr': 'تعلم العربية',
            'homeUrl': 'https://learning.aljazeera.net/en',
        },
        'articles': articles,
    }
    out.write_text(json.dumps(payload, ensure_ascii=False, separators=(',', ':')), encoding='utf-8')

    pairs = sum(len(a['vocab']) + len(a['expressions']) for a in articles)
    print(f'articles written : {len(articles)}   (skipped {skipped} with no body text)')
    print(f'fully vowelled   : {sum(a["vowelled"] for a in articles)}')
    print(f'with a thumbnail : {sum(bool(a["imageUrl"]) for a in articles)}')
    print(f'with a video     : {sum(bool(a["videoUrl"]) for a in articles)}')
    print(f'brightcove stills: {len(posters)} supplied' if posters
          else 'brightcove stills: none (run fetch_brightcove_posters.py to add them)')
    print(f'publisher glosses: {pairs}')
    print(f'asset size       : {out.stat().st_size / 1024:.0f} KB')


if __name__ == '__main__':
    main(Path(sys.argv[1]), Path(sys.argv[2]))
