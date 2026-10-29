import { LevelThresholds, PerformanceGrade } from '@/types/game';

/** 每次点错的罚时（毫秒）：乱点的时间成本必须高于收益 */
export const ERROR_PENALTY = 150;

/** 节奏判定窗口（毫秒）：与目标音符间隔的偏差 */
export const PERFECT_WINDOW = 80;
export const GOOD_WINDOW = 160;

/** 按错误次数换算罚时 */
export const calcPenalty = (errors: number): number => errors * ERROR_PENALTY;

/**
 * 演奏评级：只看节奏贴合度（Perfect 占比），**不影响星级**。
 * 星级衡量"快不快、准不准"，评级衡量"弹得好不好听"，两条线互不干扰。
 */
export const calcPerformanceGrade = (
  perfect: number,
  good: number,
  total: number
): PerformanceGrade => {
  if (total <= 0) {
    return 'C';
  }
  // Good 按半个 Perfect 计入，避免"准但差一点点"被一刀切
  const score = (perfect + good * 0.5) / total;
  if (score >= 0.7) {
    return 'S';
  }
  if (score >= 0.45) {
    return 'A';
  }
  if (score >= 0.25) {
    return 'B';
  }
  return 'C';
};

export const GRADE_LABELS: Record<PerformanceGrade, string> = {
  S: '完美演奏',
  A: '流畅',
  B: '尚可',
  C: '自由发挥'
};

/**
 * 星级判定：
 * 用时达标给 1~3 星，达成极速档再给 1 星（仅长调卷有极速档）；
 * 0 失误额外 +1 星，上限是该关满星（小令 3 / 中调 4 / 长调 5）。
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
