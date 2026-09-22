import dayjs from 'dayjs';

/**
 * 用时格式化
 * @param ms 毫秒
 * @param digits 小数位：进行中计时用 1 位，结算用 2 位
 */
export const formatSeconds = (ms: number, digits = 2): string => `${(ms / 1000).toFixed(digits)}″`;

/** 记录时间格式化：MM-DD HH:mm */
export const formatRecordTime = (iso: string): string => dayjs(iso).format('MM-DD HH:mm');

/** 今日日期，用于统计今日最佳 */
export const todayKey = (): string => dayjs().format('YYYY-MM-DD');

/** 判断某个 ISO 时间是否属于今天 */
export const isToday = (iso: string): boolean => dayjs(iso).format('YYYY-MM-DD') === todayKey();
