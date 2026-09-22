import React from 'react';
import { Text, View } from '@tarojs/components';
import classnames from 'classnames';
import { LevelConfig } from '@/types/game';
import { formatSeconds } from '@/utils/format';
import StarRating from '@/components/StarRating';
import styles from './index.module.scss';

interface LevelCardProps {
  level: LevelConfig;
  stars: number;
  /** 最佳用时（毫秒），未通关为 null */
  bestTime: number | null;
  locked: boolean;
  /** 当前进度所在关卡，用于高亮 */
  current: boolean;
  onClick: (level: LevelConfig) => void;
}

const LevelCard: React.FC<LevelCardProps> = ({ level, stars, bestTime, locked, current, onClick }) => (
  <View
    className={classnames(styles.card, locked && styles.locked, current && styles.current)}
    onClick={() => {
      if (locked) {
        return;
      }
      onClick(level);
    }}
  >
    <View className={styles.head}>
      <Text className={styles.index}>第 {level.globalIndex} 关</Text>
      <Text className={styles.size}>
        {level.size}×{level.size}
      </Text>
    </View>
    {locked ? (
      <Text className={styles.lockHint}>未解锁</Text>
    ) : (
      <View className={styles.body}>
        <StarRating stars={stars} size="sm" />
        <Text className={styles.time}>{bestTime === null ? '未通关' : formatSeconds(bestTime, 1)}</Text>
      </View>
    )}
  </View>
);

export default LevelCard;
