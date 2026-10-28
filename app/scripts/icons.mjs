// Draws the PWA icons (a 3x3 cube face on a dark background) into public/icons. Run: node scripts/icons.mjs
import { writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { deflateSync } from "node:zlib";

const BG = [0x1a, 0x1a, 0x19];
const COLORS = { W: [0xf4, 0xf4, 0xf0], Y: [0xf5, 0xd0, 0x2a], G: [0x1b, 0xaf, 0x5a], B: [0x2a, 0x78, 0xd6], R: [0xd6, 0x3a, 0x2f], O: [0xf0, 0x7a, 0x22] };
const FACE = ["GWR", "BGO", "YGG"];

const crcTable = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});
function crc32(buf) {
  let c = 0xffffffff;
  for (const b of buf) c = crcTable[(c ^ b) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}
function chunk(type, data) {
  const out = Buffer.alloc(12 + data.length);
  out.writeUInt32BE(data.length, 0);
  out.write(type, 4, "ascii");
  data.copy(out, 8);
  out.writeUInt32BE(crc32(out.subarray(4, 8 + data.length)), 8 + data.length);
  return out;
}

// Coverage of a rounded square [0, size)² with corner radius r at pixel center (x, y), 4x4 supersampled.
function coverage(x, y, size, r) {
  let hits = 0;
  for (let sy = 0; sy < 4; sy++)
    for (let sx = 0; sx < 4; sx++) {
      const px = x + (sx + 0.5) / 4, py = y + (sy + 0.5) / 4;
      if (px < 0 || py < 0 || px > size || py > size) continue;
      const dx = Math.max(r - px, px - (size - r), 0), dy = Math.max(r - py, py - (size - r), 0);
      if (dx * dx + dy * dy <= r * r) hits++;
    }
  return hits / 16;
}

function draw(size) {
  const px = new Float64Array(size * size * 3);
  for (let i = 0; i < size * size; i++) px.set(BG, i * 3);
  // The face fills the central 56%, inside the maskable safe zone.
  const face = size * 0.56, gap = face * 0.05, cell = (face - 2 * gap) / 3, origin = (size - face) / 2;
  FACE.forEach((row, r) =>
    [...row].forEach((key, c) => {
      const x0 = origin + c * (cell + gap), y0 = origin + r * (cell + gap);
      for (let y = Math.floor(y0); y < Math.ceil(y0 + cell); y++)
        for (let x = Math.floor(x0); x < Math.ceil(x0 + cell); x++) {
          const a = coverage(x - x0, y - y0, cell, cell * 0.18);
          if (!a) continue;
          for (let k = 0; k < 3; k++) px[(y * size + x) * 3 + k] = px[(y * size + x) * 3 + k] * (1 - a) + COLORS[key][k] * a;
        }
    }),
  );
  const raw = Buffer.alloc(size * (size * 3 + 1));
  for (let y = 0; y < size; y++)
    for (let x = 0; x < size * 3; x++) raw[y * (size * 3 + 1) + 1 + x] = Math.round(px[y * size * 3 + x]);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 2; // RGB
  const sig = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  return Buffer.concat([sig, chunk("IHDR", ihdr), chunk("IDAT", deflateSync(raw)), chunk("IEND", Buffer.alloc(0))]);
}

const dir = resolve(import.meta.dirname, "../public/icons");
for (const [name, size] of [["icon-192.png", 192], ["icon-512.png", 512], ["apple-touch-icon.png", 180]])
  writeFileSync(resolve(dir, name), draw(size));
