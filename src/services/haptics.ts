import Taro from '@tarojs/taro';

let hapticsEnabled = true;

export const setHapticsEnabled = (enabled: boolean): void => {
  hapticsEnabled = enabled;
};

/**
 * 震动反馈。
 * 只用于「点错」和「通关」，正确点击不震动——高频震动会让体验变廉价。
 * 震动属于增强能力，平台不支持时降级但不静默：保留错误日志。
 */
export const vibrate = (type: 'light' | 'heavy'): void => {
  if (!hapticsEnabled) {
    return;
  }
  try {
    Taro.vibrateShort({ type }).catch((error) => {
      console.error('[Haptics] 震动调用失败', type, error);
    });
  } catch (error) {
    console.error('[Haptics] 震动异常', type, error);
  }
};
