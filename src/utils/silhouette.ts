import rawShapes from '@/data/patternShapes.json';

/**
 * 卡片图案的轮廓由**一条多边形**描述（归一化 0..1 坐标）。
 * 多边形由 `scripts/gen-pattern-shapes.js` 用「圆 / 椭圆 / 胶囊 / 三角」拼出来再烘成轮廓：
 * 手写坐标很难画出饱满的图案，而运行时只需要「点在不在形状内」，
 * 烘成多边形后射线法一次判定即可，比「图元并集」还快。
 */
export type ShapePoint = [number, number];

export interface PatternShape {
  key: string;
  name: string;
  polygon: ShapePoint[];
}

export const PATTERN_SHAPES: PatternShape[] = rawShapes as PatternShape[];

/** 整卡轮廓的采样分辨率：越高越贴合，但生成的 polygon 点数也越多 */
const TRACE_RESOLUTION = 72;
/** Chaikin 平滑次数，让折线轮廓变圆润 */
const SMOOTH_PASSES = 2;
/** 整卡轮廓的 Douglas-Peucker 容差（归一化单位） */
const SIMPLIFY_TOLERANCE = 0.012;
/** 格位划分分辨率：每格约 12 像素见方，够描出干净的直边 */
const DIVIDE_RESOLUTION = 96;
/** Lloyd 松弛用的分辨率与迭代次数（把格心挪到各自单元的形心，消除大小格） */
const RELAX_RESOLUTION = 72;
const RELAX_ITERATIONS = 3;
/**
 * 单格轮廓的简化容差系数：容差 = 系数 ÷ 边长，格子越小容差越小。
 * 相邻两格共享同一条 Voronoi 边，简化容差一大就会变成两条不一样的折线，
 * 画线时同一条边会被描成两条错开的线，看起来就「每格各有一圈边」。
 * 压到 0.018（8×8 容差 ≈1.5rpx）后两格基本重合。
 */
const CELL_SIMPLIFY_FACTOR = 0.018;
/**
 * 格线宽度，单位是 SVG viewBox（100 = 整张卡宽）。
 * 0.36 ≈ 2.5rpx ≈ 1.2px —— 这是「一条线」的宽度，不是「一块缝」。
 * 线现在由 SVG 统一描边（见 buildPatternInkSvg），所以宽度绝对均匀：
 * 早先用「每格内缩露底色」时，缝宽随格子瘦长程度在 3~20rpx 之间乱跳，
 * 一张 8×8 上有的边像发丝、有的像粗框，那就是「一堆小卡片」的来源。
 */
const PATTERN_LINE_WIDTH = 0.36;
/**
 * 图案外轮廓描边宽度：明显粗于格线（0.36 → 0.85，约 2.3 倍）。
 * 真机上试过 0.55，外轮廓和内部网格几乎同粗，图案的边界就读不出来了 ——
 * 图案卡要成立，眼睛必须先看到「这是一个什么形状」，再看到里面的线。
 */
const PATTERN_OUTLINE_WIDTH = 0.85;
/**
 * 图案面与线色（必须与 theme.scss 的 $paper-1 / $color-pattern-line 一致）。
 * SVG 是 data URI，拿不到 CSS 变量，只能在这里同步一份 —— 改配色时两处一起改。
 */
const PATTERN_FACE_COLOR = '#fffdf8';
const PATTERN_LINE_COLOR = '#cfbc9e';
/** 格心离轮廓的最小距离（归一化）：比这更细的地方（角、尾巴尖）不放格心 */
const SEED_CLEARANCE = 0.042;
/** 候选点相对格数的富余倍数：最远点采样要有足够的点才铺得开 */
const CORE_HEADROOM = 1.8;

const round = (value: number): number => Math.round(value * 100) / 100;

/** 点是否落在多边形内（射线法，不挑顶点方向） */
const isInsidePolygon = (polygon: ShapePoint[], x: number, y: number): boolean => {
  let inside = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i, i += 1) {
    const [xi, yi] = polygon[i];
    const [xj, yj] = polygon[j];
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) {
      inside = !inside;
    }
  }
  return inside;
};

/** 点是否落在形状内 */
export const isInsideShape = (shape: PatternShape, x: number, y: number): boolean =>
  isInsidePolygon(shape.polygon, x, y);

type PixelPredicate = (x: number, y: number) => boolean;

