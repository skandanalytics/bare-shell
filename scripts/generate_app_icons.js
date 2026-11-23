const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

const ROOT = path.join(__dirname, '..');
const BUILD_DIR = path.join(ROOT, 'build');
const ICONSET_DIR = path.join(BUILD_DIR, 'icon.iconset');

const ICONSET = [
  ['icon_16x16.png', 16],
  ['icon_16x16@2x.png', 32],
  ['icon_32x32.png', 32],
  ['icon_32x32@2x.png', 64],
  ['icon_128x128.png', 128],
  ['icon_128x128@2x.png', 256],
  ['icon_256x256.png', 256],
  ['icon_256x256@2x.png', 512],
  ['icon_512x512.png', 512],
  ['icon_512x512@2x.png', 1024]
];

function main() {
  fs.mkdirSync(BUILD_DIR, { recursive: true });
  fs.mkdirSync(ICONSET_DIR, { recursive: true });

  const pngs = new Map();
  for (const [, size] of ICONSET) {
    if (!pngs.has(size)) pngs.set(size, createIconPng(size));
  }

  for (const [name, size] of ICONSET) {
    fs.writeFileSync(path.join(ICONSET_DIR, name), pngs.get(size));
  }
  fs.writeFileSync(path.join(BUILD_DIR, 'icon.png'), pngs.get(1024));
  fs.writeFileSync(path.join(BUILD_DIR, 'icon.ico'), createIco([pngs.get(256), pngs.get(64), pngs.get(32), pngs.get(16)]));
  fs.writeFileSync(path.join(BUILD_DIR, 'icon.icns'), createIcns([
    ['icp4', pngs.get(16)],
    ['icp5', pngs.get(32)],
    ['icp6', pngs.get(64)],
    ['ic07', pngs.get(128)],
    ['ic08', pngs.get(256)],
    ['ic09', pngs.get(512)],
    ['ic10', pngs.get(1024)]
  ]));
  fs.writeFileSync(path.join(BUILD_DIR, 'icon.svg'), createSvg());

  console.log('Generated Trade Assist icons in build/.');
}

function createIconPng(size) {
  const rgba = Buffer.alloc(size * size * 4);
  const radius = size * 0.22;
  const center = size / 2;

  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      const alpha = roundedRectAlpha(x + 0.5, y + 0.5, size, radius);
      if (alpha <= 0) continue;
      const t = (x + y) / (size * 2);
      const glow = Math.max(0, 1 - distance(x, y, center * 1.12, center * 0.82) / (size * 0.8));
      setPixel(rgba, size, x, y, [
        Math.round(10 + 16 * (1 - t) + 10 * glow),
        Math.round(38 + 118 * t + 42 * glow),
        Math.round(70 + 84 * (1 - t) + 28 * glow),
        Math.round(255 * alpha)
      ]);
    }
  }

  drawCandles(rgba, size);
  drawMonogram(rgba, size);
  return encodePng(size, size, rgba);
}

function drawCandles(rgba, size) {
  const color = [60, 230, 165, 230];
  const muted = [190, 235, 246, 190];
  const baseY = size * 0.68;
  const chart = [
    [0.22, 0.54, 0.40],
    [0.33, 0.47, 0.34],
    [0.44, 0.42, 0.27],
    [0.56, 0.35, 0.23],
    [0.68, 0.30, 0.18]
  ];
  for (const [xPct, topPct, wickTopPct] of chart) {
    const x = Math.round(size * xPct);
    const bodyW = Math.max(2, Math.round(size * 0.045));
    const top = Math.round(size * topPct);
    const wickTop = Math.round(size * wickTopPct);
    drawRect(rgba, size, x - Math.max(1, Math.round(size * 0.006)), wickTop, Math.max(1, Math.round(size * 0.012)), Math.round(baseY - wickTop), muted);
    drawRect(rgba, size, x - bodyW / 2, top, bodyW, Math.round(baseY - top), color);
  }
  drawLine(rgba, size, size * 0.18, size * 0.66, size * 0.78, size * 0.27, [245, 250, 255, 215], Math.max(2, size * 0.018));
}

