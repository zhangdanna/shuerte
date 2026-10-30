import Taro from '@tarojs/taro';
import { SOUND_SOURCES, SoundKey } from '@/data/sounds';
import { SongConfig, TimbreKey } from '@/types/game';
import { buildBarPlan } from '@/services/accompaniment';

type AudioInstance = ReturnType<typeof Taro.createInnerAudioContext>;

const isWeapp = process.env.TARO_ENV === 'weapp';

// ============================================
// 一、提示音（倒计时 / 点错 / 通关）：内联 WAV + InnerAudioContext
// 演奏音走下面的合成引擎，两者互不影响，可分别开关
// ============================================

const pool: Partial<Record<SoundKey, AudioInstance>> = {};
const localPathCache: Partial<Record<SoundKey, string>> = {};

let soundEnabled = true;
let musicEnabled = true;
let accompanimentEnabled = true;

export const setSoundEnabled = (enabled: boolean): void => {
  soundEnabled = enabled;
};

export const setMusicEnabled = (enabled: boolean): void => {
  musicEnabled = enabled;
};

/** 伴奏（回放时的低音 / 铺底 / 琶音）：与演奏音分开开关 */
export const setAccompanimentEnabled = (enabled: boolean): void => {
  accompanimentEnabled = enabled;
};

/**
 * 解析可播放的音源。
 * H5 直接用 data URI；小程序端 InnerAudioContext 不支持 data URI，
 * 需要先把 base64 落地为本地临时文件再播放。
 */
const resolveSource = (key: SoundKey): string | null => {
  const source = SOUND_SOURCES[key];
  if (!source) {
    console.error('[Audio] 音效资源缺失', key);
    return null;
  }
  if (!isWeapp) {
    return source;
  }
  const cached = localPathCache[key];
  if (cached) {
    return cached;
  }
  const userDataPath = (Taro.env as { USER_DATA_PATH?: string } | undefined)?.USER_DATA_PATH;
  if (!userDataPath) {
    console.error('[Audio] 无法获取小程序本地文件目录，音效不可用', key);
    return null;
  }
  try {
    const base64 = source.split(',')[1];
    const filePath = `${userDataPath}/${key}.wav`;
    Taro.getFileSystemManager().writeFileSync(filePath, base64, 'base64');
    localPathCache[key] = filePath;
    return filePath;
  } catch (error) {
    console.error('[Audio] 音效写入临时文件失败', key, error);
    return null;
  }
};

/** 播放音效：音效属于增强能力，失败只记录日志，不阻塞玩法 */
export const playSound = (key: SoundKey): void => {
  if (!soundEnabled) {
    return;
  }
  try {
    let instance = pool[key];
    if (!instance) {
      const source = resolveSource(key);
      if (!source) {
        return;
      }
      instance = Taro.createInnerAudioContext();
      instance.src = source;
      // 音频中断属于正常场景（页面跳转、切后台），静默忽略
      instance.onError((err) => {
        // AbortError / interrupted 不打日志，避免刷屏
        const errMsg = err?.errMsg ?? '';
        if (errMsg.includes('interrupted') || errMsg.includes('AbortError')) {
          return;
        }
        console.error('[Audio] 播放错误', key, err);
      });
      pool[key] = instance;
    }
    // 仅在正在播放时中断，避免打断未开始的 play() 产生无意义的 AbortError
    if (!instance.paused) {
      instance.stop();
    }
    // play() 在部分平台返回 Promise，需要捕获异步错误（类型声明里是 void，这里按运行时判断）
    const playResult = instance.play() as unknown as Promise<void> | void;
    if (playResult && typeof (playResult as Promise<void>).catch === 'function') {
      (playResult as Promise<void>).catch((err) => {
        const errMsg = err?.errMsg ?? '';
        if (errMsg.includes('interrupted') || errMsg.includes('AbortError')) {
          return;
        }
        console.error('[Audio] 播放失败', key, err);
      });
    }
  } catch (error) {
    // play() 被 pause() 打断是正常场景（页面跳转时），静默忽略
    const message = (error as { errMsg?: string })?.errMsg ?? '';
    if (message.includes('interrupted') || message.includes('AbortError')) {
      return;
    }
    console.error('[Audio] 播放失败', key, error);
  }
};

