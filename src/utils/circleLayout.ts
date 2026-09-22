/**
 * 圆形卡的分区几何（纯计算，不依赖 UI）。
 *
 * 整块圆盘按「半径分圈、角度分格」切分：第 k 圈切 2k-1 格，
 * 因为 1 + 3 + 5 + ... + (2n-1) = n²，正好容纳 size² 个数字，
 * 且格子是扇环（不规则形状，沿圆边排一圈）。
 */

export interface CircleCellGeometry {
  /** 喂给 CSS clip-path 的剪裁路径（坐标相对整张卡片） */
  clipPath: string;
  /** 数字中心相对卡片的百分比坐标 */
  labelX: number;
  labelY: number;
  /** 所在圈号（1 = 最内圈）。渲染时外圈先画、内圈后画，内圈自然盖住外圈延伸到圆心的部分 */
  ring: number;
}

const round = (value: number): number => Math.round(value * 100) / 100;

/** 返回数组下标与数字序号一一对应（下标 0 = 圆心格） */
export const buildCircleCells = (size: number): CircleCellGeometry[] => {
  const cells: CircleCellGeometry[] = [];
  for (let ring = 1; ring <= size; ring += 1) {
    const count = ring * 2 - 1;
    const radius = ring / size;
    const span = (Math.PI * 2) / count;
    // 弧线用折线逼近：每圈按角度跨度决定采样点，跨度越小点越少
    const steps = Math.min(10, Math.max(4, Math.ceil(36 / count)));
    for (let slot = 0; slot < count; slot += 1) {
      const start = -Math.PI / 2 + slot * span;
      const points: string[] = ['50% 50%'];
      for (let step = 0; step <= steps; step += 1) {
        const angle = start + (span * step) / steps;
        points.push(
          `${round(50 + 50 * radius * Math.cos(angle))}% ${round(50 + 50 * radius * Math.sin(angle))}%`
        );
      }
      const labelRadius = ((ring - 0.5) / size) * 50;
      const middle = start + span / 2;
      cells.push({
        clipPath: `polygon(${points.join(', ')})`,
        labelX: round(50 + labelRadius * Math.cos(middle)),
        labelY: round(50 + labelRadius * Math.sin(middle)),
        ring
      });
    }
  }
  return cells;
};
