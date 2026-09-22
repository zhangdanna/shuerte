/**
 * 生肖轮廓自检脚本（开发用）：
 * 用「椭圆并集」描述形状 → 采样成网格 → 追踪外轮廓 → 平滑简化 → 打印 ASCII 预览。
 * 另外把运行时的「格位采样 + Voronoi 划分」逻辑搬过来跑一遍，验证每个尺寸都能划分出 size² 个格子。
 *
 * 运行：node scripts/preview-shapes.js [name...]
 *   ASCII=1  打印形状轮廓的 ASCII 图
 *   DIVIDE=5 打印 5×5 的 Voronoi 划分图（字母相同 = 同一格）
 */

const RES = 56; // 轮廓采样分辨率
const DIVIDE_RES = 96; // Voronoi 划分分辨率

/** 形状与运行时共用同一份数据，避免两处不同步 */
const SHAPES = require('../src/data/zodiacShapes.json').reduce((acc, shape) => {
  acc[shape.key] = shape;
  return acc;
}, {});

const inside = (shape, x, y) =>
  shape.ellipses.some((e) => {
    const dx = (x - e.cx) / e.rx;
    const dy = (y - e.cy) / e.ry;
    return dx * dx + dy * dy <= 1;
  });

const buildGrid = (shape, res) => {
  const grid = new Uint8Array(res * res);
  for (let y = 0; y < res; y += 1) {
    for (let x = 0; x < res; x += 1) {
      if (inside(shape, (x + 0.5) / res, (y + 0.5) / res)) {
        grid[y * res + x] = 1;
      }
    }
  }
  return grid;
};

/** Moore 邻域轮廓追踪 */
const traceContour = (isFilled, res) => {
  const at = (x, y) => x >= 0 && y >= 0 && x < res && y < res && isFilled(x, y);
  let start = null;
  for (let y = 0; y < res && !start; y += 1) {
    for (let x = 0; x < res; x += 1) {
      if (at(x, y)) {
        start = [x, y];
        break;
      }
    }
  }
  if (!start) return [];
  const dirs = [
    [1, 0],
    [1, 1],
    [0, 1],
    [-1, 1],
    [-1, 0],
    [-1, -1],
    [0, -1],
    [1, -1]
  ];
  const contour = [start];
  let [cx, cy] = start;
  let dir = 0;
  const maxSteps = res * res * 8;
  for (let step = 0; step < maxSteps; step += 1) {
    let moved = false;
    for (let k = 0; k < 8; k += 1) {
      const d = (dir + 6 + k) % 8;
      const nx = cx + dirs[d][0];
      const ny = cy + dirs[d][1];
      if (at(nx, ny)) {
        contour.push([nx, ny]);
        cx = nx;
        cy = ny;
        dir = d;
        moved = true;
        break;
      }
    }
    if (!moved) break;
    if (cx === start[0] && cy === start[1] && contour.length > 4) break;
  }
  return contour;
};

/** Chaikin 平滑，让折线轮廓变圆润 */
const chaikin = (pts, iterations) => {
  let current = pts;
  for (let i = 0; i < iterations; i += 1) {
    const next = [];
    for (let j = 0; j < current.length; j += 1) {
      const p = current[j];
      const q = current[(j + 1) % current.length];
      next.push([p[0] * 0.75 + q[0] * 0.25, p[1] * 0.75 + q[1] * 0.25]);
      next.push([p[0] * 0.25 + q[0] * 0.75, p[1] * 0.25 + q[1] * 0.75]);
    }
    current = next;
  }
  return current;
};

/** Douglas-Peucker 简化，减少 clip-path 的点数 */
const perpDist = (p, a, b) => {
  const dx = b[0] - a[0];
  const dy = b[1] - a[1];
  const len = Math.hypot(dx, dy);
  if (len === 0) return Math.hypot(p[0] - a[0], p[1] - a[1]);
  return Math.abs(dy * p[0] - dx * p[1] + b[0] * a[1] - b[1] * a[0]) / len;
};

const simplify = (pts, tol) => {
  if (pts.length < 4) return pts;
  const keep = new Array(pts.length).fill(false);
  keep[0] = true;
  keep[pts.length - 1] = true;
  const stack = [[0, pts.length - 1]];
  while (stack.length > 0) {
    const [s, e] = stack.pop();
    let maxD = -1;
    let idx = -1;
    for (let i = s + 1; i < e; i += 1) {
      const d = perpDist(pts[i], pts[s], pts[e]);
      if (d > maxD) {
        maxD = d;
        idx = i;
      }
    }
    if (maxD > tol && idx > 0) {
      keep[idx] = true;
      stack.push([s, idx], [idx, e]);
    }
  }
  return pts.filter((_, i) => keep[i]);
};

