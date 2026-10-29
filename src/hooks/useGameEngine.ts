import { useCallback, useEffect, useRef, useState } from 'react';
import { GameState, LevelConfig, Performance } from '@/types/game';
import {
  COUNTDOWN_SECONDS,
  ERROR_FLASH_MS,
  clearError,
  createGame,
  failByTimeout,
  getDoneCount,
  getElapsed,
  pauseGame,
  resumeGame,
  startPlaying,
  tapCell
} from '@/utils/gameEngine';
import { getBeatInterval, getNoteForValue } from '@/utils/music';
import { getSongOrDefault } from '@/data/songs';
import { GOOD_WINDOW, PERFECT_WINDOW, calcPerformanceGrade } from '@/utils/scoring';
import { playNote, playSound } from '@/services/audio';
import { vibrate } from '@/services/haptics';

/** 限时检查间隔：只读快照不触发渲染，100ms 足够精确 */
const TIMEOUT_CHECK_INTERVAL = 100;

/** 基础力度：连击每满 10 次提一档，音色更亮 */
const BASE_VELOCITY = 0.72;
const COMBO_VELOCITY = 0.95;

export interface EndPayload {
  /** finished = 通关；failed = 限时内未完成 */
  kind: 'finished' | 'failed';
  elapsed: number;
  errors: number;
  /** 本局已完成的数字个数 */
  done: number;
  /** 演奏表现：只用于评级，不参与星级 */
  performance: Performance;
  /**
   * 本局的击键时间戳（ms，相对开局，按点击顺序）。
   * 曲集靠它回放「玩家自己的演奏」；罚时已计入，所以点错后的停顿也会被还原。
   */
  beats: number[];
}

export interface GameEngineApi {
  state: GameState;
  countdown: number;
  getCurrentElapsed: () => number;
  tap: (index: number) => void;
  pause: () => void;
  resume: () => void;
  restart: () => void;
}

/**
 * 对局引擎 Hook：负责倒计时、点击判定、限时失败、副作用（音效/震动）与结束回调。
 * 状态以 ref 为准，避免连续点击时拿到过期的 state。
 */
