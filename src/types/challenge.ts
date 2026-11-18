import { CellStatus } from './game';

/**
 * 挑战版「墨隐」的类型定义。
 *
 * 与经典版的根本差别：经典版的核心是「找」（数字一直在，比搜索速度），
 * 挑战版的核心是「记」（数字只亮几秒，之后靠记忆点回去）。
 * 所以这里不复用 `GameState` —— 那边带着 songId / 限时 / 星级阈值等一整套演奏语义，
 * 混进来只会让两边都变脏。
 */

/** 对局阶段：比经典版多一个 memorize（记忆），少了限时失败 */
export type MemoryPhase = 'countdown' | 'memorize' | 'recall' | 'paused' | 'finished' | 'failed';

/**
 * 盘面造型。
 * square = 常规网格；circle = 整块圆盘按半径分圈、角度分格切成扇环，
 * 几何直接复用经典版的 `utils/circleLayout`（同一个形状，两版看起来才是同一个游戏）。
 */
export type MemoryShape = 'square' | 'circle';

/** 一关的静态配置 */
export interface MemoryLevel {
  id: string;
  /** 所属段（1 初见 / 2 成串 / 3 满盘） */
  segmentId: number;
  segmentTitle: string;
  /** 段内序号，从 1 开始 */
  index: number;
  /** 全局关卡号，从 1 开始 */
  globalIndex: number;
  /** 盘面造型 */
  shape: MemoryShape;
  /**
   * 列数。方形盘面 = 每行的格数；**圆形盘面 = 圈数**（圆形总格数恒等于 cols²，
   * 因为第 k 圈有 2k-1 格，累加正好是 n²）。
   */
  cols: number;
  /** 行数。方形盘面 = 每列的格数；圆形盘面与 cols 相同（圆没有行列，只为凑总数） */
  rows: number;
  /** 数字总数 = cols × rows */
  total: number;
  /** 展示用的布局标签：方形是 `3×2`，圆形是 `圆 · 三环` */
  layoutLabel: string;
  /** 记忆阶段时长（毫秒）：数字从出现到完全隐去 */
  flashMs: number;
  /** 满星线（毫秒）：零失误且不窥看时，快于此线才拿三星 */
  gold: number;
  /** 二星线（毫秒） */
  silver: number;
  /** 命：点错几次算记忆断裂 */
  lives: number;
}

export interface MemoryCell {
  value: number;
  status: CellStatus;
}

/** 对局状态：引擎输出的不可变快照 */
export interface MemoryState {
  level: MemoryLevel;
  phase: MemoryPhase;
  cells: MemoryCell[];
  /** 当前该点的数字（1 起） */
  target: number;
  errors: number;
  /** 剩余命数，归零即失败 */
  lives: number;
  /** 窥看剩余次数（每关 1 次） */
  peekLeft: number;
  /** 本关是否用过窥看：用过即失去满星资格 */
  peeked: boolean;
  /** 罚时累计（毫秒）：点错 + 窥看 */
  penalty: number;
  /** 数字当前是否可见（记忆阶段与窥看期间为 true） */
  revealed: boolean;
  /** 回忆阶段开始的时间戳，null 表示还没进入回忆 */
  startedAt: number | null;
  pausedAt: number | null;
  pausedTotal: number;
  /** 最近一次点错的格子下标，用于红闪 */
  errorIndex: number | null;
  /** 结束后冻结的用时 */
  finalElapsed: number | null;
}

export interface MemoryTapFeedback {
  kind: 'correct' | 'error' | 'ignored';
  index: number;
  finished: boolean;
  /** 命用尽：本局判负 */
  failed: boolean;
}

/** 一局结束的成绩 */
export interface MemoryResult {
  levelId: string;
  segmentId: number;
  index: number;
  cols: number;
  rows: number;
  elapsed: number;
  errors: number;
  stars: number;
  peeked: boolean;
  isBest: boolean;
  playedAt: string;
}

/** 挑战版设置：独立于经典版，不共享 timbre / 伴奏等演奏项 */
export interface ChallengeSettings {
  /** 点击音与界面提示音 */
  sound: boolean;
  haptics: boolean;
}