function drawMonogram(rgba, size) {
  const white = [248, 252, 255, 245];
  const x = size * 0.23;
  const y = size * 0.22;
  const w = size * 0.22;
  const h = size * 0.22;
  const stroke = Math.max(2, Math.round(size * 0.035));
  drawRect(rgba, size, x, y, w, stroke, white);
  drawRect(rgba, size, x + w / 2 - stroke / 2, y, stroke, h, white);

  const ax = size * 0.56;
  const ay = size * 0.22;
  const aw = size * 0.2;
  const ah = size * 0.22;
  drawLine(rgba, size, ax, ay + ah, ax + aw / 2, ay, white, stroke);
  drawLine(rgba, size, ax + aw, ay + ah, ax + aw / 2, ay, white, stroke);
  drawRect(rgba, size, ax + aw * 0.25, ay + ah * 0.52, aw * 0.5, stroke * 0.82, white);
}

function roundedRectAlpha(x, y, size, radius) {
  const inset = size * 0.04;
  const min = inset;
  const max = size - inset;
  const cx = clamp(x, min + radius, max - radius);
  const cy = clamp(y, min + radius, max - radius);
  const d = distance(x, y, cx, cy);
  if (d <= radius - 1) return 1;
  if (d >= radius + 1) return 0;
  return clamp(radius + 1 - d, 0, 1);
}

function drawRect(rgba, size, x, y, w, h, color) {
  const x0 = Math.max(0, Math.floor(x));
  const y0 = Math.max(0, Math.floor(y));
  const x1 = Math.min(size, Math.ceil(x + w));
  const y1 = Math.min(size, Math.ceil(y + h));
  for (let yy = y0; yy < y1; yy += 1) {
    for (let xx = x0; xx < x1; xx += 1) blendPixel(rgba, size, xx, yy, color);
  }
}

function drawLine(rgba, size, x0, y0, x1, y1, color, width) {
  const minX = Math.max(0, Math.floor(Math.min(x0, x1) - width));
  const maxX = Math.min(size - 1, Math.ceil(Math.max(x0, x1) + width));
  const minY = Math.max(0, Math.floor(Math.min(y0, y1) - width));
  const maxY = Math.min(size - 1, Math.ceil(Math.max(y0, y1) + width));
  const dx = x1 - x0;
  const dy = y1 - y0;
  const len2 = dx * dx + dy * dy;
  for (let y = minY; y <= maxY; y += 1) {
    for (let x = minX; x <= maxX; x += 1) {
      const t = len2 ? clamp(((x - x0) * dx + (y - y0) * dy) / len2, 0, 1) : 0;
      const px = x0 + t * dx;
      const py = y0 + t * dy;
      const d = distance(x, y, px, py);
      if (d <= width / 2) blendPixel(rgba, size, x, y, color);
    }
  }
}

function setPixel(rgba, size, x, y, color) {
  const index = (y * size + x) * 4;
  rgba[index] = color[0];
  rgba[index + 1] = color[1];
  rgba[index + 2] = color[2];
  rgba[index + 3] = color[3];
}

function blendPixel(rgba, size, x, y, color) {
  const index = (Math.floor(y) * size + Math.floor(x)) * 4;
  const srcA = clamp((color[3] == null ? 255 : color[3]) / 255, 0, 1);
  const dstA = rgba[index + 3] / 255;
  const outA = srcA + dstA * (1 - srcA);
  if (outA <= 0) return;
  for (let channel = 0; channel < 3; channel += 1) {
    rgba[index + channel] = Math.round((color[channel] * srcA + rgba[index + channel] * dstA * (1 - srcA)) / outA);
  }
  rgba[index + 3] = Math.round(outA * 255);
}

