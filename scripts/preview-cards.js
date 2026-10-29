/**
 * 卡片造型离线预览（开发用）：
 * 直接调用运行时的几何函数（src/utils/circleLayout.ts / silhouette.ts），
 * 生成一个静态 HTML，把「圆形卡 / 图案卡」按设计稿尺寸画出来，用于肉眼验收。
 *
 * 运行：node scripts/preview-cards.js
 * 产出：docs/card-preview.html
 */

const fs = require('fs');
const path = require('path');
const esbuild = require('esbuild');

const root = path.join(__dirname, '..');
const bundlePath = path.join(root, '.tmp-card-preview.cjs');

esbuild.buildSync({
  stdin: {
    contents: `export * from './src/utils/circleLayout';\nexport * from './src/utils/silhouette';\n`,
    resolveDir: root,
    loader: 'ts'
  },
  bundle: true,
  format: 'cjs',
  platform: 'node',
  outfile: bundlePath,
  alias: { '@': path.join(root, 'src') },
  logLevel: 'warning'
});

const { buildCircleCells, buildSilhouetteCells, buildPatternInk, PATTERN_SHAPES } = require(bundlePath);

// 设计稿 750rpx → 375px，1rpx = 0.5px
const rpx = (value) => `${value / 2}px`;
const CARD = 686;

const CIRCLE_FONT = { 3: 44, 4: 38, 5: 33, 6: 29, 7: 25, 8: 22 };
const PATTERN_FONT = { 3: 44, 4: 38, 5: 34, 6: 28, 7: 24, 8: 20 };

const cellHtml = (cell, clipPath, left, top, done = false) => `
  <div class="cell${done ? ' done' : ''}" style="clip-path:${clipPath}">
    <span style="left:${left}%;top:${top}%">${cell}</span>
  </div>`;

const circleCard = (size) => {
  const cells = buildCircleCells(size);
  const body = cells
    .map((geometry, index) => cellHtml(index + 1, geometry.clipPath, geometry.labelX, geometry.labelY))
    .join('');
  return `<section class="block">
  <h3>圆形卡 · ${size}×${size}</h3>
  <div class="card circle" style="background:#f3eadc;font-size:${rpx(CIRCLE_FONT[size])}">
    <div class="area">${body}</div>
  </div>
</section>`;
};

const patternCard = (shape, size, doneCount = 0) => {
  const cells = buildSilhouetteCells(shape, size);
  const ink = buildPatternInk(shape, size);
  const body = cells
    .map(
      (geometry, index) => `
  <div class="cell ghost${index < doneCount ? ' done' : ''}" style="clip-path:${geometry.clipPath}">
    <span style="left:${geometry.labelX}%;top:${geometry.labelY}%">${index + 1}</span>
  </div>`
    )
    .join('');
  return `<section class="block">
  <h3>图案卡 · ${shape.name} · ${size}×${size}${doneCount > 0 ? ' · 已点示例' : ''}</h3>
  <div class="card pattern" style="font-size:${rpx(PATTERN_FONT[size])}">
    <img class="ink" src="${ink}" alt="" />${body}
  </div>
</section>`;
};

const squareCard = (size, doneCount) => {
  const values = Array.from({ length: size * size }, (_, i) => i + 1);
  const body = values
    .map(
      (value, index) => `<div class="slot"><div class="inner">${cellHtml(
        value,
        'none',
        50,
        50,
        index < doneCount
      )}</div></div>`
    )
    .join('');
  return `<section class="block">
  <h3>方形卡 · ${size}×${size} · 已点示例</h3>
  <div class="square" style="font-size:${rpx(33 * 1.1)}">${body}</div>
</section>`;
};

const html = `<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="utf-8" />
<title>卡片造型预览</title>
<style>
  body { margin: 0; padding: 16px; background: #fbf6ee; color: #2f2a24;
    font-family: -apple-system, "PingFang SC", "Microsoft YaHei", sans-serif; }
  .grid { display: flex; flex-wrap: wrap; gap: 12px; }
  .block { width: ${rpx(CARD)}; }
  h3 { font-size: 13px; font-weight: 600; margin: 8px 0; color: #55504a; }
  .card { position: relative; width: ${rpx(CARD)}; height: ${rpx(CARD)}; box-sizing: border-box; }
  .circle { border-radius: 999px; border: 1px solid #d8c9b2; }
  .area { position: absolute; inset: 5%; }
  .pattern { background: transparent; }
  .pattern .ink { position: absolute; inset: 0; width: 100%; height: 100%; }
  .cell { position: absolute; inset: 0; background: #fffdf8; color: #5b544b;
    font-weight: 600; font-variant-numeric: tabular-nums; }
  /* 图案卡的格子完全透明：图案面与线都在 .ink 那张 SVG 里 */
  .cell.ghost { background: transparent; }
  .cell span { position: absolute; transform: translate(-50%, -50%); line-height: 1; }
  .cell.done span::after { content: '♪'; font-size: 0.62em; margin-left: 0.12em;
    color: rgba(216, 78, 30, 0.72); }
  .square { display: flex; flex-wrap: wrap; width: ${rpx(CARD)}; }
  .square .slot { width: 20%; padding-bottom: 20%; position: relative; }
  .square .slot > .inner { position: absolute; inset: 0; padding: 0.16em; }
  /* 预览页是纯 CSS，rpx 不合法会被整条丢弃 —— 这里一律用 px（1rpx = 0.5px） */
  .square .inner > .cell { position: absolute; inset: 0; border-radius: 8px;
    border: 1px solid #e7dbc8; box-shadow: 0 1px 3px rgba(26,24,21,.04); }
  .square .cell::after { content: '♪'; position: absolute; right: 0.42em; bottom: 0.3em;
    font-size: 0.42em; line-height: 1; color: rgba(216, 78, 30, 0); }
  .square .cell.done::after { color: rgba(216, 78, 30, 0.72); }
  .square .cell.done span::after { content: none; }
</style>
</head>
<body>
<div class="grid">
  ${[3, 5, 8].map(circleCard).join('')}
  ${PATTERN_SHAPES.map((shape) => patternCard(shape, 5)).join('')}
  ${patternCard(PATTERN_SHAPES[0], 8)}
  ${patternCard(PATTERN_SHAPES[5], 8)}
  ${patternCard(PATTERN_SHAPES[0], 5, 6)}
  ${squareCard(5, 7)}
</div>
</body>
</html>`;

const out = path.join(root, 'docs/card-preview.html');
fs.writeFileSync(out, html, 'utf8');
fs.unlinkSync(bundlePath);
console.log(`已生成 ${out}`);
