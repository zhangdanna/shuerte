import { useCallback, useEffect, useRef, useState } from 'react';
import { MemoryCell, MemoryLevel, MemoryState } from '@/types/challenge';
import {
  COUNTDOWN_SECONDS,
  ERROR_FLASH_MS,
  PEEK_REVEAL_MS,
  beginMemorize,
  clearError,
  createMemoryGame,
  endMemorize,
  endPeek,
  getDoneCount,
  getElapsed,
  pauseMemory,
  resumeMemory,
  startPeek,
  tapMemory
} from '@/utils/memoryEngine';
import { initChallengeAudio, playMemorySfx, playTap } from '@/services/challengeAudio';
import { vibrate } from '@/services/haptics';

/** 计时刷新间隔：只驱动 HUD 上的数字，不参与判定 */
const TICK_INTERVAL = 100;

export interface MemoryEndPayload {
  kind: 'finished' | 'failed';
  elapsed: number;
  errors: number;
  done: number;
  peeked: boolean;
  /** 本局最终盘面（含每个格子的值与状态），结算页用它复盘答案 */
  cells: MemoryCell[];
}

export interface MemoryEngineApi {
  state: MemoryState;
  countdown: number;
  /** 实时用时（毫秒），页面直接展示 */
  elapsed: number;
  tap: (index: number) => void;
  peek: () => void;
  pause: () => void;
  resume: () => void;
  restart: () => void;
}

/**
 * 挑战版对局引擎：阶段推进（倒计时 → 记忆 → 回忆）、点击判定、窥看、副作用与结束回调。
 *
 * 与经典版 `useGameEngine` 的结构一致（state 以 ref 为准，避免连续点击拿到过期快照），
 * 但阶段机不同：这里没有「限时归零」，取而代之的是记忆 → 回忆的两次跃迁。
 */
export const useMemoryEngine = (
  level: MemoryLevel,
  onEnd: (payload: MemoryEndPayload) => void,
  /** 上一局的盘面（数字顺序）：重开时避开它，避免 2 格关卡两次抽到同一张 */
  avoidValues?: number[]
): MemoryEngineApi => {
  const [state, setState] = useState<MemoryState>(() => createMemoryGame(level, avoidValues));
  const stateRef = useRef(state);
  const [countdown, setCountdown] = useState(COUNTDOWN_SECONDS);
  const [elapsed, setElapsed] = useState(0);
  const endRef = useRef(onEnd);
  const endedRef = useRef(false);
  const peekTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    endRef.current = onEnd;
  }, [onEnd]);

  const commit = useCallback((next: MemoryState) => {
    stateRef.current = next;
    setState(next);
  }, []);

  const clearPeekTimer = useCallback(() => {
    if (peekTimerRef.current) {
      clearTimeout(peekTimerRef.current);
      peekTimerRef.current = null;
    }
  }, []);

  const reset = useCallback((next: MemoryState) => {
    clearPeekTimer();
    endedRef.current = false;
    stateRef.current = next;
    setState(next);
    setCountdown(COUNTDOWN_SECONDS);
    setElapsed(0);
  }, [clearPeekTimer]);

  // 切换关卡时重开一局
  useEffect(() => {
    reset(createMemoryGame(level, avoidValues));
  }, [level, avoidValues, reset]);

  useEffect(() => {
    initChallengeAudio();
    return clearPeekTimer;
  }, [clearPeekTimer]);

  // 3-2-1 倒计时：结束时数字亮起
  useEffect(() => {
    if (state.phase !== 'countdown') {
      return undefined;
    }
    if (countdown <= 0) {
      commit(beginMemorize(stateRef.current));
      playMemorySfx('reveal');
      return undefined;
    }
    playMemorySfx('tick');
    const timer = setTimeout(() => setCountdown((value) => value - 1), 1000);
    return () => clearTimeout(timer);
  }, [state.phase, countdown, commit]);

  // 记忆阶段：到点隐去，进入回忆
  useEffect(() => {
    if (state.phase !== 'memorize') {
      return undefined;
    }
    const timer = setTimeout(() => {
      commit(endMemorize(stateRef.current, Date.now()));
      playMemorySfx('vanish');
    }, level.flashMs);
    return () => clearTimeout(timer);
  }, [state.phase, level.flashMs, commit]);

  // 计时刷新：回忆阶段（以及切后台回来重看时）每 100ms 同步一次 HUD
  useEffect(() => {
    if (state.phase !== 'recall' && state.phase !== 'memorize') {
      return undefined;
    }
    const timer = setInterval(() => setElapsed(getElapsed(stateRef.current, Date.now())), TICK_INTERVAL);
    return () => clearInterval(timer);
  }, [state.phase]);

  // 错误格红闪后复位
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
      if (endedRef.current) {
        return;
      }
      const now = Date.now();
      const { state: next, feedback } = tapMemory(stateRef.current, index, now);
      if (feedback.kind === 'ignored') {
        return;
      }
      commit(next);

      if (feedback.kind === 'error') {
        vibrate('heavy');
        // 命用尽时不再叠闷响，直接让「断裂」的下行音把这一局收掉
        if (!feedback.failed) {
          playMemorySfx('thud');
        }
      } else {
        const value = next.cells[index]?.value ?? 0;
        playTap(value);
        if (feedback.finished) {
          vibrate('light');
        }
      }

      if (feedback.failed) {
        playMemorySfx('break');
      }

      if ((feedback.finished || feedback.failed) && !endedRef.current) {
        endedRef.current = true;
        endRef.current({
          kind: feedback.failed ? 'failed' : 'finished',
          elapsed: getElapsed(next, now),
          errors: next.errors,
          done: feedback.finished ? next.level.total : getDoneCount(next),
          peeked: next.peeked,
          cells: next.cells
        });
      }
    },
    [commit]
  );

  const peek = useCallback(() => {
    const current = stateRef.current;
    if (current.phase !== 'recall' || current.peekLeft <= 0) {
      return;
    }
    commit(startPeek(current));
    playMemorySfx('peek');
    clearPeekTimer();
    peekTimerRef.current = setTimeout(() => {
      commit(endPeek(stateRef.current));
      peekTimerRef.current = null;
    }, PEEK_REVEAL_MS);
  }, [commit, clearPeekTimer]);

  const pause = useCallback(() => {
    clearPeekTimer();
    commit(pauseMemory(stateRef.current, Date.now()));
  }, [commit, clearPeekTimer]);

  const resume = useCallback(() => {
    commit(resumeMemory(stateRef.current, Date.now()));
    // 回到记忆阶段：数字重新亮起，再走一遍记忆时长
    playMemorySfx('reveal');
  }, [commit]);

  const restart = useCallback(() => {
    // 重开必须换一张：拿当前这盘的顺序当「要避开的」，否则 2 格关卡大概率原样再来一次
    reset(createMemoryGame(level, stateRef.current.cells.map((cell) => cell.value)));
  }, [level, reset]);

  return { state, countdown, elapsed, tap, peek, pause, resume, restart };
};