// ============================================
// 二、演奏音：WebAudio 实时合成
// H5 用 AudioContext，小程序用 wx.createWebAudioContext（基础库 2.19+）
// 都不支持时退化为 click 提示音，保证「点对仍有反馈」
// ============================================

export interface TimbrePart {
  type: OscillatorType;
  ratio: number;
  gain: number;
}

export interface TimbreSpec {
  parts: TimbrePart[];
  /** 衰减到峰值的比例（越大越"余音缭绕"） */
  sustain: number;
  /** 释音时长（秒） */
  release: number;
}

/**
 * 三种音色只改三件事：波形组合、包络、释音长度。
 * 单音峰值压在 -14dBFS 附近，密集连点由总线压缩兜住。
 */
const TIMBRES: Record<TimbreKey, TimbreSpec> = {
  musicbox: {
    parts: [
      { type: 'sine', ratio: 1, gain: 1 },
      { type: 'sine', ratio: 3, gain: 0.24 }
    ],
    sustain: 0.2,
    release: 0.22
  },
  piano: {
    parts: [
      { type: 'triangle', ratio: 1, gain: 1 },
      { type: 'sine', ratio: 2, gain: 0.38 },
      { type: 'sine', ratio: 3, gain: 0.16 }
    ],
    sustain: 0.3,
    release: 0.4
  },
  epiano: {
    parts: [
      { type: 'sine', ratio: 1, gain: 1 },
      { type: 'sine', ratio: 2, gain: 0.45 },
      { type: 'sine', ratio: 4, gain: 0.1 }
    ],
    sustain: 0.42,
    release: 0.5
  }
};

let ctx: AudioContext | null = null;
let melodyBus: GainNode | null = null;
let compBus: GainNode | null = null;
let synthReady = false;
let synthUnavailable = false;
let timbre: TimbreKey = 'piano';

/**
 * 声部分池：旋律与伴奏各记各的账。
 * 旧版共用一个 10 声部池，伴奏和弦一进来就把旋律挤掉（voices.shift().stop()），
 * 表现是「和弦响了、旋律断了」。
 */
const MAX_MELODY_VOICES = 16;
const MAX_COMP_VOICES = 24;
const melodyVoices: Array<() => void> = [];
const compVoices: Array<() => void> = [];