/** Moore 邻域轮廓追踪：沿区域边界走一圈，得到边界的像素坐标序列 */
const traceContour = (isFilled: PixelPredicate, resolution: number): Array<[number, number]> => {
  const at = (x: number, y: number): boolean =>
    x >= 0 && y >= 0 && x < resolution && y < resolution && isFilled(x, y);

  let start: [number, number] | null = null;
  for (let y = 0; y < resolution && start === null; y += 1) {
    for (let x = 0; x < resolution; x += 1) {
      if (at(x, y)) {
        start = [x, y];
        break;
      }
    }
  }
  if (start === null) {
    return [];
  }

  const directions: Array<[number, number]> = [
    [1, 0],
    [1, 1],
    [0, 1],
    [-1, 1],
    [-1, 0],
    [-1, -1],
    [0, -1],
    [1, -1]
  ];
  const contour: Array<[number, number]> = [start];
  let currentX = start[0];
  let currentY = start[1];
  let direction = 0;
  const maxSteps = resolution * resolution * 8;

  for (let step = 0; step < maxSteps; step += 1) {
    let moved = false;
    for (let k = 0; k < 8; k += 1) {
      const next = (direction + 6 + k) % 8;
      const nx = currentX + directions[next][0];
      const ny = currentY + directions[next][1];
      if (at(nx, ny)) {
        contour.push([nx, ny]);
        currentX = nx;
        currentY = ny;
        direction = next;
        moved = true;
        break;
      }
    }
    if (!moved) {
      break;
    }
    if (currentX === start[0] && currentY === start[1] && contour.length > 4) {
      break;
    }
  }
  return contour;
};

/** Chaikin 平滑：把折线的直角抹圆 */
const smooth = (points: Array<[number, number]>, passes: number): Array<[number, number]> => {
  let current = points;
  for (let i = 0; i < passes; i += 1) {
    const next: Array<[number, number]> = [];
    for (let j = 0; j < current.length; j += 1) {
      const from = current[j];
      const to = current[(j + 1) % current.length];
      next.push([from[0] * 0.75 + to[0] * 0.25, from[1] * 0.75 + to[1] * 0.25]);
      next.push([from[0] * 0.25 + to[0] * 0.75, from[1] * 0.25 + to[1] * 0.75]);
    }
    current = next;
  }
  return current;
};

/** Chaikin 平滑（开放折线版：两端点保持不动，不会被抹短） */
const smoothOpen = (points: Array<[number, number]>, passes: number): Array<[number, number]> => {
  let current = points;
  for (let pass = 0; pass < passes; pass += 1) {
    if (current.length < 3) {
      return current;
    }
    const next: Array<[number, number]> = [current[0]];
    for (let i = 0; i < current.length - 1; i += 1) {
      const from = current[i];
      const to = current[i + 1];
      next.push([from[0] * 0.75 + to[0] * 0.25, from[1] * 0.75 + to[1] * 0.25]);
      next.push([from[0] * 0.25 + to[0] * 0.75, from[1] * 0.25 + to[1] * 0.75]);
    }
    next.push(current[current.length - 1]);
    current = next;
  }
  return current;
};

const distanceToLine = (point: [number, number], from: [number, number], to: [number, number]): number => {
  const dx = to[0] - from[0];
  const dy = to[1] - from[1];
  const length = Math.hypot(dx, dy);
  if (length === 0) {
    return Math.hypot(point[0] - from[0], point[1] - from[1]);
  }
  return Math.abs(dy * point[0] - dx * point[1] + to[0] * from[1] - to[1] * from[0]) / length;
};

/** Douglas-Peucker 简化：在误差容差内把点数压下来，锯齿边会被拉成直线 */
const simplify = (points: Array<[number, number]>, tolerance: number): Array<[number, number]> => {
  if (points.length < 4) {
    return points;
  }
  const keep = new Array<boolean>(points.length).fill(false);
  keep[0] = true;
  keep[points.length - 1] = true;
  const stack: Array<[number, number]> = [[0, points.length - 1]];
  while (stack.length > 0) {
    const [from, to] = stack.pop() as [number, number];
    let maxDistance = -1;
    let pivot = -1;
    for (let i = from + 1; i < to; i += 1) {
      const distance = distanceToLine(points[i], points[from], points[to]);
      if (distance > maxDistance) {
        maxDistance = distance;
        pivot = i;
      }
    }
    if (maxDistance > tolerance && pivot > 0) {
      keep[pivot] = true;
      stack.push([from, pivot], [pivot, to]);
    }
  }
  return points.filter((_, index) => keep[index]);
};

/**
 * 追踪一块像素区域的边界 → 平滑 → 简化，得到归一化坐标的闭环多边形。
 * 注意起点只能「旋转」不能「排序」：排序会打乱边界的先后顺序，平滑结果就成了乱线。
 */