/** 追踪一个区域的轮廓 → 平滑 → 简化（与 silhouette.ts 的整卡轮廓同算法） */
const buildOutlineFromFilled = (isFilled, res, tol, smoothPasses) => {
  const raw = traceContour(isFilled, res).map(([x, y]) => [(x + 0.5) / res, (y + 0.5) / res]);
  if (raw.length === 0) return [];
  // 旋转起点到最上方的点（保证起点稳定），注意不能排序：排序会打乱边界的先后顺序
  let startIndex = 0;
  for (let i = 1; i < raw.length; i += 1) {
    if (raw[i][1] < raw[startIndex][1] || (raw[i][1] === raw[startIndex][1] && raw[i][0] < raw[startIndex][0])) {
      startIndex = i;
    }
  }
  const ordered = raw.slice(startIndex).concat(raw.slice(0, startIndex));
  let shaped = smoothPasses > 0 ? chaikin(ordered, smoothPasses) : ordered.slice();
  shaped.push(shaped[0]);
  const simplified = simplify(shaped, tol);
  simplified.pop();
  return simplified;
};

const contourArea = (pts) => {
  let sum = 0;
  for (let i = 0; i < pts.length; i += 1) {
    const [x1, y1] = pts[i];
    const [x2, y2] = pts[(i + 1) % pts.length];
    sum += x1 * y2 - x2 * y1;
  }
  return Math.abs(sum) / 2;
};

const renderAscii = (shape, res) => {
  const lines = [];
  for (let y = 0; y < res; y += 1) {
    let line = '';
    for (let x = 0; x < res; x += 1) {
      line += inside(shape, (x + 0.5) / res, (y + 0.5) / res) ? '#' : '.';
    }
    lines.push(line);
  }
  return lines.join('\n');
};

/** 连通分量检查：形状必须是单一整体，否则会有孤立碎片（数字可能落进碎片里） */
const countComponents = (shape, res) => {
  const grid = buildGrid(shape, res);
  const seen = new Uint8Array(res * res);
  let components = 0;
  const sizes = [];
  for (let i = 0; i < res * res; i += 1) {
    if (grid[i] !== 1 || seen[i] === 1) continue;
    components += 1;
    let size = 0;
    const queue = [i];
    seen[i] = 1;
    while (queue.length > 0) {
      const cur = queue.pop();
      size += 1;
      const x = cur % res;
      const y = Math.floor(cur / res);
      const neighbors = [
        [x - 1, y],
        [x + 1, y],
        [x, y - 1],
        [x, y + 1]
      ];
      neighbors.forEach(([nx, ny]) => {
        if (nx < 0 || ny < 0 || nx >= res || ny >= res) return;
        const ni = ny * res + nx;
        if (grid[ni] === 1 && seen[ni] === 0) {
          seen[ni] = 1;
          queue.push(ni);
        }
      });
    }
    sizes.push(size);
  }
  return { components, sizes: sizes.sort((a, b) => b - a).slice(0, 4) };
};

/**
 * 多源 BFS 划分：每格从自己的格心向外生长，抢到像素即归属。
 * 相比「每像素找最近格心」，它天然保证每格是一个连通块，不会在凹形处被拆成两块。
 */
const labelByBFS = (shape, seeds, res, isInsidePixel) => {
  const labels = new Int16Array(res * res).fill(-1);
  const queue = new Int32Array(res * res);
  let tail = 0;

  // 落点：格心可能因松弛落到轮廓外或撞车，就近找一个空白的轮廓内像素
  const offsets = [
    [0, 0],
    [1, 0],
    [-1, 0],
    [0, 1],
    [0, -1],
    [1, 1],
    [1, -1],
    [-1, 1],
    [-1, -1]
  ];
  seeds.forEach(([x, y], s) => {
    const sx = Math.min(res - 1, Math.max(0, Math.floor(x * res)));
    const sy = Math.min(res - 1, Math.max(0, Math.floor(y * res)));
    let placed = -1;
    for (let radius = 0; radius <= 8 && placed < 0; radius += 1) {
      for (const [dx, dy] of offsets) {
        const nx = sx + dx * radius;
        const ny = sy + dy * radius;
        if (nx < 0 || ny < 0 || nx >= res || ny >= res) continue;
        const index = ny * res + nx;
        if (labels[index] !== -1 || !isInsidePixel(nx, ny)) continue;
        placed = index;
        break;
      }
    }
    if (placed < 0) {
      throw new Error(`格心 ${s} 找不到可落下的像素`);
    }
    labels[placed] = s;
    queue[tail] = placed;
    tail += 1;
  });

  let head = 0;
  const steps = [
    [1, 0],
    [-1, 0],
    [0, 1],
    [0, -1]
  ];
  while (head < tail) {
    const current = queue[head];
    head += 1;
    const label = labels[current];
    const px = current % res;
    const py = (current - px) / res;
    for (const [dx, dy] of steps) {
      const nx = px + dx;
      const ny = py + dy;
      if (nx < 0 || ny < 0 || nx >= res || ny >= res) continue;
      const index = ny * res + nx;
      if (labels[index] !== -1 || !isInsidePixel(nx, ny)) continue;
      labels[index] = label;
      queue[tail] = index;
      tail += 1;
    }
  }
  return labels;
};

