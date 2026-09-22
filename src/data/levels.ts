import { CardStyle, ChapterConfig, LevelConfig, LevelThresholds } from '@/types/game';
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

const SIZE_TIME_LIMITS: Record<number, number> = {
  3: 15000,
  4: 25000,
  5: 40000,
  6: 60000,
  7: 85000,
  8: 115000
};

/** 尺寸阶梯：3×3 起步，逐关 +1 到 8×8 */
const SIZE_STEPS: number[] = [3, 4, 5, 6, 7, 8];

/** 每档把尺寸阶梯走两遍：第二遍尺寸相同、时间标准更紧，形成档内递进 */
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
}> = [
  { title: '初级', pace: '节奏舒缓', cardStyle: 'square', starGate: 0 },
  { title: '高级', pace: '标准计时', cardStyle: 'circle', starGate: 8 },
  { title: '困难', pace: '极限计时', cardStyle: 'zodiac', starGate: 16 }
];

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

const buildLevels = (chapter: ChapterConfig, tierIndex: number): LevelConfig[] =>
  Array.from({ length: LEVELS_PER_TIER }, (_, i) => {
    const index = i + 1;
    const size = SIZE_STEPS[i % SIZE_STEPS.length];
    const cycleInTier = Math.floor(i / SIZE_STEPS.length) + 1;
    const globalCycle = tierIndex * CYCLES_PER_TIER + cycleInTier;
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
      // 生肖档共 12 关，正好把 12 生肖依次走一遍
      zodiacIndex: chapter.cardStyle === 'zodiac' ? (index - 1) % zodiacShapes.length : null,
      thresholds: {
        gold: Math.round(thresholds.gold * factor),
        silver: Math.round(thresholds.silver * factor)
      },
      timeLimit: Math.round(timeLimit * factor)
    };
  });

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

/** 全部关卡拿满三星时的星星总数 */
export const MAX_STARS = LEVELS.length * 3;
