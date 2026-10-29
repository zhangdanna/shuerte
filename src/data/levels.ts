import { CardStyle, ChapterConfig, GameMode, LevelConfig, LevelThresholds } from '@/types/game';
import patternShapes from '@/data/patternShapes.json';
import { getSongForLevel } from '@/data/songs';

/**
 * 星级阈值（毫秒）与限时（毫秒），均按尺寸查表。
 * 阈值口径参考舒尔特方格训练标准：5×5（25 格）成人熟练约 20 秒、达标约 30 秒。
 * 限时由 silver 阈值推导（见下方 SIZE_TIME_LIMITS），不再单独拍脑袋定。
 */
const SIZE_THRESHOLDS: Record<number, Omit<LevelThresholds, 'platinum'>> = {
  3: { gold: 5000, silver: 8000 },
  4: { gold: 10000, silver: 15000 },
  5: { gold: 22000, silver: 32000 },
  6: { gold: 38000, silver: 55000 },
  7: { gold: 58000, silver: 82000 },
  8: { gold: 82000, silver: 115000 }
};

/**
 * 每关限时（毫秒）= 达标线（silver）× 1.15，3×3 例外给到 ×1.5（新手第一关，别一上来就失败）。
 * 旧表是「达标线 × 1.5~2」，等于怎么点都能过 —— 限时形同虚设，故收紧到「超过达标线 15% 就失败」。
 */
const SIZE_TIME_LIMITS: Record<number, number> = {
  3: 12000,
  4: 17000,
  5: 37000,
  6: 63000,
  7: 94000,
  8: 132000
};

/** 尺寸阶梯：3×3 起步，逐关 +1 到 8×8 */
const SIZE_STEPS: number[] = [3, 4, 5, 6, 7, 8];

/**
 * 每档两轮：第一轮正序走完 3×3 → 8×8，第二轮尺寸相同但换变体玩法，
 * 所以档内 12 关没有「同一个关卡出现两次」的重复感。
 */
const CYCLES_PER_TIER = 2;

/**
 * 三档难度（界面上只呈现曲体档位，取自词乐/民歌的曲式长度：小令短、中调中、长调长）。
 * 卡片造型是该档的固定皮肤，不在 UI 上作为分类展示：
 *   小令 = 方形卡，中调 = 圆形卡（沿圆周分区），长调 = 图案卡（不规则图案轮廓内划分格子）。
 */
const TIER_BLUEPRINTS: Array<{
  title: string;
  /** 档位气质，拼在尺寸区间后面 */
  pace: string;
  cardStyle: CardStyle;
  starGate: number;
  /** 每关满星：小令 3 / 中调 4 / 长调 5 */
  maxStars: number;
  /** 第二轮（后 6 关）的变体玩法 */
  variant: GameMode;
}> = [
  { title: '小令', pace: '纸面方寸', cardStyle: 'square', starGate: 0, maxStars: 3, variant: 'reverse' },
  { title: '中调', pace: '圆盘流转', cardStyle: 'circle', starGate: 8, maxStars: 4, variant: 'reverse' },
  { title: '长调', pace: '异形拼花', cardStyle: 'pattern', starGate: 16, maxStars: 5, variant: 'alternate' }
];

/** 极速档系数：长调档在 gold 阈值上再压 15%，是第 5 颗星的唯一入口 */
const PLATINUM_RATIO = 0.85;

/** 每档关数 = 尺寸阶梯 × 循环数 */
const LEVELS_PER_TIER = SIZE_STEPS.length * CYCLES_PER_TIER;

/** 难度系数：每推进一个尺寸循环收紧 3%，最低压到 70% */
const cycleFactor = (globalCycle: number): number => Math.max(0.7, 1 - 0.03 * (globalCycle - 1));

const buildChapter = (tierIndex: number): ChapterConfig => {
  const blueprint = TIER_BLUEPRINTS[tierIndex];
  const first = SIZE_STEPS[0];
  const last = SIZE_STEPS[SIZE_STEPS.length - 1];
  return {
    id: tierIndex + 1,
    title: blueprint.title,
    subtitle: `${first}×${first} → ${last}×${last} · ${blueprint.pace}`,
    cardStyle: blueprint.cardStyle,
    sizes: SIZE_STEPS,
    starGate: blueprint.starGate
  };
};