const buildOutline = (
  isFilled: PixelPredicate,
  resolution: number,
  tolerance: number,
  smoothPasses: number
): Array<[number, number]> => {
  const raw = traceContour(isFilled, resolution).map<[number, number]>(([x, y]) => [
    (x + 0.5) / resolution,
    (y + 0.5) / resolution
  ]);
  if (raw.length === 0) {
    return [];
  }
  let startIndex = 0;
  for (let i = 1; i < raw.length; i += 1) {
    const isHigher = raw[i][1] < raw[startIndex][1];
    const isSameRowFurtherLeft = raw[i][1] === raw[startIndex][1] && raw[i][0] < raw[startIndex][0];
    if (isHigher || isSameRowFurtherLeft) {
      startIndex = i;
    }
  }
  const ordered = raw.slice(startIndex).concat(raw.slice(0, startIndex));
  const shaped = smoothPasses > 0 ? smooth(ordered, smoothPasses) : ordered.slice();
  shaped.push(shaped[0]);
  const simplified = simplify(shaped, tolerance);
  simplified.pop();
  return simplified;
};

const outlineCache = new Map<string, Array<[number, number]>>();

/** 计算形状的缩放参数：找到边界框，计算居中并放大到 90% 的变换 */
const getShapeScaleTransform = (outline: Array<[number, number]>) => {
  let minX = 1, minY = 1, maxX = 0, maxY = 0;
  outline.forEach(([x, y]) => {
    if (x < minX) minX = x;
    if (y < minY) minY = y;
    if (x > maxX) maxX = x;
    if (y > maxY) maxY = y;
  });

  const width = maxX - minX;
  const height = maxY - minY;
  const centerX = (minX + maxX) / 2;
  const centerY = (minY + maxY) / 2;

  // 目标尺寸：填充 90% 的空间
  const targetSize = 0.9;
  const scale = Math.min(targetSize / width, targetSize / height);

  return { centerX, centerY, scale };
};

/** 应用缩放变换到坐标 */
const applyScaleTransform = (
  x: number,
  y: number,
  centerX: number,
  centerY: number,
  scale: number
): [number, number] => [0.5 + (x - centerX) * scale, 0.5 + (y - centerY) * scale];

/** 形状的外轮廓（归一化 0..1 坐标）。同一个形状只计算一次 */
const getShapeOutline = (shape: PatternShape): Array<[number, number]> => {
  const cached = outlineCache.get(shape.key);
  if (cached) {
    return cached;
  }
  const outline = buildOutline(
    (x, y) => isInsideShape(shape, (x + 0.5) / TRACE_RESOLUTION, (y + 0.5) / TRACE_RESOLUTION),
    TRACE_RESOLUTION,
    SIMPLIFY_TOLERANCE,
    SMOOTH_PASSES
  );
  // 描不出轮廓说明椭圆并集为空，属于数据错误，直接抛出让问题暴露
  if (outline.length < 3) {
    throw new Error(`[Silhouette] 形状 ${shape.key} 未追踪到有效轮廓，请检查椭圆并集`);
  }

  // 缩放轮廓以填充更多空间
  const { centerX, centerY, scale } = getShapeScaleTransform(outline);
  const scaledOutline = outline.map<[number, number]>(([x, y]) =>
    applyScaleTransform(x, y, centerX, centerY, scale)
  );

  outlineCache.set(shape.key, scaledOutline);
  return scaledOutline;
};

/** 轮廓 → CSS clip-path 的 polygon（百分比坐标） */
const toClipPolygon = (outline: Array<[number, number]>): string =>
  `polygon(${outline.map(([x, y]) => `${round(x * 100)}% ${round(y * 100)}%`).join(', ')})`;

/** 多边形面积（用于取形心与判断退化） */
const polygonArea = (points: Array<[number, number]>): number => {
  let sum = 0;
  for (let i = 0; i < points.length; i += 1) {
    const [x1, y1] = points[i];
    const [x2, y2] = points[(i + 1) % points.length];
    sum += x1 * y2 - x2 * y1;
  }
  return Math.abs(sum) / 2;
};