/** Lloyd 松弛：把格心挪到自己那块的形心，再投影回轮廓内的候选点，消除大小格 */
const relaxSeeds = (shape, seeds, candidates, iterations, res) => {
  const isInsidePixel = (x, y) => inside(shape, (x + 0.5) / res, (y + 0.5) / res);
  let current = seeds.map((point) => point.slice());
  for (let iteration = 0; iteration < iterations; iteration += 1) {
    const labels = labelByBFS(shape, current, res, isInsidePixel);
    const sumX = new Float64Array(current.length);
    const sumY = new Float64Array(current.length);
    const count = new Int32Array(current.length);
    for (let index = 0; index < res * res; index += 1) {
      const label = labels[index];
      if (label < 0) continue;
      const px = index % res;
      const py = (index - px) / res;
      sumX[label] += (px + 0.5) / res;
      sumY[label] += (py + 0.5) / res;
      count[label] += 1;
    }
    current = current.map((point, index) => {
      if (count[index] === 0) return point;
      const targetX = sumX[index] / count[index];
      const targetY = sumY[index] / count[index];
      let bestPoint = point;
      let bestDistance = Infinity;
      candidates.forEach(([cx, cy]) => {
        const distance = (cx - targetX) ** 2 + (cy - targetY) ** 2;
        if (distance < bestDistance) {
          bestDistance = distance;
          bestPoint = [cx, cy];
        }
      });
      return bestPoint;
    });
  }
  return current;
};

/** 在最远点采样出来的格心上做 Voronoi 划分，返回每格的形心、面积与顶点数 */
const divideVoronoi = (shape, size) => {
  const total = size * size;

  // 1) 轮廓内候选点：分辨率随格数提高，格心才能铺得开
  const candRes = Math.max(24, size * 10);
  const candidates = [];
  for (let iy = 0; iy < candRes; iy += 1) {
    for (let ix = 0; ix < candRes; ix += 1) {
      const x = (ix + 0.5) / candRes;
      const y = (iy + 0.5) / candRes;
      if (inside(shape, x, y)) candidates.push([x, y]);
    }
  }
  if (candidates.length < total) {
    return { ok: false, candidates: candidates.length };
  }

  // 2) 最远点采样得到 size² 个格心
  const centerX = candidates.reduce((s, [x]) => s + x, 0) / candidates.length;
  const centerY = candidates.reduce((s, [, y]) => s + y, 0) / candidates.length;
  let seed = 0;
  let best = Infinity;
  candidates.forEach(([x, y], i) => {
    const d = (x - centerX) ** 2 + (y - centerY) ** 2;
    if (d < best) {
      best = d;
      seed = i;
    }
  });
  const seeds = [candidates[seed]];
  const cache = candidates.map(([x, y]) => {
    const [sx, sy] = candidates[seed];
    return (x - sx) ** 2 + (y - sy) ** 2;
  });
  cache[seed] = -1;
  while (seeds.length < total) {
    let idx = -1;
    let far = -1;
    for (let i = 0; i < candidates.length; i += 1) {
      if (cache[i] > far) {
        far = cache[i];
        idx = i;
      }
    }
    if (idx < 0) return { ok: false, candidates: candidates.length };
    const [px, py] = candidates[idx];
    seeds.push([px, py]);
    cache[idx] = -1;
    candidates.forEach(([x, y], i) => {
      if (cache[i] < 0) return;
      const d = (x - px) ** 2 + (y - py) ** 2;
      if (d < cache[i]) cache[i] = d;
    });
  }

  // 3) Lloyd 松弛：把格心挪到各自那块的形心，消除最远点采样产生的大小格
  const relaxed = relaxSeeds(shape, seeds, candidates, 3, 72);

  // 4) 多源 BFS 划分：每个轮廓内像素归属先长到它的格心
  const isInsidePixel = (x, y) => inside(shape, (x + 0.5) / DIVIDE_RES, (y + 0.5) / DIVIDE_RES);
  const labels = labelByBFS(shape, relaxed, DIVIDE_RES, isInsidePixel);

  // 5) 逐格追踪轮廓，统计顶点数/面积/形心
  const tol = 0.09 / size;
  const cells = [];
  for (let s = 0; s < total; s += 1) {
    const isFilled = (x, y) => x >= 0 && y >= 0 && x < DIVIDE_RES && y < DIVIDE_RES && labels[y * DIVIDE_RES + x] === s;
    const outline = buildOutlineFromFilled(isFilled, DIVIDE_RES, tol, 1);
    if (outline.length === 0) {
      return { ok: false, candidates: candidates.length, emptyCell: s };
    }
    const cx = outline.reduce((sum, [x]) => sum + x, 0) / outline.length;
    const cy = outline.reduce((sum, [, y]) => sum + y, 0) / outline.length;
    cells.push({ points: outline.length, area: contourArea(outline), cx, cy });
  }

  return { ok: true, cells, seeds, labels };
};

