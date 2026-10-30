/**
 * 曲库和声体检：把「听起来有个音不对」这件事变成可复跑的数字。
 *
 * 运行：
 *   node scripts/analyze-songs.js            # 查 src/data/songs.ts
 *   node scripts/analyze-songs.js classics   # 查 src/data/classics.ts
 *
 * 判定口径（改口径前先想清楚，这是验收线）：
 *   冲突音 = 非和弦音，且与和弦根音构成 1 / 6 / 11 半音（降九度、三全音、大七度）
 *            —— 音乐盒音色下这三个音程听起来就是「弹错了」，必须为 0。
 *   色彩音 = 非和弦音，且与根音构成 2 / 5 / 9 半音（九度、十一度、十三度）
 *            —— 这是正常的和声色彩，保留，只统计不报警。
 *   其余非和弦音（3 / 4 / 7 / 8 / 10）视作经过音，不参与判定。
 *
 * 退出码：有任何冲突音 → 1，方便当 CI 用。
 */
const fs = require('fs');
const path = require('path');

const TARGETS = {
  songs: { file: '../src/data/songs.ts', name: 'SONGS' },
  classics: { file: '../src/data/classics.ts', name: 'CLASSICS' }
};

const target = TARGETS[process.argv[2] || 'songs'];
if (!target) {
  console.error(`[analyze] 未知目标：${process.argv[2]}（可选 songs / classics）`);
  process.exit(2);
}

const file = path.resolve(__dirname, target.file);
if (!fs.existsSync(file)) {
  console.error(`[analyze] 文件不存在：${file}`);
  process.exit(2);
}

/**
 * 用 TypeScript 自己把数据文件转成 CJS 再求值。
 * 不用正则抠数组：classics.ts 里有辅助函数与和弦常量，正则一碰类型标注就炸。
 * `import type` 会被转译器整条删掉，所以运行时不会真的去解析 `@/types/game`。
 */
function loadSongs() {
  const ts = require('typescript');
  const source = fs.readFileSync(file, 'utf8');
  const { outputText } = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2019,
      importsNotUsedAsValues: ts.ImportsNotUsedAsValues.Remove
    }
  });
  const module = { exports: {} };
  // eslint-disable-next-line no-new-func
  new Function('exports', 'module', 'require', outputText)(module.exports, module, () => ({}));
  const result = module.exports[target.name];
  if (!result) {
    throw new Error(`转译后取不到 ${target.name}`);
  }
  return result;
}

const NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
const pc = (midi) => ((midi % 12) + 12) % 12;
const name = (midi) => NAMES[pc(midi)];
const octave = (midi) => Math.floor(midi / 12) - 1;

const songs = loadSongs();
let failures = 0;

console.log(`[analyze] ${target.name} · ${songs.length} 首\n`);

songs.forEach((song) => {
  const issues = { clash: [], weak: [], color: [], leap: [], shape: [] };

  if (song.melody.length !== 64) {
    issues.shape.push(`melody 长度 ${song.melody.length} ≠ 64`);
  }
  if (song.chords.length !== 16) {
    issues.shape.push(`chords 长度 ${song.chords.length} ≠ 16`);
  }
  if (song.bass.length !== 64) {
    issues.shape.push(`bass 长度 ${song.bass.length} ≠ 64`);
  }

  const bars = Math.min(16, Math.floor(song.melody.length / 4));
  for (let bar = 0; bar < bars; bar += 1) {
    const chord = song.chords[bar] || [];
    const chordPcs = chord.map(pc);
    const rootPc = chordPcs[0];
    for (let beat = 0; beat < 4; beat += 1) {
      const index = bar * 4 + beat;
      const note = song.melody[index];
      if (note === undefined) {
        continue;
      }
      if (chordPcs.includes(pc(note))) {
        continue;
      }
      const interval = ((pc(note) - rootPc) % 12 + 12) % 12;
      const tag = `bar${bar}·拍${beat} ${name(note)}${octave(note)} / ${name(chord[0])}${octave(chord[0])}和弦`;
      if (interval === 1 || interval === 6 || interval === 11) {
        // 强拍（1、3 拍）出现就是和声错了；弱拍上的经过音是正常写法，只记不判
        if (beat % 2 === 0) {
          issues.clash.push(`${tag}（${interval} 半音）`);
        } else {
          issues.weak.push(`${tag}（${interval} 半音）`);
        }
      } else if (interval === 2 || interval === 5 || interval === 9) {
        issues.color.push(tag);
      }
      if (beat > 0) {
        const distance = Math.abs(note - song.melody[index - 1]);
        if (distance > 12) {
          issues.leap.push(`bar${bar}·拍${beat} ${distance} 半音`);
        }
      }
    }
  }

  const lo = Math.min(...song.melody);
  const hi = Math.max(...song.melody);
  const pass = issues.clash.length === 0 && issues.shape.length === 0;
  if (!pass) {
    failures += 1;
  }

  console.log(`${pass ? 'PASS' : 'FAIL'}  ${song.id} ${song.title} · ${song.key} · ${song.bpm}bpm`);
  console.log(`      音域 ${name(lo)}${octave(lo)}~${name(hi)}${octave(hi)}（${lo}~${hi}）· 强拍冲突 ${issues.clash.length} · 弱拍经过 ${issues.weak.length} · 色彩音 ${issues.color.length} · 大跳 ${issues.leap.length}`);
  if (issues.shape.length) {
    console.log(`      结构：${issues.shape.join('；')}`);
  }
  if (issues.clash.length) {
    console.log(`      冲突：${issues.clash.join('，')}`);
  }
  if (issues.leap.length) {
    console.log(`      大跳：${issues.leap.join('，')}`);
  }
});

console.log('');
if (failures > 0) {
  console.log(`[analyze] ${failures} 首未通过（存在冲突音或结构问题）`);
  process.exit(1);
}
console.log('[analyze] 全部通过：冲突音 0 处');
