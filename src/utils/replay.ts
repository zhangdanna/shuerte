import { GameMode } from '@/types/game';

/**
 * 结算页「演奏回放」的节奏编排（纯函数，不碰 UI）。
 *
 * 难点是时间尺度：一局 3×3 可能 3 秒，8×8 可能 60 秒，直接照原速播没人等得起；
 * 按等间隔播又丢掉了「哪里卡了一下、哪里一气呵成」的手感。
 * 所以做法是 —— 保留相邻击键的**相对比例**，整体压到 1.1~3.2 秒，
 * 再给相邻两格设一个最小间隔（这个值同时是「声音能不能分辨」的门槛）。
 */

/** 回放总时长区间（ms） */
const MIN_TOTAL = 1100;
const MAX_TOTAL = 3200;
/**
 * 相邻两格的最小间隔（ms）。
 * 这不只是视觉参数 —— 回放要**同时出声**，而人能分辨相邻两音的下限就在 40~50ms：
 * 间距小于它，64 个音会糊成一堵墙，反而听不出「按顺序」。
 * 8×8 因此变成约 3.2 秒扫完，3×3 仍在 120ms/音（很清楚）。
 */
const MIN_STEP = 50;
/** 格子弹出动画时长（ms），必须与 RunReplay 的 replayPop 保持一致 */
const POP_MS = 240;
/** 播完到碎裂之间的停顿（ms）：留一口气，碎裂才有「定格后炸开」的感觉 */
const HOLD_MS = 320;
/** 原速压缩比例：一局 12 秒 → 约 1.2 秒 */
const COMPRESS = 0.1;

export interface ReplayCell {
  value: number;
  /** 演奏顺序下标；-1 表示这一局没点到 */
  order: number;
  /** 出现延迟（ms）；-1 表示不出现 */
  delay: number;
}

/** 一个发声点：第 value 个数字，在回放开始后 atMs 毫秒响 */
export interface ReplayCue {
  value: number;
  atMs: number;
}

export interface ReplayPlan {
  cells: ReplayCell[];
  /**
   * 发声表（已抽稀）。视觉上每格都要亮，但 8×8 的 64 个音连成一串会糊，
   * 所以大棋盘隔一格响一个 —— 听感仍是连绵的乐句，只是不再逐格敲。
   */
  cues: ReplayCue[];
  /** 全部播完 + 停顿的时刻（ms）；0 表示这一局没有可播的内容 */
  playMs: number;
  /** 这一局点到的个数 */
  playedCount: number;
}

/** 超过这个格数就隔一格响一个（36 格 = 6×6 起） */
const SPARSE_OVER = 32;

/**
 * 数字 → 演奏顺序。
 * 正序/双色都是 1 → N²，倒序关是 N² → 1，所以顺序不用记，由玩法推导即可。
 */
const orderOf = (value: number, total: number, mode: GameMode): number =>
  mode === 'reverse' ? total - value : value - 1;

export const buildReplayPlan = (
  values: number[],
  beats: number[],
  mode: GameMode
): ReplayPlan => {
  const total = values.length;
  const usable = beats.slice(0, total);

  if (total === 0 || usable.length === 0) {
    return {
      cells: values.map((value) => ({ value, order: -1, delay: -1 })),
      cues: [],
      playMs: 0,
      playedCount: 0
    };
  }

  const first = usable[0];
  const span = Math.max(1, usable[usable.length - 1] - first);
  const target = Math.min(MAX_TOTAL, Math.max(MIN_TOTAL, span * COMPRESS));
  // 只有一个音时没有间隔可压缩，直接落在 0
  const scale = usable.length > 1 ? target / span : 0;

  const cells: ReplayCell[] = values.map((value) => {
    const order = orderOf(value, total, mode);
    const played = order >= 0 && order < usable.length;
    return {
      value,
      order: played ? order : -1,
      delay: played ? (usable[order] - first) * scale : -1
    };
  });

  // 单调化：压缩后相邻两格可能只差几毫秒，补齐最小间隔（按演奏顺序推，保证不会倒序）
  const ordered = cells.filter((cell) => cell.order >= 0).sort((a, b) => a.order - b.order);
  let prev = -MIN_STEP;
  for (const cell of ordered) {
    const next = Math.max(cell.delay, prev + MIN_STEP);
    cell.delay = next;
    prev = next;
  }

  // 发声表：大棋盘隔一格取一个，避免 64 个音糊成一团
  const stride = ordered.length > SPARSE_OVER ? 2 : 1;
  const cues: ReplayCue[] = ordered
    .filter((_, index) => index % stride === 0)
    .map((cell) => ({ value: cell.value, atMs: cell.delay }));

  return {
    cells,
    cues,
    playMs: ordered.length > 0 ? prev + POP_MS + HOLD_MS : 0,
    playedCount: ordered.length
  };
};
