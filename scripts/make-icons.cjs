// 아이콘 PNG 생성: resources/tray.png(32px), resources/icon.png(256px)
// 사용: node scripts/make-icons.cjs
const zlib = require('zlib');
const fs = require('fs');
const path = require('path');

function clock(S) {
  const px = Buffer.alloc(S * S * 4);
  const c = (S - 1) / 2;
  const blend = (x, y, r, g, b, a) => {
    if (x < 0 || y < 0 || x >= S || y >= S) return;
    const i = (y * S + x) * 4;
    const k = a / 255;
    px[i] = Math.round(px[i] * (1 - k) + r * k);
    px[i + 1] = Math.round(px[i + 1] * (1 - k) + g * k);
    px[i + 2] = Math.round(px[i + 2] * (1 - k) + b * k);
    px[i + 3] = Math.max(px[i + 3], a);
  };
  // 4x 슈퍼샘플링으로 가장자리를 부드럽게
  const N = 4;
  const outer = S * 0.48;
  const inner = S * 0.38;
  const hand = (x, y, x1, y1, w) => {
    const dx = x1 - c, dy = y1 - c;
    const t = Math.max(0, Math.min(1, ((x - c) * dx + (y - c) * dy) / (dx * dx + dy * dy)));
    return Math.hypot(x - (c + dx * t), y - (c + dy * t)) <= w;
  };
  for (let y = 0; y < S; y++)
    for (let x = 0; x < S; x++) {
      let blue = 0, white = 0, dark = 0;
      for (let sy = 0; sy < N; sy++)
        for (let sx = 0; sx < N; sx++) {
          const fx = x + (sx + 0.5) / N - 0.5, fy = y + (sy + 0.5) / N - 0.5;
          const d = Math.hypot(fx - c, fy - c);
          const w = Math.max(1, S * 0.045);
          if (d <= inner && (hand(fx, fy, c, c - S * 0.27, w) || hand(fx, fy, c + S * 0.18, c + S * 0.1, w) || d <= w * 1.2)) dark++;
          else if (d <= inner) white++;
          else if (d <= outer) blue++;
        }
      const n = N * N;
      if (blue) blend(x, y, 47, 111, 237, Math.round((255 * blue) / n));
      if (white) blend(x, y, 255, 255, 255, Math.round((255 * white) / n));
      if (dark) blend(x, y, 29, 33, 41, Math.round((255 * dark) / n));
    }
  return png(S, px);
}

function png(S, px) {
  const crcTable = Array.from({ length: 256 }, (_, n) => {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    return c >>> 0;
  });
  const crc = (buf) => {
    let c = 0xffffffff;
    for (const b of buf) c = crcTable[(c ^ b) & 0xff] ^ (c >>> 8);
    return (c ^ 0xffffffff) >>> 0;
  };
  const chunk = (type, data) => {
    const len = Buffer.alloc(4);
    len.writeUInt32BE(data.length);
    const td = Buffer.concat([Buffer.from(type), data]);
    const cr = Buffer.alloc(4);
    cr.writeUInt32BE(crc(td));
    return Buffer.concat([len, td, cr]);
  };
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(S, 0);
  ihdr.writeUInt32BE(S, 4);
  ihdr[8] = 8;
  ihdr[9] = 6;
  const raw = Buffer.alloc((S * 4 + 1) * S);
  for (let y = 0; y < S; y++) px.copy(raw, y * (S * 4 + 1) + 1, y * S * 4, (y + 1) * S * 4);
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk('IHDR', ihdr),
    chunk('IDAT', zlib.deflateSync(raw)),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

const out = path.join(__dirname, '..', 'resources');
fs.writeFileSync(path.join(out, 'tray.png'), clock(32));
fs.writeFileSync(path.join(out, 'icon.png'), clock(256));
console.log('resources/tray.png, resources/icon.png 생성');
