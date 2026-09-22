import React, { useEffect, useState } from 'react';
import { Text, View } from '@tarojs/components';
import classnames from 'classnames';
import { formatSeconds } from '@/utils/format';
import styles from './index.module.scss';

/** 计时刷新间隔（毫秒）：50ms 足够让 0.1s 位平滑跳动 */
const TICK_INTERVAL = 50;

/** 剩余时间进入警戒/危险的比例阈值 */
const WARNING_RATIO = 0.35;
const DANGER_RATIO = 0.15;

interface TimerBarProps {
  /** 从引擎读取当前用时，避免把 20fps 的刷新扩散到整个方格树 */
  getElapsed: () => number;
  /** 本关限时（毫秒） */
  timeLimit: number;
  running: boolean;
}

/**
 * 计时条：同时显示「剩余时间」（倒计时，主导）与「实际用时」（统计）。
 * 20fps 的刷新被隔离在这个组件内部，方格不会跟着重渲染。
 */
const TimerBar: React.FC<TimerBarProps> = ({ getElapsed, timeLimit, running }) => {
  const [elapsed, setElapsed] = useState(getElapsed);

  useEffect(() => {
    setElapsed(getElapsed());
    if (!running) {
      return undefined;
    }
    const timer = setInterval(() => setElapsed(getElapsed()), TICK_INTERVAL);
    return () => clearInterval(timer);
  }, [running, getElapsed]);

  const remaining = Math.max(0, timeLimit - elapsed);
  const ratio = timeLimit > 0 ? remaining / timeLimit : 0;
  const urgency =
    ratio <= DANGER_RATIO ? styles.danger : ratio <= WARNING_RATIO ? styles.warning : undefined;

  return (
    <View className={styles.timer}>
      <Text className={styles.label}>剩余</Text>
      <Text className={classnames(styles.remaining, urgency)}>{formatSeconds(remaining, 1)}</Text>
      <Text className={styles.elapsed}>用时 {formatSeconds(elapsed, 1)}</Text>
      <View className={styles.track}>
        <View
          className={classnames(styles.bar, urgency)}
          style={{ width: `${Math.max(0, Math.min(100, ratio * 100))}%` }}
        />
      </View>
    </View>
  );
};

export default TimerBar;
