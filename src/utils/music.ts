import { LevelConfig, SongConfig } from '@/types/game';

/**
 * 数字 → 乐谱位置的映射。
 *
 * 这是整个音乐系统的地基：**乐谱永远正序，只有数字的排列在变**。
 * 倒序关如果把音乐倒放，玩家听到的就是一串无意义的音符；
 * 反向映射之后，从 N² 点回 1 依然是 C C G G A A G 这样正着走的旋律。
 */
const getSongStep = (level: LevelConfig, value: number): number =>
  level.mode === 'reverse' ? level.total - value + 1 : value;

/**
 * 取该格子对应的音高。
 * 双色交替关：奇数格走旋律轨、偶数格走低音轨 —— 红色旋律、蓝色伴奏，
 * 交替点击天然就是"双手交替"。
 */
export const getNoteForValue = (song: SongConfig, level: LevelConfig, value: number): number => {
  const step = getSongStep(level, value);
  const useBass = level.mode === 'alternate' && value % 2 === 0 && song.bass.length > 0;
  const line = useBass ? song.bass : song.melody;
  const index = Math.min(Math.max(step - 1, 0), line.length - 1);
  return line[index] ?? 60;
};

/** 每音一拍的间隔（毫秒）：节奏评级的基准，也是回放速度 */
export const getBeatInterval = (song: SongConfig): number => 60000 / song.bpm;