export const useGameEngine = (
  level: LevelConfig,
  onEnd: (payload: EndPayload) => void
): GameEngineApi => {
  const [state, setState] = useState<GameState>(() => createGame(level));
  const stateRef = useRef(state);
  const [countdown, setCountdown] = useState(COUNTDOWN_SECONDS);
  const endRef = useRef(onEnd);
  // 演奏表现：只用 ref 累计，不触发渲染
  const perfRef = useRef({ perfect: 0, good: 0, free: 0 });
  const lastTapAtRef = useRef<number | null>(null);
  // 击键时间戳：曲集用它回放「玩家自己的演奏」，不触发渲染
  const beatsRef = useRef<number[]>([]);

  const song = getSongOrDefault(level.songId);
  const beatInterval = getBeatInterval(song);

  const buildPerformance = useCallback((): Performance => {
    const { perfect, good, free } = perfRef.current;
    return { perfect, good, free, grade: calcPerformanceGrade(perfect, good, perfect + good + free) };
  }, []);

  useEffect(() => {
    endRef.current = onEnd;
  }, [onEnd]);

  const commit = useCallback((next: GameState) => {
    stateRef.current = next;
    setState(next);
  }, []);

  const getCurrentElapsed = useCallback(() => getElapsed(stateRef.current, Date.now()), []);

  // 切换关卡时重开一局
  useEffect(() => {
    stateRef.current = createGame(level);
    setState(stateRef.current);
    setCountdown(COUNTDOWN_SECONDS);
    perfRef.current = { perfect: 0, good: 0, free: 0 };
    lastTapAtRef.current = null;
    beatsRef.current = [];
  }, [level]);

  // 3-2-1 倒计时，结束时正式开始计时
  useEffect(() => {
    if (state.phase !== 'countdown') {
      return undefined;
    }
    if (countdown <= 0) {
      commit(startPlaying(stateRef.current, Date.now()));
      return undefined;
    }
    playSound('tick');
    const timer = setTimeout(() => setCountdown((value) => value - 1), 1000);
    return () => clearTimeout(timer);
  }, [state.phase, countdown, commit]);

  // 限时倒计时：归零即判定失败（指引关不设失败，教学局不该被时间逼死）
  useEffect(() => {
    if (state.phase !== 'playing' || level.tutorial) {
      return undefined;
    }
    const timer = setInterval(() => {
      const current = stateRef.current;
      if (current.phase !== 'playing') {
        return;
      }
      const now = Date.now();
      if (getElapsed(current, now) < current.level.timeLimit) {
        return;
      }
      const failed = failByTimeout(current, now);
      commit(failed);
      playSound('error');
      vibrate('heavy');
      console.info('[Game] 限时内未完成', { levelId: failed.level.id, timeLimit: failed.level.timeLimit });
      endRef.current({
        kind: 'failed',
        elapsed: getElapsed(failed, now),
        errors: failed.errors,
        done: getDoneCount(failed),
        performance: buildPerformance(),
        beats: beatsRef.current.slice()
      });
    }, TIMEOUT_CHECK_INTERVAL);
    return () => clearInterval(timer);
  }, [state.phase, level.tutorial, commit, buildPerformance]);

  // 错误格子红闪后复位
  useEffect(() => {
    const errorIndex = state.errorIndex;
    if (errorIndex === null) {
      return undefined;
    }
    const timer = setTimeout(() => commit(clearError(stateRef.current, errorIndex)), ERROR_FLASH_MS);
    return () => clearTimeout(timer);
  }, [state.errorIndex, commit]);

  const tap = useCallback(
    (index: number) => {
      const now = Date.now();
      const { state: next, feedback } = tapCell(stateRef.current, index, now);
      if (feedback.kind === 'ignored') {
        return;
      }
      commit(next);
      if (feedback.kind === 'error') {
        playSound('error');
        vibrate('heavy');
        // 点错后重新起拍，避免下一次正确点击被算成"超长间隔"
        lastTapAtRef.current = null;
      } else {
        // 点对 = 弹一个音：数字 k 对应乐谱第 k 个音
        const value = next.cells[index]?.value ?? stateRef.current.cells[index].value;
        const done = getDoneCount(next);
        const velocity = done > 0 && done % 10 === 0 ? COMBO_VELOCITY : BASE_VELOCITY;
        playNote(getNoteForValue(song, level, value), velocity);
        // 记下这个音落在第几毫秒：曲集回放时按这份节奏还原「我的演奏」
        beatsRef.current.push(getElapsed(next, now));

        if (lastTapAtRef.current !== null) {
          const delta = Math.abs(now - lastTapAtRef.current - beatInterval);
          if (delta <= PERFECT_WINDOW) {
            perfRef.current.perfect += 1;
          } else if (delta <= GOOD_WINDOW) {
            perfRef.current.good += 1;
          } else {
            perfRef.current.free += 1;
          }
        }
        lastTapAtRef.current = now;
      }
      if (feedback.finished) {
        console.info('[Game] 通关', { levelId: next.level.id, elapsed: next.finalElapsed, errors: next.errors });
        vibrate('light');
        endRef.current({
          kind: 'finished',
          elapsed: getElapsed(next, now),
          errors: next.errors,
          done: next.level.total,
          performance: buildPerformance(),
          beats: beatsRef.current.slice()
        });
      }
    },
    [commit, song, level, beatInterval, buildPerformance]
  );

  const pause = useCallback(() => {
    // 暂停会让下一次点击的间隔失真，清掉起拍点
    lastTapAtRef.current = null;
    commit(pauseGame(stateRef.current, Date.now()));
  }, [commit]);

  const resume = useCallback(() => {
    commit(resumeGame(stateRef.current, Date.now()));
  }, [commit]);

  const restart = useCallback(() => {
    const next = createGame(level);
    stateRef.current = next;
    setState(next);
    setCountdown(COUNTDOWN_SECONDS);
    perfRef.current = { perfect: 0, good: 0, free: 0 };
    lastTapAtRef.current = null;
    beatsRef.current = [];
  }, [level]);

  return { state, countdown, getCurrentElapsed, tap, pause, resume, restart };
};
