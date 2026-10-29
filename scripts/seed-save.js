/**
 * 截图用的预置存档（仅开发期）。
 * 用法：node scripts/cdp-shot.js "<url>" "<out.png>" --init=scripts/seed-save.js
 *
 * 场景：卷一前 4 关已通（共 9 星）→ 卷二「中调」刚好开卷、卷三仍锁；
 * 引子已走完，所以首页落在第 5 关。
 * 另外给 1-4（6×6，36 音）写了一份不均匀的击键记录，用来验证曲集的「我的演奏」回放。
 *
 * 注意：Taro H5 的 setStorageSync 实际写入的是 `{"data": <值>}` 这层包装
 * （见 @tarojs/taro-h5 的 setStorageSync），直接写裸 JSON 会被 getStorageSync
 * 判成「非本 API 写入」而丢弃，页面读不到进度。
 */

// 模拟一次 6×6 的弹奏：整体偏慢，每 5 个音会卡一下（真实玩家的节奏不会均匀）
const beats14 = Array.from({ length: 36 }, (_, i) => Math.round(800 + i * 900 + (i % 5) * 260));

localStorage.setItem(
  'shuerte_save',
  JSON.stringify({
    data: JSON.stringify({
      version: 4,
      state: {
        stars: { '1-1': 3, '1-2': 3, '1-3': 2, '1-4': 1 },
        bestTimes: { '1-1': 5120, '1-2': 10240, '1-3': 21800, '1-4': 38200 },
        bestErrors: { '1-1': 0, '1-2': 0, '1-3': 1, '1-4': 2 },
        grades: { '1-1': 'S', '1-2': 'A', '1-3': 'A', '1-4': 'B' },
        bestRuns: {
          '1-4': { stars: 1, elapsed: 38200, errors: 2, beats: beats14 }
        },
        fragments: 3,
        tutorialDone: true,
        totalGames: 12,
        streakDays: 4,
        lastPlayedDate: '2026-10-29',
        recent: [],
        settings: { sound: true, music: true, haptics: true, colorful: false, timbre: 'piano' }
      }
    })
  })
);
