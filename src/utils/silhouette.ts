import rawShapes from '@/data/zodiacShapes.json';

/** 形状由一个或多个椭圆并集描述（作者侧只调椭圆，轮廓自动生成） */
export interface ShapeEllipse {
  cx: number;
  cy: number;
  rx: number;
  ry: number;
}

export interface ZodiacShape {
  key: string;
  name: string;
  ellipses: ShapeEllipse[];
}

export const ZODIAC_SHAPES: ZodiacShape[] = rawShapes as ZodiacShape[];

/** 整卡轮廓的采样分辨率：越高越贴合，但生成的 polygon 点数也越多 */
const TRACE_RESOLUTION = 56;
/** Chaikin 平滑次数，让折线轮廓变圆润 */
const SMOOTH_PASSES = 2;
/** 整卡轮廓的 Douglas-Peucker 容差（归一化单位） */
const SIMPLIFY_TOLERANCE = 0.012;
/** 格位划分分辨率：每格约 12 像素见方，够描出干净的直边 */
const DIVIDE_RESOLUTION = 96;
/** Lloyd 松弛用的分辨率与迭代次数（把格心挪到各自单元的形心，消除大小格） */
const RELAX_RESOLUTION = 72;
const RELAX_ITERATIONS = 3;
/** 单格轮廓的简化容差系数：容差 = 系数 ÷ 边长，格子越小容差越小 */
const CELL_SIMPLIFY_FACTOR = 0.09;
/** 每格向形心收缩的比例系数：0 = 格子紧贴无缝隙；>0 时收缩量 = 系数 × 边长 */
const CELL_INSET_FACTOR = 0;

const round = (value: number): number => Math.round(value * 100) / 100;

/** 点是否落在形状内（椭圆并集） */
export const isInsideShape = (shape: ZodiacShape, x: number, y: number): boolean =>
  shape.ellipses.some((ellipse) => {
    const dx = (x - ellipse.cx) / ellipse.rx;
    const dy = (y - ellipse.cy) / ellipse.ry;
    return dx * dx + dy * dy <= 1;
  });

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
export const getShapeOutline = (shape: ZodiacShape): Array<[number, number]> => {
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
export const toClipPolygon = (outline: Array<[number, number]>): string =>
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
const labelPixels = (shape: ZodiacShape, seeds: Array<[number, number]>, resolution: number): Int16Array => {
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

/** 轮廓内的候选点：分辨率随格数提高，格心才铺得开 */
const buildCandidates = (shape: ZodiacShape, size: number): Array<[number, number]> => {
  const resolution = Math.max(24, size * 10);
  const points: Array<[number, number]> = [];
  for (let iy = 0; iy < resolution; iy += 1) {
    for (let ix = 0; ix < resolution; ix += 1) {
      const x = (ix + 0.5) / resolution;
      const y = (iy + 0.5) / resolution;
      if (isInsideShape(shape, x, y)) {
        points.push([x, y]);
      }
    }
  }
  return points;
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
  shape: ZodiacShape,
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

export interface SilhouetteCell {
  /** 该格在整张卡片内的剪裁路径（百分比 polygon） */
  clipPath: string;
  /** 数字中心相对整张卡片的位置（百分比） */
  labelX: number;
  labelY: number;
}

const cellCache = new Map<string, SilhouetteCell[]>();

/**
 * 在生肖轮廓内部划分出 size² 个数字格：
 * 1. 在轮廓内铺一批均匀的格心（最远点采样 + Lloyd 松弛）
 * 2. 用多源 BFS 让每格从自己的格心向外生长，得到紧贴拼合、互不重叠的格子
 * 3. 每格向自己的形心收缩一点，格子之间的缝隙露出卡片底色，形成线稿分割线
 */
export const buildSilhouetteCells = (shape: ZodiacShape, size: number): SilhouetteCell[] => {
  const cacheKey = `${shape.key}-${size}`;
  const cached = cellCache.get(cacheKey);
  if (cached) {
    return cached;
  }

  const total = size * size;
  const candidates = buildCandidates(shape, size);
  // 轮廓内放不下这么多格属于数据不合法，直接抛出让问题暴露，不做静默降级
  if (candidates.length < total) {
    throw new Error(
      `[Silhouette] 形状 ${shape.key} 内部空间不足：需要 ${total} 格，仅采到 ${candidates.length} 个候选点`
    );
  }

  const relaxed = relaxSeeds(shape, pickSeeds(candidates, total), candidates);
  const labels = labelPixels(shape, relaxed, DIVIDE_RESOLUTION);
  const tolerance = CELL_SIMPLIFY_FACTOR / size;
  const inset = CELL_INSET_FACTOR * size;

  // 获取未缩放的轮廓以计算缩放参数
  const unscaledOutline = buildOutline(
    (x, y) => isInsideShape(shape, (x + 0.5) / TRACE_RESOLUTION, (y + 0.5) / TRACE_RESOLUTION),
    TRACE_RESOLUTION,
    SIMPLIFY_TOLERANCE,
    SMOOTH_PASSES
  );
  const { centerX: scaleCenterX, centerY: scaleCenterY, scale: scaleFactor } =
    getShapeScaleTransform(unscaledOutline);

  const cells = relaxed.map((_, index) => {
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
    // 朝形心收缩：格子之间留出缝隙，卡片底色（墨色）从缝里透出来就是分割线
    const cellCenterX = outline.reduce((sum, [x]) => sum + x, 0) / outline.length;
    const cellCenterY = outline.reduce((sum, [, y]) => sum + y, 0) / outline.length;
    const shrunken = outline.map<[number, number]>(([x, y]) => [
      cellCenterX + (x - cellCenterX) * (1 - inset),
      cellCenterY + (y - cellCenterY) * (1 - inset)
    ]);
    // 应用缩放变换
    const scaledShrunken = shrunken.map(([x, y]) =>
      applyScaleTransform(x, y, scaleCenterX, scaleCenterY, scaleFactor)
    );
    const [scaledLabelX, scaledLabelY] = applyScaleTransform(
      cellCenterX,
      cellCenterY,
      scaleCenterX,
      scaleCenterY,
      scaleFactor
    );
    return {
      clipPath: toClipPolygon(scaledShrunken),
      labelX: round(scaledLabelX * 100),
      labelY: round(scaledLabelY * 100)
    };
  });

  cellCache.set(cacheKey, cells);
  return cells;
};
