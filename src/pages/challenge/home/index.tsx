import React, { useCallback, useEffect, useMemo } from 'react';
import Taro, { useShareAppMessage, useShareTimeline } from '@tarojs/taro';
import { Text, View } from '@tarojs/components';
import classnames from 'classnames';
import {
  MAX_MEMORY_STARS,
  MEMORY_LEVELS,
  MEMORY_SEGMENTS,
  getSegmentLevels
} from '@/data/challengeLevels';
import { useChallengeStore } from '@/store/useChallengeStore';
import {
  findCurrentMemoryLevel,
  getTotalMemoryStars,
  isMemoryLevelUnlocked
} from '@/utils/memoryProgress';
import { formatSeconds } from '@/utils/format';
import styles from './index.module.scss';

/**
 * 演示盘：固定盘面，数字亮 2.3 秒后隐去，循环播放。
 * 用固定盘而不是随机 —— 每次进大厅都一样，才像「贴在那儿的一张示例」，
 * 玩家第二次进来能立刻认出「哦，这个会消失」。
 */
const DEMO_BOARD = [4, 9, 2, 7, 5, 3, 8, 1, 6];

/** 竖排落款：书法里的「款」，比横排小字更像画上的题识 */
const COLOPHON = '记数字之位置';

const ChallengeHomePage: React.FC = () => {
  const stars = useChallengeStore((state) => state.stars);
  const bestTimes = useChallengeStore((state) => state.bestTimes);

  useShareAppMessage(() => ({
    title: '墨隐 · 数字只亮几秒，隐去之后你还记得住几个位置？',
    path: '/pages/challenge/home/index'
  }));
  useShareTimeline(() => ({
    title: '数字亮几秒就隐去，靠记忆按顺序点回来'
  }));

  // 小程序端导航栏标题已置空（自绘大标题）；H5 端的标题是浏览器标签，给个正式名字
  useEffect(() => {
    if (process.env.TARO_ENV === 'h5' && typeof document !== 'undefined') {
      document.title = '墨隐 · 眼力大作战';
    }
  }, []);

  const totalStars = getTotalMemoryStars(stars);
  const currentLevel = findCurrentMemoryLevel(stars);
  const bestTime = bestTimes[currentLevel.id];
  const cleared = MEMORY_LEVELS.filter((level) => (stars[level.id] ?? 0) > 0).length;

  const segments = useMemo(
    () =>
      MEMORY_SEGMENTS.map((segment) => {
        const levels = getSegmentLevels(segment.id);
        const earned = levels.reduce((sum, level) => sum + (stars[level.id] ?? 0), 0);
        return {
          ...segment,
          earned,
          max: levels.length * 3,
          unlocked: levels.length > 0 && isMemoryLevelUnlocked(levels[0], stars)
        };
      }),
    [stars]
  );

  const handleStart = useCallback(() => {
    Taro.navigateTo({ url: `/pages/challenge/game/index?levelId=${currentLevel.id}` });
  }, [currentLevel.id]);

  const handleLevels = useCallback(() => {
    Taro.navigateTo({ url: '/pages/challenge/levels/index' });
  }, []);

  const meta = `第 ${currentLevel.globalIndex} 关 · ${currentLevel.layoutLabel} · 闪 ${(
    currentLevel.flashMs / 1000
  ).toFixed(1)}″`;

  return (
    <View className={styles.page}>
      {/* 背景：两团墨晕 + 底部一道地平线弧。不承载信息，只负责让纸「有远近」 */}
      <View className={styles.washTop} />
      <View className={styles.washBottom} />
      <View className={styles.ridge} />

      <View className={styles.hero}>
        <View className={styles.heroTop}>
          <View className={styles.heroText}>
            <Text className={styles.kicker}>挑战版 · 记数字的位置</Text>
            <Text className={styles.title}>墨隐</Text>
            <Text className={styles.tagline}>数字亮几秒就隐去，剩下的靠脑子</Text>
          </View>
          <View className={styles.colophonWrap}>
            <View className={styles.colophon}>
              {COLOPHON.split('').map((char, index) => (
                <Text key={`${char}-${index}`} className={styles.colophonChar}>
                  {char}
                </Text>
              ))}
            </View>
            <View className={styles.seal}>
              <Text className={styles.sealText}>墨</Text>
            </View>
          </View>
        </View>

        {/* 演示盘：数字亮 → 隐去 → 再亮，循环。一眼看懂玩法，不用读说明 */}
        <View className={styles.demoFrame}>
          <View className={styles.demo}>
            {DEMO_BOARD.map((value) => (
              <View key={value} className={styles.demoCell}>
                <View className={styles.demoInner}>
                  <Text className={styles.demoNum}>{value}</Text>
                </View>
              </View>
            ))}
          </View>
        </View>
        <Text className={styles.demoCaption}>隐去之后，格子还在 —— 记的是位置，不是数字</Text>
      </View>

      <View className={styles.stats}>
        <View className={styles.statItem}>
          <Text className={styles.statValue}>
            {cleared}
            <Text className={styles.statUnit}>/{MEMORY_LEVELS.length}</Text>
          </Text>
          <Text className={styles.statLabel}>通关</Text>
        </View>
        <View className={styles.statDivider} />
        <View className={styles.statItem}>
          <Text className={styles.statValue}>
            {totalStars}
            <Text className={styles.statUnit}>/{MAX_MEMORY_STARS}</Text>
          </Text>
          <Text className={styles.statLabel}>拾得星子</Text>
        </View>
        <View className={styles.statDivider} />
        <View className={styles.statItem}>
          <Text className={styles.statValue}>{bestTime ? formatSeconds(bestTime, 1) : '—'}</Text>
          <Text className={styles.statLabel}>本关最佳</Text>
        </View>
      </View>

      <View className={styles.segments} onClick={handleLevels}>
        <View className={styles.segmentsHead}>
          <Text className={styles.segmentsTitle}>三段</Text>
          <Text className={styles.segmentsHint}>通一关，下一关才开</Text>
        </View>
        {segments.map((segment) => (
          <View key={segment.id} className={classnames(styles.segment, !segment.unlocked && styles.segmentLocked)}>
            <Text className={styles.segmentName}>{segment.title}</Text>
            <View className={styles.segmentBar}>
              <View
                className={styles.segmentFill}
                style={{ width: `${segment.max > 0 ? (segment.earned / segment.max) * 100 : 0}%` }}
              >
                {/* 墨迹末端的一点：让进度条读起来像「写到这里」，而不是「填充到 42%」 */}
                {segment.earned > 0 && <View className={styles.segmentDrop} />}
              </View>
            </View>
            <Text className={styles.segmentMeta}>
              {segment.unlocked ? `${segment.earned}/${segment.max}` : '未至'}
            </Text>
          </View>
        ))}
      </View>

      <View className={styles.startSection}>
        <View className={styles.startButton} onClick={handleStart}>
          <Text className={styles.startButtonText}>{cleared > 0 ? '继续挑战' : '开始挑战'}</Text>
        </View>
        <Text className={styles.levelInfo}>{meta}</Text>
      </View>

      <View className={styles.tip}>
        <Text className={styles.tipText}>点错掉一条命 · 每关可窥看一次，代价是 4 秒</Text>
      </View>
    </View>
  );
};

export default ChallengeHomePage;
