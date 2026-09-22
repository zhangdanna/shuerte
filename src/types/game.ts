/** 方格状态 */
export type CellStatus = 'idle' | 'done' | 'error';

/** 单个方格 */
export interface CellData {
  value: number;
  status: CellStatus;
}

/** 对局阶段 */
export type GamePhase = 'countdown' | 'playing' | 'paused' | 'finished' | 'failed';

/**
 * 整张卡片的造型（面板级，不是单个数字小格）。
 * 方形 → 圆形 → 生肖，随轮次递进；与小格数字数量（尺寸）自由组合。
 */
export type CardStyle = 'square' | 'circle' | 'zodiac';

/** 星级阈值（毫秒） */
export interface LevelThresholds {
  gold: number;
  silver: number;
}

/** 关卡配置 */
export interface LevelConfig {
  id: string;
  /** 所属轮次（= 章节 id） */
  chapterId: number;
  chapterTitle: string;
  /** 章内序号，从 1 开始 */
  index: number;
  /** 全局关卡号，从 1 开始，用于展示「第 N 关」 */
  globalIndex: number;
  /** 方格边长：3 ~ 8 */
  size: number;
  /** 数字总数 = size² */
  total: number;
  /** 卡片造型 */
  cardStyle: CardStyle;
  /** 生肖造型时，卡片主题生肖在 ZODIAC_SHAPES 中的下标 */
  zodiacIndex: number | null;
  thresholds: LevelThresholds;
  /** 限时（毫秒）：倒计时归零仍未完成即挑战失败 */
  timeLimit: number;
}

/** 章节配置（一个章节 = 一轮，尺寸走同一阶梯，卡片造型一致） */
export interface ChapterConfig {
  id: number;
  title: string;
  subtitle: string;
  cardStyle: CardStyle;
  /** 该轮的尺寸阶梯，逐关递增 */
  sizes: number[];
  /** 进入本轮所需的累计星星数 */
  starGate: number;
}

/** 对局状态：引擎输出的不可变快照 */
export interface GameState {
  level: LevelConfig;
  phase: GamePhase;
  cells: CellData[];
  /** 当前目标数字 */
  target: number;
  errors: number;
  /** 罚时累计（毫秒） */
  penalty: number;
  /** 开始计时的时间戳，null 表示尚未开始 */
  startedAt: number | null;
  /** 进入暂停的时间戳 */
  pausedAt: number | null;
  /** 累计暂停时长 */
  pausedTotal: number;
  /** 最近一次点错的格子下标，用于红闪提示 */
  errorIndex: number | null;
  /** 结束后冻结的用时 */
  finalElapsed: number | null;
}

/** 单次点击的判定结果 */
export interface TapFeedback {
  kind: 'correct' | 'error' | 'ignored';
  index: number;
  finished: boolean;
}

/** 一局结束的成绩 */
export interface GameResult {
  levelId: string;
  chapterId: number;
  index: number;
  size: number;
  elapsed: number;
  errors: number;
  stars: number;
  isBest: boolean;
  playedAt: string;
}

/** 用户设置 */
export interface GameSettings {
  sound: boolean;
  haptics: boolean;
}
