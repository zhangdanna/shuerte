import { CardStyle, ChapterConfig, GameMode, LevelConfig, LevelThresholds } from '@/types/game';
import zodiacShapes from '@/data/zodiacShapes.json';

/**
 * 星级阈值（毫秒）与限时（毫秒），均按尺寸查表。
 * 阈值口径参考舒尔特方格训练标准：5×5（25 格）成人熟练约 20 秒、达标约 30 秒。
 * 限时给到达标的 1.5~2 倍，留出手滑与思考空间——限时是「别卡住」的兜底，不是主要压力来源。
 */
const SIZE_THRESHOLDS: Record<number, LevelThresholds> = {
  3: { gold: 6000, silver: 9000 },
  4: { gold: 12000, silver: 18000 },
  5: { gold: 25000, silver: 36000 },
  6: { gold: 42000, silver: 58000 },
  7: { gold: 65000, silver: 88000 },
  8: { gold: 95000, silver: 125000 }
};

/** 每关限时（毫秒）：6×6 起大尺寸明显更吃时间，在基础表上各加 10 秒 */
const SIZE_TIME_LIMITS: Record<number, number> = {
  3: 15000,
  4: 25000,
  5: 40000,
  6: 70000,
  7: 95000,
  8: 125000
};

/** 尺寸阶梯：3×3 起步，逐关 +1 到 8×8 */
const SIZE_STEPS: number[] = [3, 4, 5, 6, 7, 8];

/**
 * 每档两轮：第一轮正序走完 3×3 → 8×8，第二轮尺寸相同但换变体玩法，
 * 所以档内 12 关没有「同一个关卡出现两次」的重复感。
 */
const CYCLES_PER_TIER = 2;

/**
 * 三档难度（界面上只呈现难度档位）。
 * 卡片造型是该档的固定皮肤，不在 UI 上作为分类展示：
 *   初级 = 方形卡，高级 = 圆形卡（沿圆周分区），困难 = 生肖卡（生肖轮廓内划分格子）。
 */
const TIER_BLUEPRINTS: Array<{
  title: string;
  /** 难度档的节奏说明，拼在尺寸区间后面 */
  pace: string;
  cardStyle: CardStyle;
  starGate: number;
  /** 每关满星：初级 3 / 高级 4 / 困难 5 */
  maxStars: number;
  /** 第二轮（后 6 关）的变体玩法 */
  variant: GameMode;
}> = [
  { title: '初级', pace: '节奏舒缓', cardStyle: 'square', starGate: 0, maxStars: 3, variant: 'reverse' },
  { title: '高级', pace: '标准计时', cardStyle: 'circle', starGate: 8, maxStars: 4, variant: 'reverse' },
  { title: '困难', pace: '极限计时', cardStyle: 'zodiac', starGate: 16, maxStars: 5, variant: 'alternate' }
];

/** 极速档系数：困难档在 gold 阈值上再压 15%，是第 5 颗星的唯一入口 */
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
      // 生肖档共 12 关，正好把 12 生肖依次走一遍
      zodiacIndex: chapter.cardStyle === 'zodiac' ? (index - 1) % zodiacShapes.length : null,
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

export const getLevelById = (id: string): LevelConfig | undefined => LEVELS.find((level) => level.id === id);

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