/** 每个像素归属哪一格；-1 表示不在形状内 */
const labelPixels = (shape: PatternShape, seeds: Array<[number, number]>, resolution: number): Int16Array => {
  const labels = new Int16Array(resolution * resolution).fill(-1);
  const queue = new Int32Array(resolution * resolution);
  const insidePixel = (x: number, y: number): boolean =>
    isInsideShape(shape, (x + 0.5) / resolution, (y + 0.5) / resolution);
  let tail = 0;

  // 起点：格心可能落在轮廓外或与别的格心撞到同一像素，就近找一个空白的轮廓内像素
  const landingOffsets: Array<[number, number]> = [
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
  seeds.forEach(([seedX, seedY], index) => {
    const baseX = Math.min(resolution - 1, Math.max(0, Math.floor(seedX * resolution)));
    const baseY = Math.min(resolution - 1, Math.max(0, Math.floor(seedY * resolution)));
    let placed = -1;
    for (let radius = 0; radius <= 8 && placed < 0; radius += 1) {
      for (const [dx, dy] of landingOffsets) {
        const x = baseX + dx * radius;
        const y = baseY + dy * radius;
        if (x < 0 || y < 0 || x >= resolution || y >= resolution) {
          continue;
        }
        const pixel = y * resolution + x;
        if (labels[pixel] !== -1 || !insidePixel(x, y)) {
          continue;
        }
        placed = pixel;
        break;
      }
    }
    if (placed < 0) {
      throw new Error(`[Silhouette] 形状 ${shape.key} 的第 ${index} 个格心找不到落点`);
    }
    labels[placed] = index;
    queue[tail] = placed;
    tail += 1;
  });

  // 多源 BFS：每格从自己的格心向外生长，天然保证每格是完整的一块
  const steps: Array<[number, number]> = [
    [1, 0],
    [-1, 0],
    [0, 1],
    [0, -1]
  ];
  let head = 0;
  while (head < tail) {
    const current = queue[head];
    head += 1;
    const label = labels[current];
    const px = current % resolution;
    const py = (current - px) / resolution;
    for (const [dx, dy] of steps) {
      const x = px + dx;
      const y = py + dy;
      if (x < 0 || y < 0 || x >= resolution || y >= resolution) {
        continue;
      }
      const pixel = y * resolution + x;
      if (labels[pixel] !== -1 || !insidePixel(x, y)) {
        continue;
      }
      labels[pixel] = label;
      queue[tail] = pixel;
      tail += 1;
    }
  }
  return labels;
};

/**
 * 轮廓内的候选点，附带「离轮廓有多远」（距离场）。
 * 分辨率随格数提高，格心才铺得开。
 */
interface CandidateField {
  points: Array<[number, number]>;
  /** 与 points 一一对应：该点到轮廓的距离（归一化单位） */
  clearance: number[];
}

const buildCandidateField = (shape: PatternShape, size: number): CandidateField => {
  const resolution = Math.max(24, size * 10);
  const total = resolution * resolution;
  const inside = new Uint8Array(total);
  for (let iy = 0; iy < resolution; iy += 1) {
    for (let ix = 0; ix < resolution; ix += 1) {
      if (isInsideShape(shape, (ix + 0.5) / resolution, (iy + 0.5) / resolution)) {
        inside[iy * resolution + ix] = 1;
      }
    }
  }

  // 距离场：从轮廓外的像素出发做多源 BFS，往轮廓内蔓延，得到每个内点到轮廓的近似距离
  const distance = new Float32Array(total).fill(Number.POSITIVE_INFINITY);
  // 用普通数组而不是定长 TypedArray：同一个像素可能因为距离被刷新而多次入队，
  // 定长数组会静默丢弃越界写入，导致队列下标与内容错位（死循环）
  const queue: number[] = [];
  for (let pixel = 0; pixel < total; pixel += 1) {
    if (inside[pixel] === 0) {
      distance[pixel] = 0;
      queue.push(pixel);
    }
  }
  const step = 1 / resolution;
  const neighbours: Array<[number, number]> = [
    [1, 0],
    [-1, 0],
    [0, 1],
    [0, -1]
  ];
  let head = 0;
  while (head < queue.length) {
    const current = queue[head];
    head += 1;
    const px = current % resolution;
    const py = (current - px) / resolution;
    for (const [dx, dy] of neighbours) {
      const x = px + dx;
      const y = py + dy;
      if (x < 0 || y < 0 || x >= resolution || y >= resolution) {
        continue;
      }
      const next = y * resolution + x;
      if (distance[next] <= distance[current] + step) {
        continue;
      }
      distance[next] = distance[current] + step;
      queue.push(next);
    }
  }

  const points: Array<[number, number]> = [];
  const clearance: number[] = [];
  for (let pixel = 0; pixel < total; pixel += 1) {
    if (inside[pixel] !== 1) {
      continue;
    }
    const px = pixel % resolution;
    const py = (pixel - px) / resolution;
    points.push([(px + 0.5) / resolution, (py + 0.5) / resolution]);
    clearance.push(distance[pixel]);
  }
  return { points, clearance };
};

/**
 * 挑「厚处」候选点：离轮廓太近的地方（耳朵、角、尾巴尖）不放格心，
 * 否则会切出放不下数字的碎片格。形状本身太细、富余不够时逐级放宽。
 */
const pickCoreCandidates = (field: CandidateField, total: number): Array<[number, number]> => {
  const levels = [SEED_CLEARANCE, SEED_CLEARANCE * 0.72, SEED_CLEARANCE * 0.5, SEED_CLEARANCE * 0.3];
  for (const level of levels) {
    const core = field.points.filter((_, index) => field.clearance[index] >= level);
    if (core.length >= total * CORE_HEADROOM) {
      return core;
    }
  }
  return field.points;
};

/** 最远点采样：从形心出发，每次挑距离已选集合最远的候选点，铺出一批均匀的格心 */
const pickSeeds = (candidates: Array<[number, number]>, total: number): Array<[number, number]> => {
  const centerX = candidates.reduce((sum, [x]) => sum + x, 0) / candidates.length;
  const centerY = candidates.reduce((sum, [, y]) => sum + y, 0) / candidates.length;
  let seedIndex = 0;
  let seedDistance = Number.POSITIVE_INFINITY;
  candidates.forEach(([x, y], index) => {
    const distance = (x - centerX) ** 2 + (y - centerY) ** 2;
    if (distance < seedDistance) {
      seedDistance = distance;
      seedIndex = index;
    }
  });

  const seeds: Array<[number, number]> = [candidates[seedIndex]];
  const nearest = candidates.map(([x, y]) => {
    const [sx, sy] = candidates[seedIndex];
    return (x - sx) ** 2 + (y - sy) ** 2;
  });
  nearest[seedIndex] = -1;

  while (seeds.length < total) {
    let bestIndex = -1;
    let bestDistance = -1;
    for (let i = 0; i < candidates.length; i += 1) {
      if (nearest[i] > bestDistance) {
        bestDistance = nearest[i];
        bestIndex = i;
      }
    }
    if (bestIndex < 0) {
      throw new Error('[Silhouette] 格心采样失败：候选点不足');
    }
    const [px, py] = candidates[bestIndex];
    seeds.push([px, py]);
    nearest[bestIndex] = -1;
    candidates.forEach(([x, y], i) => {
      if (nearest[i] < 0) {
        return;
      }
      const distance = (x - px) ** 2 + (y - py) ** 2;
      if (distance < nearest[i]) {
        nearest[i] = distance;
      }
    });
  }
  return seeds;
};

/** Lloyd 松弛：把格心挪到自己那块的形心，再投影回轮廓内的候选点，消除大小格 */
const relaxSeeds = (
  shape: PatternShape,
  seeds: Array<[number, number]>,
  candidates: Array<[number, number]>
): Array<[number, number]> => {
  let current = seeds.map((point) => point.slice() as [number, number]);
  for (let iteration = 0; iteration < RELAX_ITERATIONS; iteration += 1) {
    const labels = labelPixels(shape, current, RELAX_RESOLUTION);
    const sumX = new Float64Array(current.length);
    const sumY = new Float64Array(current.length);
    const count = new Int32Array(current.length);
    for (let pixel = 0; pixel < RELAX_RESOLUTION * RELAX_RESOLUTION; pixel += 1) {
      const label = labels[pixel];
      if (label < 0) {
        continue;
      }
      const px = pixel % RELAX_RESOLUTION;
      const py = (pixel - px) / RELAX_RESOLUTION;
      sumX[label] += (px + 0.5) / RELAX_RESOLUTION;
      sumY[label] += (py + 0.5) / RELAX_RESOLUTION;
      count[label] += 1;
    }
    current = current.map((point, index) => {
      if (count[index] === 0) {
        return point;
      }
      const targetX = sumX[index] / count[index];
      const targetY = sumY[index] / count[index];
      let bestPoint = point;
      let bestDistance = Number.POSITIVE_INFINITY;
      candidates.forEach(([x, y]) => {
        const distance = (x - targetX) ** 2 + (y - targetY) ** 2;
        if (distance < bestDistance) {
          bestDistance = distance;
          bestPoint = [x, y];
        }
      });
      return bestPoint;
    });
  }
  return current;
};

/** 像素阶梯 → 拉直时的容差（像素单位，分辨率 96 下 0.9 约等于 6rpx） */
const SEAM_SIMPLIFY_TOLERANCE = 0.9;

/**
 * 从像素标签里提取**唯一的**内部格线折线（坐标是像素格点 0..resolution）。
 *
 * 为什么不能「按格子多边形各画一遍」：相邻两格共享同一条边，但两格各自独立做过简化，
 * 同一条边会被描成两条错开的线 —— 视觉上就是「每格各有一圈边框」，也就是「一堆小卡片」。
 * 这里直接读像素归属：每条内部边只属于一对相邻格，遍历时天然只出现一次，
 * 于是每条线只画一次，宽度完全交给 stroke-width。
 */
const buildSeamPolylines = (
  labels: Int16Array,
  resolution: number
): Array<Array<[number, number]>> => {
  const edgeEnds = new Map<string, [[number, number], [number, number]]>();
  const addEdge = (x1: number, y1: number, x2: number, y2: number): void => {
    const a = `${x1},${y1}`;
    const b = `${x2},${y2}`;
    const key = a < b ? `${a}|${b}` : `${b}|${a}`;
    if (!edgeEnds.has(key)) {
      edgeEnds.set(key, [[x1, y1], [x2, y2]]);
    }
  };
  for (let y = 0; y < resolution; y += 1) {
    for (let x = 0; x < resolution; x += 1) {
      const label = labels[y * resolution + x];
      if (label < 0) {
        continue;
      }
      // 只收「两侧都在形状内」的边；外轮廓交给 getShapeOutline（那条线已经平滑过）
      const right = x + 1 < resolution ? labels[y * resolution + x + 1] : -1;
      if (right >= 0 && right !== label) {
        addEdge(x + 1, y, x + 1, y + 1);
      }
      const down = y + 1 < resolution ? labels[(y + 1) * resolution + x] : -1;
      if (down >= 0 && down !== label) {
        addEdge(x, y + 1, x + 1, y + 1);
      }
    }
  }

  const links = new Map<string, string[]>();
  const link = (a: string, b: string): void => {
    const list = links.get(a);
    if (list === undefined) {
      links.set(a, [b]);
    } else {
      list.push(b);
    }
  };
  for (const [, [a, b]] of edgeEnds) {
    const ka = `${a[0]},${a[1]}`;
    const kb = `${b[0]},${b[1]}`;
    link(ka, kb);
    link(kb, ka);
  }

  const edgeKey = (a: string, b: string): string => (a < b ? `${a}|${b}` : `${b}|${a}`);
  const parsePoint = (key: string): [number, number] => {
    const [px, py] = key.split(',');
    return [Number(px), Number(py)];
  };
  const used = new Set<string>();
  const walk = (start: string, first: string): Array<[number, number]> => {
    const points: Array<[number, number]> = [parsePoint(start)];
    let prev = start;
    let cur = first;
    while (!used.has(edgeKey(prev, cur))) {
      used.add(edgeKey(prev, cur));
      points.push(parsePoint(cur));
      const neighbors = links.get(cur) ?? [];
      // 走到分叉点（三格交汇）就断成一段，避免一个顶点被两条线重复描绘
      if (neighbors.length !== 2) {
        break;
      }
      const next = neighbors[0] === prev ? neighbors[1] : neighbors[0];
      if (next === undefined) {
        break;
      }
      prev = cur;
      cur = next;
    }
    return points;
  };

  const polylines: Array<Array<[number, number]>> = [];
  for (const [point, neighbors] of links) {
    if (neighbors.length === 2) {
      continue;
    }
    for (const next of neighbors) {
      if (!used.has(edgeKey(point, next))) {
        const line = walk(point, next);
        if (line.length >= 2) {
          polylines.push(line);
        }
      }
    }
  }
  // 剩下的是没有分叉的闭合环
  for (const [, [a]] of edgeEnds) {
    const start = `${a[0]},${a[1]}`;
    const next = (links.get(start) ?? []).find((item) => !used.has(edgeKey(start, item)));
    if (next !== undefined) {
      const line = walk(start, next);
      if (line.length >= 2) {
        polylines.push(line);
      }
    }
  }

  // 像素阶梯 → 拉直 → 抹圆
  return polylines
    .map((line) => simplify(line, SEAM_SIMPLIFY_TOLERANCE))
    .map((line) => smoothOpen(line, 1))
    .filter((line) => line.length >= 2);
};

const seamCache = new Map<string, Array<Array<[number, number]>>>();

export interface SilhouetteCell {
  /** 该格在整张卡片内的剪裁路径（百分比 polygon），用于点击命中 */
  clipPath: string;
  /** 数字中心相对整张卡片的位置（百分比） */
  labelX: number;
  labelY: number;
}

const cellCache = new Map<string, SilhouetteCell[]>();

/**
 * 在图案轮廓内部划分出 size² 个数字格：
 * 1. 只在轮廓的「厚处」铺格心（距离场过滤 + 最远点采样 + Lloyd 松弛），
 *    耳朵/尾巴/角这些细长突起不落格心 —— 否则会切出放不下数字的碎片格
 * 2. 用多源 BFS 让每格从自己的格心向外生长，细长突起由相邻格子长过去
 * 3. 每格向自己的形心内缩固定距离，缝隙露出卡片底色，成为格线与整卡轮廓描边
 */
export const buildSilhouetteCells = (shape: PatternShape, size: number): SilhouetteCell[] => {
  const cacheKey = `${shape.key}-${size}`;
  const cached = cellCache.get(cacheKey);
  if (cached) {
    return cached;
  }

  const total = size * size;
  const field = buildCandidateField(shape, size);
  // 轮廓内放不下这么多格属于数据不合法，直接抛出让问题暴露，不做静默降级
  if (field.points.length < total) {
    throw new Error(
      `[Silhouette] 形状 ${shape.key} 内部空间不足：需要 ${total} 格，仅采到 ${field.points.length} 个候选点`
    );
  }

  // 厚处候选：轮廓内部至少要有 2 倍格数的富余点，最远点采样才铺得开；
  // 细长形状（蛇、龙）不够就逐级放宽，最后退回全部候选点
  const core = pickCoreCandidates(field, total);
  const relaxed = relaxSeeds(shape, pickSeeds(core, total), core);
  const labels = labelPixels(shape, relaxed, DIVIDE_RESOLUTION);
  const tolerance = CELL_SIMPLIFY_FACTOR / size;

  // 每格的面积形心：用像素统计而不是「顶点平均」，细长突起不会把标签拽走
  const areaSumX = new Float64Array(total);
  const areaSumY = new Float64Array(total);
  const areaCount = new Int32Array(total);
  for (let pixel = 0; pixel < DIVIDE_RESOLUTION * DIVIDE_RESOLUTION; pixel += 1) {
    const label = labels[pixel];
    if (label < 0) {
      continue;
    }
    const px = pixel % DIVIDE_RESOLUTION;
    const py = (pixel - px) / DIVIDE_RESOLUTION;
    areaSumX[label] += (px + 0.5) / DIVIDE_RESOLUTION;
    areaSumY[label] += (py + 0.5) / DIVIDE_RESOLUTION;
    areaCount[label] += 1;
  }

  // 获取未缩放的轮廓以计算缩放参数
  const unscaledOutline = buildOutline(
    (x, y) => isInsideShape(shape, (x + 0.5) / TRACE_RESOLUTION, (y + 0.5) / TRACE_RESOLUTION),
    TRACE_RESOLUTION,
    SIMPLIFY_TOLERANCE,
    SMOOTH_PASSES
  );
  const { centerX: scaleCenterX, centerY: scaleCenterY, scale: baseScale } =
    getShapeScaleTransform(unscaledOutline);
  // 格子与轮廓用同一套缩放：图案不再靠「格子内缩露底色」画线，
  // 所以格子可以直接铺满轮廓，不需要额外的整体内缩
  const scaleFactor = baseScale;

  const cells = relaxed.map((seed, index) => {
    const outline = buildOutline(
      (x, y) =>
        x >= 0 &&
        y >= 0 &&
        x < DIVIDE_RESOLUTION &&
        y < DIVIDE_RESOLUTION &&
        labels[y * DIVIDE_RESOLUTION + x] === index,
      DIVIDE_RESOLUTION,
      tolerance,
      0
    );
    if (outline.length < 3 || polygonArea(outline) <= 0) {
      throw new Error(`[Silhouette] 形状 ${shape.key} 在 ${size}×${size} 下第 ${index} 格轮廓退化`);
    }
    // 形心优先取面积形心，退化时退回格心
    const cellCenterX = areaCount[index] > 0 ? areaSumX[index] / areaCount[index] : seed[0];
    const cellCenterY = areaCount[index] > 0 ? areaSumY[index] / areaCount[index] : seed[1];
    // 格子**不内缩**：线由 SVG 线条层统一描边（见 buildPatternInkSvg），
    // 相邻两格共享的那条边描出来是同一条线，宽度绝对均匀
    const scaledOutline = outline.map(([x, y]) =>
      applyScaleTransform(x, y, scaleCenterX, scaleCenterY, scaleFactor)
    );
    const [scaledLabelX, scaledLabelY] = applyScaleTransform(
      cellCenterX,
      cellCenterY,
      scaleCenterX,
      scaleCenterY,
      scaleFactor
    );
    // 形心可能落在凹形格子之外，那就退回格心，保证数字不出格
    const labelPoint: ShapePoint = isInsidePolygon(scaledOutline, scaledLabelX, scaledLabelY)
      ? [scaledLabelX, scaledLabelY]
      : applyScaleTransform(seed[0], seed[1], scaleCenterX, scaleCenterY, scaleFactor);
    return {
      clipPath: toClipPolygon(scaledOutline),
      labelX: round(labelPoint[0] * 100),
      labelY: round(labelPoint[1] * 100)
    };
  });

  cellCache.set(cacheKey, cells);
  // 线条层用的唯一分割线（每条内部边只出现一次），顺便按同一套缩放变换落到卡片坐标
  seamCache.set(
    cacheKey,
    buildSeamPolylines(labels, DIVIDE_RESOLUTION).map((line) =>
      line.map(([x, y]) =>
        applyScaleTransform(
          x / DIVIDE_RESOLUTION,
          y / DIVIDE_RESOLUTION,
          scaleCenterX,
          scaleCenterY,
          scaleFactor
        )
      )
    )
  );
  return cells;
};

/** 点集 → SVG path（viewBox 100×100，坐标保留一位小数：1 单位 ≈ 6.9rpx） */
const toPathData = (points: Array<[number, number]>, closed: boolean): string => {
  const command = points
    .map(([x, y]) => `${Math.round(x * 1000) / 10} ${Math.round(y * 1000) / 10}`)
    .join('L');
  return `M${command}${closed ? 'Z' : ''}`;
};

const BASE64_CHARS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';

/**
 * 纯 ASCII 字符串的 base64 编码。
 * 不用 btoa：小程序端没有这个全局函数，而 SVG 内容全是 ASCII，自己编更省事也更稳。
 */
const toBase64 = (input: string): string => {
  let output = '';
  for (let i = 0; i < input.length; i += 3) {
    const c1 = input.charCodeAt(i);
    const c2 = i + 1 < input.length ? input.charCodeAt(i + 1) : Number.NaN;
    const c3 = i + 2 < input.length ? input.charCodeAt(i + 2) : Number.NaN;
    const triple = (c1 << 16) | ((Number.isNaN(c2) ? 0 : c2) << 8) | (Number.isNaN(c3) ? 0 : c3);
    output += BASE64_CHARS[(triple >> 18) & 63];
    output += BASE64_CHARS[(triple >> 12) & 63];
    output += Number.isNaN(c2) ? '=' : BASE64_CHARS[(triple >> 6) & 63];
    output += Number.isNaN(c3) ? '=' : BASE64_CHARS[triple & 63];
  }
  return output;
};

const inkCache = new Map<string, string>();

/**
 * 图案卡的「线条层」：一张 data URI 的 SVG，同时画图案面、外轮廓和所有格线。
 *
 * 为什么不用「每格内缩、缝隙露底色」画线：
 * 那样每条线都是**某一格的边框**，两格各让一半，缝宽受格子形状影响，
 * 而且格子本身是一块有底色的小多边形 —— 无论缝多细，看起来都是「一堆小卡片」。
 * 换成独立线条层后，线只被描一次、宽度由 stroke-width 统一控制，
 * 相邻两格共享的边就是同一条线；格子退化成完全透明的点击热区，
 * 图案于是成为「一整块面 + 一组线 + 数字」。
 */
export const buildPatternInk = (shape: PatternShape, size: number): string => {
  const cacheKey = `${shape.key}-${size}`;
  const cached = inkCache.get(cacheKey);
  if (cached) {
    return cached;
  }
  // 先跑一次格子划分，把 seamCache 填上
  buildSilhouetteCells(shape, size);
  const seams = seamCache.get(cacheKey) ?? [];
  const outline = getShapeOutline(shape);
  // 分割线是开放折线，不能加 Z（加了会凭空连出一条首尾线）
  const seamPaths = seams.map((line) => toPathData(line, false)).join('');
  const svg =
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100" preserveAspectRatio="none">' +
    `<path d="${toPathData(outline, true)}" fill="${PATTERN_FACE_COLOR}" stroke="${PATTERN_LINE_COLOR}"` +
    ` stroke-width="${PATTERN_OUTLINE_WIDTH}" stroke-linejoin="round"/>` +
    `<path d="${seamPaths}" fill="none" stroke="${PATTERN_LINE_COLOR}" stroke-width="${PATTERN_LINE_WIDTH}"` +
    ' stroke-linejoin="round" stroke-linecap="round"/>' +
    '</svg>';
  const uri = `data:image/svg+xml;base64,${toBase64(svg)}`;
  inkCache.set(cacheKey, uri);
  return uri;
};
