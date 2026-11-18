// Generates the PWA PNG icons into public/icons with no dependencies (node:zlib only).
// Run with `pnpm --filter @monevo/web icons` after changing the design; the outputs are committed.
import { mkdirSync, writeFileSync } from 'node:fs';
import { deflateSync } from 'node:zlib';

const OUT = new URL('../public/icons/', import.meta.url);
const BRAND = [0x1c, 0x7e, 0xd6];
const WHITE = [0xff, 0xff, 0xff];

const CRC_TABLE = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});

function crc32(buffer) {
  let c = 0xffffffff;
  for (const byte of buffer) c = CRC_TABLE[(c ^ byte) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([length, body, crc]);
}

function encodePng(size, rgba) {
  const header = Buffer.alloc(13);
  header.writeUInt32BE(size, 0);
  header.writeUInt32BE(size, 4);
  header[8] = 8; // bit depth
  header[9] = 6; // RGBA
  const raw = Buffer.alloc(size * (size * 4 + 1));
  for (let y = 0; y < size; y++) {
    raw[y * (size * 4 + 1)] = 0; // filter: none
    rgba.copy(raw, y * (size * 4 + 1) + 1, y * size * 4, (y + 1) * size * 4);
  }
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', header),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

function distanceToSegment(px, py, [ax, ay], [bx, by]) {
  const dx = bx - ax;
  const dy = by - ay;
  const t = Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / (dx * dx + dy * dy)));
  return Math.hypot(px - (ax + t * dx), py - (ay + t * dy));
}

/** Signed distance (negative inside) to a rounded square covering the unit square. */
function roundedSquareDistance(x, y, radius) {
  const qx = Math.abs(x - 0.5) - (0.5 - radius);
  const qy = Math.abs(y - 0.5) - (0.5 - radius);
  return Math.hypot(Math.max(qx, 0), Math.max(qy, 0)) + Math.min(Math.max(qx, qy), 0) - radius;
}

/**
 * A white "M" on the brand color. `glyphScale` is the glyph size relative to the icon;
 * `cornerRadius` 0 fills the whole square (maskable icons are cropped by the platform).
 */
function render(size, { glyphScale, cornerRadius }) {
  const rgba = Buffer.alloc(size * size * 4);
  const s = glyphScale;
  const o = (1 - s) / 2;
  const p = (x, y) => [o + x * s, o + y * s];
  const strokes = [
    [p(0.1, 0.9), p(0.1, 0.1)],
    [p(0.1, 0.1), p(0.5, 0.6)],
    [p(0.5, 0.6), p(0.9, 0.1)],
    [p(0.9, 0.1), p(0.9, 0.9)],
  ];
  const half = 0.07 * s;
  const samples = 4;
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      let shape = 0;
      let glyph = 0;
      for (let sy = 0; sy < samples; sy++) {
        for (let sx = 0; sx < samples; sx++) {
          const u = (x + (sx + 0.5) / samples) / size;
          const v = (y + (sy + 0.5) / samples) / size;
          if (cornerRadius === 0 || roundedSquareDistance(u, v, cornerRadius) <= 0) {
            shape++;
            if (strokes.some(([a, b]) => distanceToSegment(u, v, a, b) <= half)) glyph++;
          }
        }
      }
      const total = samples * samples;
      const g = shape === 0 ? 0 : glyph / shape;
      const i = (y * size + x) * 4;
      for (let c = 0; c < 3; c++) rgba[i + c] = Math.round(BRAND[c] * (1 - g) + WHITE[c] * g);
      rgba[i + 3] = Math.round((shape / total) * 255);
    }
  }
  return encodePng(size, rgba);
}

mkdirSync(OUT, { recursive: true });
const ICONS = [
  ['icon-192.png', 192, { glyphScale: 0.6, cornerRadius: 0.2 }],
  ['icon-512.png', 512, { glyphScale: 0.6, cornerRadius: 0.2 }],
  // Maskable: full bleed, glyph inside the central 80% safe zone.
  ['icon-maskable-512.png', 512, { glyphScale: 0.45, cornerRadius: 0 }],
  ['apple-touch-icon.png', 180, { glyphScale: 0.55, cornerRadius: 0 }],
];
for (const [name, size, options] of ICONS) {
  writeFileSync(new URL(name, OUT), render(size, options));
  console.log(`wrote public/icons/${name}`);
}