function encodePng(width, height, rgba) {
  const scanlines = Buffer.alloc((width * 4 + 1) * height);
  for (let y = 0; y < height; y += 1) {
    const rowOffset = y * (width * 4 + 1);
    scanlines[rowOffset] = 0;
    rgba.copy(scanlines, rowOffset + 1, y * width * 4, (y + 1) * width * 4);
  }
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    pngChunk('IHDR', ihdr(width, height)),
    pngChunk('IDAT', zlib.deflateSync(scanlines, { level: 9 })),
    pngChunk('IEND', Buffer.alloc(0))
  ]);
}

function ihdr(width, height) {
  const out = Buffer.alloc(13);
  out.writeUInt32BE(width, 0);
  out.writeUInt32BE(height, 4);
  out[8] = 8;
  out[9] = 6;
  return out;
}

function pngChunk(type, data) {
  const typeBuffer = Buffer.from(type, 'ascii');
  const out = Buffer.alloc(12 + data.length);
  out.writeUInt32BE(data.length, 0);
  typeBuffer.copy(out, 4);
  data.copy(out, 8);
  out.writeUInt32BE(crc32(Buffer.concat([typeBuffer, data])), 8 + data.length);
  return out;
}

function crc32(buffer) {
  let crc = 0xffffffff;
  for (const byte of buffer) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit += 1) crc = (crc >>> 1) ^ (0xedb88320 & -(crc & 1));
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function createIco(pngs) {
  const header = Buffer.alloc(6);
  header.writeUInt16LE(0, 0);
  header.writeUInt16LE(1, 2);
  header.writeUInt16LE(pngs.length, 4);
  const entries = [];
  let offset = 6 + pngs.length * 16;
  for (const png of pngs) {
    const size = readPngWidth(png);
    const entry = Buffer.alloc(16);
    entry[0] = size >= 256 ? 0 : size;
    entry[1] = size >= 256 ? 0 : size;
    entry.writeUInt16LE(1, 4);
    entry.writeUInt16LE(32, 6);
    entry.writeUInt32LE(png.length, 8);
    entry.writeUInt32LE(offset, 12);
    offset += png.length;
    entries.push(entry);
  }
  return Buffer.concat([header, ...entries, ...pngs]);
}

function createIcns(entries) {
  const chunks = entries.map(([type, data]) => {
    const chunk = Buffer.alloc(8 + data.length);
    chunk.write(type, 0, 4, 'ascii');
    chunk.writeUInt32BE(chunk.length, 4);
    data.copy(chunk, 8);
    return chunk;
  });
  const totalLength = 8 + chunks.reduce((total, chunk) => total + chunk.length, 0);
  const header = Buffer.alloc(8);
  header.write('icns', 0, 4, 'ascii');
  header.writeUInt32BE(totalLength, 4);
  return Buffer.concat([header, ...chunks], totalLength);
}

function readPngWidth(png) {
  return png.readUInt32BE(16);
}

function createSvg() {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1024 1024">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="#0e2848"/>
      <stop offset="1" stop-color="#129a86"/>
    </linearGradient>
  </defs>
  <rect x="40" y="40" width="944" height="944" rx="220" fill="url(#bg)"/>
  <path d="M188 676 800 276" fill="none" stroke="#f8fcff" stroke-width="22" stroke-linecap="round" opacity=".86"/>
  <g fill="#3ce6a5" opacity=".9">
    <rect x="214" y="414" width="46" height="258" rx="12"/>
    <rect x="328" y="354" width="46" height="318" rx="12"/>
    <rect x="450" y="300" width="46" height="372" rx="12"/>
    <rect x="572" y="258" width="46" height="414" rx="12"/>
    <rect x="696" y="204" width="46" height="468" rx="12"/>
  </g>
  <g fill="#f8fcff">
    <path d="M230 224h226v58h-82v218h-62V282h-82z"/>
    <path d="M610 224h78l118 276h-70l-22-56H584l-22 56h-70zm-4 162h86l-43-106z"/>
  </g>
</svg>
`;
}

function distance(x0, y0, x1, y1) {
  return Math.hypot(x0 - x1, y0 - y1);
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

if (require.main === module) {
  main();
}
