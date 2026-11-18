import Taro from '@tarojs/taro';

/**
 * 挑战版音效：一套完全独立的合成器，不 import `services/audio.ts` 的任何东西。
 *
 * 为什么要另起一套：
 *   1. 经典版的听感是「演奏」——旋律、伴奏、音色都在讲一首曲子；
 *      挑战版的听感是「机关」——只有敲在纸上的木与石，一个音都不成曲。
 *   2. 两边各持一个 AudioContext，互不干扰。挑战版出问题不会连累经典版没声音。
 *
 * 全部实时合成（振荡器 + 噪声），不占包体，也不需要 base64 资源。
 */

export type MemorySfx = 'tick' | 'reveal' | 'vanish' | 'thud' | 'peek' | 'clear' | 'break';

const isWeapp = process.env.TARO_ENV === 'weapp';

let ctx: AudioContext | null = null;
let master: GainNode | null = null;
let unavailable = false;
let enabled = true;

export const setChallengeSoundEnabled = (next: boolean): void => {
  enabled = next;
};

/** 小程序端由基础库提供 createWebAudioContext，Taro 类型里没有 */
const createContext = (): AudioContext | null => {
  try {
    if (isWeapp) {
      const factory = (Taro as unknown as { createWebAudioContext?: () => AudioContext })
        .createWebAudioContext;
      return factory ? factory() : null;
    }
    const scope = globalThis as unknown as {
      AudioContext?: typeof AudioContext;
      webkitAudioContext?: typeof AudioContext;
    };
    const Ctor = scope.AudioContext ?? scope.webkitAudioContext;
    return Ctor ? new Ctor() : null;
  } catch (error) {
    console.warn('[ChallengeAudio] WebAudio 不可用', error);
    return null;
  }
};

const ensure = (): AudioContext | null => {
  if (ctx) {
    return ctx;
  }
  if (unavailable) {
    return null;
  }
  const context = createContext();
  if (!context) {
    unavailable = true;
    return null;
  }
  try {
    const out = context.createGain();
    // 比经典版压低一点：这里全是短促的点音，整体偏亮，总音量要收
    out.gain.value = 0.42;
    out.connect(context.destination);
    ctx = context;
    master = out;
    return context;
  } catch (error) {
    console.warn('[ChallengeAudio] 总线初始化失败', error);
    unavailable = true;
    return null;
  }
};

/** 页面 onShow 预热；真正发声仍发生在用户操作之后 */
export const initChallengeAudio = (): void => {
  const context = ensure();
  if (context && context.state === 'suspended') {
    context.resume().catch(() => undefined);
  }
};

interface ToneOptions {
  freq: number;
  when: number;
  /** 衰减总时长（秒） */
  duration: number;
  peak: number;
  attack?: number;
  /** 谐波倍频：2 = 木（亮），3 = 磬（空） */
  harmonic?: number;
  harmonicGain?: number;
  /** 频率滑到的目标（下滑音用） */
  glideTo?: number;
}

const playTone = (context: AudioContext, out: GainNode, options: ToneOptions): void => {
  const { freq, when, duration, peak, attack = 0.004, harmonic = 2, harmonicGain = 0, glideTo } = options;
  try {
    const osc = context.createOscillator();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(freq, when);
    if (glideTo !== undefined) {
      osc.frequency.exponentialRampToValueAtTime(glideTo, when + duration);
    }
    const env = context.createGain();
    env.gain.setValueAtTime(0.0001, when);
    env.gain.linearRampToValueAtTime(peak, when + attack);
    // 指数衰减到极小值（不能直接给 0，exponentialRamp 不接受 0）
    env.gain.exponentialRampToValueAtTime(0.0001, when + duration);
    osc.connect(env);
    env.connect(out);
    osc.start(when);
    osc.stop(when + duration + 0.02);

    if (harmonicGain > 0) {
      const partial = context.createOscillator();
      partial.type = 'sine';
      partial.frequency.setValueAtTime(freq * harmonic, when);
      if (glideTo !== undefined) {
        partial.frequency.exponentialRampToValueAtTime(glideTo * harmonic, when + duration);
      }
      const partialEnv = context.createGain();
      partialEnv.gain.setValueAtTime(0.0001, when);
      partialEnv.gain.linearRampToValueAtTime(peak * harmonicGain, when + attack);
      partialEnv.gain.exponentialRampToValueAtTime(0.0001, when + duration);
      partial.connect(partialEnv);
      partialEnv.connect(out);
      partial.start(when);
      partial.stop(when + duration + 0.02);
    }
  } catch (error) {
    console.warn('[ChallengeAudio] 单音合成失败', error);
  }
};

/** 极短白噪声：只用来给「闷响」和「收起」加一点摩擦感 */
const playNoise = (context: AudioContext, out: GainNode, when: number, duration: number, peak: number): void => {
  try {
    const frames = Math.max(1, Math.floor(context.sampleRate * duration));
    const buffer = context.createBuffer(1, frames, context.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < frames; i += 1) {
      data[i] = (Math.random() * 2 - 1) * (1 - i / frames);
    }
    const source = context.createBufferSource();
    source.buffer = buffer;
    const env = context.createGain();
    env.gain.value = peak;
    source.connect(env);
    env.connect(out);
    source.start(when);
  } catch (error) {
    console.warn('[ChallengeAudio] 噪声合成失败', error);
  }
};

