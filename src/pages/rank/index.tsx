import React from 'react';
import { Text, View } from '@tarojs/components';
import Taro, { useShareAppMessage } from '@tarojs/taro';
import { getRankShare } from '@/utils/share';
import styles from './index.module.scss';

/**
 * 排行榜占位页。
 * M1 的成绩全部保存在本机，云端排行榜需要服务端校验成绩时间戳，安排在 M3 里程碑。
 */
const RankPage: React.FC = () => {
  // 占位页也接上转发，否则从这儿点右上角转发还是「当前页面未设置分享」
  useShareAppMessage(() => getRankShare());

  return (
    <View className={styles.page}>
      <Text className={styles.title}>排行榜</Text>
      <Text className={styles.desc}>功能正在开发中...</Text>
      <View className={styles.tipCard}>
        <Text className={styles.tipTitle}>当前版本</Text>
        <Text className={styles.tipText}>
          你的成绩已保存在本机（关卡地图可查看每关星级与最佳用时）。云端排行榜将在后续版本开放。
        </Text>
      </View>
      <View className={styles.primaryBtn} onClick={() => Taro.navigateBack()}>
        <Text className={styles.primaryBtnText}>返回</Text>
      </View>
    </View>
  );
};

export default RankPage;
