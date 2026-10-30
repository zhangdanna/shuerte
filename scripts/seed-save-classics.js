/**
 * 截图用的预置存档（仅开发期）：曲集「名曲拾遗」的解锁态展示。
 * 用法：node scripts/cdp-shot.js "<url>#/pages/collection/index" "docs/shot-collection.png" --init=scripts/seed-save-classics.js
 *
 * 场景：卷一 10 关满星 = 30 星 → 欢乐颂（24 星）已解锁、小步舞曲（48 星）仍锁；
 * 金唱片 0 张 → 卡农锁；S 评级 3 关 → 茉莉花 3/8。
 *
 * 注意：Taro H5 的 setStorageSync 写入的是 `{"data": <值>}` 双层包装，裸写会被丢弃。
 */
const beats14 = Array.from({ length: 36 }, (_, i) => Math.round(800 + i * 900 + (i % 5) * 260));

const stars = {};
for (let i = 1; i <= 10; i += 1) {
  stars[`1-${i}`] = 3;
}

localStorage.setItem(
  'shuerte_save',
  JSON.stringify({
    data: JSON.stringify({
      version: 5,
      state: {
        stars,
        bestTimes: { '1-1': 5120, '1-4': 38200 },
        bestErrors: { '1-1': 0, '1-4': 2 },
        grades: { '1-1': 'S', '1-2': 'S', '1-3': 'S', '1-4': 'B' },
        bestRuns: {
          '1-4': { stars: 1, elapsed: 38200, errors: 2, beats: beats14 }
        },
        tutorialDone: true,
        totalGames: 22,
        streakDays: 6,
        lastPlayedDate: '2026-10-29',
        recent: [],
        settings: {
          sound: true,
          music: true,
          accompaniment: true,
          haptics: true,
          colorful: false,
          timbre: 'piano'
        }
      }
    })
  })
);
