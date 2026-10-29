import React, { useEffect, useState } from 'react';
import { Text, View } from '@tarojs/components';
import classnames from 'classnames';
import Disc from '@/components/Disc';
import styles from './index.module.scss';

/** 计时刷新间隔（毫秒）：50ms 足够让秒位平滑变化 */
const TICK_INTERVAL = 50;

/** 剩余时间进入警戒/危险的比例阈值 */
const WARNING_RATIO = 0.35;
const DANGER_RATIO = 0.15;

/** 环形进度色：与主题一致，只有这三档 */
const RING_COLORS = {
  normal: '#e85d2a',
  warning: '#c98a3a',
  danger: '#be4438'
};

interface TimerRingProps {
  /** 从引擎读取当前用时，避免把 20fps 的刷新扩散到整个方格树 */
  getElapsed: () => number;
  /** 本关限时（毫秒） */
  timeLimit: number;
  running: boolean;
  /** 当前目标数字：放在环心，成为整屏的主角 */
  target: number;
  errors: number;
  /** 指引关：不限时，环只作装饰 */
  untimed?: boolean;
}

/**
 * 环形计时：环心是当前目标数字，环本身是剩余时间。
 * 外圈沿用首页的黑胶唱片造型（一道反光慢慢扫过），里面垫一圈纸盘托住数字，
 * 这样计时、节拍、曲子三件事共用同一种形状语言；
 * 20fps 的刷新被隔离在这个组件内部，方格不会跟着重渲染。
 */
const TimerRing: React.FC<TimerRingProps> = ({
  getElapsed,
  timeLimit,
  running,
  target,
  errors,
  untimed = false
}) => {
  const [elapsed, setElapsed] = useState(getElapsed);

  useEffect(() => {
    setElapsed(getElapsed());
    if (!running || untimed) {
      return undefined;
    }
    const timer = setInterval(() => setElapsed(getElapsed()), TICK_INTERVAL);
    return () => clearInterval(timer);
  }, [running, untimed, getElapsed]);

  const remaining = Math.max(0, timeLimit - elapsed);
  const ratio = timeLimit > 0 ? remaining / timeLimit : 0;
  const level = ratio <= DANGER_RATIO ? 'danger' : ratio <= WARNING_RATIO ? 'warning' : 'normal';
  const percent = Math.max(0, Math.min(100, ratio * 100));
  const color = RING_COLORS[level];
  const seconds = Math.ceil(remaining / 1000);

  return (
    <View className={styles.wrap}>
      <View
        className={classnames(styles.ring, !untimed && styles[level])}
        style={{
          background: untimed
            ? `conic-gradient(${RING_COLORS.normal} 100%, ${RING_COLORS.normal} 0)`
            : `conic-gradient(${color} ${percent}%, #ede4d6 0)`
        }}
      >
        {/* 唱片层：只提供盘面与反光，慢转（26s 一圈），不抢数字的注意力 */}
        <View className={styles.discLayer}>
          <Disc spinning speed={26} label={false} />
        </View>
        <View className={styles.plate}>
          <Text className={styles.target}>{target}</Text>
        </View>
      </View>
      <View className={styles.meta}>
        <Text className={classnames(styles.remaining, !untimed && styles[level])}>
          {untimed ? '引子 · 不限时' : `剩余 ${seconds}″`}
        </Text>
        <View className={classnames(styles.errorBadge, errors > 0 && styles.errorBadgeOn)}>
          <Text className={classnames(styles.errorText, errors > 0 && styles.errorTextOn)}>× {errors}</Text>
        </View>
      </View>
    </View>
  );
};

export default TimerRing;