const buildLevels = (chapter: ChapterConfig, tierIndex: number): LevelConfig[] => {
  const blueprint = TIER_BLUEPRINTS[tierIndex];
  return Array.from({ length: LEVELS_PER_TIER }, (_, i) => {
    const index = i + 1;
    const size = SIZE_STEPS[i % SIZE_STEPS.length];
    // 0 = 第一轮（正序），1 = 第二轮（变体玩法）
    const pass = Math.floor(i / SIZE_STEPS.length);
    const globalCycle = tierIndex * CYCLES_PER_TIER + pass + 1;
    const factor = cycleFactor(globalCycle);
    const thresholds = SIZE_THRESHOLDS[size];
    const timeLimit = SIZE_TIME_LIMITS[size];
    // 配置错误属于不可恢复的不变量破坏，直接抛出让问题立刻暴露
    if (!thresholds || !timeLimit) {
      throw new Error(`[Levels] 尺寸 ${size} 缺少阈值或限时配置（难度档 ${chapter.title}）`);
    }
    return {
      id: `${chapter.id}-${index}`,
      chapterId: chapter.id,
      chapterTitle: chapter.title,
      index,
      globalIndex: tierIndex * LEVELS_PER_TIER + index,
      size,
      total: size * size,
      cardStyle: chapter.cardStyle,
      mode: pass === 0 ? 'forward' : blueprint.variant,
      // 每档两首曲子：前 6 关弹曲 A，后 6 关（变体玩法）弹曲 B
      songId: getSongForLevel(tierIndex, pass).id,
      // 图案档共 12 关，正好把 12 个图案依次走一遍
      patternIndex: chapter.cardStyle === 'pattern' ? (index - 1) % patternShapes.length : null,
      maxStars: blueprint.maxStars,
      thresholds: {
        gold: Math.round(thresholds.gold * factor),
        silver: Math.round(thresholds.silver * factor),
        // 只有需要满星 5 的档位配极速档，其余档位为 null（判定时直接跳过）
        platinum:
          blueprint.maxStars >= 5 ? Math.round(thresholds.gold * factor * PLATINUM_RATIO) : null
      },
      timeLimit: Math.round(timeLimit * factor)
    };
  });
};

export const CHAPTERS: ChapterConfig[] = TIER_BLUEPRINTS.map((_, tierIndex) => buildChapter(tierIndex));

export const LEVELS: LevelConfig[] = CHAPTERS.reduce<LevelConfig[]>(
  (acc, chapter, tierIndex) => acc.concat(buildLevels(chapter, tierIndex)),
  []
);

/** 指引关 id：不属于任何一轮，也不进 LEVELS（不占星、不进曲集、不影响解锁门槛） */
const GUIDE_LEVEL_ID = 'guide';

/**
 * 引子（指引关）：第一关之前的教学局。
 * 3×3、无评星、不写档、不会超时失败 —— 它只负责把「按顺序点数字」这件事讲明白，
 * 所以首页不再需要常驻的文字说明。通关后只解锁第一关。
 */
export const GUIDE_LEVEL: LevelConfig = {
  id: GUIDE_LEVEL_ID,
  chapterId: 0,
  chapterTitle: '引子',
  tutorial: true,
  index: 0,
  globalIndex: 0,
  size: 3,
  total: 9,
  cardStyle: 'square',
  patternIndex: null,
  mode: 'forward',
  songId: getSongForLevel(0, 0).id,
  maxStars: 0,
  thresholds: { gold: 0, silver: 0, platinum: null },
  // 教学局不该被时间逼死：9 个数字给足 60 秒，且引擎对 tutorial 关不做超时判定
  timeLimit: 60000
};

export const getLevelById = (id: string): LevelConfig | undefined =>
  id === GUIDE_LEVEL_ID ? GUIDE_LEVEL : LEVELS.find((level) => level.id === id);

export const getChapterById = (id: number): ChapterConfig | undefined =>
  CHAPTERS.find((chapter) => chapter.id === id);

export const getChapterLevels = (chapterId: number): LevelConfig[] =>
  LEVELS.filter((level) => level.chapterId === chapterId);

/** 下一关：全部打完后返回 undefined */
export const getNextLevel = (id: string): LevelConfig | undefined => {
  const position = LEVELS.findIndex((level) => level.id === id);
  return position >= 0 ? LEVELS[position + 1] : undefined;
};

/** 全部关卡拿满（按各档满星 3/4/5）时的星星总数 */
export const MAX_STARS = LEVELS.reduce((sum, level) => sum + level.maxStars, 0);

/** 玩法文案：关卡卡片、对局页统一取这里 */
export const MODE_LABELS: Record<GameMode, string> = {
  forward: '正序',
  reverse: '倒序',
  alternate: '双色'
};
