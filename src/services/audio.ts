import Taro from '@tarojs/taro';
import { SOUND_SOURCES, SoundKey } from '@/data/sounds';

type AudioInstance = ReturnType<typeof Taro.createInnerAudioContext>;

const isWeapp = process.env.TARO_ENV === 'weapp';

const pool: Partial<Record<SoundKey, AudioInstance>> = {};
const localPathCache: Partial<Record<SoundKey, string>> = {};

let soundEnabled = true;

export const setSoundEnabled = (enabled: boolean): void => {
  soundEnabled = enabled;
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
    // play() 可能返回 Promise，需要捕获异步错误
    const playResult = instance.play();
    if (playResult && typeof playResult.catch === 'function') {
      playResult.catch((err) => {
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

/** 释放音频实例，避免常驻内存 */
export const releaseSounds = (): void => {
  (Object.keys(pool) as SoundKey[]).forEach((key) => {
    const instance = pool[key];
    if (instance) {
      instance.destroy();
      delete pool[key];
    }
  });
};
