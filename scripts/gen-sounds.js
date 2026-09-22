/**
 * 生成游戏音效（WAV）并写入 src/data/sounds.ts。
 *
 * 运行：node scripts/gen-sounds.js
 * 原因：小程序包体不适合塞入大量音频二进制，且构建配置不便于新增静态资源目录；
 * 这里用 Node 合成极短的 PCM 音频，内联为 base64 data URI，零外部依赖。
 * 调整音效只需改下面的参数并重新运行脚本。
 */
const fs = require('fs');
const path = require('path');

const SAMPLE_RATE = 11025;
const OUTPUT_FILE = path.resolve(__dirname, '../src/data/sounds.ts');

/** 合成单音：正弦波 + 快速起音 + 指数衰减 */
function tone(freq, durationMs, options = {}) {
  const { amp = 0.3, decay = 5, attackMs = 4 } = options;
  const count = Math.round((durationMs / 1000) * SAMPLE_RATE);
  const attackCount = Math.max(1, Math.round((attackMs / 1000) * SAMPLE_RATE));
  const samples = new Float32Array(count);
  for (let i = 0; i < count; i += 1) {
    const t = i / SAMPLE_RATE;
    const progress = i / count;
    const attack = i < attackCount ? i / attackCount : 1;
    const envelope = attack * Math.exp(-decay * progress);
    samples[i] = Math.sin(2 * Math.PI * freq * t) * amp * envelope;
  }
  return samples;
}

/** 叠加多条音轨（长度取最长者） */
function mix(...tracks) {
  const length = tracks.reduce((max, track) => Math.max(max, track.length), 0);
  const samples = new Float32Array(length);
  tracks.forEach((track) => {
    for (let i = 0; i < track.length; i += 1) {
      samples[i] += track[i];
    }
  });
  return samples;
}

/** 顺序拼接多段音频 */
function sequence(...tracks) {
  const length = tracks.reduce((sum, track) => sum + track.length, 0);
  const samples = new Float32Array(length);
  let offset = 0;
  tracks.forEach((track) => {
    samples.set(track, offset);
    offset += track.length;
  });
  return samples;
}

/** 浮点采样 → 16bit 单声道 PCM WAV */
function toWav(samples) {
  const dataLength = samples.length * 2;
  const buffer = Buffer.alloc(44 + dataLength);
  buffer.write('RIFF', 0);
  buffer.writeUInt32LE(36 + dataLength, 4);
  buffer.write('WAVE', 8);
  buffer.write('fmt ', 12);
  buffer.writeUInt32LE(16, 16);
  buffer.writeUInt16LE(1, 20);
  buffer.writeUInt16LE(1, 22);
  buffer.writeUInt32LE(SAMPLE_RATE, 24);
  buffer.writeUInt32LE(SAMPLE_RATE * 2, 28);
  buffer.writeUInt16LE(2, 32);
  buffer.writeUInt16LE(16, 34);
  buffer.write('data', 36);
  buffer.writeUInt32LE(dataLength, 40);
  for (let i = 0; i < samples.length; i += 1) {
    const clamped = Math.max(-1, Math.min(1, samples[i]));
    buffer.writeInt16LE(Math.round(clamped * 32767), 44 + i * 2);
  }
  return buffer;
}

// 倒计时「嗒」：短、高、轻
const tick = tone(1046.5, 70, { amp: 0.22, decay: 9 });

// 点击正确「叮」：两个高频音叠加，清脆但不刺耳
const click = mix(tone(1568, 90, { amp: 0.3, decay: 7 }), tone(2093, 90, { amp: 0.14, decay: 10 }));

// 点击错误「嗡」：低频叠加，明确提示但不惩罚情绪
const error = mix(tone(196, 240, { amp: 0.32, decay: 3.2 }), tone(147, 240, { amp: 0.2, decay: 3 }));

// 通关：上行三音 + 收尾长音
const success = sequence(
  tone(523.25, 110, { amp: 0.26, decay: 2.4 }),
  tone(659.25, 110, { amp: 0.26, decay: 2.4 }),
  tone(783.99, 110, { amp: 0.26, decay: 2.4 }),
  tone(1046.5, 300, { amp: 0.28, decay: 2.8 })
);

const sounds = { tick, click, error, success };

const lines = [
  '// 该文件由 scripts/gen-sounds.js 生成，请勿手动修改。',
  '// 调整音效：修改脚本中的合成参数后重新运行 node scripts/gen-sounds.js',
  '',
  "export type SoundKey = 'tick' | 'click' | 'error' | 'success';",
  '',
  'export const SOUND_SOURCES: Record<SoundKey, string> = {'
];

Object.keys(sounds).forEach((key) => {
  const wav = toWav(sounds[key]);
  lines.push(`  ${key}: 'data:audio/wav;base64,${wav.toString('base64')}',`);
  console.log(`[gen-sounds] ${key}: ${wav.length} bytes`);
});

lines.push('};', '');

fs.writeFileSync(OUTPUT_FILE, lines.join('\n'));
console.log(`[gen-sounds] 已写入 ${OUTPUT_FILE}`);
