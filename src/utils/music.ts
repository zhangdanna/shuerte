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
 *
 * 双色交替关：奇数格走旋律轨、偶数格走低音轨 —— 红色旋律、蓝色伴奏，
 * 交替点击天然就是「双手交替」。
 *
 * **两条轨必须各有各的指针**。旧实现两条轨共用一个下标（都取 step-1），
 * 结果偶数格把旋律的下标也一起推走了：旋律的第 2、4、6… 个音永远不响，
 * 听到的是一条「隔一个音跳一下」的残旋律。现在第 k 次交替（k 从 0 起）
 * 分别推进旋律与低音，两条线都是连续的。
 */
export const getNoteForValue = (song: SongConfig, level: LevelConfig, value: number): number => {
  if (level.mode === 'alternate') {
    const isMelody = value % 2 === 1;
    const step = Math.floor((value - 1) / 2);
    const line = isMelody || song.bass.length === 0 ? song.melody : song.bass;
    const index = Math.min(Math.max(step, 0), line.length - 1);
    return line[index] ?? 60;
  }
  const step = getSongStep(level, value);
  const index = Math.min(Math.max(step - 1, 0), song.melody.length - 1);
  return song.melody[index] ?? 60;
};

/** 每音一拍的间隔（毫秒）：节奏评级的基准，也是回放速度 */
export const getBeatInterval = (song: SongConfig): number => 60000 / song.bpm;
