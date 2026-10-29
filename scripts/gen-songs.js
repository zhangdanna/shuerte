/**
 * 生成曲库（原创旋律）并写入 src/data/songs.ts。
 *
 * 运行：node scripts/gen-songs.js
 *
 * 为什么程序生成：全部曲目为算法原创，零版权风险；且能保证「每首曲子前 9 个音
 * 是一个能认出来的动机」——3×3 首关就要让人听出旋律，惊喜感全在开局 15 秒。
 *
 * 结构：16 小节 × 每小节 4 个音 = 64 个音，每个音一拍。
 *       AABA 四句，每句 4 小节；前两句用 hook 模板保证可辨识。
 *       关卡 N×N 取前 N² 个音，所以 8×8 才听得到完整的一首。
 */
const fs = require('fs');
const path = require('path');

const SCALES = {
  major: [0, 2, 4, 5, 7, 9, 11],
  minor: [0, 2, 3, 5, 7, 8, 10]
};

/** 可辨识的开头动机（音级偏移，相对首小节和弦根音）；以级进为主，才唱得出来 */
const HOOKS = [
  [0, 0, 2, 2, 4, 4, 2, 0],
  [0, 2, 4, 4, 2, 0, 2, 4],
  [0, 2, 4, 5, 4, 2, 0, 2],
  [4, 4, 2, 2, 0, 0, 2, 2],
  [0, 0, 4, 4, 2, 2, 0, 0],
  [2, 2, 0, 2, 4, 4, 2, 0]
];

const SPECS = [
  { id: 's1a', title: '纸飞机', tier: 1, bpm: 84, root: 60, mode: 'major', style: 'musicbox', prog: [0, 4, 5, 3], seed: 11 },
  { id: 's1b', title: '雨后', tier: 1, bpm: 76, root: 62, mode: 'major', style: 'musicbox', prog: [0, 5, 3, 4], seed: 23 },
  { id: 's2a', title: '旋转木马', tier: 2, bpm: 100, root: 65, mode: 'major', style: 'piano', prog: [0, 3, 4, 0], seed: 37 },
  { id: 's2b', title: '旧唱片', tier: 2, bpm: 92, root: 57, mode: 'minor', style: 'piano', prog: [0, 5, 3, 4], seed: 41 },
  { id: 's3a', title: '齿轮', tier: 3, bpm: 118, root: 62, mode: 'minor', style: 'piano', prog: [0, 6, 5, 4], seed: 53 },
  { id: 's3b', title: '夜航', tier: 3, bpm: 112, root: 64, mode: 'minor', style: 'epiano', prog: [0, 3, 6, 4], seed: 67 }
];

const KEY_NAMES = { 60: 'C 大调', 62: 'D 大调', 65: 'F 大调', 64: 'E 大调', 57: 'a 小调' };

