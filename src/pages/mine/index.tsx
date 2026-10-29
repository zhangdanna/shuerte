import { useCallback } from 'react';
import Taro from '@tarojs/taro';
import { View, Text, Switch } from '@tarojs/components';
import classnames from 'classnames';
import { useSaveStore } from '@/store/useSaveStore';
import { LEVELS, MAX_STARS } from '@/data/levels';
import { TimbreKey } from '@/types/game';
import styles from './index.module.scss';

const TIMBRES: Array<{ key: TimbreKey; label: string }> = [
  { key: 'musicbox', label: '八音盒' },
  { key: 'piano', label: '三角钢琴' },
  { key: 'epiano', label: '电钢' }
];

const TOTAL_LEVELS = LEVELS.length;

export default function MinePage() {
  const { stars, totalGames, streakDays, fragments, settings, setSetting, resetAll } = useSaveStore();

  const totalStars = Object.values(stars).reduce((sum, s) => sum + s, 0);
  const clearedLevels = Object.values(stars).filter((s) => s > 0).length;

  const handleReset = useCallback(() => {
    Taro.showModal({
      title: '确认清空',
      content: '将清空所有游戏记录，此操作不可恢复',
      confirmText: '清空',
      confirmColor: '#b23a2b',
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
      <View className={styles.header}>
        <Text className={styles.title}>我的</Text>
        <Text className={styles.subtitle}>一张谱纸，一局一局地落墨</Text>
      </View>

      {/* 演奏者：只留最该被看见的数字 */}
      <View className={styles.statsCard}>
        <View className={styles.starRow}>
          <Text className={styles.starValue}>{totalStars}</Text>
          <Text className={styles.starUnit}>/ {MAX_STARS} 星</Text>
        </View>
        <View className={styles.starBar}>
          <View
            className={styles.starBarFill}
            style={{ width: `${MAX_STARS > 0 ? (totalStars / MAX_STARS) * 100 : 0}%` }}
          />
        </View>
        <View className={styles.statsRow}>
          <View className={styles.statItem}>
            <Text className={styles.statValue}>
              {clearedLevels}
              <Text className={styles.statUnit}>/{TOTAL_LEVELS}</Text>
            </Text>
            <Text className={styles.statLabel}>已通关</Text>
          </View>
          <View className={styles.statDivider} />
          <View className={styles.statItem}>
            <Text className={styles.statValue}>{totalGames}</Text>
            <Text className={styles.statLabel}>总场次</Text>
          </View>
          <View className={styles.statDivider} />
          <View className={styles.statItem}>
            <Text className={styles.statValue}>{streakDays}</Text>
            <Text className={styles.statLabel}>连续天数</Text>
          </View>
          <View className={styles.statDivider} />
          <View className={styles.statItem}>
            <Text className={styles.statValue}>{fragments}</Text>
            <Text className={styles.statLabel}>音符碎片</Text>
          </View>
        </View>
      </View>

      {/* 声音 */}
      <View className={styles.section}>
        <Text className={styles.sectionTitle}>声音</Text>
        <View className={styles.panel}>
          <View className={styles.settingItem}>
            <View className={styles.settingMeta}>
              <Text className={styles.settingLabel}>演奏音</Text>
              <Text className={styles.settingDesc}>点对时弹出的音符</Text>
            </View>
            <Switch
              checked={settings.music}
              onChange={() => setSetting('music', !settings.music)}
              color="#e85d2a"
            />
          </View>
          <View className={styles.settingItem}>
            <View className={styles.settingMeta}>
              <Text className={styles.settingLabel}>提示音</Text>
              <Text className={styles.settingDesc}>倒计时、点错、通关</Text>
            </View>
            <Switch
              checked={settings.sound}
              onChange={() => setSetting('sound', !settings.sound)}
              color="#e85d2a"
            />
          </View>
          <View className={styles.settingItem}>
            <View className={styles.settingMeta}>
              <Text className={styles.settingLabel}>震动</Text>
              <Text className={styles.settingDesc}>仅点错与通关触发</Text>
            </View>
            <Switch
              checked={settings.haptics}
              onChange={() => setSetting('haptics', !settings.haptics)}
              color="#e85d2a"
            />
          </View>
          <View className={styles.timbreItem}>
            <Text className={styles.settingLabel}>音色</Text>
            <View className={styles.timbreRow}>
              {TIMBRES.map((item) => (
                <View
                  key={item.key}
                  className={classnames(
                    styles.timbreChip,
                    settings.timbre === item.key && styles.timbreChipActive
                  )}
                  onClick={() => setSetting('timbre', item.key)}
                >
                  <Text
                    className={classnames(
                      styles.timbreText,
                      settings.timbre === item.key && styles.timbreTextActive
                    )}
                  >
                    {item.label}
                  </Text>
                </View>
              ))}
            </View>
          </View>
        </View>
      </View>

      {/* 画面 */}
      <View className={styles.section}>
        <Text className={styles.sectionTitle}>画面</Text>
        <View className={styles.panel}>
          <View className={styles.settingItem}>
            <View className={styles.settingMeta}>
              <Text className={styles.settingLabel}>彩色数字</Text>
              <Text className={styles.settingDesc}>亲子模式：格子按 6 色循环上色</Text>
            </View>
            <Switch
              checked={settings.colorful}
              onChange={() => setSetting('colorful', !settings.colorful)}
              color="#e85d2a"
            />
          </View>
        </View>
      </View>

      {/* 关于 */}
      <View className={styles.section}>
        <Text className={styles.sectionTitle}>关于</Text>
        <View className={styles.panel}>
          <View className={styles.aboutItem} onClick={handleReset}>
            <Text className={styles.aboutLabel}>清空记录</Text>
            <Text className={styles.aboutArrow}>›</Text>
          </View>
        </View>
      </View>

      <Text className={styles.version}>眼力大作战 v2.1.0</Text>
    </View>
  );
}
