import type { ClassicSong } from '@/types/game';

/**
 * 名曲拾遗：六首公有领域作品，靠战绩解锁，只进曲集、不进关卡。
 *
 * 版权说明（每一首都要能回答"凭什么能用"）：
 *   旋律本身：作者逝世逾 70 年（中国逾 50 年），已进入公有领域。
 *   和声与配器：本文件全部自行编配，不引用任何现成录音、不照抄任何乐谱版本的编配。
 *   因此本项目对这些曲目的编配享有权利，也不侵犯他人。
 * 详细判定见 docs/audio-license.md；改这里的旋律后跑 node scripts/analyze-songs.js classics。
 *
 * 记谱约定与 songs.ts 一致：16 小节 × 4 拍 = 64 个音，每音一拍，
 * 关卡尺寸越大弹到的音越多（名曲在曲集里始终整首播放）。
 */

/** 低音轨：走动低音（根–五–根–三），和生成曲库用的是同一套写法 */
const walkingBass = (chords: number[][]): number[] =>
  chords.reduce<number[]>((acc, chord) => {
    acc.push(chord[0] - 12, chord[2] - 12, chord[0] - 12, chord[1] - 12);
    return acc;
  }, []);

/** 三和弦速记：只写和弦根音与性质，具体音高由这里统一摆位 */
const CHORD = {
  // C 大调体系
  C: [48, 52, 55],
  Dm: [50, 53, 57],
  Em: [52, 55, 59],
  F: [53, 57, 60],
  G: [55, 59, 62],
  Am: [45, 48, 52],
  // G 大调体系
  G_low: [43, 47, 50],
  D_of_g: [50, 54, 57],
  // D 大调体系
  D: [50, 54, 57],
  A: [45, 49, 52],
  Bm: [47, 50, 54],
  Fsm: [42, 46, 49],
  G_of_d: [43, 47, 50],
  // a 小调体系
  E: [52, 56, 59]
};