const createContext = (): AudioContext | null => {
  try {
    if (isWeapp) {
      // Taro 未内置该 API 的类型，运行时由基础库提供
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
    console.warn('[Audio] WebAudio 不可用，退化为提示音', error);
    return null;
  }
};

/**
 * 建两条总线：旋律与伴奏分开走，最后汇进同一个限幅器。
 *   旋律 → melodyBus(0.90) ─────────────┐
 *   伴奏 → compBus(0.55) → 低通 ────────┤→ limiter → 输出
 *   两条总线都挂一点反馈延迟做混响（伴奏送得多一点，退得更远）
 */
const ensureSynth = (): AudioContext | null => {
  if (synthReady) {
    return ctx;
  }
  if (synthUnavailable) {
    return null;
  }
  const context = createContext();
  if (!context) {
    synthUnavailable = true;
    return null;
  }
  try {
    const melody = context.createGain();
    melody.gain.value = 0.9;

    const comp = context.createGain();
    comp.gain.value = 0.55;

    // 伴奏整体压暗，避免和旋律抢高频
    const compTone = context.createBiquadFilter();
    compTone.type = 'lowpass';
    compTone.frequency.value = 3200;
    compTone.Q.value = 0.6;

    const limiter = context.createDynamicsCompressor();
    limiter.threshold.value = -14;
    limiter.knee.value = 10;
    limiter.ratio.value = 4;
    limiter.attack.value = 0.004;
    limiter.release.value = 0.2;

    // 简易混响：反馈延迟，比卷积省得多，听感够用
    const delay = context.createDelay(0.5);
    delay.delayTime.value = 0.09;
    const feedback = context.createGain();
    feedback.gain.value = 0.16;
    const wet = context.createGain();
    wet.gain.value = 0.14;

    melody.connect(limiter);
    melody.connect(delay);
    comp.connect(compTone);
    compTone.connect(limiter);
    compTone.connect(delay);
    delay.connect(feedback);
    feedback.connect(delay);
    delay.connect(wet);
    wet.connect(limiter);
    limiter.connect(context.destination);

    ctx = context;
    melodyBus = melody;
    compBus = comp;
    synthReady = true;
    return context;
  } catch (error) {
    console.warn('[Audio] 音频总线初始化失败', error);
    synthUnavailable = true;
    return null;
  }
};

/** 页面 onShow 时预热：真正发声仍发生在用户点击之后 */
export const initAudio = (): void => {
  const context = ensureSynth();
  if (context && context.state === 'suspended') {
    context.resume().catch(() => undefined);
  }
};

export const setTimbre = (next: TimbreKey): void => {
  // 存档里可能是旧值或缺失，兜底到默认音色，避免取不到包络参数
  timbre = TIMBRES[next] ? next : 'piano';
};

/** 一个声部的完整描述：谁、什么时候、多响、怎么衰减、送到哪条总线 */
export interface VoiceRequest {
  midi: number;
  /** 绝对时间（AudioContext.currentTime 口径）；不传则立即发声 */
  when?: number;
  /** 峰值增益（0~1，已含力度） */
  gain: number;
  attack: number;
  /** 从峰值衰减到 sustain 比例所用时间 */
  decay: number;
  /** 持续电平（相对峰值的比例） */
  sustain: number;
  /** 从发声到开始释音的时长（秒）；铺底音用它把和弦撑满一小节 */
  hold: number;
  release: number;
  parts: TimbrePart[];
  /** 送到哪条总线：melody = 旋律，comp = 伴奏 */
  dest?: 'melody' | 'comp';
}

const trimVoices = (list: Array<() => void>, max: number): void => {
  while (list.length > max) {
    const stop = list.shift();
    stop?.();
  }
};

/**
 * 排一个声部进音频图。
 * 所有时间都用 when（绝对时间）而不是 setTimeout —— 这是伴奏和旋律不跑偏的前提。
 */
export const scheduleVoice = (request: VoiceRequest): void => {
  const context = ensureSynth();
  const bus = request.dest === 'comp' ? compBus : melodyBus;
  if (!context || !bus) {
    return;
  }
  const { midi, gain, attack, decay, sustain, hold, release, parts } = request;
  const when = Math.max(context.currentTime + 0.002, request.when ?? context.currentTime + 0.004);
  const peak = Math.max(0.0002, Math.min(1, gain));
  const freq = 440 * Math.pow(2, (midi - 69) / 12);
  const decayAt = Math.max(attack + 0.001, when + attack + decay);
  const releaseAt = Math.max(decayAt + 0.01, when + hold);

  const envelope = context.createGain();
  envelope.gain.setValueAtTime(0.0001, when);
  envelope.gain.exponentialRampToValueAtTime(peak, when + attack);
  envelope.gain.exponentialRampToValueAtTime(Math.max(0.0001, peak * sustain), decayAt);
  envelope.gain.setValueAtTime(Math.max(0.0001, peak * sustain), releaseAt);
  envelope.gain.exponentialRampToValueAtTime(0.0001, releaseAt + release);
  envelope.connect(bus);

  const oscillators: OscillatorNode[] = [];
  parts.forEach((part) => {
    const osc = context.createOscillator();
    osc.type = part.type;
    osc.frequency.value = freq * part.ratio;
    const voiceGain = context.createGain();
    voiceGain.gain.value = part.gain;
    osc.connect(voiceGain);
    voiceGain.connect(envelope);
    osc.start(when);
    osc.stop(releaseAt + release + 0.03);
    oscillators.push(osc);
  });

  const stop = () => {
    oscillators.forEach((osc) => {
      try {
        osc.stop();
        osc.disconnect();
      } catch (error) {
        // 已停止的振荡器再 stop 会抛错，忽略
      }
    });
    try {
      envelope.disconnect();
    } catch (error) {
      // 同上
    }
  };

  const list = request.dest === 'comp' ? compVoices : melodyVoices;
  list.push(stop);
  trimVoices(list, request.dest === 'comp' ? MAX_COMP_VOICES : MAX_MELODY_VOICES);
  // 自然结束后出列，避免声部表无限增长
  setTimeout(() => {
    const index = list.indexOf(stop);
    if (index >= 0) {
      list.splice(index, 1);
    }
  }, (releaseAt - when + release + 0.2) * 1000);
};

export const stopAllNotes = (): void => {
  while (melodyVoices.length > 0) {
    melodyVoices.pop()?.();
  }
  while (compVoices.length > 0) {
    compVoices.pop()?.();
  }
};

/** 噪声源缓存：轻击声部每小节都要用，每次新建 buffer 太浪费 */
let noiseBuffer: AudioBuffer | null = null;

const getNoiseBuffer = (context: AudioContext): AudioBuffer => {
  if (noiseBuffer && noiseBuffer.sampleRate === context.sampleRate) {
    return noiseBuffer;
  }
  const length = Math.max(64, Math.floor(context.sampleRate * 0.12));
  const buffer = context.createBuffer(1, length, context.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < length; i += 1) {
    // 指数衰减的白噪声，听感接近纸面轻击 / 沙锤
    data[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / length, 2);
  }
  noiseBuffer = buffer;
  return buffer;
};

/** 打击声部：噪声 → 带通 → 短包络 → 伴奏总线 */
const scheduleNoise = (options: {
  ctx: AudioContext;
  at: number;
  gain: number;
  freq: number;
  decay: number;
}): void => {
  const { ctx: context, gain, freq, decay } = options;
  const bus = compBus;
  if (!bus) {
    return;
  }
  const at = Math.max(context.currentTime + 0.002, options.at);
  const source = context.createBufferSource();
  source.buffer = getNoiseBuffer(context);
  const filter = context.createBiquadFilter();
  filter.type = 'bandpass';
  filter.frequency.value = freq;
  filter.Q.value = 1.1;
  const envelope = context.createGain();
  envelope.gain.setValueAtTime(0.0001, at);
  envelope.gain.exponentialRampToValueAtTime(Math.max(0.0002, gain), at + 0.004);
  envelope.gain.exponentialRampToValueAtTime(0.0001, at + decay);
  source.connect(filter);
  filter.connect(envelope);
  envelope.connect(bus);
  source.start(at);
  source.stop(at + decay + 0.02);
  const stop = () => {
    try {
      source.stop();
      source.disconnect();
      envelope.disconnect();
    } catch (error) {
      // 已停止的源再 stop 会抛错，忽略
    }
  };
  compVoices.push(stop);
  trimVoices(compVoices, MAX_COMP_VOICES);
  setTimeout(() => {
    const index = compVoices.indexOf(stop);
    if (index >= 0) {
      compVoices.splice(index, 1);
    }
  }, (decay + 0.2) * 1000);
};

/**
 * 弹一个音。
 * @param midi MIDI 音高，60 = C4
 * @param velocity 0~1，默认 0.72
 * @param when 绝对时间（秒，AudioContext 口径）；不传则立即发声
 * @param override 指定音色（曲集按曲目音色回放）；不传则用设置里的音色
 */
export const playNote = (
  midi: number,
  velocity = 0.72,
  when?: number,
  override?: TimbreKey
): void => {
  if (!musicEnabled) {
    return;
  }
  const context = ensureSynth();
  if (!context) {
    // 降级：至少让玩家听到"点对了"
    playSound('click');
    return;
  }
  if (context.state === 'suspended') {
    context.resume().catch(() => undefined);
  }

  const spec = TIMBRES[override ?? timbre] ?? TIMBRES.piano;
  // 低音余音更长，听感更接近真实钢琴
  const release = midi < 55 ? spec.release * 1.4 : spec.release;
  scheduleVoice({
    midi,
    when,
    gain: Math.max(0.02, Math.min(1, velocity)) * 0.34,
    attack: 0.008,
    decay: 0.2,
    sustain: spec.sustain,
    hold: 0.2,
    release,
    parts: spec.parts,
    dest: 'melody'
  });
};

export interface PlaySongOptions {
  /** 覆盖曲目速度 */
  bpm?: number;
  /**
   * 玩家自己的击键时间戳（毫秒，相对开局，按点击顺序）。
   * 传了就按这个节奏播 —— 弹得急就急、卡住了就停，这是「回放我的演奏」；
   * 超出记录长度的音用曲目 BPM 续播（玩家还没弹到那一段）。
   */
  beats?: number[];
  /** 每个音的回调；-1 表示结束 */
  onStep?: (index: number) => void;
  /** 是否铺伴奏（低音 / 铺底 / 琶音），默认跟随设置 */
  accompaniment?: boolean;
}

/** lookahead 调度参数：每 30ms 醒一次，把未来 0.25s 内的事件排进音频图 */
const SCHEDULER_TICK = 30;
const SCHEDULER_LOOKAHEAD = 0.25;
/** 起播留白：给音频上下文一点预热时间，避免第一个音被截 */
const START_LEAD = 0.15;

/**
 * 回放整首曲子（曲集页用）。
 *
 * 时间轴规则：
 *   1. 有 beats 就按玩家的真实节奏走，**不做量化** —— 量化会让「回放我的演奏」
 *      变成「另一个人弹的」。
 *   2. 伴奏按小节（4 音一小节）对齐到同一份时间轴：barTimes[b] = noteTimes[b * 4]，
 *      玩家卡住时伴奏跟着停，不会自顾自往下走。
 *   3. 旋律与伴奏都走同一个 lookahead 循环、都用绝对时间排程，
 *      不再用 64 个 setTimeout（定时器抖动会让长曲子越到后面越飘）。
 *
 * 返回 stop，页面卸载时必须调用，否则循环会一直跑。
 */
export const playSong = (song: SongConfig, options: PlaySongOptions = {}): (() => void) => {
  const interval = 60000 / (options.bpm ?? song.bpm);
  const { beats } = options;
  const context = ensureSynth();
  const timers: Array<ReturnType<typeof setTimeout>> = [];
  let stopped = false;

  // 预先算出每个音的绝对时刻：前 beats.length 个用玩家节奏，其余按 BPM 续上。
  // 整体减去第一个音的时刻 —— 开局发呆的几秒不算演奏，回放不该先静默
  const lead = beats && beats.length > 0 ? beats[0] : 0;
  const noteTimes = song.melody.map((_, index) => {
    if (!beats || beats.length === 0) {
      return index * interval;
    }
    if (index < beats.length) {
      return Math.max(0, beats[index] - lead);
    }
    return beats[beats.length - 1] - lead + (index - beats.length + 1) * interval;
  });

  const total = song.melody.length;
  const barCount = Math.ceil(total / 4);
  const barTimes = Array.from({ length: barCount }, (_, bar) =>
    bar * 4 < total ? noteTimes[bar * 4] : noteTimes[total - 1] + interval
  );

  // 音频上下文不可用：退回纯定时器，只播旋律（保证曲集页不静音、不崩）
  if (!context) {
    noteTimes.forEach((at, index) => {
      timers.push(
        setTimeout(() => {
          if (stopped) {
            return;
          }
          playNote(song.melody[index], 0.62);
          options.onStep?.(index);
          if (index === total - 1) {
            timers.push(setTimeout(() => !stopped && options.onStep?.(-1), interval));
          }
        }, at)
      );
    });
    return () => {
      stopped = true;
      timers.forEach((timer) => clearTimeout(timer));
      stopAllNotes();
    };
  }

  const wallStart = Date.now();
  const withAccompaniment = options.accompaniment ?? accompanimentEnabled;
  let nextNote = 0;
  let nextBar = 0;
  let handle: ReturnType<typeof setInterval> | null = null;

  /**
   * 用**墙钟**决定「该排哪些事件」，用**音频时钟**决定「什么时候响」。
   *
   * 反过来做（用 ctx.currentTime 算 horizon）在音频上下文被挂起时会死锁：
   * currentTime 冻结在 0，horizon 永远推进不了，整首曲子卡在第一个音。
   * 移动端自动播放策略、切后台回来、iOS 首帧手势没落地时都会遇到。
   */
  const pump = () => {
    if (stopped) {
      return;
    }
    const elapsedMs = Date.now() - wallStart - START_LEAD * 1000;
    const horizon = (elapsedMs + SCHEDULER_LOOKAHEAD * 1000) / 1000;
    const running = context.state === 'running';

    while (nextNote < total && noteTimes[nextNote] / 1000 <= horizon) {
      const index = nextNote;
      const delay = Math.max(0.003, noteTimes[index] / 1000 - elapsedMs / 1000);
      // 上下文没跑起来就别排声音（排了会在恢复瞬间一起炸响），但进度照走
      if (running) {
        playNote(song.melody[index], 0.62, context.currentTime + delay, song.style);
      }
      // 进度条回调仍用定时器：±20ms 对 UI 没有意义，对音准有意义的是 when
      timers.push(
        setTimeout(
          () => !stopped && options.onStep?.(index),
          Math.max(0, noteTimes[index] - elapsedMs)
        )
      );
      if (index === total - 1) {
        // 最后一个音之后留一拍再收尾，避免进度条突然消失
        timers.push(
          setTimeout(
            () => !stopped && options.onStep?.(-1),
            Math.max(0, noteTimes[index] + interval - elapsedMs)
          )
        );
      }
      nextNote += 1;
    }

    while (withAccompaniment && nextBar < barCount && barTimes[nextBar] / 1000 <= horizon) {
      const bar = nextBar;
      const delay = Math.max(0.003, barTimes[bar] / 1000 - elapsedMs / 1000);
      const when = context.currentTime + delay;
      const nextAt = barTimes[bar + 1] ?? barTimes[bar] + interval * 4;
      // 小节时长封顶：玩家卡太久时不让一个和弦撑到十几秒
      const duration = Math.min(Math.max((nextAt - barTimes[bar]) / 1000, 0.25), (interval * 4) / 1000 * 2.5);
      const plan = running
        ? buildBarPlan({
            bar,
            chord: song.chords[bar] ?? song.chords[song.chords.length - 1],
            duration,
            timbre: song.style,
            lastBar: bar === barCount - 1
          })
        : [];
      plan.forEach((voice) => {
        if (voice.noise) {
          scheduleNoise({
            ctx: context,
            at: when + voice.offset,
            gain: voice.gain,
            freq: voice.noiseFreq ?? 1800,
            decay: voice.decay + voice.release
          });
          return;
        }
        if (voice.midi === undefined) {
          return;
        }
        scheduleVoice({
          midi: voice.midi,
          when: when + voice.offset,
          gain: voice.gain,
          attack: voice.attack,
          decay: voice.decay,
          sustain: voice.sustain,
          hold: voice.hold,
          release: voice.release,
          parts: voice.parts,
          dest: 'comp'
        });
      });
      nextBar += 1;
    }

    if (nextNote >= total && nextBar >= barCount) {
      if (handle) {
        clearInterval(handle);
        handle = null;
      }
    }
  };

  pump();
  handle = setInterval(pump, SCHEDULER_TICK);

  return () => {
    stopped = true;
    if (handle) {
      clearInterval(handle);
      handle = null;
    }
    timers.forEach((timer) => clearTimeout(timer));
    stopAllNotes();
  };
};

export const suspendAudio = (): void => {
  stopAllNotes();
  if (ctx && ctx.state === 'running') {
    ctx.suspend().catch(() => undefined);
  }
};

export const resumeAudio = (): void => {
  if (ctx && ctx.state === 'suspended') {
    ctx.resume().catch(() => undefined);
  }
};

/** 释放音频实例，避免常驻内存 */
export const releaseSounds = (): void => {
  stopAllNotes();
  (Object.keys(pool) as SoundKey[]).forEach((key) => {
    const instance = pool[key];
    if (instance) {
      instance.destroy();
      delete pool[key];
    }
  });
};
