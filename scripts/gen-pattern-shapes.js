/**
 * 不规则图案生成器（开发用）：
 * 用「圆 / 椭圆 / 胶囊 / 多边形」拼出 12 个不规则图案，栅格化成掩膜 → 追踪外轮廓 →
 * Chaikin 平滑 → Douglas-Peucker 简化 → 输出归一化多边形到 src/data/patternShapes.json。
 *
 * 为什么不在运行时算：作者侧用几何图元拼形状最直观，但运行时只需要「点在不在形状内」，
 * 直接把拼好的结果烘成一条多边形，运行时用射线法判定即可（比椭圆并集还快）。
 *
 * 运行：node scripts/gen-pattern-shapes.js [name...]
 *   ASCII=1  打印 ASCII 预览（36×36）
 *   WRITE=1  写回 src/data/patternShapes.json
 */

const fs = require('fs');
const path = require('path');

const RES = 320; // 栅格分辨率：足够描出细节，生成一次即可
const ASCII_RES = 36;
const SMOOTH_PASSES = 2;
const SIMPLIFY_TOL = 0.0035;

// ---------------- 图元 ----------------
const C = (cx, cy, r) => ({ t: 'e', cx, cy, rx: r, ry: r });
const E = (cx, cy, rx, ry) => ({ t: 'e', cx, cy, rx, ry });
const K = (x1, y1, x2, y2, r) => ({ t: 'k', x1, y1, x2, y2, r });
const P = (...pts) => ({ t: 'p', pts });
/** 镜像：把一个图元按 x → 1 - x 翻到另一侧（省掉一半手写量） */
const M = (p) => {
  if (p.t === 'e') return { ...p, cx: 1 - p.cx };
  if (p.t === 'k') return { ...p, x1: 1 - p.x1, x2: 1 - p.x2 };
  return { ...p, pts: p.pts.map(([x, y]) => [1 - x, y]) };
};

const insidePrimitive = (p, x, y) => {
  if (p.t === 'e') {
    const dx = (x - p.cx) / p.rx;
    const dy = (y - p.cy) / p.ry;
    return dx * dx + dy * dy <= 1;
  }
  if (p.t === 'k') {
    const vx = p.x2 - p.x1;
    const vy = p.y2 - p.y1;
    const len2 = vx * vx + vy * vy;
    let t = len2 === 0 ? 0 : ((x - p.x1) * vx + (y - p.y1) * vy) / len2;
    t = Math.max(0, Math.min(1, t));
    const px = p.x1 + vx * t;
    const py = p.y1 + vy * t;
    return Math.hypot(x - px, y - py) <= p.r;
  }
  // 射线法
  let inside = false;
  const pts = p.pts;
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i, i += 1) {
    const [xi, yi] = pts[i];
    const [xj, yj] = pts[j];
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) {
      inside = !inside;
    }
  }
  return inside;
};

// ---------------- 栅格化 + 轮廓追踪 ----------------
const buildMask = (shape) => {
  const mask = new Uint8Array(RES * RES);
  for (let y = 0; y < RES; y += 1) {
    for (let x = 0; x < RES; x += 1) {
      const px = (x + 0.5) / RES;
      const py = (y + 0.5) / RES;
      if (shape.parts.some((p) => insidePrimitive(p, px, py))) {
        mask[y * RES + x] = 1;
      }
    }
  }
  return mask;
};

