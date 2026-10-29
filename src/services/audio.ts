import Taro from '@tarojs/taro';
import { SOUND_SOURCES, SoundKey } from '@/data/sounds';
import { SongConfig, TimbreKey } from '@/types/game';

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

export const setSoundEnabled = (enabled: boolean): void => {
  soundEnabled = enabled;
};

export const setMusicEnabled = (enabled: boolean): void => {
  musicEnabled = enabled;
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

interface TimbrePart {
  type: OscillatorType;
  ratio: number;
  gain: number;
}

interface TimbreSpec {
  parts: TimbrePart[];
  /** 衰减到峰值的比例（越大越"余音缭绕"） */
  sustain: number;
  /** 释音时长（秒） */
  release: number;
}

/**
 * 四种音色只改三件事：波形组合、包络、释音长度。
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
let master: GainNode | null = null;
let synthReady = false;
let synthUnavailable = false;
let timbre: TimbreKey = 'piano';

/** 同时发声上限：超出时抢占最旧的声部，避免连点爆音 */
const MAX_VOICES = 10;
const voices: Array<{ stop: () => void }> = [];

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

/** 建一条共享总线：增益 → 压缩 → 输出，另挂一条短延迟做混响 */
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
    const bus = context.createGain();
    bus.gain.value = 0.9;

    const limiter = context.createDynamicsCompressor();
    limiter.threshold.value = -18;
    limiter.knee.value = 12;
    limiter.ratio.value = 3;
    limiter.attack.value = 0.003;
    limiter.release.value = 0.18;

    // 简易混响：反馈延迟，比卷积省得多，听感够用
    const delay = context.createDelay(0.5);
    delay.delayTime.value = 0.09;
    const feedback = context.createGain();
    feedback.gain.value = 0.18;
    const wet = context.createGain();
    wet.gain.value = 0.14;

    bus.connect(limiter);
    bus.connect(delay);
    delay.connect(feedback);
    feedback.connect(delay);
    delay.connect(wet);
    wet.connect(limiter);
    limiter.connect(context.destination);

    ctx = context;
    master = bus;
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

export const stopAllNotes = (): void => {
  while (voices.length > 0) {
    voices.pop()?.stop();
  }
};

/**
 * 弹一个音。
 * @param midi MIDI 音高，60 = C4
 * @param velocity 0~1，默认 0.72
 */
export const playNote = (midi: number, velocity = 0.72): void => {
  if (!musicEnabled) {
    return;
  }
  const context = ensureSynth();
  if (!context || !master) {
    // 降级：至少让玩家听到"点对了"
    playSound('click');
    return;
  }
  if (context.state === 'suspended') {
    context.resume().catch(() => undefined);
  }

  const spec = TIMBRES[timbre] ?? TIMBRES.piano;
  const now = context.currentTime + 0.004;
  const freq = 440 * Math.pow(2, (midi - 69) / 12);
  const peak = Math.max(0.02, Math.min(1, velocity)) * 0.34;
  const sustain = Math.max(0.0003, peak * spec.sustain);
  // 低音余音更长，听感更接近真实钢琴
  const release = midi < 55 ? spec.release * 1.4 : spec.release;

  const envelope = context.createGain();
  envelope.gain.setValueAtTime(0.0001, now);
  envelope.gain.exponentialRampToValueAtTime(peak, now + 0.008);
  envelope.gain.exponentialRampToValueAtTime(sustain, now + 0.2);
  envelope.gain.exponentialRampToValueAtTime(0.0001, now + 0.2 + release);
  envelope.connect(master);

  const oscillators: OscillatorNode[] = [];
  spec.parts.forEach((part) => {
    const osc = context.createOscillator();
    osc.type = part.type;
    osc.frequency.value = freq * part.ratio;
    const gain = context.createGain();
    gain.gain.value = part.gain;
    osc.connect(gain);
    gain.connect(envelope);
    osc.start(now);
    osc.stop(now + 0.22 + release + 0.03);
    oscillators.push(osc);
  });

  const voice = {
    stop: () => {
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
    }
  };
  voices.push(voice);
  if (voices.length > MAX_VOICES) {
    voices.shift()?.stop();
  }
  // 自然结束后出列，避免 voices 无限增长
  setTimeout(() => {
    const index = voices.indexOf(voice);
    if (index >= 0) {
      voices.splice(index, 1);
    }
  }, (0.22 + release + 0.1) * 1000);
};

/** 和弦铺底：音量压低，只做背景 */
const playChord = (midis: number[], velocity = 0.2): void => {
  midis.forEach((midi) => playNote(midi, velocity));
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
}

/**
 * 回放整首曲子（曲集页用）。
 * 默认按曲目 BPM 等间隔自动演奏；传入 beats 则按玩家自己的节奏播。
 * 返回 stop，页面卸载时必须调用，否则定时器会一直跑。
 */
export const playSong = (song: SongConfig, options: PlaySongOptions = {}): (() => void) => {
  const interval = 60000 / (options.bpm ?? song.bpm);
  const { beats } = options;
  const timers: Array<ReturnType<typeof setTimeout>> = [];
  let stopped = false;

  // 预先算出每个音的绝对时刻：前 beats.length 个用玩家节奏，其余按 BPM 续上。
  // 整体减去第一个音的时刻 —— 开局发呆的几秒不算演奏，回放不该先静默
  const lead = beats && beats.length > 0 ? beats[0] : 0;
  const schedule = song.melody.map((_, index) => {
    if (!beats || beats.length === 0) {
      return index * interval;
    }
    if (index < beats.length) {
      return Math.max(0, beats[index] - lead);
    }
    return beats[beats.length - 1] - lead + (index - beats.length + 1) * interval;
  });

  const total = song.melody.length;

  schedule.forEach((at, index) => {
    timers.push(
      setTimeout(() => {
        if (stopped) {
          return;
        }
        playNote(song.melody[index], 0.62);
        // 每小节首拍铺一个和弦，让单声部旋律听起来有伴奏
        if (index % 4 === 0) {
          const chord = song.chords[Math.floor(index / 4)];
          if (chord) {
            playChord(chord, 0.16);
          }
        }
        options.onStep?.(index);
        // 最后一个音之后留一拍再收尾，避免进度条突然消失
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
