/**
 * 生成挑战版 tabBar 图标（81×81 PNG）。
 *
 * 运行：node scripts/gen-challenge-icon.js
 *
 * 为什么自己画：tabBar 只吃 png，项目里没有 canvas / sharp 依赖，
 * 这里用零依赖的方式（SDF 求覆盖率 + Node 内置 zlib）直接编码 PNG。
 *
 * 图形语义：一个圆角方框（纸格）+ 四颗墨点，右下那颗只剩轮廓 ——
 * 「有一个位置已经隐去了」，正是挑战版的核心动作。
 */
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

const SIZE = 81;
const OUT_DIR = path.resolve(__dirname, '../src/assets/tabbar');

// ---------- PNG 编码 ----------
const CRC_TABLE = (() => {
  const table = new Int32Array(256);
  for (let n = 0; n < 256; n += 1) {
    let c = n;
    for (let k = 0; k < 8; k += 1) {
      c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    }
    table[n] = c;
  }
  return table;
})();

const crc32 = (buffer) => {
  let c = 0xffffffff;
  for (let i = 0; i < buffer.length; i += 1) {
    c = CRC_TABLE[(c ^ buffer[i]) & 0xff] ^ (c >>> 8);
  }
  return (c ^ 0xffffffff) >>> 0;
};

const chunk = (type, data) => {
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length, 0);
  const typeBuffer = Buffer.from(type, 'ascii');
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(Buffer.concat([typeBuffer, data])), 0);
  return Buffer.concat([length, typeBuffer, data, crc]);
};

const encodePng = (pixels) => {
  const stride = SIZE * 4 + 1;
  const raw = Buffer.alloc(stride * SIZE);
  for (let y = 0; y < SIZE; y += 1) {
    raw[y * stride] = 0; // filter: none
    for (let x = 0; x < SIZE; x += 1) {
      const src = (y * SIZE + x) * 4;
      const dst = y * stride + 1 + x * 4;
      raw[dst] = pixels[src];
      raw[dst + 1] = pixels[src + 1];
      raw[dst + 2] = pixels[src + 2];
      raw[dst + 3] = pixels[src + 3];
    }
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(SIZE, 0);
  ihdr.writeUInt32BE(SIZE, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // RGBA
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', zlib.deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0))
  ]);
};

// ---------- 距离场 ----------
const sdRoundRect = (px, py, cx, cy, halfW, halfH, radius) => {
  const qx = Math.abs(px - cx) - (halfW - radius);
  const qy = Math.abs(py - cy) - (halfH - radius);
  const ax = Math.max(qx, 0);
  const ay = Math.max(qy, 0);
  return Math.sqrt(ax * ax + ay * ay) + Math.min(Math.max(qx, qy), 0) - radius;
};

const sdCircle = (px, py, cx, cy, radius) => Math.hypot(px - cx, py - cy) - radius;

/** 距离 → 覆盖率（1px 抗锯齿） */
const coverage = (distance) => Math.min(1, Math.max(0, 0.5 - distance));

const hexToRgb = (hex) => [
  parseInt(hex.slice(1, 3), 16),
  parseInt(hex.slice(3, 5), 16),
  parseInt(hex.slice(5, 7), 16)
];

const draw = (hex) => {
  const [r, g, b] = hexToRgb(hex);
  const pixels = new Uint8Array(SIZE * SIZE * 4);
  const center = SIZE / 2;

  for (let y = 0; y < SIZE; y += 1) {
    for (let x = 0; x < SIZE; x += 1) {
      const px = x + 0.5;
      const py = y + 0.5;

      // 圆角方框：外轮廓 10..71，线宽 4.5
      const frame = Math.abs(sdRoundRect(px, py, center, center, 30.5, 30.5, 11)) - 2.25;

      // 四颗墨点，右下那颗是空心环
      const dotRadius = 6;
      const dots = [
        { cx: 30.5, cy: 30.5, ring: false },
        { cx: 50.5, cy: 30.5, ring: false },
        { cx: 30.5, cy: 50.5, ring: false },
        { cx: 50.5, cy: 50.5, ring: true }
      ];

      let alpha = coverage(frame);
      dots.forEach((dot) => {
        const distance = dot.ring
          ? Math.abs(sdCircle(px, py, dot.cx, dot.cy, dotRadius - 1.2)) - 1.6
          : sdCircle(px, py, dot.cx, dot.cy, dotRadius);
        alpha = Math.max(alpha, coverage(distance));
      });

      const index = (y * SIZE + x) * 4;
      pixels[index] = r;
      pixels[index + 1] = g;
      pixels[index + 2] = b;
      pixels[index + 3] = Math.round(alpha * 255);
    }
  }
  return pixels;
};

// 与 gen-tabbar-icons.js 保持一致：未选中 #8c8478、选中 #e85d2a，
// 也正好对应 app.config.ts 的 tabBar.color / tabBar.selectedColor。
// （挑战版页面内部用水墨令牌，但 tabBar 是全 App 共用的导航条，必须同色系。）
const COLOR_IDLE = '#8c8478';
const COLOR_ACTIVE = '#e85d2a';

const targets = [
  { file: 'challenge.png', color: COLOR_IDLE },
  { file: 'challenge-selected.png', color: COLOR_ACTIVE }
];

targets.forEach(({ file, color }) => {
  const output = path.join(OUT_DIR, file);
  fs.writeFileSync(output, encodePng(draw(color)));
  console.log(`[Icon] 写入 ${output}`);
});
