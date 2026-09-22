import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import dayjs from 'dayjs';
import { GameResult, GameSettings } from '@/types/game';
import { SAVE_STORAGE_KEY, taroStorage } from '@/services/storage';

/** 最近成绩保留条数 */
const RECENT_LIMIT = 10;

export interface SaveState {
  /** 关卡 id → 最高星级 */
  stars: Record<string, number>;
  /** 关卡 id → 最佳用时（毫秒） */
  bestTimes: Record<string, number>;
  /** 关卡 id → 最少失误次数 */
  bestErrors: Record<string, number>;
  totalGames: number;
  streakDays: number;
  lastPlayedDate: string;
  recent: GameResult[];
  settings: GameSettings;
  submitResult: (result: GameResult) => void;
  setSetting: (key: keyof GameSettings, value: boolean) => void;
  resetAll: () => void;
}

const initialData = {
  stars: {} as Record<string, number>,
  bestTimes: {} as Record<string, number>,
  bestErrors: {} as Record<string, number>,
  totalGames: 0,
  streakDays: 0,
  lastPlayedDate: '',
  recent: [] as GameResult[],
  settings: { sound: true, haptics: true } as GameSettings
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

export const useSaveStore = create<SaveState>()(
  persist(
    (set, get) => ({
      ...initialData,
      submitResult: (result) => {
        const state = get();
        const prevBest = state.bestTimes[result.levelId];
        const prevErrors = state.bestErrors[result.levelId];
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
          totalGames: state.totalGames + 1,
          streakDays: calcStreak(state.lastPlayedDate, state.streakDays),
          lastPlayedDate: dayjs().format('YYYY-MM-DD'),
          recent: [result, ...state.recent].slice(0, RECENT_LIMIT)
        });
      },
      setSetting: (key, value) =>
        set((state) => ({ settings: { ...state.settings, [key]: value } })),
      resetAll: () => set({ ...initialData, settings: get().settings })
    }),
    {
      name: SAVE_STORAGE_KEY,
      version: 1,
      storage: createJSONStorage(() => taroStorage)
    }
  )
);

/** 累计星星数 */
export const selectTotalStars = (state: SaveState): number =>
  Object.values(state.stars).reduce((sum, value) => sum + value, 0);
