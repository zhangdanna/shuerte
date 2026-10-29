import { useCallback, useEffect, useMemo } from 'react';
import Taro from '@tarojs/taro';
import { View, Text } from '@tarojs/components';
import classnames from 'classnames';
import Disc from '@/components/Disc';
import { useSaveStore } from '@/store/useSaveStore';
import { CHAPTERS, LEVELS, MAX_STARS, getChapterLevels } from '@/data/levels';
import { SONGS, getSongOrDefault } from '@/data/songs';
import { findCurrentLevel, isChapterUnlocked } from '@/utils/progress';
import { formatSeconds } from '@/utils/format';
import styles from './index.module.scss';

/** 谱纸上的音符：横向位置 / 纵向位置（%）与所在「小节」，纯装饰，不参与玩法 */
const STAFF_NOTES = [
  { left: 8, top: 34 },
  { left: 20, top: 62 },
  { left: 32, top: 26 },
  { left: 45, top: 54 },
  { left: 57, top: 38 },
  { left: 69, top: 66 },
  { left: 81, top: 30 },
  { left: 92, top: 58 }
];

export default function HomePage() {
  const { stars, bestTimes, streakDays, tutorialDone } = useSaveStore();

  // 小程序端导航栏标题已置空（首页自绘大标题）；H5 端的「标题」是浏览器标签，给个正式名字
  useEffect(() => {
    if (process.env.TARO_ENV === 'h5' && typeof document !== 'undefined') {
      document.title = '眼力大作战';
    }
  }, []);

  const totalStars = Object.values(stars).reduce((sum, s) => sum + s, 0);
  const currentLevel = findCurrentLevel(stars, totalStars, tutorialDone);
  const bestTime = bestTimes[currentLevel.id];
  const song = getSongOrDefault(currentLevel.songId);

  // 当前曲子的收录进度：关卡是曲子的段落
  const songLevels = useMemo(() => LEVELS.filter((level) => level.songId === song.id), [song.id]);
  const songCollected = songLevels.filter((level) => (stars[level.id] ?? 0) > 0).length;

  // 曲集：至少收录过一段的曲子算 1 首
  const collectedSongs = SONGS.filter((item) =>
    LEVELS.some((level) => level.songId === item.id && (stars[level.id] ?? 0) > 0)
  ).length;

  const handleStart = useCallback(() => {
    Taro.navigateTo({ url: `/pages/game/index?levelId=${currentLevel.id}` });
  }, [currentLevel]);

  const meta = currentLevel.tutorial
    ? '引子 · 先学会按顺序点'
    : `${currentLevel.chapterTitle} · 第 ${currentLevel.globalIndex} 关 · ${currentLevel.size}×${currentLevel.size}`;

  // 三卷进度：让首页回答「我走到哪一卷了」
  const volumes = useMemo(
    () =>
      CHAPTERS.map((chapter) => {
        const levels = getChapterLevels(chapter.id);
        return {
          id: chapter.id,
          title: chapter.title,
          earned: levels.reduce((sum, level) => sum + (stars[level.id] ?? 0), 0),
          max: levels.reduce((sum, level) => sum + level.maxStars, 0),
          unlocked: isChapterUnlocked(chapter, totalStars),
          starGate: chapter.starGate
        };
      }),
    [stars, totalStars]
  );

  return (
    <View className={styles.home}>
      {/* 首屏：一张谱纸，一句宣传语 */}
      <View className={styles.hero}>
        <View className={styles.heroTop}>
          <View className={styles.heroText}>
            <Text className={styles.title}>眼力大作战</Text>
            <Text className={styles.tagline}>一张乐谱纸，和一场属于你的演奏</Text>
          </View>
          <View className={styles.seal}>
            <Text className={styles.sealText}>谱</Text>
          </View>
        </View>

        <View className={styles.staff}>
          {[0, 1, 2, 3, 4].map((line) => (
            <View key={line} className={styles.staffLine} />
          ))}
          {STAFF_NOTES.map((note, index) => (
            <Text
              key={note.left}
              className={styles.staffNote}
              style={{ left: `${note.left}%`, top: `${note.top}%`, animationDelay: `${index * 0.42}s` }}
            >
              ♪
            </Text>
          ))}
        </View>
      </View>

      {/* 当前曲目：把「关卡进度」讲成「一首曲子弹到哪一段」 */}
      <View className={styles.scroll} onClick={() => Taro.switchTab({ url: '/pages/collection/index' })}>
        <View className={styles.scrollHead}>
          <Text className={styles.scrollLabel}>当前曲目</Text>
          <Text className={styles.scrollTier}>
            {currentLevel.tutorial ? '先走一遍引子' : `第 ${songCollected + 1} / ${songLevels.length} 段`}
          </Text>
        </View>
        <View className={styles.songRow}>
          <View className={styles.discSlot}>
            <Disc spinning speed={9} />
          </View>
          <View className={styles.songInfo}>
            <Text className={styles.songTitle}>《{song.title}》</Text>
            <Text className={styles.songMeta}>
              {song.bpm} BPM · {song.key}
            </Text>
          </View>
          <Text className={styles.arrow}>›</Text>
        </View>
        <View className={styles.segments}>
          {songLevels.map((level) => (
            <View
              key={level.id}
              className={classnames(styles.segment, (stars[level.id] ?? 0) > 0 && styles.segmentOn)}
            />
          ))}
        </View>
      </View>

      {/* 三卷：首页回答「我走到哪一卷了」 */}
      <View className={styles.volumes} onClick={() => Taro.switchTab({ url: '/pages/levels/index' })}>
        <View className={styles.volumesHead}>
          <Text className={styles.volumesTitle}>三卷</Text>
          <Text className={styles.volumesHint}>攒够星子，下一卷才开</Text>
        </View>
        <View className={styles.volumeRow}>
          {volumes.map((volume) => (
            <View
              key={volume.id}
              className={classnames(styles.volume, !volume.unlocked && styles.volumeLocked)}
            >
              <Text className={styles.volumeName}>{volume.title}</Text>
              <View className={styles.volumeBar}>
                <View
                  className={styles.volumeBarFill}
                  style={{ width: `${volume.max > 0 ? (volume.earned / volume.max) * 100 : 0}%` }}
                />
              </View>
              <Text className={styles.volumeMeta}>
                {volume.unlocked ? `${volume.earned}/${volume.max}` : `${volume.starGate} 星开卷`}
              </Text>
            </View>
          ))}
        </View>
      </View>

      <View className={styles.startSection}>
        <View className={styles.startButton} onClick={handleStart}>
          <Text className={styles.startButtonText}>
            {currentLevel.tutorial ? '开始演奏' : '继续演奏'}
          </Text>
        </View>
        <Text className={styles.levelInfo}>
          {meta}
          {bestTime ? ` · 最佳 ${formatSeconds(bestTime, 1)}` : ''}
        </Text>
      </View>

      <View className={styles.footer}>
        <View className={styles.footerItem}>
          <Text className={styles.footerValue}>
            {totalStars}
            <Text className={styles.footerUnit}>/{MAX_STARS}</Text>
          </Text>
          <Text className={styles.footerLabel}>拾得星子</Text>
        </View>
        <View className={styles.footerDivider} />
        <View className={styles.footerItem}>
          <Text className={styles.footerValue}>
            {collectedSongs}
            <Text className={styles.footerUnit}>/{SONGS.length}</Text>
          </Text>
          <Text className={styles.footerLabel}>收录曲目</Text>
        </View>
        <View className={styles.footerDivider} />
        <View className={styles.footerItem}>
          <Text className={styles.footerValue}>{streakDays}</Text>
          <Text className={styles.footerLabel}>连续演奏</Text>
        </View>
      </View>
    </View>
  );
}
