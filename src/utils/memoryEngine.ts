import { MemoryCell, MemoryLevel, MemoryState, MemoryTapFeedback } from '@/types/challenge';
import { shuffle } from './shuffle';

/** 开局倒计时秒数 */
export const COUNTDOWN_SECONDS = 3;

/** 错误格子的红闪时长（毫秒） */
export const ERROR_FLASH_MS = 420;

/**
 * 点错罚时（毫秒）。
 * 经典版是 150ms —— 那里点错只是「慢了一点」，找数字的注意力还在。
 * 这里点错意味着「记错了一个位置」，比罚时更重的是掉一条命，所以罚时给到 1.5s 就够，
 * 再重会变成双重惩罚，玩家只会觉得被针对。
 */
export const ERROR_PENALTY = 1500;

/** 窥看罚时（毫秒）：看一次 700ms，代价 4 秒 */
export const PEEK_PENALTY = 4000;

/** 窥看时数字亮起的时长（毫秒） */
export const PEEK_REVEAL_MS = 700;

/** 每关窥看次数 */
export const PEEK_PER_LEVEL = 1;

/**
 * 洗一盘数字，并保证和上一局不一样。
 *
 * 为什么必须显式避开：2 格关卡只有 2 种排列，纯随机重开有 50% 概率
 * 和刚才那一局一模一样 —— 玩家会觉得「这游戏没重开」，而记忆类玩法里
 * 记住上一局的答案直接通关，等于白送。
 */
const buildValues = (total: number, avoid?: number[]): number[] => {
  const base = Array.from({ length: total }, (_, i) => i + 1);
  if (!avoid || avoid.length !== total) {
    return shuffle(base);
  }
  const avoidKey = avoid.join(',');
  for (let attempt = 0; attempt < 12; attempt += 1) {
    const next = shuffle(base);
    if (next.join(',') !== avoidKey) {
      return next;
    }
  }
  // 兜底：两格只有两种排列，正常第二次就不同；真撞上了就交换前两位
  const fallback = base.slice();
  [fallback[0], fallback[1]] = [fallback[1], fallback[0]];
  return fallback;
};

/** 建一局：数字乱序铺满格子，等待倒计时。传 avoidValues 可避开上一局的盘面 */
export const createMemoryGame = (level: MemoryLevel, avoidValues?: number[]): MemoryState => {
  const values = buildValues(level.total, avoidValues);
  const cells: MemoryCell[] = values.map((value) => ({ value, status: 'idle' }));
  return {
    level,
    phase: 'countdown',
    cells,
    target: 1,
    errors: 0,
    lives: level.lives,
    peekLeft: PEEK_PER_LEVEL,
    peeked: false,
    penalty: 0,
    revealed: false,
    startedAt: null,
    pausedAt: null,
    pausedTotal: 0,
    errorIndex: null,
    finalElapsed: null
  };
};

/** 已点对的格子数 */
export const getDoneCount = (state: MemoryState): number =>
  Math.min(Math.max(state.target - 1, 0), state.level.total);

/**
 * 当前用时。
 * 与经典版同口径：时间戳差值，不用定时器累加（切后台、掉帧都不影响）。
 * 记忆阶段（第一次进入）还没 startedAt，所以不计时；罚时统一加在 penalty 里。
 */
export const getElapsed = (state: MemoryState, now: number): number => {
  if (state.finalElapsed !== null) {
    return state.finalElapsed;
  }
  if (state.startedAt === null) {
    return 0;
  }
  const base = state.pausedAt !== null ? state.pausedAt : now;
  return Math.max(0, base - state.startedAt - state.pausedTotal + state.penalty);
};

/** 进入记忆阶段：数字亮起 */
export const beginMemorize = (state: MemoryState): MemoryState =>
  state.phase === 'countdown' || state.phase === 'memorize' ? { ...state, phase: 'memorize', revealed: true } : state;

/**
 * 记忆结束：数字隐去，开始计时。
 *
 * `pausedTotal` 只在「首次进入回忆」时清零 —— 记忆阶段切后台攒下的暂停时长
 * 不属于「回忆用时」，留着会让 getElapsed 一开始就被扣成 0，成绩虚高。
 * 已经进入过回忆（切后台回来重记）时则保留，暂停时长本来就该从总用时里扣。
 */