/** 打印 Voronoi 划分：同一字母 = 同一格 */
const renderDivide = (labels, res, size) => {
  const chars = '0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ';
  const lines = [];
  for (let y = 0; y < res; y += 1) {
    let line = '';
    for (let x = 0; x < res; x += 1) {
      const label = labels[y * res + x];
      line += label < 0 ? '.' : chars[label % chars.length];
    }
    lines.push(line);
  }
  return lines.join('\n');
};

const names = process.argv.slice(2);
const showAscii = process.env.ASCII === '1';
const divideSize = process.env.DIVIDE ? Number(process.env.DIVIDE) : 0;

const keys = names.length > 0 ? names : Object.keys(SHAPES);
keys.forEach((key) => {
  const shape = SHAPES[key];
  if (!shape) {
    console.log(`未知形状：${key}`);
    return;
  }
  const outline = buildOutlineFromFilled(
    (x, y) => inside(shape, (x + 0.5) / RES, (y + 0.5) / RES),
    RES,
    0.012,
    2
  );
  const { components, sizes } = countComponents(shape, RES);
  const maskArea = (sizes[0] || 0) / (RES * RES);
  const outlineArea = contourArea(outline);
  const areaDelta = Math.abs(outlineArea - maskArea) / maskArea;
  const flag = components === 1 ? 'OK' : `⚠️ 有 ${components} 个碎片`;
  console.log(
    `\n===== ${key}（${shape.name}） 轮廓点 ${outline.length} ｜ 连通块 ${components} ${flag} ｜ 掩膜面积 ${(
      maskArea * 100
    ).toFixed(1)}% ｜ 轮廓面积 ${(outlineArea * 100).toFixed(1)}% ｜ 偏差 ${(areaDelta * 100).toFixed(1)}% =====`
  );

  [3, 4, 5, 6, 7, 8].forEach((size) => {
    const result = divideVoronoi(shape, size);
    if (!result.ok) {
      console.log(`  ${size}×${size}(${size * size}格) ⚠️ 划分失败 候选 ${result.candidates ?? '-'}`);
      return;
    }
    const areas = result.cells.map((c) => c.area);
    const points = result.cells.map((c) => c.points);
    const minArea = Math.min(...areas);
    const maxPoints = Math.max(...points);
    const minPoints = Math.min(...points);
    // 最小格的等效边长（rpx）：用来判断字号是否够用
    const sideRpx = Math.round(Math.sqrt(minArea) * 686);
    console.log(
      `  ${size}×${size}(${size * size}格) 顶点 ${minPoints}~${maxPoints} ｜ 最小格 ${sideRpx}rpx ｜ 面积比 ${(
        (minArea / Math.max(...areas)) *
        100
      ).toFixed(0)}%`
    );
  });

  if (showAscii) {
    console.log(renderAscii(shape, 46));
  }
  if (divideSize > 0) {
    const result = divideVoronoi(shape, divideSize);
    if (result.ok) {
      console.log(renderDivide(result.labels, DIVIDE_RES, divideSize));
    }
  }
});
