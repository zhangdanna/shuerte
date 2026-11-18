import React from 'react';
import { View } from '@tarojs/components';
import styles from './index.module.scss';

interface MemoryBarProps {
  /**
   * memorize = 记忆倒计时（整条从满到空）
   * recall   = 回忆进度（按已点比例填充）
   */
  mode: 'memorize' | 'recall';
  /** memorize：记忆总时长（毫秒） */
  duration?: number;
  /** recall：0 ~ 1 */
  progress?: number;
  /** memorize 的最后一段转朱砂预警 */
  warning?: boolean;
}

/**
 * 记忆条。
 *
 * 闪现阶段最怕的是「数字突然没了」——玩家还没扫完就被剥夺信息，只会觉得被耍。
 * 所以给一条明确在走的条：条走完 = 数字消失，玩家自己控制扫视节奏。
 * 最后 400ms 整条转朱砂，是「要收了」的第二次提醒。
 */
const MemoryBar: React.FC<MemoryBarProps> = ({ mode, duration = 0, progress = 0, warning = true }) => {
  if (mode === 'recall') {
    return (
      <View className={styles.track}>
        <View className={styles.progress} style={{ width: `${Math.min(100, Math.max(0, progress * 100))}%` }} />
      </View>
    );
  }

  return (
    <View className={styles.track}>
      <View className={styles.shrink} style={{ animationDuration: `${Math.max(1, duration)}ms` }} />
      {warning && duration > 400 && (
        <View
          className={styles.warn}
          style={{ animationDelay: `${duration - 400}ms`, animationDuration: '400ms' }}
        />
      )}
    </View>
  );
};

export default MemoryBar;
