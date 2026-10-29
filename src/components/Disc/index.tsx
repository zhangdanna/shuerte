import React from 'react';
import { Text, View } from '@tarojs/components';
import classnames from 'classnames';
import styles from './index.module.scss';

interface DiscProps {
  /** 是否旋转（首页常转、曲集回放时转、对局页慢转） */
  spinning?: boolean;
  /** 转一圈的秒数，越小越快 */
  speed?: number;
  /** 金唱片：盘面与标签换成金色 */
  gold?: boolean;
  /** 内置中心标签盘（随盘旋转，含轴孔与偏心音符）；传 children 时让位 */
  label?: boolean;
  className?: string;
  /** 不随盘旋转的中心内容（对局页的目标数字） */
  children?: React.ReactNode;
}

/**
 * 黑胶唱片。
 * 尺寸交给父容器（width/height 100%），中心标签用百分比自适应，
 * 所以首页 96rpx、曲集 108rpx、对局页 248rpx 共用同一份实现。
 * 转动线索来自反光带与偏心音符 —— 同心沟槽本身旋转是对称的，看不出来。
 */
const Disc: React.FC<DiscProps> = ({
  spinning = false,
  speed = 9,
  gold = false,
  label = true,
  className,
  children
}) => (
  <View
    className={classnames(styles.disc, gold && styles.gold, spinning && styles.spinning, className)}
    style={spinning ? { animationDuration: `${speed}s` } : undefined}
  >
    <View className={styles.sheen} />
    {children === undefined && label && (
      <View className={styles.label}>
        <Text className={styles.note}>♪</Text>
      </View>
    )}
    {children !== undefined && <View className={styles.center}>{children}</View>}
  </View>
);

export default Disc;
