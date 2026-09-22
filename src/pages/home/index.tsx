import { useCallback } from 'react';
import Taro from '@tarojs/taro';
import { View, Text } from '@tarojs/components';
import { useSaveStore } from '@/store/useSaveStore';
import { findCurrentLevel } from '@/utils/progress';
import { formatSeconds } from '@/utils/format';
import styles from './index.module.scss';

export default function HomePage() {
  const { stars, bestTimes } = useSaveStore();

  // 计算总星星数
  const totalStars = Object.values(stars).reduce((sum, s) => sum + s, 0);

  // 获取当前关卡（全部通关时回到最后一关刷星）
  const currentLevel = findCurrentLevel(stars, totalStars);

  // 获取当前关卡最佳用时
  const bestTime = currentLevel ? bestTimes[currentLevel.id] : null;

  // 开始挑战
  const handleStartChallenge = useCallback(() => {
    if (!currentLevel) {
      return;
    }

    Taro.navigateTo({
      url: `/pages/game/index?levelId=${currentLevel.id}`
    });
  }, [currentLevel]);

  return (
    <View className={styles.home}>
      {/* 标题区域 */}
      <View className={styles.titleSection}>
        <Text className={styles.title}>眼力大作战</Text>
        <Text className={styles.subtitle}>挑战你的视觉极限</Text>
      </View>

      {/* 装饰动画区域 */}
      <View className={styles.decoSection}>
        <View className={styles.decoGrid}>
          {Array.from({ length: 9 }, (_, i) => (
            <View
              key={i}
              className={styles.decoCell}
              style={{ animationDelay: `${i * 0.1}s` }}
            >
              <Text className={styles.decoNumber}>{i + 1}</Text>
            </View>
          ))}
        </View>
        <Text className={styles.decoTip}>按顺序点击 1 → 9，越快越好！</Text>
      </View>

      {/* 开始挑战按钮 */}
      <View className={styles.startSection}>
        <View className={styles.startButton} onClick={handleStartChallenge}>
          <Text className={styles.startButtonText}>开始挑战</Text>
        </View>
        {currentLevel && (
          <Text className={styles.levelInfo}>
            {currentLevel.chapterTitle} · 第 {currentLevel.globalIndex} 关 · {currentLevel.size}×{currentLevel.size}
            {bestTime ? ` · 最佳 ${formatSeconds(bestTime)}` : ''}
          </Text>
        )}
      </View>
    </View>
  );
}
