import { LevelThresholds } from '@/types/game';

/** 每次点错的罚时（毫秒）：乱点的时间成本必须高于收益 */
export const ERROR_PENALTY = 150;

/** 按错误次数换算罚时 */
export const calcPenalty = (errors: number): number => errors * ERROR_PENALTY;

/**
 * 星级判定：
 * 用时达标给 1~3 星，达成极速档再给 1 星（仅困难档有极速档）；
 * 0 失误额外 +1 星，上限是该关满星（初级 3 / 高级 4 / 困难 5）。
 * 满星因此只在零失误时拿得到，让「手速」和「精准」成为两条并行的追求路线。
 */
export const calcStars = (
  elapsed: number,
  errors: number,
  thresholds: LevelThresholds,
  maxStars: number
): number => {
  let stars = 1;
  if (elapsed <= thresholds.gold) {
    stars = 3;
  } else if (elapsed <= thresholds.silver) {
    stars = 2;
  }
  if (thresholds.platinum !== null && elapsed <= thresholds.platinum) {
    stars = 4;
  }
  if (errors === 0) {
    stars += 1;
  }
  return Math.min(maxStars, stars);
};