// ============================================
// 点击音：音高 = 序号
// ============================================
// D 宫五声（D E F# A B），D4 起，每 5 个音升一个八度，两圈之后回到低八度。
// 玩家点得越顺，音越高 —— 耳朵能确认「我点到第几个了」，这是隐性的记忆辅助。
const PENTATONIC = [0, 2, 4, 7, 9];
const BASE_FREQ = 293.66;

export const getTapFrequency = (value: number): number => {
  const i = Math.max(0, Math.round(value) - 1);
  const octave = Math.floor(i / PENTATONIC.length) % 2;
  const semitone = PENTATONIC[i % PENTATONIC.length];
  return BASE_FREQ * 2 ** (octave + semitone / 12);
};

/** 每次发声前顺手确认上下文在跑：iOS 微信/浏览器切页后会把 context 挂成 suspended */
const ensureRunning = (context: AudioContext): void => {
  if (context.state === 'suspended') {
    context.resume().catch(() => undefined);
  }
};

/** 点对一个：木质短音，音高跟着序号走 */
export const playTap = (value: number): void => {
  if (!enabled) {
    return;
  }
  const context = ensure();
  if (!context || !master) {
    return;
  }
  ensureRunning(context);
  const now = context.currentTime;
  playTone(context, master, {
    freq: getTapFrequency(value),
    when: now,
    duration: 0.26,
    peak: 0.44,
    harmonic: 2,
    harmonicGain: 0.26
  });
};

// ============================================
// 界面音效
// ============================================

/** 磬：三次谐波、长尾，用来做「提示」与「落定」 */
const CHIME = { harmonic: 3, harmonicGain: 0.34, duration: 0.62, peak: 0.3 };

const SFX: Record<MemorySfx, (context: AudioContext, out: GainNode, now: number) => void> = {
  /** 倒计时每秒一下：比 reveal 更轻、更短，不抢记忆的注意力 */
  tick: (context, out, now) => {
    playTone(context, out, { freq: 587.33, when: now, duration: 0.12, peak: 0.16, harmonic: 2, harmonicGain: 0.1 });
  },

  /** 数字浮现：三音上行琶音，像掀开一张纸 */
  reveal: (context, out, now) => {
    [587.33, 880, 1174.66].forEach((freq, i) => {
      playTone(context, out, { ...CHIME, freq, when: now + i * 0.06, peak: 0.24 });
    });
  },

  /**
   * 数字隐去：一声古琴散音。
   *
   * 刻意**不用下滑音** —— 740→370Hz 那种扫频是电子合成器的语汇，
   * 一响就把水墨的意境打散了。这里要的是「笔尖离纸、墨迹收干」：
   * 低频空弦（D3）给厚度，高八度泛音（D4）给空，再补一丝极轻的触弦摩擦，
   * 让低频听起来是「弦」而不是「振荡器」。
   */
  vanish: (context, out, now) => {
    playTone(context, out, {
      freq: 146.83,
      when: now,
      duration: 1,
      peak: 0.26,
      attack: 0.008,
      harmonic: 2,
      harmonicGain: 0.2
    });
    playTone(context, out, {
      freq: 293.66,
      when: now + 0.02,
      duration: 0.6,
      peak: 0.1,
      attack: 0.01,
      harmonic: 3,
      harmonicGain: 0.16
    });
    playNoise(context, out, now, 0.04, 0.05);
  },

  /** 点错：低频闷响，短而钝，不刺耳 */
  thud: (context, out, now) => {
    playTone(context, out, { freq: 110, when: now, duration: 0.12, peak: 0.5, harmonic: 2, harmonicGain: 0.12 });
    playNoise(context, out, now, 0.04, 0.09);
  },

  /** 窥看：一声清亮的叮 */
  peek: (context, out, now) => {
    playTone(context, out, { ...CHIME, freq: 880, when: now, peak: 0.34 });
  },

  /** 通关：四音上行，落在高八度的主音上 */
  clear: (context, out, now) => {
    [587.33, 739.99, 880, 1174.66].forEach((freq, i) => {
      playTone(context, out, { ...CHIME, freq, when: now + i * 0.085, peak: 0.28 });
    });
  },

  /** 失败：两音下行，沉下去 */
  break: (context, out, now) => {
    [440, 293.66].forEach((freq, i) => {
      playTone(context, out, {
        freq,
        when: now + i * 0.18,
        duration: 0.5,
        peak: 0.3,
        harmonic: 2,
        harmonicGain: 0.16
      });
    });
  }
};

export const playMemorySfx = (key: MemorySfx): void => {
  if (!enabled) {
    return;
  }
  const context = ensure();
  if (!context || !master) {
    return;
  }
  ensureRunning(context);
  SFX[key](context, master, context.currentTime);
};
