/**
 * Generates the app icons from the Amiri face the app itself renders with, so
 * the mark on the home screen is the same typography as the reading screen.
 * Checked in rather than drawn by hand: the icons are derived artefacts, and
 * regenerating them should not mean redrawing them.
 *
 *   node scripts/make-icons.mjs
 *
 * The diacritics are the point of this app (§5.2), so they carry the accent
 * colour. Getting two colours out of one word uses a property of Arabic
 * combining marks: they have zero advance width, so "بيان" and "بَيَان" place
 * their base letters identically. Painting the vowelled word in amber and the
 * unvowelled word in cream directly on top leaves exactly the marks showing.
 *
 * Everything is laid out from measured ink (actualBoundingBox*), never from the
 * line box — Amiri's ascent and descent come to roughly 1.75em, so sizing
 * against the line box shrinks the word to about half the space it should have.
 */
import { chromium } from 'playwright';
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { deflateSync, inflateSync } from 'node:zlib';

const CRC_TABLE = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});

function crc32(buf) {
  let c = 0xffffffff;
  for (const byte of buf) c = CRC_TABLE[(c ^ byte) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const head = Buffer.alloc(8);
  head.writeUInt32BE(data.length, 0);
  head.write(type, 4, 'ascii');
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(Buffer.concat([head.subarray(4), data])), 0);
  return Buffer.concat([head, data, crc]);
}

function paeth(a, b, c) {
  const p = a + b - c;
  const pa = Math.abs(p - a);
  const pb = Math.abs(p - b);
  const pc = Math.abs(p - c);
  return pa <= pb && pa <= pc ? a : pb <= pc ? b : c;
}

/** Undo PNG per-scanline filtering into flat samples. */
function unfilter(raw, width, height, bpp) {
  const stride = width * bpp;
  const out = Buffer.alloc(stride * height);
  for (let y = 0; y < height; y++) {
    const type = raw[y * (stride + 1)];
    const line = raw.subarray(y * (stride + 1) + 1, (y + 1) * (stride + 1));
    for (let i = 0; i < stride; i++) {
      const a = i >= bpp ? out[y * stride + i - bpp] : 0;
      const b = y > 0 ? out[(y - 1) * stride + i] : 0;
      const c = y > 0 && i >= bpp ? out[(y - 1) * stride + i - bpp] : 0;
      const x = line[i];
      let value;
      if (type === 0) value = x;
      else if (type === 1) value = x + a;
      else if (type === 2) value = x + b;
      else if (type === 3) value = x + ((a + b) >> 1);
      else if (type === 4) value = x + paeth(a, b, c);
      else throw new Error(`unsupported PNG filter ${type}`);
      out[y * stride + i] = value & 0xff;
    }
  }
  return out;
}

/**
 * Re-encodes a Canvas PNG (always RGBA) as opaque RGB.
 *
 * iOS composites a transparent apple-touch-icon onto black and some Android
 * launchers treat the alpha channel as a mask, so a home-screen icon should
 * carry no alpha at all. Throws rather than guessing if any pixel is actually
 * translucent — that would mean the artwork changed, not just the container.
 */
function toOpaqueRgb(png) {
  let pos = 8;
  let ihdr = null;
  const idat = [];
  while (pos < png.length) {
    const length = png.readUInt32BE(pos);
    const type = png.toString('ascii', pos + 4, pos + 8);
    const data = png.subarray(pos + 8, pos + 8 + length);
    if (type === 'IHDR') ihdr = data;
    if (type === 'IDAT') idat.push(data);
    pos += 12 + length;
  }
  if (!ihdr) throw new Error('PNG has no IHDR');

  const width = ihdr.readUInt32BE(0);
  const height = ihdr.readUInt32BE(4);
  const [bitDepth, colorType, , , interlace] = ihdr.subarray(8, 13);
  if (bitDepth !== 8 || colorType !== 6 || interlace !== 0) {
    throw new Error(`unexpected PNG encoding: depth ${bitDepth}, color ${colorType}`);
  }

  const rgba = unfilter(inflateSync(Buffer.concat(idat)), width, height, 4);
  const rgb = Buffer.alloc(width * height * 3);
  for (let p = 0; p < width * height; p++) {
    if (rgba[p * 4 + 3] !== 255) throw new Error('icon has translucent pixels; refusing to flatten');
    rgb[p * 3] = rgba[p * 4];
    rgb[p * 3 + 1] = rgba[p * 4 + 1];
    rgb[p * 3 + 2] = rgba[p * 4 + 2];
  }

  // Filter 0 (None) on every scanline: deflate does the work, and the encoder
  // stays simple enough to read.
  const stride = width * 3;
  const raw = Buffer.alloc((stride + 1) * height);
  for (let y = 0; y < height; y++) {
    rgb.copy(raw, y * (stride + 1) + 1, y * stride, (y + 1) * stride);
  }

  const newIhdr = Buffer.from(ihdr);
  newIhdr[9] = 2; // truecolour, no alpha
  return {
    png: Buffer.concat([
      png.subarray(0, 8),
      chunk('IHDR', newIhdr),
      chunk('IDAT', deflateSync(raw, { level: 9 })),
      chunk('IEND', Buffer.alloc(0)),
    ]),
    rgb,
    width,
    height,
  };
}

