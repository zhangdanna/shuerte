import { useCallback, useEffect, useMemo } from 'react';
import Taro from '@tarojs/taro';
import { View, Text } from '@tarojs/components';
import classnames from 'classnames';
import Disc from '@/components/Disc';
import { useSaveStore } from '@/store/useSaveStore';
import { CHAPTERS, LEVELS, MAX_STARS, getChapterLevels } from '@/data/levels';
import { getSongOrDefault } from '@/data/songs';
import { findCurrentLevel, isChapterUnlocked } from '@/utils/progress';
import { formatSeconds } from '@/utils/format';
import styles from './index.module.scss';

/**
 * 首屏演示盘：乱序的九宫格，按 1→9 依次点亮，点过的落一枚 ♪。
 * 用固定盘面而不是随机 —— 每次进首页都一样，才像「一张贴在那儿的示例谱」。
 */
const DEMO_BOARD = [7, 3, 9, 1, 5, 8, 4, 2, 6];
/** 每格的间隔（秒）：9 格 × 0.45 = 4.05s，正好是一遍「点完九格」的节奏 */
const DEMO_STEP = 0.45;

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

  // 通关关卡数：主线是「找数字」，所以首页第一层数据是通关，而不是收录了几首曲子
  const clearedCount = useMemo(
    () => Object.values(stars).filter((value) => value > 0).length,
    [stars]
  );

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
      {/* 首屏：讲清楚「这是什么游戏」，然后立刻能开局 */}
      <View className={styles.hero}>
        <View className={styles.heroTop}>
          <View className={styles.heroText}>
            <Text className={styles.kicker}>舒尔特方格 · 按顺序点击数字</Text>
            <Text className={styles.title}>眼力大作战</Text>
            <Text className={styles.tagline}>一张乐谱纸，和一场属于你的演奏</Text>
          </View>
          <View className={styles.seal}>
            <Text className={styles.sealText}>奏</Text>
          </View>
        </View>

        {/* 演示盘：数字是主角，♪ 只是点过之后留下的记号 */}
        <View className={styles.demo} onClick={handleStart}>
          {DEMO_BOARD.map((value) => {
            const delay = `${(value - 1) * DEMO_STEP}s`;
            return (
              <View key={value} className={styles.demoCell} style={{ animationDelay: delay }}>
                <Text className={styles.demoNum}>{value}</Text>
                <Text className={styles.demoNote} style={{ animationDelay: delay }}>
                  ♪
                </Text>
              </View>
            );
          })}
        </View>
        <Text className={styles.demoCaption}>点过落一枚 ♪ · 点错罚时</Text>
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

      {/* 配乐：降级成一行。音乐是可选层，愿意听的人点进去，不愿意听的直接开局 */}
      <View className={styles.songBar} onClick={() => Taro.switchTab({ url: '/pages/collection/index' })}>
        <View className={styles.songDisc}>
          <Disc spinning speed={14} />
        </View>
        <View className={styles.songBarText}>
          <Text className={styles.songBarTitle}>《{song.title}》</Text>
          <Text className={styles.songBarMeta}>
            本关配乐 · 第 {Math.min(songCollected + 1, songLevels.length)} / {songLevels.length} 段
          </Text>
        </View>
        <Text className={styles.songBarArrow}>›</Text>
      </View>

      {/* 主按钮落在曲子下面：先看「这一关配什么乐」，再开局 */}
      <View className={styles.startSection}>
        <View className={styles.startButton} onClick={handleStart}>
          <Text className={styles.startButtonText}>
            {currentLevel.tutorial ? '开始挑战' : '继续挑战'}
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
            {clearedCount}
            <Text className={styles.footerUnit}>/{LEVELS.length}</Text>
          </Text>
          <Text className={styles.footerLabel}>通关关卡</Text>
        </View>
        <View className={styles.footerDivider} />
        <View className={styles.footerItem}>
          <Text className={styles.footerValue}>{streakDays}</Text>
          <Text className={styles.footerLabel}>连续训练</Text>
        </View>
      </View>
    </View>
  );
}
