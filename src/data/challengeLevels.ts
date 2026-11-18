import { MemoryLevel, MemoryShape } from '@/types/challenge';

/**
 * 挑战版关卡表：14 关，三段。
 *
 * 三条口径（改难度只改这里，不要在各页面里散着调）：
 *   1. 格子数 = 数字个数。不留空格 —— 空格本身就是「这里没有数字」的提示，等于泄题。
 *   2. 难度只有两条轴：格子数、每格闪现预算（1.26s → 0.59s）。
 *      同一布局重复出现（第 3/4 关、第 8/9 关）靠缩短闪现区分，不靠继续加格子 ——
 *      16 格一次性砸到玩家脸上，只会让人第一眼就放弃。
 *   3. 方形布局只取横版 / 方版。竖版（1×3 立着）在手机上和横版记忆成本不一样，不混用。
 *
 * 第 13、14 关是**圆形盘面**（和经典版的圆形卡同一套几何）：
 * 圆形总格数恒等于 n²（第 k 圈 2k-1 格，累加即 n²），所以在「不超过 16 格」的前提下
 * 只有 3 环（9 格）和 4 环（16 格）两种，正好各出一关。
 * 圆形比同格数的方阵难记（扇环没有「第几行第几列」这种可以复述的坐标），
 * 所以每格预算比方阵宽一点；最后的 4×4 方阵仍是最紧的一关。
 */

export interface MemorySegment {
  id: number;
  title: string;
  subtitle: string;
}

export const MEMORY_SEGMENTS: MemorySegment[] = [
  { id: 1, title: '初见', subtitle: '两三个数字，先摸清规矩' },
  { id: 2, title: '成串', subtitle: '一眼扫过，记成一串' },
  { id: 3, title: '满盘', subtitle: '十几处位置，全靠脑子' }
];

interface Blueprint {
  /** 盘面造型，缺省为方形 */
  shape?: MemoryShape;
  /** 方形 = 列数；圆形 = 圈数（总格数 = cols²） */
  cols: number;
  rows: number;
  /** 每格分到多少毫秒的记忆时间 */
  perCell: number;
}

/**
 * 每格记忆预算：1.26s → 0.59s。
 *
 * 第一版是 1.4 → 0.7，实测反馈「稍微偏长」—— 玩家扫完还有一小段空等，
 * 那段空等不会让记忆变牢，只会让人分心。整体压 10%：2 格 2.5s、16 格 10.1s。
 */
const BLUEPRINTS: Blueprint[] = [
  { cols: 2, rows: 1, perCell: 1.26 },
  { cols: 3, rows: 1, perCell: 1.17 },
  { cols: 2, rows: 2, perCell: 1.13 },
  { cols: 2, rows: 2, perCell: 0.86 },
  { cols: 3, rows: 2, perCell: 0.9 },
  { cols: 2, rows: 3, perCell: 0.77 },
  { cols: 4, rows: 2, perCell: 0.86 },
  { cols: 3, rows: 3, perCell: 0.81 },
  { cols: 3, rows: 3, perCell: 0.63 },
  { cols: 4, rows: 3, perCell: 0.72 },
  { cols: 3, rows: 4, perCell: 0.59 },
  // 圆 · 三环：9 格，接在 3×4 之后。换形状等于换一套记忆坐标，数量先退一档不算放水
  { shape: 'circle', cols: 3, rows: 3, perCell: 0.7 },
  // 圆 · 四环：16 格，首次满盘
  { shape: 'circle', cols: 4, rows: 4, perCell: 0.66 },
  // 终章：4×4 方阵，16 格里预算最紧的一关
  { cols: 4, rows: 4, perCell: 0.63 }
];

/** 每段包含的关卡序号（全局，1 起），与 BLUEPRINTS 一一对应 */
const SEGMENT_RANGES: Array<{ id: number; from: number; to: number }> = [
  { id: 1, from: 1, to: 3 },
  { id: 2, from: 4, to: 7 },
  { id: 3, from: 8, to: 14 }
];

const segmentOf = (globalIndex: number): { id: number; title: string; index: number } => {
  const range = SEGMENT_RANGES.find((item) => globalIndex >= item.from && globalIndex <= item.to);
  const segment = MEMORY_SEGMENTS.find((item) => item.id === (range?.id ?? 1)) ?? MEMORY_SEGMENTS[0];
  const index = range ? globalIndex - range.from + 1 : globalIndex;
  return { id: segment.id, title: segment.title, index };
};

/**
 * 星级时间线：
 *   gold   = 每格 1.1s + 1s 起手
 *   silver = 每格 1.9s + 2s 起手
 * 回忆阶段不像搜索阶段那样「越快越爽」——想不起来就是真的想不起来，
 * 所以两档之间留得比较宽，别让「差 0.3 秒掉一颗星」变成挫败源。
 */
const buildGold = (total: number): number => Math.round(total * 1100 + 1000);
const buildSilver = (total: number): number => Math.round(total * 1900 + 2000);

/** 命：格子越多容错越多，但始终只给「几次」，记忆断裂必须是真的断裂 */
const buildLives = (total: number): number => Math.max(2, Math.ceil(total / 4));

const pad2 = (value: number): string => (value < 10 ? `0${value}` : `${value}`);

/** 圈数的汉字写法：圆形盘面说「几环」比说「几×几」准确 */
const RING_NUMERALS = ['一', '二', '三', '四', '五', '六', '七', '八'];

const buildLayoutLabel = (shape: MemoryShape, cols: number, rows: number): string =>
  shape === 'circle' ? `圆 · ${RING_NUMERALS[cols - 1] ?? cols}环` : `${cols}×${rows}`;

export const MEMORY_LEVELS: MemoryLevel[] = BLUEPRINTS.map((blueprint, i) => {
  const globalIndex = i + 1;
  const shape: MemoryShape = blueprint.shape ?? 'square';
  const total = blueprint.cols * blueprint.rows;
  const segment = segmentOf(globalIndex);
  return {
    id: `m-${pad2(globalIndex)}`,
    segmentId: segment.id,
    segmentTitle: segment.title,
    index: segment.index,
    globalIndex,
    shape,
    cols: blueprint.cols,
    rows: blueprint.rows,
    total,
    layoutLabel: buildLayoutLabel(shape, blueprint.cols, blueprint.rows),
    flashMs: Math.round(total * blueprint.perCell * 1000),
    gold: buildGold(total),
    silver: buildSilver(total),
    lives: buildLives(total)
  };
});

/** 满星总数：14 关 × 3 星 */
export const MAX_MEMORY_STARS = MEMORY_LEVELS.length * 3;

export const FIRST_MEMORY_LEVEL_ID = MEMORY_LEVELS[0].id;

export const getMemoryLevelById = (id: string): MemoryLevel | undefined =>
  MEMORY_LEVELS.find((level) => level.id === id);

export const getSegmentLevels = (segmentId: number): MemoryLevel[] =>
  MEMORY_LEVELS.filter((level) => level.segmentId === segmentId);

export const getSegmentById = (segmentId: number): MemorySegment | undefined =>
  MEMORY_SEGMENTS.find((segment) => segment.id === segmentId);