const root = fileURLToPath(new URL('..', import.meta.url));
const font = readFileSync(`${root}src/assets/fonts/Amiri-Bold.woff2`).toString('base64');

const TARGETS = [
  ['public/icon-512.png', 512],
  ['public/icon-192.png', 192],
  ['public/apple-touch-icon.png', 180],
];

const html = `<!doctype html>
<meta charset="utf-8">
<style>
  @font-face {
    font-family: 'Amiri';
    font-weight: 700;
    src: url(data:font/woff2;base64,${font}) format('woff2');
  }
  html, body { margin: 0; }
</style>
<canvas id="c"></canvas>`;

const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
const tab = await browser.newPage();
await tab.setContent(html);
await tab.evaluate(() => document.fonts.load('700 100px Amiri').then(() => document.fonts.ready));

for (const [file, size] of TARGETS) {
  const { dataUrl, report } = await tab.evaluate((px) => {
    const VOWELLED = 'بَيَان';
    const BARE = 'بيان';
    // Fractions of the canvas the ink may occupy. Height binds here — the
    // marks sit well above the letters — and the resulting width lands near
    // 0.5, comfortably inside the 80% safe circle a maskable or adaptive crop
    // keeps, so nothing clips on any platform.
    const FIT_W = 0.78;
    const FIT_H = 0.56;

    const canvas = document.getElementById('c');
    canvas.width = px;
    canvas.height = px;
    const ctx = canvas.getContext('2d');

    ctx.direction = 'rtl';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'alphabetic';

    /** True ink box of a string at a given size, relative to the draw origin. */
    const ink = (text, fontSize) => {
      ctx.font = `700 ${fontSize}px Amiri`;
      const m = ctx.measureText(text);
      return {
        left: m.actualBoundingBoxLeft,
        right: m.actualBoundingBoxRight,
        ascent: m.actualBoundingBoxAscent,
        descent: m.actualBoundingBoxDescent,
        width: m.actualBoundingBoxLeft + m.actualBoundingBoxRight,
        height: m.actualBoundingBoxAscent + m.actualBoundingBoxDescent,
        advance: m.width,
      };
    };

    const PROBE = 200;
    const probe = ink(VOWELLED, PROBE);
    const fontSize = PROBE * Math.min((px * FIT_W) / probe.width, (px * FIT_H) / probe.height);

    const box = ink(VOWELLED, fontSize);
    // Origin that lands the measured ink dead centre. Using the ink box rather
    // than the advance width matters here: the marks sit above the letters, so
    // centring on the line box leaves the word visibly low.
    const x = px / 2 + (box.left - box.right) / 2;
    const y = px / 2 + (box.ascent - box.descent) / 2;

    const bg = ctx.createLinearGradient(0, 0, px, px);
    bg.addColorStop(0, '#12293f');
    bg.addColorStop(0.54, '#2e5e8c');
    bg.addColorStop(1, '#4d93bd');
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, px, px);

    ctx.font = `700 ${fontSize}px Amiri`;
    // Marks first, in the accent; then the bare word on top, which covers the
    // amber letterforms and leaves only the tashkeel showing.
    ctx.fillStyle = '#f5b53f';
    ctx.fillText(VOWELLED, x, y);
    ctx.fillStyle = '#fbf7f0';
    ctx.fillText(BARE, x, y);

    return {
      dataUrl: canvas.toDataURL('image/png'),
      report: {
        fontSize: Math.round(fontSize),
        ink: `${Math.round(box.width)}x${Math.round(box.height)}`,
        // The layering is only valid while both strings advance identically.
        advanceMatches: Math.abs(ink(BARE, fontSize).advance - box.advance) < 0.01,
      },
    };
  }, size);

  if (!report.advanceMatches) {
    throw new Error(
      `${file}: vowelled and bare words no longer advance alike — the two-colour layering is invalid`,
    );
  }

  const flattened = toOpaqueRgb(Buffer.from(dataUrl.split(',')[1], 'base64'));
  writeFileSync(`${root}${file}`, flattened.png);

  // Read the file we just wrote back through the browser and compare it to the
  // canvas pixels. A hand-rolled PNG encoder that is subtly wrong would produce
  // a plausible-looking file, so this checks rather than assumes.
  const drift = await tab.evaluate(
    async ({ dataUrl: written, expected, px }) => {
      const bitmap = await createImageBitmap(
        await (await fetch(written)).blob(),
      );
      const check = document.createElement('canvas');
      check.width = px;
      check.height = px;
      const ctx = check.getContext('2d');
      ctx.drawImage(bitmap, 0, 0);
      const actual = ctx.getImageData(0, 0, px, px).data;
      let worst = 0;
      for (let p = 0; p < px * px; p++) {
        for (let c = 0; c < 3; c++) {
          worst = Math.max(worst, Math.abs(actual[p * 4 + c] - expected[p * 3 + c]));
        }
        worst = Math.max(worst, 255 - actual[p * 4 + 3]);
      }
      return worst;
    },
    {
      dataUrl: `data:image/png;base64,${flattened.png.toString('base64')}`,
      expected: [...flattened.rgb],
      px: size,
    },
  );
  if (drift !== 0) throw new Error(`${file}: re-encoded PNG differs from the canvas by ${drift}`);

  console.log(
    `${file}  ${size}px  font ${report.fontSize}px  ink ${report.ink}  ` +
      `opaque RGB, pixel-identical`,
  );
}

await browser.close();
