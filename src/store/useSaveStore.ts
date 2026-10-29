import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import dayjs from 'dayjs';
import { BestRun, GameResult, GameSettings, PerformanceGrade } from '@/types/game';
import { SAVE_STORAGE_KEY, taroStorage } from '@/services/storage';

/** 最近成绩保留条数 */
const RECENT_LIMIT = 10;

/** 存档版本：v2 起增加演奏评级、音符碎片与新的设置项；v3 增加指引关进度；v4 增加「最好那一次」的击键记录 */
const SAVE_VERSION = 4;

export interface SaveState {
  /** 关卡 id → 最高星级 */
  stars: Record<string, number>;
  /** 关卡 id → 最佳用时（毫秒） */
  bestTimes: Record<string, number>;
  /** 关卡 id → 最少失误次数 */
  bestErrors: Record<string, number>;
  /** 关卡 id → 最好的一次演奏评级 */
  grades: Record<string, PerformanceGrade>;
  /** 关卡 id → 最好的一次演奏（含击键节奏），供曲集回放 */
  bestRuns: Record<string, BestRun>;
  /** 音符碎片：每日一曲产出，攒够可换隐藏曲 */
  fragments: number;
  /** 指引关（引子）是否已通过：未通过时主线第一关不开 */
  tutorialDone: boolean;
  totalGames: number;
  streakDays: number;
  lastPlayedDate: string;
  recent: GameResult[];
  settings: GameSettings;
  submitResult: (result: GameResult, grade?: PerformanceGrade, beats?: number[]) => void;
  setSetting: <K extends keyof GameSettings>(key: K, value: GameSettings[K]) => void;
  addFragments: (count: number) => void;
  /** 指引关通关：只记一个标记，不发星、不写成绩 */
  completeTutorial: () => void;
  resetAll: () => void;
}

const defaultSettings: GameSettings = {
  sound: true,
  music: true,
  haptics: true,
  colorful: false,
  timbre: 'piano'
};

const initialData = {
  stars: {} as Record<string, number>,
  bestTimes: {} as Record<string, number>,
  bestErrors: {} as Record<string, number>,
  grades: {} as Record<string, PerformanceGrade>,
  bestRuns: {} as Record<string, BestRun>,
  fragments: 0,
  tutorialDone: false,
  totalGames: 0,
  streakDays: 0,
  lastPlayedDate: '',
  recent: [] as GameResult[],
  settings: defaultSettings
};

/**
 * 这一局是否比存档里那一次更好：先比星级，再比用时，最后比失误。
 * 只有更好才覆盖 bestRuns —— 打崩了不会把「最好的一次演奏」冲掉，
 * 玩家才敢反复重玩去刷新记录。
 */
const isBetterRun = (
  prev: BestRun | undefined,
  next: { stars: number; elapsed: number; errors: number }
): boolean => {
  if (!prev) {
    return true;
  }
  if (next.stars !== prev.stars) {
    return next.stars > prev.stars;
  }
  if (next.elapsed !== prev.elapsed) {
    return next.elapsed < prev.elapsed;
  }
  return next.errors < prev.errors;
};

const calcStreak = (lastPlayedDate: string, streakDays: number): number => {
  if (!lastPlayedDate) {
    return 1;
  }
  const today = dayjs().format('YYYY-MM-DD');
  if (lastPlayedDate === today) {
    return streakDays;
  }
  const yesterday = dayjs().subtract(1, 'day').format('YYYY-MM-DD');
  return lastPlayedDate === yesterday ? streakDays + 1 : 1;
};

/** 评级排序：S > A > B > C */
const GRADE_ORDER: Record<PerformanceGrade, number> = { S: 4, A: 3, B: 2, C: 1 };

const betterGrade = (
  prev: PerformanceGrade | undefined,
  next: PerformanceGrade
): PerformanceGrade => (prev && GRADE_ORDER[prev] >= GRADE_ORDER[next] ? prev : next);

export const useSaveStore = create<SaveState>()(
  persist(
    (set, get) => ({
      ...initialData,
      submitResult: (result, grade, beats) => {
        const state = get();
        const prevBest = state.bestTimes[result.levelId];
        const prevErrors = state.bestErrors[result.levelId];
        // 有击键记录且这一局更好，才换掉「最好的一次演奏」
        const nextBestRuns =
          beats && beats.length > 0 && isBetterRun(state.bestRuns[result.levelId], result)
            ? {
                ...state.bestRuns,
                [result.levelId]: {
                  stars: result.stars,
                  elapsed: result.elapsed,
                  errors: result.errors,
                  beats
                }
              }
            : state.bestRuns;
        set({
          stars: { ...state.stars, [result.levelId]: Math.max(state.stars[result.levelId] ?? 0, result.stars) },
          bestTimes: {
            ...state.bestTimes,
            [result.levelId]: prevBest === undefined ? result.elapsed : Math.min(prevBest, result.elapsed)
          },
          bestErrors: {
            ...state.bestErrors,
            [result.levelId]: prevErrors === undefined ? result.errors : Math.min(prevErrors, result.errors)
          },
          grades: grade
            ? { ...state.grades, [result.levelId]: betterGrade(state.grades[result.levelId], grade) }
            : state.grades,
          bestRuns: nextBestRuns,
          totalGames: state.totalGames + 1,
          streakDays: calcStreak(state.lastPlayedDate, state.streakDays),
          lastPlayedDate: dayjs().format('YYYY-MM-DD'),
          recent: [{ ...result, grade }, ...state.recent].slice(0, RECENT_LIMIT)
        });
      },
      setSetting: (key, value) => set((state) => ({ settings: { ...state.settings, [key]: value } })),
      addFragments: (count) => set((state) => ({ fragments: Math.max(0, state.fragments + count) })),
      completeTutorial: () => set({ tutorialDone: true }),
      resetAll: () => set({ ...initialData, settings: get().settings })
    }),
    {
      name: SAVE_STORAGE_KEY,
      version: SAVE_VERSION,
      storage: createJSONStorage(() => taroStorage),
      // 老存档补齐新字段而不是整份丢弃；已经玩过的玩家视为走过引子，不再被拉回教学局
      migrate: (persisted, version) => {
        const state = (persisted ?? {}) as Partial<SaveState>;
        if (version < SAVE_VERSION) {
          const legacyPlayed = (state.totalGames ?? 0) > 0 || Object.keys(state.stars ?? {}).length > 0;
          return {
            ...initialData,
            ...state,
            grades: state.grades ?? {},
            fragments: state.fragments ?? 0,
            tutorialDone: state.tutorialDone ?? legacyPlayed,
            // v4 之前没有击键记录：老存档的空着即可，回放会退回「原曲」
            bestRuns: state.bestRuns ?? {},
            settings: { ...defaultSettings, ...(state.settings ?? {}) }
          } as SaveState;
        }
        return state as SaveState;
      }
    }
  )
);
