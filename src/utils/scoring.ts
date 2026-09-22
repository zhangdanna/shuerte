import { LevelThresholds } from '@/types/game';

/** 每次点错的罚时（毫秒）：乱点的时间成本必须高于收益 */
export const ERROR_PENALTY = 1500;

/** 按错误次数换算罚时 */
export const calcPenalty = (errors: number): number => errors * ERROR_PENALTY;

/**
 * 星级判定：
 * 用时达标给 1~3 星；0 失误额外 +1 星（上限 3 星），
 * 让「手速」和「精准」成为两条并行的追求路线。
 */
export const calcStars = (elapsed: number, errors: number, thresholds: LevelThresholds): number => {
  let stars = 1;
  if (elapsed <= thresholds.gold) {
    stars = 3;
  } else if (elapsed <= thresholds.silver) {
    stars = 2;
  }
  if (errors === 0) {
    stars = Math.min(3, stars + 1);
  }
  return stars;
};
