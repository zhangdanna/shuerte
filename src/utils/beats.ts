import { BestRun, LevelConfig } from '@/types/game';

export interface SongBeats {
  /** 击键时间戳（ms，相对开局，按点击顺序） */
  beats: number[];
  /** 提供这份节奏的关卡 */
  levelId: string;
  /** 覆盖到的音数 */
  covered: number;
  /** 该关的数字总数（= 这首曲子弹到的音数） */
  total: number;
}

/**
 * 曲集整曲回放用：一首曲子横跨 6 关，尺寸从 3×3 到 8×8，
 * 每关都是「同一首曲子的前 N 个音」——所以取记录最长的那一关，
 * 8×8 通过时正好就是完整的 64 音。没有记录就返回 null（回放退回原曲）。
 */
export const pickSongBeats = (
  levels: LevelConfig[],
  bestRuns: Record<string, BestRun>
): SongBeats | null => {
  let picked: SongBeats | null = null;
  levels.forEach((level) => {
    const run = bestRuns[level.id];
    if (!run || run.beats.length === 0) {
      return;
    }
    if (!picked || run.beats.length > picked.covered) {
      picked = {
        beats: run.beats,
        levelId: level.id,
        covered: run.beats.length,
        total: level.total
      };
    }
  });
  return picked;
};
