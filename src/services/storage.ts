import Taro from '@tarojs/taro';

export const SAVE_STORAGE_KEY = 'shuerte_save';

/**
 * zustand persist 的存储适配器。
 * 小程序端为同步存储，H5 端由 Taro 映射到 localStorage。
 */
export const taroStorage = {
  getItem: (name: string): string | null => {
    const raw = Taro.getStorageSync(name);
    return typeof raw === 'string' && raw.length > 0 ? raw : null;
  },
  setItem: (name: string, value: string): void => {
    try {
      Taro.setStorageSync(name, value);
    } catch (error) {
      // 存档失败意味着玩家进度会丢失，属于必须让用户感知的失败，不能静默吞掉
      console.error('[Storage] 存档写入失败', name, error);
      Taro.showToast({ title: '存档失败，请检查存储空间', icon: 'none' });
    }
  },
  removeItem: (name: string): void => {
    try {
      Taro.removeStorageSync(name);
    } catch (error) {
      console.error('[Storage] 存档清除失败', name, error);
      Taro.showToast({ title: '清除失败，请重试', icon: 'none' });
    }
  }
};
