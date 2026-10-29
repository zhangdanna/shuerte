import React from 'react';
import { Text, View } from '@tarojs/components';
import classnames from 'classnames';
import { LevelConfig } from '@/types/game';
import { MODE_LABELS } from '@/data/levels';
import { formatSeconds } from '@/utils/format';
import StarRating from '@/components/StarRating';
import styles from './index.module.scss';

interface LevelCardProps {
  level: LevelConfig;
  stars: number;
  /** 最佳用时（毫秒），未通关为 null */
  bestTime: number | null;
  /** 本关绑定的曲名：关卡是曲子的段落，不是孤立的数字 */
  songTitle: string;
  locked: boolean;
  /** 当前进度所在关卡，用于高亮 */
  current: boolean;
  onClick: (level: LevelConfig) => void;
}

const LevelCard: React.FC<LevelCardProps> = ({
  level,
  stars,
  bestTime,
  songTitle,
  locked,
  current,
  onClick
}) => (
  <View
    className={classnames(styles.card, locked && styles.locked, current && styles.current)}
    onClick={() => onClick(level)}
  >
    <View className={styles.head}>
      <Text className={styles.index}>第 {level.globalIndex} 关</Text>
      <Text className={styles.size}>
        {level.size}×{level.size}
      </Text>
    </View>

    <View className={styles.metaRow}>
      <Text className={styles.song}>{songTitle}</Text>
      {/* 变体玩法的关卡带玩法标签，避免看起来和第一轮的正序关一样 */}
      {level.mode !== 'forward' && <Text className={styles.mode}>{MODE_LABELS[level.mode]}</Text>}
    </View>

    {locked ? (
      <Text className={styles.lockHint}>先通上一关</Text>
    ) : (
      <View className={styles.body}>
        <StarRating stars={stars} max={level.maxStars} size="sm" />
        <Text className={styles.time}>{bestTime === null ? '未通关' : formatSeconds(bestTime, 1)}</Text>
      </View>
    )}

    {/* 当前关落一枚朱砂印，比高亮底色更克制 */}
    {current && (
      <View className={styles.seal}>
        <Text className={styles.sealText}>在此</Text>
      </View>
    )}
  </View>
);

export default LevelCard;
