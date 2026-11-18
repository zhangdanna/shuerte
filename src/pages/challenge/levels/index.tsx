import React, { useCallback, useState } from 'react';
import { Text, View } from '@tarojs/components';
import Taro, { useShareAppMessage, useShareTimeline } from '@tarojs/taro';
import classnames from 'classnames';
import StarRating from '@/components/StarRating';
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
import { MemoryLevel } from '@/types/challenge';
import styles from './index.module.scss';

/** 段序：与经典版的「卷一/卷二/卷三」区分开，这里是「一记/二记/三记」 */
const SEGMENT_NUMERALS = ['一记', '二记', '三记'];

/** 页面下方那方淡墨大字用的单字（列表短时把留白填成「留白」，不是「没内容」） */
const SEGMENT_GLYPHS = ['壹', '贰', '叁'];

const ChallengeLevelsPage: React.FC = () => {
  const stars = useChallengeStore((state) => state.stars);
  const bestTimes = useChallengeStore((state) => state.bestTimes);

  useShareAppMessage(() => ({
    title: `墨隐 ${MEMORY_LEVELS.length} 关，数字隐去后你还记得住几个位置？`,
    path: '/pages/challenge/home/index'
  }));
  useShareTimeline(() => ({
    title: '数字亮几秒就隐去，靠记忆按顺序点回来'
  }));

  const totalStars = getTotalMemoryStars(stars);
  const currentLevel = findCurrentMemoryLevel(stars);
  const [activeSegmentId, setActiveSegmentId] = useState<number>(currentLevel.segmentId);

  const segmentLevels = getSegmentLevels(activeSegmentId);

  const handleLevelClick = useCallback(
    (level: MemoryLevel) => {
      if (!isMemoryLevelUnlocked(level, stars)) {
        const previous = MEMORY_LEVELS[level.globalIndex - 2];
        Taro.showToast({
          title: previous ? `先通关第 ${previous.globalIndex} 关` : '尚未解锁',
          icon: 'none'
        });
        return;
      }
      Taro.navigateTo({ url: `/pages/challenge/game/index?levelId=${level.id}` });
    },
    [stars]
  );

  return (
    <View className={styles.page}>
      {/* 墨晕用独立元素而不是伪元素：整页的装饰层都必须能单独定位，才好压在内容下面 */}
      <View className={styles.wash} />
      {/* 淡墨大字：每段只有 3~5 关，列表天然偏短，这方大字把下方留白撑成画面的一部分 */}
      <Text className={styles.ghostGlyph}>{SEGMENT_GLYPHS[activeSegmentId - 1] ?? ''}</Text>

      <View className={styles.header}>
        <View className={styles.headerRow}>
          {/* 大厅是 tabBar 页：这里只能用 switchTab，navigateBack 在 redirectTo 之后会退无可退 */}
          <View
            className={styles.backBtn}
            onClick={() => Taro.switchTab({ url: '/pages/challenge/home/index' })}
          >
            <Text className={styles.backIcon}>‹</Text>
            <Text className={styles.backText}>墨隐</Text>
          </View>
          <Text className={styles.pageMeta}>
            {totalStars}
            <Text className={styles.pageMetaUnit}> / {MAX_MEMORY_STARS} 星</Text>
          </Text>
        </View>
        <Text className={styles.pageTitle}>关卡</Text>
        <View className={styles.headerLine}>
          <View
            className={styles.headerLineFill}
            style={{ width: `${MAX_MEMORY_STARS > 0 ? (totalStars / MAX_MEMORY_STARS) * 100 : 0}%` }}
          />
        </View>
      </View>

      <View className={styles.tabs}>
        {MEMORY_SEGMENTS.map((segment, index) => {
          const levels = getSegmentLevels(segment.id);
          const earned = levels.reduce((sum, level) => sum + (stars[level.id] ?? 0), 0);
          const max = levels.length * 3;
          const unlocked = levels.length > 0 && isMemoryLevelUnlocked(levels[0], stars);
          const active = segment.id === activeSegmentId;
          return (
            <View
              key={segment.id}
              className={classnames(styles.tab, active && styles.tabActive, !unlocked && styles.tabLocked)}
              onClick={() => setActiveSegmentId(segment.id)}
            >
              <Text className={styles.tabNumeral}>{SEGMENT_NUMERALS[index] ?? `第 ${index + 1} 段`}</Text>
              <Text className={styles.tabName}>{segment.title}</Text>
              <Text className={styles.tabStars}>{unlocked ? `${earned}/${max}` : '未至'}</Text>
              {active && <View className={styles.tabUnderline} />}
            </View>
          );
        })}
      </View>

      <View className={styles.segmentCard}>
        <View className={styles.segmentText}>
          <Text className={styles.segmentTitle}>{MEMORY_SEGMENTS[activeSegmentId - 1]?.title ?? ''}</Text>
          <Text className={styles.segmentSub}>{MEMORY_SEGMENTS[activeSegmentId - 1]?.subtitle ?? ''}</Text>
        </View>
      </View>

      <View className={styles.levelGrid}>
        {segmentLevels.map((level) => {
          const locked = !isMemoryLevelUnlocked(level, stars);
          const best = bestTimes[level.id];
          const isCurrent = level.id === currentLevel.id;
          return (
            <View
              key={level.id}
              className={classnames(
                styles.card,
                locked && styles.cardLocked,
                isCurrent && styles.cardCurrent
              )}
              onClick={() => handleLevelClick(level)}
            >
              <View className={styles.cardTop}>
                <Text className={styles.cardNo}>第 {level.globalIndex} 关</Text>
                <Text className={styles.cardSize}>{level.layoutLabel}</Text>
              </View>
              {locked ? (
                <Text className={styles.cardLock}>未至</Text>
              ) : (
                <StarRating stars={stars[level.id] ?? 0} max={3} size="sm" />
              )}
              <Text className={styles.cardMeta}>
                {locked
                  ? `闪 ${(level.flashMs / 1000).toFixed(1)}″`
                  : best
                    ? `最佳 ${formatSeconds(best, 1)}`
                    : `闪 ${(level.flashMs / 1000).toFixed(1)}″`}
              </Text>
            </View>
          );
        })}
      </View>

      <View className={styles.tip}>
        <Text className={styles.tipText}>点错掉一条命 · 每关可窥看一次，代价 4 秒且拿不到满星</Text>
      </View>
    </View>
  );
};

export default ChallengeLevelsPage;
