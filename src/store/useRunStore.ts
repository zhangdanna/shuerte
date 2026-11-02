import { create } from 'zustand';
import { GameMode } from '@/types/game';

/**
 * 一局结束时的「演奏快照」。
 * 结算页拿它回放「这一遍」：盘面按当时的 cells 还原，节奏用真实击键时间戳。
 */
export interface RunSnapshot {
  levelId: string;
  size: number;
  mode: GameMode;
  /** 盘面顺序的数字（= 对局时 cells[i].value），保证回放和刚才看到的盘面一模一样 */
  values: number[];
  /** 击键时间戳（ms，相对开局，按演奏顺序） */
  beats: number[];
  /** 本局完成的数字个数 */
  done: number;
  failed: boolean;
}

interface RunState {
  run: RunSnapshot | null;
  setRun: (run: RunSnapshot) => void;
  clearRun: () => void;
}

/**
 * 对局 → 结算的一次性交接。
 *
 * 刻意**不持久化**：
 *   1. 它只服务「刚打完这一局」的结算页，跨会话没有意义；
 *   2. 存档里只该留 bestRuns 那一条最好成绩，不该被每局的临时数据污染；
 *   3. 不走 URL 参数 —— 8×8 有 64 个时间戳，拼进 query 会顶到微信 path 上限。
 */
export const useRunStore = create<RunState>((set) => ({
  run: null,
  setRun: (run) => set({ run }),
  clearRun: () => set({ run: null })
}));
