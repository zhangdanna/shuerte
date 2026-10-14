import { CellData, GameState, LevelConfig, TapFeedback } from '@/types/game';
import { buildNumbers } from './shuffle';
import { calcPenalty } from './scoring';

/** 开局倒计时秒数 */
export const COUNTDOWN_SECONDS = 3;

/** 错误格子的红闪时长（毫秒） */
export const ERROR_FLASH_MS = 420;

/** 建一局新游戏：数字乱序，等待倒计时结束才开始计时。倒序玩法从 size² 开始点 */
export const createGame = (level: LevelConfig): GameState => {
  const cells: CellData[] = buildNumbers(level.size).map((value) => ({ value, status: 'idle' }));
  return {
    level,
    phase: 'countdown',
    cells,
    target: level.mode === 'reverse' ? level.total : 1,
    errors: 0,
    penalty: 0,
    startedAt: null,
    pausedAt: null,
    pausedTotal: 0,
    errorIndex: null,
    finalElapsed: null
  };
};

/** 当前该点的数字（对局结束后仍夹在 1 ~ total 之间，供 HUD 展示） */
export const getCurrentTarget = (state: GameState): number =>
  Math.min(Math.max(state.target, 1), state.level.total);

/** 已正确点击的格子数：倒序玩法目标递减，正序/双色递增 */
export const getDoneCount = (state: GameState): number => {
  const total = state.level.total;
  const raw = state.level.mode === 'reverse' ? total - state.target : state.target - 1;
  return Math.min(Math.max(raw, 0), total);
};

/**
 * 计算当前用时。
 * 用时间戳差值而非定时器累加，避免小程序定时器漂移与切后台节流导致计时不准。
 */
export const getElapsed = (state: GameState, now: number): number => {
  if (state.finalElapsed !== null) {
    return state.finalElapsed;
  }
  if (state.startedAt === null) {
    return 0;
  }
  const base = state.pausedAt !== null ? state.pausedAt : now;
  return Math.max(0, base - state.startedAt - state.pausedTotal + state.penalty);
};

/** 倒计时结束，正式开始计时 */
export const startPlaying = (state: GameState, now: number): GameState =>
  state.phase === 'countdown'
    ? { ...state, phase: 'playing', startedAt: now, pausedAt: null, pausedTotal: 0 }
    : state;

/**
 * 点击一个方格。
 * 命中目标 → 标记完成并推进目标；否则计一次错误、累加罚时并高亮该格。
 */
export const tapCell = (
  state: GameState,
  index: number,
  now: number
): { state: GameState; feedback: TapFeedback } => {
  const cell = state.cells[index];
  if (state.phase !== 'playing' || !cell || cell.status === 'done') {
    return { state, feedback: { kind: 'ignored', index, finished: false } };
  }

  if (cell.value !== state.target) {
    const cells = state.cells.slice();
    // 上一次的红闪格子先复位，避免连续点错时旧格子一直保持红色
    if (state.errorIndex !== null) {
      const previous = cells[state.errorIndex];
      if (previous && previous.status === 'error') {
        cells[state.errorIndex] = { ...previous, status: 'idle' };
      }
    }
    cells[index] = { ...cell, status: 'error' };
    const errors = state.errors + 1;
    return {
      state: { ...state, cells, errors, penalty: calcPenalty(errors), errorIndex: index },
      feedback: { kind: 'error', index, finished: false }
    };
  }

  const cells = state.cells.slice();
  cells[index] = { ...cell, status: 'done' };
  const reverse = state.level.mode === 'reverse';
  const advanced: GameState = { ...state, cells, target: reverse ? state.target - 1 : state.target + 1 };
  const finished = reverse ? advanced.target < 1 : advanced.target > state.level.total;
  if (!finished) {
    return { state: advanced, feedback: { kind: 'correct', index, finished: false } };
  }
  const settled: GameState = {
    ...advanced,
    phase: 'finished',
    finalElapsed: getElapsed(advanced, now)
  };
  return { state: settled, feedback: { kind: 'correct', index, finished: true } };
};

/** 清除错误格子的红闪状态 */
export const clearError = (state: GameState, index: number): GameState => {
  const cell = state.cells[index];
  if (!cell || cell.status !== 'error') {
    return state;
  }
  const cells = state.cells.slice();
  cells[index] = { ...cell, status: 'idle' };
  return { ...state, cells, errorIndex: state.errorIndex === index ? null : state.errorIndex };
};

/** 暂停：冻结计时 */
export const pauseGame = (state: GameState, now: number): GameState =>
  state.phase === 'playing' ? { ...state, phase: 'paused', pausedAt: now } : state;

/** 继续：把暂停时长从总用时里扣掉 */
export const resumeGame = (state: GameState, now: number): GameState =>
  state.phase === 'paused' && state.pausedAt !== null
    ? { ...state, phase: 'playing', pausedAt: null, pausedTotal: state.pausedTotal + (now - state.pausedAt) }
    : state;

/** 限时归零：挑战失败，用时冻结在限时上（不记录成绩） */
export const failByTimeout = (state: GameState, now: number): GameState =>
  state.phase === 'playing'
    ? {
        ...state,
        phase: 'failed',
        finalElapsed: Math.min(getElapsed(state, now), state.level.timeLimit)
      }
    : state;