export const CLASSICS: ClassicSong[] = [
  {
    id: 'c1',
    title: '欢乐颂',
    tier: 0,
    bpm: 100,
    key: 'C 大调',
    style: 'piano',
    composer: '贝多芬 · 1824',
    credit: '公有领域 · 自行记谱编配',
    unlock: { kind: 'stars', value: 24 },
    melody: [
      64, 64, 65, 67, 67, 65, 64, 62, 60, 60, 62, 64, 64, 62, 62, 62,
      64, 64, 65, 67, 67, 65, 64, 62, 60, 60, 62, 64, 62, 60, 60, 60,
      62, 62, 64, 60, 62, 64, 65, 64, 60, 62, 64, 67, 65, 64, 62, 60,
      64, 64, 65, 67, 67, 65, 64, 62, 60, 60, 62, 64, 64, 62, 60, 60
    ],
    chords: [
      CHORD.C, CHORD.G, CHORD.C, CHORD.G,
      CHORD.C, CHORD.G, CHORD.C, CHORD.C,
      CHORD.G, CHORD.C, CHORD.C, CHORD.G,
      CHORD.C, CHORD.G, CHORD.C, CHORD.C
    ],
    bass: walkingBass([
      CHORD.C, CHORD.G, CHORD.C, CHORD.G,
      CHORD.C, CHORD.G, CHORD.C, CHORD.C,
      CHORD.G, CHORD.C, CHORD.C, CHORD.G,
      CHORD.C, CHORD.G, CHORD.C, CHORD.C
    ])
  },
  {
    id: 'c2',
    title: '小步舞曲',
    tier: 0,
    bpm: 108,
    key: 'G 大调',
    style: 'musicbox',
    composer: '佩措尔德 · c.1720',
    credit: '公有领域 · 自行记谱编配',
    unlock: { kind: 'stars', value: 48 },
    melody: [
      74, 67, 69, 71, 72, 74, 67, 67, 76, 72, 74, 76, 78, 67, 67, 67,
      72, 74, 72, 71, 69, 71, 69, 67, 66, 67, 69, 71, 67, 67, 67, 67,
      71, 72, 74, 76, 74, 72, 71, 69, 71, 69, 67, 66, 67, 69, 71, 72,
      74, 67, 69, 71, 72, 74, 67, 67, 76, 72, 74, 72, 74, 67, 67, 67
    ],
    chords: [
      CHORD.G_low, CHORD.G_low, CHORD.C, CHORD.D_of_g,
      CHORD.C, CHORD.Am, CHORD.D_of_g, CHORD.G_low,
      CHORD.G_low, CHORD.Am, CHORD.D_of_g, CHORD.G_low,
      CHORD.G_low, CHORD.G_low, CHORD.C, CHORD.G_low
    ],
    bass: walkingBass([
      CHORD.G_low, CHORD.G_low, CHORD.C, CHORD.D_of_g,
      CHORD.C, CHORD.Am, CHORD.D_of_g, CHORD.G_low,
      CHORD.G_low, CHORD.Am, CHORD.D_of_g, CHORD.G_low,
      CHORD.G_low, CHORD.G_low, CHORD.C, CHORD.G_low
    ])
  },
  {
    id: 'c3',
    title: '致爱丽丝',
    tier: 0,
    bpm: 76,
    key: 'a 小调',
    style: 'piano',
    composer: '贝多芬 · 1810',
    credit: '公有领域 · 自行记谱编配',
    unlock: { kind: 'stars', value: 72 },
    melody: [
      76, 75, 76, 75, 76, 71, 74, 72, 69, 60, 64, 69, 71, 64, 68, 71,
      72, 64, 76, 75, 76, 75, 76, 71, 74, 72, 69, 69, 69, 64, 69, 72,
      71, 71, 68, 71, 72, 72, 69, 72, 74, 74, 71, 74, 76, 76, 72, 76,
      76, 75, 76, 75, 76, 71, 74, 72, 69, 71, 72, 74, 76, 72, 69, 69
    ],
    chords: [
      CHORD.Am, CHORD.E, CHORD.Am, CHORD.E,
      CHORD.Am, CHORD.Am, CHORD.Am, CHORD.Am,
      CHORD.E, CHORD.Am, CHORD.Dm, CHORD.E,
      CHORD.Am, CHORD.Am, CHORD.Dm, CHORD.Am
    ],
    bass: walkingBass([
      CHORD.Am, CHORD.E, CHORD.Am, CHORD.E,
      CHORD.Am, CHORD.Am, CHORD.Am, CHORD.Am,
      CHORD.E, CHORD.Am, CHORD.Dm, CHORD.E,
      CHORD.Am, CHORD.Am, CHORD.Dm, CHORD.Am
    ])
  },
  {
    id: 'c4',
    title: '卡农',
    tier: 0,
    bpm: 72,
    key: 'D 大调',
    style: 'piano',
    composer: '帕赫贝尔 · c.1680',
    credit: '公有领域 · 自行记谱编配',
    unlock: { kind: 'gold', value: 1 },
    melody: [
      78, 76, 74, 73, 71, 69, 71, 73, 74, 73, 71, 69, 66, 67, 66, 64,
      66, 69, 74, 69, 67, 71, 74, 71, 67, 71, 74, 71, 69, 73, 76, 73,
      78, 76, 74, 73, 71, 69, 71, 73, 74, 73, 71, 69, 66, 69, 73, 69,
      67, 71, 74, 71, 67, 71, 74, 71, 69, 73, 76, 73, 74, 74, 74, 74
    ],
    chords: [
      CHORD.D, CHORD.A, CHORD.Bm, CHORD.Fsm,
      CHORD.D, CHORD.G_of_d, CHORD.G_of_d, CHORD.A,
      CHORD.D, CHORD.A, CHORD.Bm, CHORD.Fsm,
      CHORD.D, CHORD.G_of_d, CHORD.A, CHORD.D
    ],
    bass: walkingBass([
      CHORD.D, CHORD.A, CHORD.Bm, CHORD.Fsm,
      CHORD.D, CHORD.G_of_d, CHORD.G_of_d, CHORD.A,
      CHORD.D, CHORD.A, CHORD.Bm, CHORD.Fsm,
      CHORD.D, CHORD.G_of_d, CHORD.A, CHORD.D
    ])
  },
  {
    id: 'c5',
    title: '绿袖子',
    tier: 0,
    bpm: 88,
    key: 'a 小调',
    style: 'epiano',
    composer: '英格兰民谣 · 16 世纪',
    credit: '公有领域 · 自行记谱编配',
    unlock: { kind: 'stars', value: 96 },
    melody: [
      69, 72, 74, 76, 77, 76, 74, 71, 67, 69, 71, 72, 69, 69, 68, 69,
      71, 72, 74, 76, 77, 76, 74, 71, 67, 69, 71, 72, 69, 69, 69, 69,
      76, 77, 76, 74, 72, 74, 72, 71, 69, 71, 72, 74, 71, 69, 67, 69,
      72, 74, 76, 77, 76, 74, 72, 71, 69, 71, 72, 74, 69, 69, 69, 69
    ],
    chords: [
      CHORD.Am, CHORD.C, CHORD.G, CHORD.E,
      CHORD.Am, CHORD.C, CHORD.G, CHORD.Am,
      CHORD.C, CHORD.G, CHORD.Am, CHORD.E,
      CHORD.Am, CHORD.C, CHORD.G, CHORD.Am
    ],
    bass: walkingBass([
      CHORD.Am, CHORD.C, CHORD.G, CHORD.E,
      CHORD.Am, CHORD.C, CHORD.G, CHORD.Am,
      CHORD.C, CHORD.G, CHORD.Am, CHORD.E,
      CHORD.Am, CHORD.C, CHORD.G, CHORD.Am
    ])
  },
  {
    id: 'c6',
    title: '茉莉花',
    tier: 0,
    bpm: 84,
    key: 'C 大调',
    style: 'musicbox',
    composer: '江苏民歌 · 清代',
    credit: '公有领域 · 自行记谱编配',
    unlock: { kind: 'grade', grade: 'S', value: 8 },
    melody: [
      64, 64, 67, 69, 72, 72, 69, 67, 67, 69, 67, 64, 62, 64, 62, 60,
      64, 64, 67, 69, 72, 72, 69, 67, 69, 72, 74, 72, 69, 67, 67, 67,
      72, 74, 72, 69, 67, 69, 71, 72, 74, 72, 69, 67, 69, 67, 64, 62,
      64, 67, 69, 72, 74, 72, 69, 67, 64, 64, 62, 60, 60, 60, 60, 60
    ],
    chords: [
      CHORD.C, CHORD.Am, CHORD.C, CHORD.G,
      CHORD.C, CHORD.Am, CHORD.F, CHORD.G,
      CHORD.F, CHORD.G, CHORD.G, CHORD.Am,
      CHORD.C, CHORD.G, CHORD.C, CHORD.C
    ],
    bass: walkingBass([
      CHORD.C, CHORD.Am, CHORD.C, CHORD.G,
      CHORD.C, CHORD.Am, CHORD.F, CHORD.G,
      CHORD.F, CHORD.G, CHORD.G, CHORD.Am,
      CHORD.C, CHORD.G, CHORD.C, CHORD.C
    ])
  }
];

export const getClassicById = (id: string): ClassicSong | undefined =>
  CLASSICS.find((song) => song.id === id);
