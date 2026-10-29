/**
 * 用时格式化
 * @param ms 毫秒
 * @param digits 小数位：进行中计时用 1 位，结算用 2 位
 */
export const formatSeconds = (ms: number, digits = 2): string => `${(ms / 1000).toFixed(digits)}″`;
