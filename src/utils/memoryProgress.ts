import { MemoryLevel } from '@/types/challenge';
import { MEMORY_LEVELS } from '@/data/challengeLevels';

/**
 * 挑战版解锁规则：比经典版简单得多 —— 没有卷与卷之间的星星门槛，只认「上一关通没通」。
 *
 * 为什么去掉星门槛：挑战版的难度本身就是一道门槛（16 格记 11 秒），
 * 再要求攒星才能进下一段，只会把卡住的玩家彻底堵死。想刷星的人自己会回去刷。
 */

export const isMemoryLevelUnlocked = (level: MemoryLevel, stars: Record<string, number>): boolean => {
  if (level.globalIndex <= 1) {
    return true;
  }
  const previous = MEMORY_LEVELS[level.globalIndex - 2];
  return previous ? (stars[previous.id] ?? 0) > 0 : true;
};

/** 当前该打的关：第一个已解锁且还没通关的；全通了就停在最后一关刷记录 */
export const findCurrentMemoryLevel = (stars: Record<string, number>): MemoryLevel => {
  const pending = MEMORY_LEVELS.find(
    (level) => isMemoryLevelUnlocked(level, stars) && (stars[level.id] ?? 0) === 0
  );
  if (pending) {
    return pending;
  }
  const unlocked = MEMORY_LEVELS.filter((level) => isMemoryLevelUnlocked(level, stars));
  return unlocked.length > 0 ? unlocked[unlocked.length - 1] : MEMORY_LEVELS[0];
};

export const getTotalMemoryStars = (stars: Record<string, number>): number =>
  Object.values(stars).reduce((sum, value) => sum + value, 0);
