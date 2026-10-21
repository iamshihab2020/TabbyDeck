// Draws the TabbyDeck mark (four keys on an amber cap, as in ui/src/Mark.tsx) and writes a multi-size .ico of PNGs.
import { writeFileSync } from 'node:fs';
import { crc32, deflateSync } from 'node:zlib';

// Mark geometry in a 20 x 20 box: [x, y, w, h, r, rgb, alpha]
const SHAPES = [
  [0, 0, 20, 20, 6, [0xf5, 0xa5, 0x24], 1],
  [4.6, 4.6, 4.6, 4.6, 1.2, [0x1a, 0x12, 0x08], 1],
  [10.8, 4.6, 4.6, 4.6, 1.2, [0x1a, 0x12, 0x08], 1],
  [4.6, 10.8, 4.6, 4.6, 1.2, [0x1a, 0x12, 0x08], 1],
  [10.8, 10.8, 4.6, 4.6, 1.2, [0x1a, 0x12, 0x08], 0.45],
];

function inRoundRect(px, py, [x, y, w, h, r]) {
  if (px < x || py < y || px > x + w || py > y + h) return false;
  const cx = Math.min(Math.max(px, x + r), x + w - r), cy = Math.min(Math.max(py, y + r), y + h - r);
  return (px - cx) ** 2 + (py - cy) ** 2 <= r * r;
}

/** RGBA pixels of the mark at size n, 4 x 4 supersampled. */
function draw(n) {
  const px = Buffer.alloc(n * n * 4), S = 4;
  for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) {
    let r = 0, g = 0, b = 0, a = 0;
    for (let sy = 0; sy < S; sy++) for (let sx = 0; sx < S; sx++) {
      const x = ((i + (sx + 0.5) / S) / n) * 20, y = ((j + (sy + 0.5) / S) / n) * 20;
      let c = null, ca = 0;
      for (const s of SHAPES) if (inRoundRect(x, y, s)) {
        const [, , , , , rgb, al] = s;
        c = c ? c.map((v, k) => v * (1 - al) + rgb[k] * al) : rgb; ca = 1;
      }
      if (c) { r += c[0]; g += c[1]; b += c[2]; a += ca; }
    }
    const o = (j * n + i) * 4;
    px[o] = a ? r / a : 0; px[o + 1] = a ? g / a : 0; px[o + 2] = a ? b / a : 0; px[o + 3] = Math.round((a / (S * S)) * 255);
  }
  return px;
}

export function png(n) {
  const rgba = draw(n), raw = Buffer.alloc(n * (n * 4 + 1));
  for (let y = 0; y < n; y++) { raw[y * (n * 4 + 1)] = 0; rgba.copy(raw, y * (n * 4 + 1) + 1, y * n * 4, (y + 1) * n * 4); }
  const chunk = (type, data) => {
    const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
    const td = Buffer.concat([Buffer.from(type), data]), crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(td));
    return Buffer.concat([len, td, crc]);
  };
  const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(n, 0); ihdr.writeUInt32BE(n, 4); ihdr[8] = 8; ihdr[9] = 6;
  return Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), chunk('IHDR', ihdr), chunk('IDAT', deflateSync(raw)), chunk('IEND', Buffer.alloc(0))]);
}

export function writeIco(file, sizes = [16, 20, 24, 32, 48, 64, 256]) {
  const images = sizes.map(png);
  const head = Buffer.alloc(6 + 16 * sizes.length);
  head.writeUInt16LE(0, 0); head.writeUInt16LE(1, 2); head.writeUInt16LE(sizes.length, 4);
  let offset = head.length;
  sizes.forEach((n, k) => {
    const e = 6 + 16 * k;
    head[e] = n >= 256 ? 0 : n; head[e + 1] = n >= 256 ? 0 : n; head.writeUInt16LE(1, e + 4); head.writeUInt16LE(32, e + 6);
    head.writeUInt32LE(images[k].length, e + 8); head.writeUInt32LE(offset, e + 12); offset += images[k].length;
  });
  writeFileSync(file, Buffer.concat([head, ...images]));
}