export const endMemorize = (state: MemoryState, now: number): MemoryState =>
  state.phase === 'memorize'
    ? {
        ...state,
        phase: 'recall',
        revealed: false,
        startedAt: state.startedAt ?? now,
        pausedTotal: state.startedAt === null ? 0 : state.pausedTotal
      }
    : state;

/** 窥看：数字再亮一下，代价是罚时 + 失去满星资格 */
export const startPeek = (state: MemoryState): MemoryState =>
  state.phase === 'recall' && state.peekLeft > 0
    ? {
        ...state,
        revealed: true,
        peekLeft: state.peekLeft - 1,
        peeked: true,
        penalty: state.penalty + PEEK_PENALTY
      }
    : state;

/** 窥看结束：重新隐去 */
export const endPeek = (state: MemoryState): MemoryState =>
  state.phase === 'recall' && state.revealed ? { ...state, revealed: false } : state;

/**
 * 点击一格。
 * 命中目标 → 该格浮现数字并推进；否则掉一条命、罚时、红闪。
 * 命归零即「记忆断裂」，本局判负。
 */
export const tapMemory = (
  state: MemoryState,
  index: number,
  now: number
): { state: MemoryState; feedback: MemoryTapFeedback } => {
  const cell = state.cells[index];
  if (state.phase !== 'recall' || !cell || cell.status === 'done') {
    return { state, feedback: { kind: 'ignored', index, finished: false, failed: false } };
  }

  if (cell.value !== state.target) {
    const cells = state.cells.slice();
    // 连续点错时先复位上一个红闪格，否则旧格子会一直红着
    if (state.errorIndex !== null) {
      const previous = cells[state.errorIndex];
      if (previous && previous.status === 'error') {
        cells[state.errorIndex] = { ...previous, status: 'idle' };
      }
    }
    cells[index] = { ...cell, status: 'error' };
    const errors = state.errors + 1;
    const lives = state.lives - 1;
    const next: MemoryState = {
      ...state,
      cells,
      errors,
      lives,
      penalty: state.penalty + ERROR_PENALTY,
      errorIndex: index
    };
    if (lives <= 0) {
      return {
        state: { ...next, phase: 'failed', revealed: true, finalElapsed: getElapsed(next, now) },
        feedback: { kind: 'error', index, finished: false, failed: true }
      };
    }
    return { state: next, feedback: { kind: 'error', index, finished: false, failed: false } };
  }

  const cells = state.cells.slice();
  cells[index] = { ...cell, status: 'done' };
  const advanced: MemoryState = { ...state, cells, target: state.target + 1 };
  if (advanced.target <= state.level.total) {
    return { state: advanced, feedback: { kind: 'correct', index, finished: false, failed: false } };
  }
  return {
    state: { ...advanced, phase: 'finished', revealed: true, finalElapsed: getElapsed(advanced, now) },
    feedback: { kind: 'correct', index, finished: true, failed: false }
  };
};

/** 清除错误格的红闪 */
export const clearError = (state: MemoryState, index: number): MemoryState => {
  const cell = state.cells[index];
  if (!cell || cell.status !== 'error') {
    return state;
  }
  const cells = state.cells.slice();
  cells[index] = { ...cell, status: 'idle' };
  return { ...state, cells, errorIndex: state.errorIndex === index ? null : state.errorIndex };
};

/** 暂停：冻结计时（切后台时调用） */
export const pauseMemory = (state: MemoryState, now: number): MemoryState =>
  state.phase === 'recall' || state.phase === 'memorize'
    ? { ...state, phase: 'paused', revealed: false, pausedAt: now }
    : state;

/**
 * 恢复：**回到记忆阶段重看一遍**，而不是接着回忆。
 *
 * 记忆游戏切后台等于可以截图、可以慢慢想，一旦允许「原地恢复」，
 * 排行榜上的成绩就全是假的。回到 memorize 让作弊没有收益 —— 重新记一遍，
 * 时间照走（暂停时长扣除，但罚时和已消耗的时间不返还）。
 */
export const resumeMemory = (state: MemoryState, now: number): MemoryState =>
  state.phase === 'paused' && state.pausedAt !== null
    ? {
        ...state,
        phase: 'memorize',
        revealed: true,
        pausedAt: null,
        pausedTotal: state.pausedTotal + (now - state.pausedAt)
      }
    : state;
