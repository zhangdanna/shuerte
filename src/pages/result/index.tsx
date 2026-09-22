import React, { useEffect } from 'react';
import { Text, View } from '@tarojs/components';
import Taro, { useRouter, useUnload } from '@tarojs/taro';
import StarRating from '@/components/StarRating';
import { getChapterById, getLevelById, getNextLevel } from '@/data/levels';
import { playSound, releaseSounds } from '@/services/audio';
import { useSaveStore } from '@/store/useSaveStore';
import { isLevelUnlocked } from '@/utils/progress';
import { ERROR_PENALTY } from '@/utils/scoring';
import { formatSeconds } from '@/utils/format';
import styles from './index.module.scss';

const ResultPage: React.FC = () => {
  const router = useRouter();
  const levelId = router.params.levelId ?? '';
  const level = getLevelById(levelId);
  const elapsed = Number(router.params.elapsed ?? 0);
  const errors = Number(router.params.errors ?? 0);
  const stars = Number(router.params.stars ?? 0);
  const isBest = router.params.isBest === '1';
  const failed = router.params.failed === '1';
  const done = Number(router.params.done ?? 0);

  const starsMap = useSaveStore((state) => state.stars);
  const bestTimes = useSaveStore((state) => state.bestTimes);

  useEffect(() => {
    // 失败时引擎已经播过错误音，这里只在通关时播胜利音
    if (!failed) {
      playSound('success');
    }
  }, [failed]);

  // 离开结算页时释放音频实例，避免常驻内存
  useUnload(() => {
    releaseSounds();
  });

  // 参数来自上一页跳转，属于外部输入边界：非法值明确暴露而不是用假数据渲染
  if (!level || !Number.isFinite(elapsed) || !Number.isFinite(stars)) {
    console.error('[Result] 结算参数非法', router.params);
    return (
      <View className={styles.emptyPage}>
        <Text className={styles.emptyTitle}>成绩读取失败</Text>
        <Text className={styles.emptyDesc}>请返回关卡地图重新挑战</Text>
        <View className={styles.primaryBtn} onClick={() => Taro.switchTab({ url: '/pages/levels/index' })}>
          <Text className={styles.primaryBtnText}>返回关卡地图</Text>
        </View>
      </View>
    );
  }

  const totalStars = Object.values(starsMap).reduce((sum, value) => sum + value, 0);
  const nextLevel = getNextLevel(level.id);
  const bestTime = bestTimes[level.id];

  const handleRetry = () => {
    Taro.redirectTo({ url: `/pages/game/index?levelId=${level.id}` });
  };

  const handleNext = () => {
    if (!nextLevel) {
      Taro.showToast({ title: '已通关全部关卡', icon: 'none' });
      return;
    }
    if (!isLevelUnlocked(nextLevel, starsMap, totalStars)) {
      const chapter = getChapterById(nextLevel.chapterId);
      Taro.showToast({ title: `累计 ${chapter?.starGate ?? 0} 星解锁下一轮`, icon: 'none' });
      return;
    }
    Taro.redirectTo({ url: `/pages/game/index?levelId=${nextLevel.id}` });
  };

  return (
    <View className={styles.page}>
      <View className={styles.card}>
        <Text className={styles.chapter}>{level.chapterTitle}</Text>
        <Text className={styles.title}>
          第 {level.globalIndex} 关 · {level.size}×{level.size}
        </Text>

        {failed ? (
          <View className={styles.failBlock}>
            <Text className={styles.failTitle}>时间到 · 挑战失败</Text>
            <Text className={styles.failDesc}>
              限时 {formatSeconds(level.timeLimit, 0)} 内完成 {done} / {level.total}，本关未通过
            </Text>
          </View>
        ) : (
          <>
            <View className={styles.starRow}>
              <StarRating stars={stars} size="lg" animated />
            </View>
            {isBest && (
              <View className={styles.recordTag}>
                <Text className={styles.recordTagText}>新纪录</Text>
              </View>
            )}
          </>
        )}

        <View className={styles.metrics}>
          <View className={styles.metric}>
            <Text className={styles.metricLabel}>用时</Text>
            <Text className={styles.metricValue}>{formatSeconds(elapsed)}</Text>
          </View>
          <View className={styles.metric}>
            <Text className={styles.metricLabel}>失误</Text>
            <Text className={styles.metricValue}>{errors}</Text>
          </View>
          <View className={styles.metric}>
            {failed ? (
              <>
                <Text className={styles.metricLabel}>完成</Text>
                <Text className={styles.metricValue}>
                  {done}/{level.total}
                </Text>
              </>
            ) : (
              <>
                <Text className={styles.metricLabel}>最佳</Text>
                <Text className={styles.metricValue}>
                  {bestTime === undefined ? '—' : formatSeconds(bestTime, 1)}
                </Text>
              </>
            )}
          </View>
        </View>

        <Text className={styles.hint}>
          {failed
            ? `失误 ${errors} 次累计罚时 ${formatSeconds(errors * ERROR_PENALTY, 1)}，重打本关才能继续推进`
            : `三星目标 ${formatSeconds(level.thresholds.gold, 1)} · 限时 ${formatSeconds(level.timeLimit, 0)}
              {errors === 0 ? ' · 零失误已额外加星' : ' · 零失误可额外加星'}`}
        </Text>
      </View>

      <View className={styles.actions}>
        <View className={styles.primaryBtn} onClick={handleRetry}>
          <Text className={styles.primaryBtnText}>{failed ? '再来一次' : '再来一局'}</Text>
        </View>
        {/* 只有本关通过才提供下一关，失败时不能跳过 */}
        {!failed && nextLevel && (
          <View className={styles.ghostBtn} onClick={handleNext}>
            <Text className={styles.ghostBtnText}>挑战下一关</Text>
          </View>
        )}
        <View className={styles.ghostBtn} onClick={() => Taro.switchTab({ url: '/pages/levels/index' })}>
          <Text className={styles.ghostBtnText}>返回关卡地图</Text>
        </View>
      </View>
    </View>
  );
};

export default ResultPage;
