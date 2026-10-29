import { ChapterConfig, LevelConfig } from '@/types/game';
import { CHAPTERS, GUIDE_LEVEL, LEVELS } from '@/data/levels';

/**
 * 解锁规则（正式版，勿再临时放开）：
 *   1. 跨档：累计星星达到该档 starGate 才开档
 *   2. 档内：第一关常开，其余关必须先通关上一关
 *   3. 指引关未通时，主线第一关不开
 */

/** 累计星星是否达到难度档解锁门槛 */
export const isChapterUnlocked = (chapter: ChapterConfig, totalStars: number): boolean =>
  totalStars >= chapter.starGate;

/** 关卡是否解锁：所在档位已解锁，且（本档首关 或 上一关已通关） */
export const isLevelUnlocked = (
  level: LevelConfig,
  stars: Record<string, number>,
  totalStars: number
): boolean => {
  // 指引关不进章节体系，永远可进
  if (level.tutorial) {
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

/**
 * 当前该挑战的关卡：指引关没通就先回指引关，否则是第一个已解锁但尚未通关的关卡。
 * tutorialDone 必须由存档传入 —— 这是「有没有走过引子」的唯一来源。
 */
export const findCurrentLevel = (
  stars: Record<string, number>,
  totalStars: number,
  tutorialDone: boolean
): LevelConfig => {
  if (!tutorialDone) {
    return GUIDE_LEVEL;
  }
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

/** 某首曲子是否已经走到（第一段解锁即算）：曲集用它区分「未至」与「未收录」 */
export const isSongReachable = (
  songLevels: LevelConfig[],
  stars: Record<string, number>,
  totalStars: number
): boolean => songLevels.some((level) => isLevelUnlocked(level, stars, totalStars));
