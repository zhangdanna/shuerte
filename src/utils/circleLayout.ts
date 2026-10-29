/**
 * 圆形卡的分区几何（纯计算，不依赖 UI）。
 *
 * 整块圆盘按「半径分圈、角度分格」切分：第 k 圈切 2k-1 格，
 * 因为 1 + 3 + 5 + ... + (2n-1) = n²，正好容纳 size² 个数字。
 *
 * 每格是**带缝隙的圆角扇环**（annular sector）：
 *   - 径向：格子从 (k-1)/size 到 k/size，两头各留半条缝，圈与圈之间才看得出分界
 *   - 角向：每格的角度跨度两头各收一点，格与格之间才不粘连
 *   - 四角：沿弧线把半径在末端「回落」，做出圆角（polygon 画不了真圆角，用半径渐变逼近）
 * 早期版本是「从圆心出发的整块扇形」，格与格严丝合缝，整盘糊成一片只剩数字，故重写。
 */

export interface CircleCellGeometry {
  /** 喂给 CSS clip-path 的剪裁路径（坐标相对整张卡片） */
  clipPath: string;
  /** 数字中心相对卡片的百分比坐标 */
  labelX: number;
  labelY: number;
  /** 所在圈号（1 = 最内圈） */
  ring: number;
}

/** 卡片坐标系：0~100（相对圆形分区区域），圆心 (50, 50)，外半径 50 */
const CENTER = 50;
const MAX_RADIUS = 50;

const round = (value: number): number => Math.round(value * 100) / 100;

/** 缝隙宽度（百分比）：随圈厚自适应 —— 3×3 时圈厚 16.7 不必开太大，8×8 时圈厚 6.25 不能开太大 */
const gapOf = (size: number): number => {
  const ringWidth = MAX_RADIUS / size;
  return Math.min(1.5, Math.max(0.7, ringWidth * 0.19));
};

const toPoint = (radius: number, angle: number): string =>
  `${round(CENTER + radius * Math.cos(angle))}% ${round(CENTER + radius * Math.sin(angle))}%`;

/**
 * 一段带圆角的圆弧。`inset` 为 +1 时半径在两端「向内收」做圆角（内弧用），
 * 为 -1 时「向外收」（外弧用）。
 *
 * 采样按「圆角段固定 3 个点 + 中段按弧长等分」来分配：
 * 如果整体按弧长等分，半径小的内圈圆角会被一两个点抹平；
 * 如果按圆角密度等分，外圈又会为了几个圆角点画出几十个点（clip-path 会膨胀到几十 KB）。
 */
const arcPoints = (
  from: number,
  to: number,
  radius: number,
  inset: 1 | -1,
  corner: number
): string[] => {
  const span = Math.abs(to - from);
  const direction = Math.sign(to - from);
  // 圆角占用的角度：按弧长换算（半径越小，同样弧长对应的角度越大），最多吃掉 1/2.4 跨度
  const cornerAngle = Math.min(span / 2.4, corner / Math.max(radius, 1));
  const cornerSteps = 2;
  // 中段：每 6 个单位弧长一个点，至少 2 段
  const middleSpan = Math.max(0, span - cornerAngle * 2);
  const middleSteps = Math.max(2, Math.ceil((middleSpan * radius) / 6));

  const angles: number[] = [];
  for (let i = 0; i <= cornerSteps; i += 1) {
    angles.push(from + direction * cornerAngle * (i / cornerSteps));
  }
  const middleFrom = from + direction * cornerAngle;
  const middleTo = to - direction * cornerAngle;
  for (let i = 1; i <= middleSteps; i += 1) {
    angles.push(middleFrom + ((middleTo - middleFrom) * i) / middleSteps);
  }
  for (let i = 1; i <= cornerSteps; i += 1) {
    angles.push(to - direction * cornerAngle + direction * cornerAngle * (i / cornerSteps));
  }

  return angles.map((angle) => {
    const distanceToEnd = Math.min(Math.abs(angle - from), Math.abs(to - angle));
    const t = cornerAngle === 0 ? 1 : Math.min(1, distanceToEnd / cornerAngle);
    // smoothstep：端点处回落满一个圆角半径，中段恢复整半径
    const eased = t * t * (3 - 2 * t);
    return toPoint(radius + inset * corner * (1 - eased), angle);
  });
};

/** 圆心格：一整块小圆盘（采样点够多，天然是圆的） */
const buildCenterDisc = (radius: number): string => {
  const steps = 24;
  const points: string[] = [];
  for (let i = 0; i < steps; i += 1) {
    points.push(toPoint(radius, -Math.PI / 2 + (Math.PI * 2 * i) / steps));
  }
  return `polygon(${points.join(', ')})`;
};

/** 一圈扇环里的单格：外弧正着走、内弧倒着走，闭合成环带 */
const buildSector = (
  start: number,
  end: number,
  innerRadius: number,
  outerRadius: number,
  corner: number
): string => {
  const points = [
    ...arcPoints(start, end, outerRadius, -1, corner),
    ...arcPoints(end, start, innerRadius, 1, corner)
  ];
  return `polygon(${points.join(', ')})`;
};

/** 返回数组下标与数字序号一一对应（下标 0 = 圆心格） */
export const buildCircleCells = (size: number): CircleCellGeometry[] => {
  const cells: CircleCellGeometry[] = [];
  const gap = gapOf(size);
  const ringWidth = MAX_RADIUS / size;
  const corner = Math.min(gap * 0.8, ringWidth * 0.3);

  for (let ring = 1; ring <= size; ring += 1) {
    const count = ring * 2 - 1;
    const outerRadius = ring * ringWidth - gap / 2;
    // 最内圈是实心圆盘，其余是环带
    const innerRadius = ring === 1 ? 0 : (ring - 1) * ringWidth + gap / 2;
    const midRadius = (innerRadius + outerRadius) / 2;
    const span = (Math.PI * 2) / count;
    // 角向缝隙：按中半径换算成角度，最多吃掉 30% 的跨度（小圈格子本来就窄）
    const gapAngle = Math.min(span * 0.3, gap / Math.max(midRadius, 1));

    for (let slot = 0; slot < count; slot += 1) {
      const start = -Math.PI / 2 + slot * span + gapAngle / 2;
      const end = -Math.PI / 2 + (slot + 1) * span - gapAngle / 2;
      const middle = (start + end) / 2;
      cells.push({
        clipPath:
          ring === 1
            ? buildCenterDisc(outerRadius)
            : buildSector(start, end, innerRadius, outerRadius, corner),
        labelX: round(CENTER + midRadius * Math.cos(middle)),
        labelY: round(CENTER + midRadius * Math.sin(middle)),
        ring
      });
    }
  }
  return cells;
};
