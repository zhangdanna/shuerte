import React, { useState } from 'react';
import { Text, View } from '@tarojs/components';
import Taro from '@tarojs/taro';
import classnames from 'classnames';
import LevelCard from '@/components/LevelCard';
import { CHAPTERS, GUIDE_LEVEL, MAX_STARS, getChapterById, getChapterLevels } from '@/data/levels';
import { getSongOrDefault } from '@/data/songs';
import { useSaveStore } from '@/store/useSaveStore';
import { findCurrentLevel, isChapterUnlocked, isLevelUnlocked } from '@/utils/progress';
import { ERROR_PENALTY } from '@/utils/scoring';
import { formatSeconds } from '@/utils/format';
import { LevelConfig } from '@/types/game';
import styles from './index.module.scss';

/** 卷序：古风页码，比「第一章」更贴纸面 */
const CHAPTER_NUMERALS = ['卷一', '卷二', '卷三'];

const LevelsPage: React.FC = () => {
  const stars = useSaveStore((state) => state.stars);
  const bestTimes = useSaveStore((state) => state.bestTimes);
  const tutorialDone = useSaveStore((state) => state.tutorialDone);

  const totalStars = Object.values(stars).reduce((sum, value) => sum + value, 0);
  const currentLevel = findCurrentLevel(stars, totalStars, tutorialDone);
  // 指引关不属于任何一卷，默认落在卷一
  const [activeChapterId, setActiveChapterId] = useState<number>(currentLevel.chapterId || CHAPTERS[0].id);

  const chapter = getChapterById(activeChapterId) ?? CHAPTERS[0];
  const chapterLevels = getChapterLevels(chapter.id);
  const chapterStars = chapterLevels.reduce((sum, item) => sum + (stars[item.id] ?? 0), 0);
  const chapterMaxStars = chapterLevels.reduce((sum, item) => sum + item.maxStars, 0);
  const chapterUnlocked = isChapterUnlocked(chapter, totalStars);

  const handleLevelClick = (level: LevelConfig) => {
    if (!isLevelUnlocked(level, stars, totalStars)) {
      const chapterOfLevel = getChapterById(level.chapterId);
      const tip = !chapterOfLevel || !isChapterUnlocked(chapterOfLevel, totalStars)
        ? `累计 ${chapterOfLevel?.starGate ?? 0} 星开卷`
        : `先通关第 ${level.globalIndex - 1} 关`;
      Taro.showToast({ title: tip, icon: 'none' });
      return;
    }
    Taro.navigateTo({ url: `/pages/game/index?levelId=${level.id}` });
  };

  const handleGuideClick = () => {
    Taro.navigateTo({ url: `/pages/game/index?levelId=${GUIDE_LEVEL.id}` });
  };

  return (
    <View className={styles.page}>
      {/* 卷首：总星进度 */}
      <View className={styles.header}>
        <View className={styles.headerRow}>
          <Text className={styles.pageTitle}>曲谱</Text>
          <Text className={styles.pageMeta}>
            {totalStars}
            <Text className={styles.pageMetaUnit}> / {MAX_STARS} 星</Text>
          </Text>
        </View>
        <View className={styles.headerLine}>
          <View
            className={styles.headerLineFill}
            style={{ width: `${MAX_STARS > 0 ? (totalStars / MAX_STARS) * 100 : 0}%` }}
          />
        </View>
      </View>

      {/* 三卷切换 */}
      <View className={styles.tabs}>
        {CHAPTERS.map((item, index) => {
          const levels = getChapterLevels(item.id);
          const earned = levels.reduce((sum, level) => sum + (stars[level.id] ?? 0), 0);
          const max = levels.reduce((sum, level) => sum + level.maxStars, 0);
          const unlocked = isChapterUnlocked(item, totalStars);
          const active = item.id === activeChapterId;
          return (
            <View
              key={item.id}
              className={classnames(styles.tab, active && styles.tabActive, !unlocked && styles.tabLocked)}
              onClick={() => setActiveChapterId(item.id)}
            >
              <Text className={styles.tabNumeral}>{CHAPTER_NUMERALS[index] ?? `卷${index + 1}`}</Text>
              <Text className={styles.tabName}>{item.title}</Text>
              <Text className={styles.tabStars}>{unlocked ? `${earned}/${max}` : `${item.starGate} 星开卷`}</Text>
              {active && <View className={styles.tabUnderline} />}
            </View>
          );
        })}
      </View>

      {/* 卷首卡 */}
      <View className={styles.chapterCard}>
        <View className={styles.chapterTop}>
          <View className={styles.chapterInfo}>
            <Text className={styles.chapterTitle}>{chapter.title}</Text>
            <Text className={styles.chapterSub}>{chapter.subtitle}</Text>
          </View>
          <Text className={styles.chapterStars}>
            {chapterStars}
            <Text className={styles.chapterStarsUnit}> / {chapterMaxStars} 星</Text>
          </Text>
        </View>
        <View className={styles.chapterBar}>
          <View
            className={styles.chapterBarFill}
            style={{ width: `${chapterMaxStars > 0 ? (chapterStars / chapterMaxStars) * 100 : 0}%` }}
          />
        </View>
        {!chapterUnlocked && (
          <Text className={styles.chapterLock}>
            累计 {chapter.starGate} 星开卷 · 当前 {totalStars} 星
          </Text>
        )}
      </View>

      {/* 引子：第一关之前的教学局，替代首页的常驻文字说明 */}
      {!tutorialDone && chapter.id === CHAPTERS[0].id && (
        <View className={styles.guide} onClick={handleGuideClick}>
          <View className={styles.guideSeal}>
            <Text className={styles.guideSealText}>引</Text>
          </View>
          <View className={styles.guideInfo}>
            <Text className={styles.guideTitle}>引子 · 第一关之前</Text>
            <Text className={styles.guideDesc}>九个数字九个音，先学会按顺序点</Text>
          </View>
          <Text className={styles.guideAction}>开始 ›</Text>
        </View>
      )}

      <View className={styles.levelGrid}>
        {chapterLevels.map((level) => (
          <View key={level.id} className={styles.levelItem}>
            <LevelCard
              level={level}
              stars={stars[level.id] ?? 0}
              bestTime={bestTimes[level.id] ?? null}
              songTitle={getSongOrDefault(level.songId).title}
              locked={!isLevelUnlocked(level, stars, totalStars)}
              current={level.id === currentLevel.id}
              onClick={handleLevelClick}
            />
          </View>
        ))}
      </View>

      <View className={styles.tip}>
        <Text className={styles.tipText}>
          点错罚时 {formatSeconds(ERROR_PENALTY, 2)} · 每关限时，超时重来
        </Text>
      </View>
    </View>
  );
};

export default LevelsPage;
