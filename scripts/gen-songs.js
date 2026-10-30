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
 *
 * 和声约定（改这里之前先读一遍，否则很容易再踩一遍旧坑）：
 *   1. 和弦轨必须和旋律用同一份「分段进行」—— B 句用反转进行，和弦轨在 bar 8–11
 *      也必须跟着反转。旧版只反转了旋律，结果 B 段每个强拍都落在别的和弦上。
 *   2. 半音摩擦（旋律与和弦根音构成 1 或 11 半音）必须消掉：音乐盒音色下，
 *      大七度/降九度听起来就是「弹错了一个音」。九度、十一度这类色彩音则保留，
 *      全吸附到三和弦会让旋律变木。
 *   3. 低音轨不是踏板，是走动低音（根–五–根–三）：双色关的偶数格取这条轨，
 *      走起来才像左手伴奏，站着一个根音只是嗡嗡响。
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

/**
 * 调性名必须按「主音 + 大小调」双键查：只按主音查会把 d 小调写成 D 大调。
 * 小调按惯例用小写主音（a 小调 / d 小调 / e 小调）。
 */
const KEY_NAMES = {
  '60-major': 'C 大调',
  '62-major': 'D 大调',
  '65-major': 'F 大调',
  '57-minor': 'a 小调',
  '62-minor': 'd 小调',
  '64-minor': 'e 小调'
};

const keyName = (spec) => KEY_NAMES[`${spec.root}-${spec.mode}`] || `${spec.root} 调`;

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

/** B 段（bar 8–11）走反转进行，其余走原进行 —— 旋律与和弦轨共用这一处判断 */
const progAt = (prog, bar) => (bar >= 8 && bar <= 11 ? prog.slice().reverse() : prog);

/** 某小节的和弦级数 */
const chordDegAt = (prog, bar) => progAt(prog, bar)[bar % 4];

/** 生成 4 小节（16 音）的乐句，barOffset 用于让和弦轨跟着真实小节号走 */
function buildPhrase(rng, prog, from, barOffset) {
  const notes = [];
  let deg = from;
  for (let bar = 0; bar < 4; bar += 1) {
    const chordDeg = chordDegAt(prog, barOffset + bar);
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
  return notes;
}

/**
 * 消除和声摩擦。
 * 只处理「与和弦根音构成 1 / 6 / 11 半音」且不是和弦音的音：
 *   1  = 降九度（半音顶牛）、11 = 大七度、6 = 三全音（升十一度）。
 * 这三个音程在三和弦上听起来就是「弹错了一个音」，尤其音乐盒音色会把它们放大。
 * 九度/十一度/十三度是正常色彩音，保留 —— 全吸附到三和弦会让旋律变木。
 * 移动目标是距离最近的和弦音（同小节），保证只挪最小距离。
 */
function removeFriction(degrees, prog, root, scale) {
  const out = degrees.slice();
  for (let bar = 0; bar < 16; bar += 1) {
    const chordDeg = chordDegAt(prog, bar);
    const tones = [chordDeg, chordDeg + 2, chordDeg + 4].map(clampDeg);
    const tonePitches = tones.map((deg) => degToMidi(root, scale, deg));
    const rootPitch = degToMidi(root, scale, chordDeg);
    for (let beat = 0; beat < 4; beat += 1) {
      const index = bar * 4 + beat;
      const pitch = degToMidi(root, scale, out[index]);
      if (tonePitches.some((value) => value % 12 === pitch % 12)) {
        continue;
      }
      const interval = (((pitch - rootPitch) % 12) + 12) % 12;
      if (interval !== 1 && interval !== 6 && interval !== 11) {
        continue;
      }
      let bestIndex = 0;
      let bestDistance = Infinity;
      tonePitches.forEach((value, i) => {
        const distance = Math.abs(value - pitch);
        if (distance < bestDistance) {
          bestDistance = distance;
          bestIndex = i;
        }
      });
      out[index] = tones[bestIndex];
    }
  }
  return out;
}

function buildSong(spec, index) {
  const rng = mulberry32(spec.seed);
  const scale = SCALES[spec.mode];
  // 按曲目顺序取动机，而不是按 seed 取模——否则 6 首会撞到同一两个动机
  const hook = HOOKS[index % HOOKS.length];

  // A 句：前两小节用 hook，保证开头能认出来
  const phraseA = buildPhrase(rng, spec.prog, 0, 0);
  for (let i = 0; i < 8; i += 1) {
    phraseA[i] = clampDeg(hook[i]);
  }
  // 第 9 个音（第 3 小节首拍）落在该小节和弦音上，给 3×3 关一个稳定的收束
  const thirdChord = chordDegAt(spec.prog, 2);
  phraseA[8] = clampDeg(
    [thirdChord, thirdChord + 2, thirdChord + 4].reduce(
      (best, cur) => (Math.abs(cur - phraseA[7]) < Math.abs(best - phraseA[7]) ? cur : best),
      thirdChord
    )
  );

  // A' 句：A 句的轻微变化（第 3 小节换一个音）
  const phraseA2 = phraseA.slice();
  phraseA2[9] = clampDeg(phraseA2[9] + (rng() < 0.5 ? 1 : -1));
  phraseA2[14] = clampDeg(phraseA2[14] + (rng() < 0.5 ? 1 : -1));

  // B 句：换到高音区做对比；和声由 progAt 在 bar 8–11 自动反转，和和弦轨对齐
  const phraseB = buildPhrase(rng, spec.prog, 4, 8);

  const degrees = removeFriction(
    [...phraseA, ...phraseA2, ...phraseB, ...phraseA],
    spec.prog,
    spec.root,
    scale
  );

  const melody = degrees.map((deg) => degToMidi(spec.root, scale, deg));

  // 低音：走动低音（根–五–根–三），双色关的偶数格取这里
  const bass = [];
  const chords = [];
  for (let bar = 0; bar < 16; bar += 1) {
    const chordDeg = chordDegAt(spec.prog, bar);
    const rootMidi = degToMidi(spec.root, scale, chordDeg) - 12;
    const third = degToMidi(spec.root, scale, chordDeg + 2) - 12;
    const fifth = degToMidi(spec.root, scale, chordDeg + 4) - 12;
    chords.push([rootMidi, third, fifth]);
    bass.push(rootMidi, fifth, rootMidi, third);
  }

  return {
    ...spec,
    key: keyName(spec),
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
// 全部旋律为程序生成的原创内容，无版权风险；改动后跑 node scripts/analyze-songs.js 复核和声。

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
  console.log(`[gen-songs] ${song.id} ${song.title} · ${song.key} · ${song.bpm}bpm · 音域 ${lo}~${hi} · 首句 ${song.melody.slice(0, 9).join(' ')}`);
});
console.log(`[gen-songs] 已写入 ${outputFile}`);
