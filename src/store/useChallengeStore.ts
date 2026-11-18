import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import { ChallengeSettings, MemoryResult } from '@/types/challenge';
import { taroStorage } from '@/services/storage';

/**
 * 挑战版存档：**与经典版物理隔离**。
 *
 * 为什么不复用 `useSaveStore`：那份存档里躺着玩家 36 关的星子、最佳演奏和击键记录，
 * 一旦因为新增字段的迁移逻辑出岔子，损失是不可逆的。换一个 storage key 是最便宜的保险。
 */
export const CHALLENGE_STORAGE_KEY = 'shuerte_challenge_v1';

/**
 * 存档版本。
 *
 * v2：第 13、14 关插入了两关圆形盘面，原来第 12 关（4×4 方阵）顺延到第 14 关。
 *     所以 v1 里挂在 `m-12` 上的成绩必须搬到 `m-14` —— 不搬的话，玩家已经拿到的
 *     4×4 星子会挂到新加的「圆 · 三环」头上：白送三星，还把最佳用时污染成一张 9 格盘的成绩。
 *     这是唯一一次「关卡 id 会错位」的改动，往后只追加、不再插队。
 */
const SAVE_VERSION = 2;

/** v1 → v2 的关卡 id 变更表（旧 id → 新 id） */
const V1_ID_REMAP: Record<string, string> = { 'm-12': 'm-14' };

const remapKeys = <T>(record: Record<string, T> | undefined, map: Record<string, string>): Record<string, T> => {
  if (!record) {
    return {};
  }
  const next: Record<string, T> = {};
  Object.keys(record).forEach((key) => {
    next[map[key] ?? key] = record[key];
  });
  return next;
};

export interface ChallengeSaveState {
  /** 关卡 id → 最高星级 */
  stars: Record<string, number>;
  /** 关卡 id → 最佳用时（毫秒） */
  bestTimes: Record<string, number>;
  /** 关卡 id → 最少失误次数 */
  bestErrors: Record<string, number>;
  totalRuns: number;
  settings: ChallengeSettings;
  submit: (result: MemoryResult) => void;
  setSetting: <K extends keyof ChallengeSettings>(key: K, value: ChallengeSettings[K]) => void;
  resetAll: () => void;
}

const defaultSettings: ChallengeSettings = {
  sound: true,
  haptics: true
};

const initialData = {
  stars: {} as Record<string, number>,
  bestTimes: {} as Record<string, number>,
  bestErrors: {} as Record<string, number>,
  totalRuns: 0,
  settings: defaultSettings
};

export const useChallengeStore = create<ChallengeSaveState>()(
  persist(
    (set, get) => ({
      ...initialData,
      submit: (result) => {
        const state = get();
        const prevBest = state.bestTimes[result.levelId];
        const prevErrors = state.bestErrors[result.levelId];
        set({
          stars: {
            ...state.stars,
            [result.levelId]: Math.max(state.stars[result.levelId] ?? 0, result.stars)
          },
          bestTimes: {
            ...state.bestTimes,
            [result.levelId]: prevBest === undefined ? result.elapsed : Math.min(prevBest, result.elapsed)
          },
          bestErrors: {
            ...state.bestErrors,
            [result.levelId]: prevErrors === undefined ? result.errors : Math.min(prevErrors, result.errors)
          },
          totalRuns: state.totalRuns + 1
        });
      },
      setSetting: (key, value) => set((state) => ({ settings: { ...state.settings, [key]: value } })),
      // 重置只清战绩，保留设置（音效开关不该跟着进度一起被抹掉）
      resetAll: () => set({ ...initialData, settings: get().settings })
    }),
    {
      name: CHALLENGE_STORAGE_KEY,
      version: SAVE_VERSION,
      storage: createJSONStorage(() => taroStorage),
      migrate: (persisted, version) => {
        const state = (persisted ?? {}) as Partial<ChallengeSaveState>;
        const base = {
          ...initialData,
          ...state,
          settings: { ...defaultSettings, ...(state.settings ?? {}) }
        } as ChallengeSaveState;
        if (version < 2) {
          return {
            ...base,
            stars: remapKeys(base.stars, V1_ID_REMAP),
            bestTimes: remapKeys(base.bestTimes, V1_ID_REMAP),
            bestErrors: remapKeys(base.bestErrors, V1_ID_REMAP)
          };
        }
        return base;
      }
    }
  )
);
