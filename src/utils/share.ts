import { getLevelById, LEVELS, MAX_STARS } from '@/data/levels';
import { SONGS, getSongOrDefault } from '@/data/songs';
import { CLASSICS } from '@/data/classics';
import { GRADE_LABELS } from '@/utils/scoring';
import { formatSeconds } from '@/utils/format';
import type { PerformanceGrade } from '@/types/game';

/**
 * 分享内容生成（纯函数层）。
 *
 * 为什么需要它：微信小程序右上角菜单的「转发给朋友 / 分享到朋友圈」默认是灰的，
 * 只有页面定义了 onShareAppMessage / onShareTimeline 才可点（文案：「当前页面未设置分享」）。
 * 这里只产出数据，不碰任何平台 API —— 由各页面用 useShareAppMessage / useShareTimeline 接上。
 *
 * 两套返回结构不能混：
 *   ShareMessage  —— 转发给朋友，可以带 path
 *   ShareTimeline —— 分享到朋友圈，只能 title / query / imageUrl（单页模式，不能带 path）
 */

export const APP_NAME = '眼力大作战';
export const HOME_PATH = '/pages/home/index';

export interface ShareMessage {
  title: string;
  path: string;
}

export interface ShareTimeline {
  title: string;
  /** 不带前导 `?`，微信会拼到当前页路径后面 */
  query: string;
}

const GAME_PATH = (levelId: string) => `/pages/game/index?levelId=${encodeURIComponent(levelId)}`;

const TITLE_LIMIT = 30;

/** 朋友圈标题在卡片上只有一行，超出部分会被截断，这里主动收口 */
const clip = (title: string) => (title.length > TITLE_LIMIT ? `${title.slice(0, TITLE_LIMIT)}…` : title);

/** 结算参数来自页面 query，可能是空串/NaN，分享文案不能把 NaN 发出去 */
const safeInt = (value: number) => (Number.isFinite(value) ? Math.max(0, Math.round(value)) : 0);

/** 首页：讲清楚「这是什么」，落到开局 */
export const getHomeShare = (): ShareMessage => ({
  title: `${APP_NAME} · 一张乐谱纸，一场属于你的演奏`,
  path: HOME_PATH
});

export const getHomeTimeline = (): ShareTimeline => ({
  title: clip(`按顺序点数字，一边点一边弹完一首曲子 · ${APP_NAME}`),
  query: ''
});

/** 关卡：拉新用「你走到第几卷」做钩子 */
export const getLevelsShare = (): ShareMessage => ({
  title: `三卷 ${LEVELS.length} 关，看看你的眼力能走到第几关`,
  path: HOME_PATH
});

export const getLevelsTimeline = (): ShareTimeline => ({
  title: clip(`三卷 ${LEVELS.length} 关 · 按顺序点数字，越点越快`),
  query: ''
});

/** 曲集：卖点是「点格子的声音就是旋律」 */
export const getCollectionShare = (): ShareMessage => ({
  title: `${SONGS.length} 首原创曲，点格子的声音就是旋律`,
  path: HOME_PATH
});

export const getCollectionTimeline = (): ShareTimeline => ({
  title: clip(`点格子点出一首曲子 · ${CLASSICS.length} 首名曲按战绩解锁`),
  query: ''
});

/** 我的：拿自己的进度当钩子 */
export const getMineShare = (input: { totalStars: number; cleared: number }): ShareMessage => ({
  title: `我已经攒到 ${input.totalStars}/${MAX_STARS} 星、通关 ${input.cleared} 关，你呢？`,
  path: HOME_PATH
});

export const getMineTimeline = (input: { totalStars: number; cleared: number }): ShareTimeline => ({
  title: clip(`${input.totalStars} 星 · ${input.cleared} 关 · 来比比眼力`),
  query: ''
});

/** 对局页：邀请朋友直接进同一关，比分享进度更有转化 */
export const getGameShare = (levelId: string): ShareMessage => {
  const level = getLevelById(levelId);
  if (!level) {
    return { title: `${APP_NAME} · 按顺序点数字`, path: HOME_PATH };
  }
  const song = getSongOrDefault(level.songId);
  const modeHint =
    level.mode === 'reverse' ? '倒序点' : level.mode === 'alternate' ? '双色交替点' : '按顺序点';
  return {
    title: `《${song.title}》第 ${level.globalIndex} 关 · ${level.size}×${level.size}，${modeHint}，看多久点完`,
    path: GAME_PATH(level.id)
  };
};

export const getGameTimeline = (levelId: string): ShareTimeline => {
  const level = getLevelById(levelId);
  // 关卡参数缺失时不能把空 levelId 拼进 query —— 朋友圈进来会落到「关卡不存在」
  if (!level) {
    return { title: clip(`${APP_NAME} · 按顺序点数字`), query: '' };
  }
  return { title: clip(getGameShare(level.id).title), query: `levelId=${encodeURIComponent(level.id)}` };
};

/** 排行榜占位页：内容还没做，只保证菜单不灰 */
export const getRankShare = (): ShareMessage => ({
  title: `${APP_NAME} · 云端排行榜开发中`,
  path: HOME_PATH
});

export interface ResultShareInput {
  levelId: string;
  stars: number;
  elapsed: number;
  errors: number;
  done: number;
  grade: PerformanceGrade | null;
  failed: boolean;
}

/**
 * 结算页是传播主战场：转发带完整成绩参数，朋友点开直接看到你的成绩卡；
 * 但 path 指向对局页 —— 朋友看到成绩的第一反应是「我也来」，不是「看你」。
 */
export const getResultShare = (input: ResultShareInput): ShareMessage => {
  const level = getLevelById(input.levelId);
  if (!level) {
    return { title: `${APP_NAME} · 按顺序点数字`, path: HOME_PATH };
  }
  const song = getSongOrDefault(level.songId);
  const place = `《${song.title}》第 ${level.globalIndex} 关`;

  if (input.failed) {
    return {
      title: `${place}差一点就点完了，你来试试？`,
      path: GAME_PATH(level.id)
    };
  }

  const gradeText = input.grade ? ` · ${GRADE_LABELS[input.grade]}` : '';
  return {
    title: `${place}拿下 ${safeInt(input.stars)}★${gradeText}，用时 ${formatSeconds(safeInt(input.elapsed), 1)}`,
    path: GAME_PATH(level.id)
  };
};

export const getResultTimeline = (input: ResultShareInput): ShareTimeline => {
  const level = getLevelById(input.levelId);
  if (!level) {
    return { title: clip(`${APP_NAME} · 按顺序点数字`), query: '' };
  }
  const song = getSongOrDefault(level.songId);
  const place = `《${song.title}》第 ${level.globalIndex} 关`;

  const title = input.failed
    ? `${place}差一点就点完了，你来试试？`
    : `${place} ${safeInt(input.stars)}★ 用时 ${formatSeconds(safeInt(input.elapsed), 1)}`;

  // 朋友圈只能靠 query 传参，且落在结算页 —— 参数必须给全，否则朋友看到的是「成绩读取失败」
  const query = [
    `levelId=${encodeURIComponent(level.id)}`,
    `elapsed=${safeInt(input.elapsed)}`,
    `errors=${safeInt(input.errors)}`,
    `stars=${safeInt(input.stars)}`,
    `done=${safeInt(input.done)}`,
    `grade=${input.grade ?? ''}`,
    `isBest=0`,
    `failed=${input.failed ? 1 : 0}`
  ].join('&');

  return { title: clip(title), query };
};
