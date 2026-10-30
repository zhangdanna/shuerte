/**
 * 旋律相似度自查：把每首曲子压成「音程串」，两两比对最长公共片段。
 *
 * 运行：node scripts/audio-similarity.js
 *
 * 为什么查「音程」而不是「音高」：移调之后音高全变、旋律还是同一首，
 * 音程串是移调不变量，这才是「像不像」的正确度量。
 *
 * 判定：连续 ≥ 8 个音程完全一致 → 报警（8 个音大约是一句能被认出来的长度）。
 * 注意这是**辅助自查**，不是法律意见：它只能发现"逐音重合"，
 * 发现不了"改了节奏/加了装饰音"的实质性相似，最终仍要人工听一遍。
 *
 * 比对库分两部分：
 *   1. 内置公有领域动机（小星星 / 欢乐颂 / 卡农低音 / 绿袖子）——
 *      撞上它们不违法，但说明旋律不够原创，建议改；
 *   2. 本项目的 6 首原创 + 6 首名曲互相比对 —— 防止几首曲子自己抄自己。
 * 若需要与外部作品比对，把它们的音程串写进 scripts/motif-lib.json（格式见文件末尾注释），
 * 脚本会自动加载。**不要把有版权的完整旋律提交进仓库。**
 */
const fs = require('fs');
const path = require('path');
const ts = require('typescript');

/** 连续重合多少个音程就报警 */
const ALERT_LENGTH = 8;

function loadTs(file, exportName) {
  const source = fs.readFileSync(file, 'utf8');
  const { outputText } = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2019 }
  });
  const module = { exports: {} };
  // eslint-disable-next-line no-new-func
  new Function('exports', 'module', 'require', outputText)(module.exports, module, () => ({}));
  return module.exports[exportName];
}

/** midi 序列 → 音程串（相邻差；超过一个八度的跳进切断链条） */
const toIntervals = (melody) => {
  const result = [];
  for (let i = 1; i < melody.length; i += 1) {
    const delta = melody[i] - melody[i - 1];
    result.push(Math.abs(delta) > 12 ? null : delta);
  }
  return result;
};

/** 最长公共连续子串（null 视为分隔符，不参与匹配） */
function longestCommon(a, b) {
  let best = { length: 0, aStart: 0, bStart: 0 };
  const prev = new Array(b.length + 1).fill(0);
  for (let i = 1; i <= a.length; i += 1) {
    let diagonal = 0;
    for (let j = 1; j <= b.length; j += 1) {
      const saved = prev[j];
      if (a[i - 1] !== null && a[i - 1] === b[j - 1]) {
        prev[j] = diagonal + 1;
        if (prev[j] > best.length) {
          best = { length: prev[j], aStart: i - prev[j], bStart: j - prev[j] };
        }
      } else {
        prev[j] = 0;
      }
      diagonal = saved;
    }
  }
  return best;
}

const root = path.resolve(__dirname, '..');
const songs = loadTs(path.join(root, 'src/data/songs.ts'), 'SONGS');
const classics = loadTs(path.join(root, 'src/data/classics.ts'), 'CLASSICS');

/** 公有领域动机：撞上不算侵权，但说明旋律太"顺手"，建议改 */
const PUBLIC_MOTIFS = [
  { name: '小星星', melody: [60, 60, 67, 67, 69, 69, 67, 65, 65, 64, 64, 62, 62, 60] },
  { name: '欢乐颂', melody: [64, 64, 65, 67, 67, 65, 64, 62, 60, 60, 62, 64, 64, 62, 62] },
  { name: '卡农低音', melody: [50, 45, 47, 42, 43, 50, 43, 45] },
  { name: '绿袖子', melody: [69, 72, 74, 76, 77, 76, 74, 71, 67, 69, 71, 72, 69] }
];

const externalLibPath = path.join(__dirname, 'motif-lib.json');
const external = fs.existsSync(externalLibPath)
  ? JSON.parse(fs.readFileSync(externalLibPath, 'utf8'))
  : [];

const pool = [
  ...PUBLIC_MOTIFS.map((item) => ({ ...item, kind: '公有领域动机' })),
  ...external.map((item) => ({ ...item, kind: '外部曲目' })),
  ...songs.map((song) => ({ name: `${song.title}（原创）`, melody: song.melody, kind: '本项目原创' })),
  ...classics.map((song) => ({ name: `${song.title}（名曲）`, melody: song.melody, kind: '本项目名曲' }))
];

const targets = [...songs, ...classics];
let alerts = 0;

console.log(`[similarity] 阈值：连续 ${ALERT_LENGTH} 个音程一致\n`);

targets.forEach((song) => {
  const intervals = toIntervals(song.melody);
  const hits = [];

  pool.forEach((item) => {
    // 自己和自己不算
    if (item.name.startsWith(`${song.title}（`)) {
      return;
    }
    // 名曲与它自己的公有领域原型重合是应该的，不算问题
    if (item.kind === '公有领域动机' && item.name === song.title) {
      return;
    }
    const other = toIntervals(item.melody);
    const match = longestCommon(intervals, other);
    if (match.length >= ALERT_LENGTH) {
      hits.push({ name: item.name, kind: item.kind, length: match.length, at: match.aStart + 1 });
    }
  });

  if (hits.length === 0) {
    console.log(`PASS  ${song.id} ${song.title} · 无 ≥${ALERT_LENGTH} 音重合`);
    return;
  }
  alerts += 1;
  console.log(`WARN  ${song.id} ${song.title} · ${hits.length} 处重合`);
  hits.forEach((hit) => {
    console.log(`      ${hit.kind}「${hit.name}」重合 ${hit.length} 个音程（从第 ${hit.at} 个音起）`);
  });
});

console.log('');
if (alerts > 0) {
  console.log(`[similarity] ${alerts} 首需要人工复核：撞公有领域动机可接受（不侵权），撞外部曲目必须改。`);
} else {
  console.log('[similarity] 全部通过：没有连续 8 个音程以上的重合。');
}

/**
 * motif-lib.json 格式（放在 scripts/ 下，按需本地维护，不入库有版权的旋律）：
 * [
 *   { "name": "某曲", "melody": [60, 62, 64, ...] }
 * ]
 */
