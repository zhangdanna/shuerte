import { useCallback, useEffect, useRef, useState } from 'react';
import { GameState, LevelConfig } from '@/types/game';
import {
  COUNTDOWN_SECONDS,
  ERROR_FLASH_MS,
  clearError,
  createGame,
  failByTimeout,
  getElapsed,
  pauseGame,
  resumeGame,
  startPlaying,
  tapCell
} from '@/utils/gameEngine';
import { playSound } from '@/services/audio';
import { vibrate } from '@/services/haptics';

/** 限时检查间隔：只读快照不触发渲染，100ms 足够精确 */
const TIMEOUT_CHECK_INTERVAL = 100;

export interface EndPayload {
  /** finished = 通关；failed = 限时内未完成 */
  kind: 'finished' | 'failed';
  elapsed: number;
  errors: number;
  /** 本局已完成的数字个数 */
  done: number;
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

  // 限时倒计时：归零即判定失败
  useEffect(() => {
    if (state.phase !== 'playing') {
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
        done: Math.max(0, failed.target - 1)
      });
    }, TIMEOUT_CHECK_INTERVAL);
    return () => clearInterval(timer);
  }, [state.phase, commit]);

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
      } else {
        playSound('click');
      }
      if (feedback.finished) {
        console.info('[Game] 通关', { levelId: next.level.id, elapsed: next.finalElapsed, errors: next.errors });
        vibrate('light');
        endRef.current({
          kind: 'finished',
          elapsed: getElapsed(next, now),
          errors: next.errors,
          done: next.level.total
        });
      }
    },
    [commit]
  );

  const pause = useCallback(() => {
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
  }, [level]);

  return { state, countdown, getCurrentElapsed, tap, pause, resume, restart };
};
