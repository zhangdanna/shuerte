import { useCallback } from 'react';
import Taro from '@tarojs/taro';
import { View, Text, Switch } from '@tarojs/components';
import { useSaveStore } from '@/store/useSaveStore';
import { getLevelById } from '@/data/levels';
import { formatSeconds, formatRecordTime, isToday } from '@/utils/format';
import styles from './index.module.scss';

export default function MinePage() {
  const {
    stars,
    bestTimes,
    recent,
    totalGames,
    streakDays,
    settings,
    setSetting,
    resetAll
  } = useSaveStore();

  // 计算总星星数
  const totalStars = Object.values(stars).reduce((sum, s) => sum + s, 0);

  // 计算已通关关卡数
  const clearedLevels = Object.values(stars).filter((s) => s > 0).length;

  // 获取最近成绩（今天）
  const todayResults = recent
    .filter((r) => isToday(r.playedAt))
    .sort((a, b) => b.playedAt - a.playedAt)
    .slice(0, 5);

  // 获取最近成绩（全部）
  const allRecentResults = [...recent]
    .sort((a, b) => b.playedAt - a.playedAt)
    .slice(0, 10);

  // 音效开关
  const handleSoundToggle = useCallback(() => {
    setSetting('sound', !settings.sound);
  }, [settings.sound, setSetting]);

  // 震动开关
  const handleHapticToggle = useCallback(() => {
    setSetting('haptics', !settings.haptics);
  }, [settings.haptics, setSetting]);

  // 清空记录
  const handleReset = useCallback(() => {
    Taro.showModal({
      title: '确认清空',
      content: '将清空所有游戏记录，此操作不可恢复',
      confirmText: '清空',
      confirmColor: '#FF6B35',
      success: (res) => {
        if (res.confirm) {
          resetAll();
          Taro.showToast({ title: '已清空', icon: 'success' });
        }
      }
    });
  }, [resetAll]);

  return (
    <View className={styles.mine}>
      {/* 统计卡片 */}
      <View className={styles.statsCard}>
        <View className={styles.statsRow}>
          <View className={styles.statItem}>
            <Text className={styles.statValue}>{totalStars}</Text>
            <Text className={styles.statLabel}>总星星</Text>
          </View>
          <View className={styles.statDivider} />
          <View className={styles.statItem}>
            <Text className={styles.statValue}>{clearedLevels}</Text>
            <Text className={styles.statLabel}>已通关</Text>
          </View>
          <View className={styles.statDivider} />
          <View className={styles.statItem}>
            <Text className={styles.statValue}>{totalGames}</Text>
            <Text className={styles.statLabel}>总场次</Text>
          </View>
        </View>
        <View className={styles.streakRow}>
          <Text className={styles.streakText}>🔥 连续打卡 {streakDays} 天</Text>
        </View>
      </View>

      {/* 今日成绩 */}
      {todayResults.length > 0 && (
        <View className={styles.section}>
          <Text className={styles.sectionTitle}>今日成绩</Text>
          <View className={styles.resultList}>
            {todayResults.map((result) => {
              const level = getLevelById(result.levelId);
              return (
                <View key={result.id} className={styles.resultItem}>
                  <View className={styles.resultInfo}>
                    <Text className={styles.resultLevel}>{level?.name || '未知关卡'}</Text>
                    <Text className={styles.resultTime}>{formatRecordTime(result.playedAt)}</Text>
                  </View>
                  <View className={styles.resultStats}>
                    <Text className={styles.resultDuration}>{formatSeconds(result.duration)}</Text>
                    <Text className={styles.resultStars}>{'⭐'.repeat(result.stars)}</Text>
                  </View>
                </View>
              );
            })}
          </View>
        </View>
      )}

      {/* 最近成绩 */}
      {allRecentResults.length > 0 && (
        <View className={styles.section}>
          <Text className={styles.sectionTitle}>最近成绩</Text>
          <View className={styles.resultList}>
            {allRecentResults.map((result) => {
              const level = getLevelById(result.levelId);
              return (
                <View key={result.id} className={styles.resultItem}>
                  <View className={styles.resultInfo}>
                    <Text className={styles.resultLevel}>{level?.name || '未知关卡'}</Text>
                    <Text className={styles.resultTime}>{formatRecordTime(result.playedAt)}</Text>
                  </View>
                  <View className={styles.resultStats}>
                    <Text className={styles.resultDuration}>{formatSeconds(result.duration)}</Text>
                    <Text className={styles.resultStars}>{'⭐'.repeat(result.stars)}</Text>
                  </View>
                </View>
              );
            })}
          </View>
        </View>
      )}

      {/* 设置 */}
      <View className={styles.section}>
        <Text className={styles.sectionTitle}>设置</Text>
        <View className={styles.settingItem}>
          <Text className={styles.settingLabel}>音效</Text>
          <Switch
            checked={settings.sound}
            onChange={handleSoundToggle}
            color="#FF6B35"
          />
        </View>
        <View className={styles.settingItem}>
          <Text className={styles.settingLabel}>震动</Text>
          <Switch
            checked={settings.haptics}
            onChange={handleHapticToggle}
            color="#FF6B35"
          />
        </View>
      </View>

      {/* 关于 */}
      <View className={styles.section}>
        <Text className={styles.sectionTitle}>关于</Text>
        <View className={styles.aboutItem} onClick={handleReset}>
          <Text className={styles.aboutLabel}>清空记录</Text>
          <Text className={styles.aboutArrow}>›</Text>
        </View>
      </View>

      {/* 版本信息 */}
      <Text className={styles.version}>眼力大作战 v1.0.0</Text>
    </View>
  );
}
