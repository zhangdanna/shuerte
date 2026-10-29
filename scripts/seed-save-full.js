/**
 * 截图用的预置存档（仅开发期）：卷一前 6 关满星 = 18 星 → 三卷全开。
 * 用法：node scripts/cdp-shot.js "<url>" "<out.png>" --init=scripts/seed-save-full.js
 * 用途：验证卷二圆形卡、卷三图案卡这类「跨卷才解锁」的形态。
 *
 * 注意：Taro H5 的 setStorageSync 实际写入的是 `{"data": <值>}` 这层包装
 * （见 @tarojs/taro-h5 的 setStorageSync），直接写裸 JSON 会被 getStorageSync
 * 判成「非本 API 写入」而丢弃，页面读不到进度。
 */
localStorage.setItem(
  'shuerte_save',
  JSON.stringify({
    data: JSON.stringify({
      version: 4,
      state: {
        stars: {
          '1-1': 3,
          '1-2': 3,
          '1-3': 3,
          '1-4': 3,
          '1-5': 3,
          '1-6': 3
        },
        bestTimes: {
          '1-1': 4820,
          '1-2': 9860,
          '1-3': 20100,
          '1-4': 35100,
          '1-5': 54000,
          '1-6': 36200
        },
        bestErrors: { '1-1': 0, '1-2': 0, '1-3': 0, '1-4': 0, '1-5': 0, '1-6': 0 },
        grades: { '1-1': 'S', '1-2': 'S', '1-3': 'S', '1-4': 'A', '1-5': 'A', '1-6': 'A' },
        fragments: 5,
        tutorialDone: true,
        totalGames: 24,
        streakDays: 6,
        lastPlayedDate: '2026-10-29',
        recent: [],
        settings: { sound: true, music: true, haptics: true, colorful: false, timbre: 'piano' }
      }
    })
  })
);
