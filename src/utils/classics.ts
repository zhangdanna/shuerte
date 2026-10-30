import { LEVELS } from '@/data/levels';
import { SONGS } from '@/data/songs';
import { ClassicSong, PerformanceGrade } from '@/types/game';

/** 解锁判定只吃这两样存档数据：星级与演奏评级 */
export interface ClassicStats {
  stars: Record<string, number>;
  grades: Record<string, PerformanceGrade>;
}

export const countTotalStars = (stars: Record<string, number>): number =>
  Object.values(stars).reduce((sum, value) => sum + value, 0);

/**
 * 金唱片：一首曲子绑定的 6 关全部满星（3/4/5 星按各关满星算）。
 * 和曲集页的「金唱片」是同一个口径 —— 两处都从 LEVELS 现算，不存派生值。
 */
export const countGoldRecords = (stars: Record<string, number>): number =>
  SONGS.filter((song) => {
    const levels = LEVELS.filter((level) => level.songId === song.id);
    return levels.length > 0 && levels.every((level) => (stars[level.id] ?? 0) >= level.maxStars);
  }).length;

/** 拿过 S 评级的关卡数：评级只反映节奏贴合度，和星级是两条进步路线 */
export const countGradeS = (grades: Record<string, PerformanceGrade>): number =>
  Object.values(grades).filter((grade) => grade === 'S').length;

export interface ClassicProgress {
  unlocked: boolean;
  current: number;
  target: number;
  /** 条件名称，用于 UI 文案 */
  label: string;
}

/** 一首名曲的解锁进度：全部由存档现算，不新增存档字段 */
export const getClassicProgress = (song: ClassicSong, stats: ClassicStats): ClassicProgress => {
  const { unlock } = song;
  if (unlock.kind === 'stars') {
    const current = countTotalStars(stats.stars);
    return { unlocked: current >= unlock.value, current, target: unlock.value, label: '累计星星' };
  }
  if (unlock.kind === 'gold') {
    const current = countGoldRecords(stats.stars);
    return { unlocked: current >= unlock.value, current, target: unlock.value, label: '金唱片' };
  }
  const current = countGradeS(stats.grades);
  return { unlocked: current >= unlock.value, current, target: unlock.value, label: 'S 评级' };
};
