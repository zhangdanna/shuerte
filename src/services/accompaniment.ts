import type { TimbrePart } from '@/services/audio';
import type { TimbreKey } from '@/types/game';

/**
 * 伴奏编排：给定一个小节的和弦与时长，产出一串「相对小节起点」的声部请求。
 *
 * 这里只算数据、不碰音频节点 —— 真正排程由 services/audio.ts 的 scheduleVoice 完成。
 * 这样音频模块不会和编排模块互相 import，也方便单独调参、单独看数值。
 *
 * 配器随段落变化（16 小节）：
 *   0–3   低音 + 铺底            进场，别一上来就满
 *   4–7   + 琶音                 让空拍有东西在动
 *   8–11  + 琶音 + 轻击，铺底抬高   B 段要顶起来
 *   12–15 全开；最后一小节只留铺底收长音
 */

export type AccompRole = 'bass' | 'pad' | 'arp' | 'perc';

export interface AccompVoice {
  role: AccompRole;
  /** 打击声部没有音高 */
  midi?: number;
  /** 相对小节起点的偏移（秒） */
  offset: number;
  gain: number;
  attack: number;
  decay: number;
  sustain: number;
  /** 从发声到开始释音的时长（秒） */
  hold: number;
  release: number;
  parts: TimbrePart[];
  /** 打击声部：噪声 + 带通中心频率 */
  noise?: boolean;
  noiseFreq?: number;
}

/** 低音：正弦打底 + 一点三角波给厚度 */
const BASS_PARTS: TimbrePart[] = [
  { type: 'sine', ratio: 1, gain: 1 },
  { type: 'triangle', ratio: 1, gain: 0.32 }
];

/** 铺底：三角波为主，高频弱，退在人声后面 */
const PAD_PARTS: TimbrePart[] = [
  { type: 'triangle', ratio: 1, gain: 0.75 },
  { type: 'sine', ratio: 2, gain: 0.22 }
];

/** 琶音跟着曲目音色走，才不会和旋律两张皮 */
const ARP_PARTS: Record<TimbreKey, TimbrePart[]> = {
  musicbox: [
    { type: 'sine', ratio: 1, gain: 1 },
    { type: 'sine', ratio: 3, gain: 0.2 }
  ],
  piano: [
    { type: 'triangle', ratio: 1, gain: 1 },
    { type: 'sine', ratio: 2, gain: 0.3 }
  ],
  epiano: [
    { type: 'sine', ratio: 1, gain: 1 },
    { type: 'sine', ratio: 2, gain: 0.4 }
  ]
};

const PERC_PARTS: TimbrePart[] = [];

export interface BarPlanOptions {
  bar: number;
  /** 该小节的三和弦（midi，低音在前） */
  chord: number[];
  /** 小节时长（秒）；跟随玩家的真实节奏，不做量化 */
  duration: number;
  timbre: TimbreKey;
  lastBar?: boolean;
}

const DEFAULT_CHORD = [48, 52, 55];

export const buildBarPlan = (options: BarPlanOptions): AccompVoice[] => {
  const { bar, duration, timbre, lastBar } = options;
  const chord = options.chord && options.chord.length >= 3 ? options.chord : DEFAULT_CHORD;
  const voices: AccompVoice[] = [];
  const beat = duration / 4;

  // 最后一小节只留铺底收长音，避免整首放完还在"哒哒"
  if (lastBar) {
    chord.forEach((midi) => {
      voices.push({
        role: 'pad',
        midi,
        offset: 0,
        gain: 0.075,
        attack: 0.06,
        decay: 0.3,
        sustain: 0.75,
        hold: duration,
        release: 0.8,
        parts: PAD_PARTS
      });
    });
    return voices;
  }

  // 低音：每小节第 1 拍
  voices.push({
    role: 'bass',
    midi: chord[0] - 12,
    offset: 0,
    gain: 0.3,
    attack: 0.008,
    decay: 0.25,
    sustain: 0.5,
    hold: 0.3,
    release: 0.5,
    parts: BASS_PARTS
  });

  // 铺底：整小节的和弦，B 段（8–11）抬一点
  const inBSection = bar >= 8 && bar < 12;
  const padGain = inBSection ? 0.085 : 0.07;
  chord.forEach((midi) => {
    voices.push({
      role: 'pad',
      midi,
      offset: 0,
      gain: padGain,
      attack: 0.06,
      decay: 0.3,
      sustain: 0.8,
      hold: Math.max(0.2, duration * 0.92),
      release: 0.45,
      parts: PAD_PARTS
    });
  });

  // 琶音：第 2–4 拍，根（高八度）– 五 – 三
  if (bar >= 4) {
    const arpNotes = [chord[0] + 12, chord[2], chord[1]];
    arpNotes.forEach((midi, index) => {
      voices.push({
        role: 'arp',
        midi,
        offset: beat * (index + 1),
        gain: 0.1,
        attack: 0.005,
        decay: 0.15,
        sustain: 0.3,
        hold: 0.12,
        release: 0.25,
        parts: ARP_PARTS[timbre] ?? ARP_PARTS.piano
      });
    });
  }

  // 轻击：B 段起加，第 1、3 拍
  if (bar >= 8) {
    [0, 2].forEach((beatIndex) => {
      voices.push({
        role: 'perc',
        offset: beat * beatIndex,
        gain: 0.075,
        attack: 0.001,
        decay: 0.03,
        sustain: 0.05,
        hold: 0.02,
        release: 0.06,
        parts: PERC_PARTS,
        noise: true,
        noiseFreq: 1800
      });
    });
  }

  return voices;
};