/** 确定性伪随机：同一 seed 永远产出同一首曲子 */
function mulberry32(seed) {
  let a = seed >>> 0;
  return function next() {
    a += 0x6d2b79f5;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const degToMidi = (root, scale, deg) => {
  const len = scale.length;
  const oct = Math.floor(deg / len);
  const idx = ((deg % len) + len) % len;
  return root + scale[idx] + 12 * oct;
};

const clampDeg = (deg) => Math.max(-3, Math.min(9, deg));

/** 生成 4 小节（16 音）的乐句 */
function buildPhrase(rng, prog, from, to) {
  const notes = [];
  let deg = from;
  for (let bar = 0; bar < 4; bar += 1) {
    const chordDeg = prog[bar % prog.length];
    const tones = [chordDeg, chordDeg + 2, chordDeg + 4];
    // 每小节第一拍落在离上一个音最近的和弦音上，保证和声不打架
    let pick = tones.reduce((best, cur) => (Math.abs(cur - deg) < Math.abs(best - deg) ? cur : best), tones[0]);
    pick = clampDeg(pick);
    notes.push(pick);
    deg = pick;
    for (let beat = 1; beat < 4; beat += 1) {
      const dice = rng();
      let move = dice < 0.3 ? 1 : dice < 0.55 ? -1 : dice < 0.7 ? 2 : dice < 0.82 ? -2 : 0;
      let next = clampDeg(deg + move);
      // 避免连续三拍同一个音
      if (next === deg && notes.length >= 2 && notes[notes.length - 2] === deg) {
        next = clampDeg(deg + (rng() < 0.5 ? 1 : -1));
      }
      notes.push(next);
      deg = next;
    }
  }
  return { notes, endDeg: to };
}

function buildSong(spec, index) {
  const rng = mulberry32(spec.seed);
  const scale = SCALES[spec.mode];
  // 按曲目顺序取动机，而不是按 seed 取模——否则 6 首会撞到同一两个动机
  const hook = HOOKS[index % HOOKS.length];

  // A 句：前两小节用 hook，保证开头能认出来
  const phraseA = buildPhrase(rng, spec.prog, 0).notes;
  for (let i = 0; i < 8; i += 1) {
    phraseA[i] = clampDeg(hook[i]);
  }
  // 第 9 个音（第 3 小节首拍）落在该小节和弦音上，给 3×3 关一个稳定的收束
  const thirdChord = spec.prog[2];
  phraseA[8] = clampDeg([thirdChord, thirdChord + 2, thirdChord + 4].reduce(
    (best, cur) => (Math.abs(cur - phraseA[7]) < Math.abs(best - phraseA[7]) ? cur : best),
    thirdChord
  ));

  // A' 句：A 句的轻微变化（第 3 小节换一个音）
  const phraseA2 = phraseA.slice();
  phraseA2[9] = clampDeg(phraseA2[9] + (rng() < 0.5 ? 1 : -1));
  phraseA2[14] = clampDeg(phraseA2[14] + (rng() < 0.5 ? 1 : -1));

  // B 句：换到高音区做对比
  const phraseB = buildPhrase(rng, spec.prog.slice().reverse(), 4).notes;

  const degrees = [...phraseA, ...phraseA2, ...phraseB, ...phraseA];

  const melody = degrees.map((deg) => degToMidi(spec.root, scale, deg));

  // 低音：每小节和弦根音，重复 4 次（双色交替关的偶数格取这里，形成固定低音）
  const bass = [];
  const chords = [];
  for (let bar = 0; bar < 16; bar += 1) {
    const chordDeg = spec.prog[bar % spec.prog.length];
    const rootMidi = degToMidi(spec.root, scale, chordDeg) - 12;
    const third = degToMidi(spec.root, scale, chordDeg + 2) - 12;
    const fifth = degToMidi(spec.root, scale, chordDeg + 4) - 12;
    chords.push([rootMidi, third, fifth]);
    for (let beat = 0; beat < 4; beat += 1) {
      bass.push(rootMidi);
    }
  }

  return {
    ...spec,
    key: KEY_NAMES[spec.root] || `${spec.root}`,
    melody,
    bass,
    chords,
    credit: '原创生成 · scripts/gen-songs.js'
  };
}

const songs = SPECS.map((spec, index) => buildSong(spec, index));

/** 每 16 个数字换行，方便人读与 diff */
const formatNumbers = (list, indent = '    ') => {
  const rows = [];
  for (let i = 0; i < list.length; i += 16) {
    rows.push(`${indent}${list.slice(i, i + 16).join(', ')}`);
  }
  return rows.join(',\n');
};

const blocks = songs.map((song) => `  {
    id: '${song.id}',
    title: '${song.title}',
    tier: ${song.tier},
    bpm: ${song.bpm},
    key: '${song.key}',
    style: '${song.style}',
    credit: '${song.credit}',
    melody: [
${formatNumbers(song.melody, '      ')}
    ],
    bass: [
${formatNumbers(song.bass, '      ')}
    ],
    chords: [
${song.chords.map((chord) => `      [${chord.join(', ')}]`).join(',\n')}
    ]
  }`);

const output = `// 该文件由 scripts/gen-songs.js 生成，请勿手动修改。
// 调整曲目：修改脚本中的 SPECS / HOOKS 后重新运行 node scripts/gen-songs.js
// 全部旋律为程序生成的原创内容，无版权风险。

import { SongConfig } from '@/types/game';

export const SONGS: SongConfig[] = [
${blocks.join(',\n')}
];

export const getSongById = (id: string): SongConfig | undefined => SONGS.find((song) => song.id === id);

/** 曲目缺失属于配置错误，但不能让对局崩掉：回落到第一首 */
export const getSongOrDefault = (id: string): SongConfig => getSongById(id) ?? SONGS[0];

/** 每档 2 首曲子：前 6 关弹曲 A，后 6 关（变体玩法）弹曲 B */
export const getSongForLevel = (tierIndex: number, pass: number): SongConfig =>
  SONGS[Math.min(SONGS.length - 1, tierIndex * 2 + pass)];
`;

const outputFile = path.resolve(__dirname, '../src/data/songs.ts');
fs.writeFileSync(outputFile, output);

songs.forEach((song) => {
  const lo = Math.min(...song.melody);
  const hi = Math.max(...song.melody);
  console.log(`[gen-songs] ${song.id} ${song.title} · ${song.bpm}bpm · 音域 ${lo}~${hi} · 首句 ${song.melody.slice(0, 9).join(' ')}`);
});
console.log(`[gen-songs] 已写入 ${outputFile}`);
