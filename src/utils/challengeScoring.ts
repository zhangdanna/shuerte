import { MemoryLevel } from '@/types/challenge';

/**
 * 挑战版星级：与经典版分开算，不复用 `utils/scoring.ts`。
 *
 * 经典版的星级是「速度 + 失误」的函数，因为搜索速度就是能力本身；
 * 挑战版的星级必须把「窥看」算进去 —— 看过答案还拿三星，这个三星就不值钱了。
 *
 *   三星：零失误 + 没窥看 + 快于 gold
 *   二星：失误 ≤ 1 且快于 silver（用过窥看也能拿到二星）
 *   一星：通关即得
 */
export const calcMemoryStars = (
  elapsed: number,
  errors: number,
  peeked: boolean,
  level: MemoryLevel
): number => {
  if (!peeked && errors === 0 && elapsed <= level.gold) {
    return 3;
  }
  if (errors <= 1 && elapsed <= level.silver) {
    return 2;
  }
  return 1;
};

/** 星级说明：结算页用一句话解释「为什么少一颗星」，比只显示星星有用 */
export const getStarHint = (stars: number, errors: number, peeked: boolean): string => {
  if (stars === 3) {
    return '一眼记全，全无失误';
  }
  if (stars === 2) {
    return peeked ? '窥看过一次，最多两星' : `点错 ${errors} 次，满星要零失误`;
  }
  return '记忆断裂过，但走完了全程';
};
