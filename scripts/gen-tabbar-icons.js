/**
 * 生成 tabBar 图标（微信小程序只支持 PNG/JPG，不支持 SVG）。
 * 运行：node scripts/gen-tabbar-icons.js
 *
 * 线性图标，24 网格；未选中 #8c8478，选中 #e85d2a。
 */
const fs = require('fs');
const path = require('path');
const sharp = require('sharp');

const OUT_DIR = path.resolve(__dirname, '../src/assets/tabbar');
const SIZE = 81;

const COLOR_IDLE = '#8c8478';
const COLOR_ACTIVE = '#e85d2a';

const ICONS = {
  play: `
    <path d="M9 17.5V6.4l9.5-1.9v11.1" />
    <circle cx="6.9" cy="17.6" r="2.1" />
    <circle cx="16.4" cy="15.6" r="2.1" />
  `,
  levels: `
    <rect x="3.2" y="3.2" width="7.2" height="7.2" rx="1.6" />
    <rect x="13.6" y="3.2" width="7.2" height="7.2" rx="1.6" />
    <rect x="3.2" y="13.6" width="7.2" height="7.2" rx="1.6" />
    <rect x="13.6" y="13.6" width="7.2" height="7.2" rx="1.6" />
  `,
  collection: `
    <circle cx="12" cy="12" r="8.6" />
    <circle cx="12" cy="12" r="2.4" />
  `,
  mine: `
    <circle cx="12" cy="8" r="3.6" />
    <path d="M4.6 20.2c0-4 3.4-6.4 7.4-6.4s7.4 2.4 7.4 6.4" />
  `
};

const buildSvg = (body, color) => `<svg xmlns="http://www.w3.org/2000/svg" width="${SIZE}" height="${SIZE}" viewBox="0 0 24 24" fill="none" stroke="${color}" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round">${body}</svg>`;

(async () => {
  if (!fs.existsSync(OUT_DIR)) {
    fs.mkdirSync(OUT_DIR, { recursive: true });
  }
  for (const [name, body] of Object.entries(ICONS)) {
    for (const [suffix, color] of [
      ['', COLOR_IDLE],
      ['-selected', COLOR_ACTIVE]
    ]) {
      const file = path.join(OUT_DIR, `${name}${suffix}.png`);
      // eslint-disable-next-line no-await-in-loop
      await sharp(Buffer.from(buildSvg(body, color)))
        .resize(SIZE, SIZE, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
        .png()
        .toFile(file);
      console.log(`[tabbar] ${path.basename(file)}`);
    }
  }
})();
