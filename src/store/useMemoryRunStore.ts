import { create } from 'zustand';
import { MemoryCell, MemoryShape } from '@/types/challenge';

/**
 * 一局的盘面快照：只走内存，不进存档。
 *
 * 结算页要「复盘答案盘」，而答案盘依赖这一局真实的乱序 ——
 * 重新洗一次牌就对不上了。塞进 URL 又会超长（16 个数字 + 状态），
 * 所以用一份内存 store 在对局页与结算页之间传。
 */
export interface MemoryRun {
  levelId: string;
  /** 盘面造型：答案盘必须和对局时同一个形状，否则「复盘」会复出另一张盘 */
  shape: MemoryShape;
  cols: number;
  cells: MemoryCell[];
  elapsed: number;
  errors: number;
  peeked: boolean;
  failed: boolean;
}

interface MemoryRunState {
  run: MemoryRun | null;
  setRun: (run: MemoryRun) => void;
  clearRun: () => void;
}

export const useMemoryRunStore = create<MemoryRunState>((set) => ({
  run: null,
  setRun: (run) => set({ run }),
  clearRun: () => set({ run: null })
}));
