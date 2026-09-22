import React, { useState } from 'react';
import { Text, View } from '@tarojs/components';
import Taro from '@tarojs/taro';
import classnames from 'classnames';
import LevelCard from '@/components/LevelCard';
import { CHAPTERS, getChapterById, getChapterLevels } from '@/data/levels';
import { useSaveStore } from '@/store/useSaveStore';
import { findCurrentLevel, isChapterUnlocked, isLevelUnlocked } from '@/utils/progress';
import { LevelConfig } from '@/types/game';
import styles from './index.module.scss';

const LevelsPage: React.FC = () => {
  const stars = useSaveStore((state) => state.stars);
  const bestTimes = useSaveStore((state) => state.bestTimes);

  const totalStars = Object.values(stars).reduce((sum, value) => sum + value, 0);
  const currentLevel = findCurrentLevel(stars, totalStars);
  const [activeChapterId, setActiveChapterId] = useState<number>(currentLevel.chapterId);

  const chapter = getChapterById(activeChapterId) ?? CHAPTERS[0];
  const chapterLevels = getChapterLevels(chapter.id);
  const chapterStars = chapterLevels.reduce((sum, item) => sum + (stars[item.id] ?? 0), 0);
  const chapterUnlocked = isChapterUnlocked(chapter, totalStars);

  const handleLevelClick = (level: LevelConfig) => {
    Taro.navigateTo({ url: `/pages/game/index?levelId=${level.id}` });
  };

  return (
    <View className={styles.page}>
      <View className={styles.chapterTabs}>
        {CHAPTERS.map((item) => (
          <View
            key={item.id}
            className={classnames(
              styles.chapterTab,
              item.id === activeChapterId && styles.chapterTabActive,
              !isChapterUnlocked(item, totalStars) && styles.chapterTabLocked
            )}
            onClick={() => setActiveChapterId(item.id)}
          >
            <Text className={styles.chapterTabText}>{item.title}</Text>
          </View>
        ))}
      </View>

      <View className={styles.chapterCard}>
        <View className={styles.chapterHead}>
          <Text className={styles.chapterTitle}>{chapter.title}</Text>
          <Text className={styles.chapterStars}>
            {chapterStars} / {chapterLevels.length * 3} 星
          </Text>
        </View>
        <Text className={styles.chapterSubtitle}>{chapter.subtitle}</Text>
        {!chapterUnlocked && (
          <Text className={styles.chapterLock}>
            累计 {chapter.starGate} 星解锁本档，当前 {totalStars} 星
          </Text>
        )}
      </View>

      <View className={styles.levelGrid}>
        {chapterLevels.map((level) => (
          <View key={level.id} className={styles.levelItem}>
            <LevelCard
              level={level}
              stars={stars[level.id] ?? 0}
              bestTime={bestTimes[level.id] ?? null}
              locked={!isLevelUnlocked(level, stars, totalStars)}
              current={level.id === currentLevel.id}
              onClick={handleLevelClick}
            />
          </View>
        ))}
      </View>

      <View className={styles.tip}>
        <Text className={styles.tipText}>
          每关都有倒计时，超时即失败；点错罚时 1.5s，看准再点比手快更划算
        </Text>
      </View>
    </View>
  );
};

export default LevelsPage;
