import { ChapterConfig, LevelConfig } from '@/types/game';
import { CHAPTERS, LEVELS } from '@/data/levels';

/**
 * ⚠️ 临时测试开关：为 true 时开放全部关卡，任意关卡都能直接进入。
 * 测试完成后把它改回 false，即恢复正常的解锁规则（档内顺序解锁 + 跨档星星门槛）。
 */
export const UNLOCK_ALL_LEVELS = true;

/** 累计星星是否达到难度档解锁门槛 */
export const isChapterUnlocked = (chapter: ChapterConfig, totalStars: number): boolean =>
  UNLOCK_ALL_LEVELS || totalStars >= chapter.starGate;

/** 关卡是否解锁：所在档位已解锁，且（本档首关 或 上一关已通关） */
export const isLevelUnlocked = (
  level: LevelConfig,
  stars: Record<string, number>,
  totalStars: number
): boolean => {
  if (UNLOCK_ALL_LEVELS) {
    return true;
  }
  const chapter = CHAPTERS.find((item) => item.id === level.chapterId);
  if (!chapter || !isChapterUnlocked(chapter, totalStars)) {
    return false;
  }
  if (level.index === 1) {
    return true;
  }
  return (stars[`${level.chapterId}-${level.index - 1}`] ?? 0) > 0;
};

/** 当前该挑战的关卡：第一个已解锁但尚未通关的关卡 */
export const findCurrentLevel = (stars: Record<string, number>, totalStars: number): LevelConfig => {
  const pending = LEVELS.find(
    (level) => isLevelUnlocked(level, stars, totalStars) && (stars[level.id] ?? 0) === 0
  );
  if (pending) {
    return pending;
  }
  // 全部通关，或攒的星星还不够开下一章：回到最后一个已解锁的关卡刷星，而不是跳到打不开的关卡
  const unlocked = LEVELS.filter((level) => isLevelUnlocked(level, stars, totalStars));
  return unlocked.length > 0 ? unlocked[unlocked.length - 1] : LEVELS[0];
};