const traceContour = (mask) => {
  const at = (x, y) => x >= 0 && y >= 0 && x < RES && y < RES && mask[y * RES + x] === 1;
  let start = null;
  for (let y = 0; y < RES && !start; y += 1) {
    for (let x = 0; x < RES; x += 1) {
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
  for (let step = 0; step < RES * RES * 8; step += 1) {
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

/** 连通块数量：>1 说明有零件没接上主体，会切出孤立碎片 */
const countComponents = (mask) => {
  const seen = new Uint8Array(RES * RES);
  let components = 0;
  const stack = [];
  for (let i = 0; i < RES * RES; i += 1) {
    if (mask[i] !== 1 || seen[i] === 1) continue;
    let size = 0;
    components += 1;
    stack.push(i);
    seen[i] = 1;
    while (stack.length > 0) {
      const cur = stack.pop();
      size += 1;
      const x = cur % RES;
      const y = (cur - x) / RES;
      [
        [x - 1, y],
        [x + 1, y],
        [x, y - 1],
        [x, y + 1]
      ].forEach(([nx, ny]) => {
        if (nx < 0 || ny < 0 || nx >= RES || ny >= RES) return;
        const ni = ny * RES + nx;
        if (mask[ni] === 1 && seen[ni] === 0) {
          seen[ni] = 1;
          stack.push(ni);
        }
      });
    }
    if (size < 30) components -= 1; // 尖角上的 1~2 像素噪点不算碎片
  }
  return components;
};

/** 掩膜 → 归一化多边形（顺时针/逆时针不重要，射线法不挑方向） */
const outlineOf = (shape) => {
  const raw = traceContour(buildMask(shape)).map(([x, y]) => [(x + 0.5) / RES, (y + 0.5) / RES]);
  if (raw.length === 0) throw new Error(`${shape.key} 没有描出轮廓`);
  let startIndex = 0;
  for (let i = 1; i < raw.length; i += 1) {
    if (raw[i][1] < raw[startIndex][1] || (raw[i][1] === raw[startIndex][1] && raw[i][0] < raw[startIndex][0])) {
      startIndex = i;
    }
  }
  const ordered = raw.slice(startIndex).concat(raw.slice(0, startIndex));
  const shaped = chaikin(ordered, SMOOTH_PASSES);
  shaped.push(shaped[0]);
  const simplified = simplify(shaped, SIMPLIFY_TOL);
  simplified.pop();
  return simplified.map(([x, y]) => [Math.round(x * 1000) / 1000, Math.round(y * 1000) / 1000]);
};

// ======================================================================
// 12 个不规则图案
// ----------------------------------------------------------------------
// 12 个不规则图案
// 统一约束：单连通、够「胖」（任何零件宽度 ≥ 0.1），因为 8×8 时要在这个轮廓里塞
// 64 格，太细的尖角/枝杈会切出放不下数字的碎片格。
// 造型语言：放射花瓣、星芒、云朵、水滴一类「几何 + 有机」的团块，
// 拼的是图案感，不追求具象（早期版本是生肖，识别成本高且画不准）。
// ----------------------------------------------------------------------
const TAU = Math.PI * 2;
const polar = (r, a, cx = 0.5, cy = 0.5) => [cx + r * Math.cos(a), cy + r * Math.sin(a)];

/** 放射状排布的一圈圆（花瓣 / 扇贝边缘） */
const ring = (count, radius, size, phase = -Math.PI / 2) =>
  Array.from({ length: count }, (_, i) => {
    const [x, y] = polar(radius, phase + (i * TAU) / count);
    return C(x, y, size);
  });

/** 星芒：count 个三角，顶点在外圈、底边压在内圈（底边压在中心块里才连得上） */
const spikes = (count, inner, outer, baseHalf, phase = -Math.PI / 2) =>
  Array.from({ length: count }, (_, i) => {
    const a = phase + (i * TAU) / count;
    const apex = polar(outer, a);
    const b1 = polar(inner, a - baseHalf);
    const b2 = polar(inner, a + baseHalf);
    return P(apex, b1, b2);
  });

const DESIGNS = [
  {
    key: 'flower',
    name: '五瓣花',
    parts: [...ring(5, 0.27, 0.15), C(0.5, 0.5, 0.18)]
  },
  {
    key: 'cloud',
    name: '云朵',
    parts: [
      C(0.24, 0.56, 0.15),
      C(0.4, 0.44, 0.19),
      C(0.6, 0.47, 0.17),
      C(0.77, 0.57, 0.13),
      K(0.22, 0.72, 0.78, 0.72, 0.11)
    ]
  },
  {
    key: 'drop',
    name: '水滴',
    parts: [P([0.5, 0.05], [0.75, 0.53], [0.25, 0.53]), C(0.5, 0.63, 0.27)]
  },
  {
    key: 'heart',
    name: '心形',
    parts: [C(0.31, 0.33, 0.19), C(0.69, 0.33, 0.19), P([0.12, 0.4], [0.88, 0.4], [0.5, 0.88])]
  },
  {
    key: 'leaf',
    name: '叶片',
    parts: [
      K(0.32, 0.76, 0.48, 0.54, 0.16),
      K(0.48, 0.54, 0.63, 0.34, 0.13),
      K(0.63, 0.34, 0.72, 0.18, 0.085)
    ]
  },
  {
    key: 'star6',
    name: '六角星',
    parts: [...spikes(6, 0.24, 0.43, 0.52), C(0.5, 0.5, 0.26)]
  },
  {
    key: 'gear',
    name: '齿轮',
    parts: [
      C(0.5, 0.5, 0.29),
      ...Array.from({ length: 8 }, (_, i) => {
        const a = (i * TAU) / 8;
        const [x1, y1] = polar(0.24, a);
        const [x2, y2] = polar(0.43, a);
        return K(x1, y1, x2, y2, 0.075);
      })
    ]
  },
  {
    key: 'shell',
    name: '贝壳',
    parts: [
      C(0.5, 0.5, 0.3),
      ...[0.45, 0.85, 1.57, 2.29, 2.69].map((a) => {
        const [x, y] = polar(0.3, a);
        return C(x, y, 0.1);
      })
    ]
  },
  {
    key: 'gourd',
    name: '葫芦',
    parts: [C(0.5, 0.68, 0.26), C(0.5, 0.33, 0.17), K(0.5, 0.2, 0.57, 0.09, 0.05)]
  },
  {
    key: 'flower8',
    name: '八角花',
    parts: [...ring(8, 0.28, 0.13), C(0.5, 0.5, 0.17)]
  },
  {
    key: 'clover',
    name: '十字花',
    parts: [C(0.5, 0.5, 0.19), C(0.5, 0.28, 0.17), C(0.5, 0.72, 0.17), C(0.28, 0.5, 0.17), C(0.72, 0.5, 0.17)]
  },
  {
    key: 'star4',
    name: '四角星',
    parts: [...spikes(4, 0.24, 0.45, 0.62, -Math.PI / 2), C(0.5, 0.5, 0.27)]
  }
];

// ---------------- 输出 ----------------
/**
 * 出场顺序（不是定义顺序）：关卡尺寸是 3×3→8×8 循环两轮，图案按数组下标依次取，
 * 所以下标 0/6 永远配 3×3、5/11 永远配 8×8。排序的两条约束：
 *   ① 小尺寸（3×3/4×4）只有 9~16 格，格子又大，细节全被格线吃掉 —— 必须用「整体性强的简单轮廓」
 *      （水滴、四角星、心形、葫芦），否则像齿轮这种带细齿的会变成一团多边形；
 *   ② 大尺寸（7×7/8×8）格子小，要选分格最松的（五瓣花 8×8 最小格 30rpx、云朵 28rpx），
 *      免得出现放不下数字的碎格。
 * 改顺序只改这个数组，DESIGNS 里各图案的定义不用动。
 */
const ORDER = [
  'drop', //   0 → 3×3
  'heart', //  1 → 4×4
  'leaf', //   2 → 5×5
  'star6', //  3 → 6×6
  'gear', //   4 → 7×7
  'flower', // 5 → 8×8
  'star4', //  6 → 3×3
  'gourd', //  7 → 4×4
  'shell', //  8 → 5×5
  'flower8', // 9 → 6×6
  'clover', // 10 → 7×7
  'cloud' //  11 → 8×8
];

const names = process.argv.slice(2);
const showAscii = process.env.ASCII === '1';
const shouldWrite = process.env.WRITE === '1';

const ordered = ORDER.map((key) => {
  const design = DESIGNS.find((item) => item.key === key);
  if (design === undefined) {
    throw new Error(`[Pattern] ORDER 里的 ${key} 在 DESIGNS 中不存在`);
  }
  return design;
});
if (ordered.length !== DESIGNS.length) {
  throw new Error(`[Pattern] ORDER 有 ${ordered.length} 项，DESIGNS 有 ${DESIGNS.length} 项，必须一一对应`);
}

const picked = names.length > 0 ? ordered.filter((d) => names.includes(d.key)) : ordered;
const result = [];

picked.forEach((design) => {
  const components = countComponents(buildMask(design));
  const polygon = outlineOf(design);
  result.push({ key: design.key, name: design.name, polygon });
  console.log(`${design.key}(${design.name}) 顶点 ${polygon.length}${components > 1 ? `  ⚠️ ${components} 个连通块` : ''}`);
  if (showAscii) {
    const lines = [];
    for (let y = 0; y < ASCII_RES; y += 1) {
      let line = '';
      for (let x = 0; x < ASCII_RES; x += 1) {
        const px = (x + 0.5) / ASCII_RES;
        const py = (y + 0.5) / ASCII_RES;
        line += insidePrimitive({ t: 'p', pts: polygon }, px, py) ? '#' : '.';
      }
      lines.push(line);
    }
    console.log(lines.join('\n'));
  }
});

if (shouldWrite) {
  const file = path.join(__dirname, '../src/data/patternShapes.json');
  // 手写序列化：多边形点对压成一行，JSON.stringify 的逐行展开没法看
  const body = result
    .map(
      (shape) =>
        `  {\n    "key": "${shape.key}",\n    "name": "${shape.name}",\n    "polygon": [${shape.polygon
          .map(([x, y]) => `[${x}, ${y}]`)
          .join(', ')}]\n  }`
    )
    .join(',\n');
  fs.writeFileSync(file, `[\n${body}\n]\n`, 'utf8');
  console.log(`\n已写入 ${file}`);
}
