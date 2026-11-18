import React, { useCallback, useMemo } from 'react';
import { Text, View } from '@tarojs/components';
import Taro, { useRouter, useShareAppMessage, useShareTimeline } from '@tarojs/taro';
import classnames from 'classnames';
import MemoryGrid from '@/components/MemoryGrid';
import StarRating from '@/components/StarRating';
import { MEMORY_LEVELS, getMemoryLevelById } from '@/data/challengeLevels';
import { useChallengeStore } from '@/store/useChallengeStore';
import { useMemoryRunStore } from '@/store/useMemoryRunStore';
import { getStarHint } from '@/utils/challengeScoring';
import { formatSeconds } from '@/utils/format';
import styles from './index.module.scss';

const noop = () => undefined;

const ChallengeResultPage: React.FC = () => {
  const router = useRouter();
  const level = getMemoryLevelById(router.params.levelId ?? '');
  const run = useMemoryRunStore((state) => state.run);
  const bestTimes = useChallengeStore((state) => state.bestTimes);

  const failed = router.params.failed === '1';
  const stars = Number(router.params.stars ?? 0) || 0;
  const elapsed = Number(router.params.elapsed ?? 0) || 0;
  const errors = Number(router.params.errors ?? 0) || 0;
  const peeked = router.params.peeked === '1';
  const done = Number(router.params.done ?? 0) || 0;

  const nextLevel = useMemo(
    () => (level ? MEMORY_LEVELS.find((item) => item.globalIndex === level.globalIndex + 1) ?? null : null),
    [level]
  );

  useShareAppMessage(() => ({
    title: failed
      ? `第 ${level?.globalIndex ?? 0} 关记忆断裂，${level?.layoutLabel ?? ''} 你能记住吗？`
      : `墨隐第 ${level?.globalIndex ?? 0} 关 · ${stars} 星 ${formatSeconds(elapsed, 1)}`,
    path: '/pages/challenge/home/index'
  }));
  useShareTimeline(() => ({
    title: '数字亮几秒就隐去，靠记忆按顺序点回来'
  }));

  const handleRetry = useCallback(() => {
    if (!level) {
      return;
    }
    Taro.redirectTo({ url: `/pages/challenge/game/index?levelId=${level.id}` });
  }, [level]);

  const handleNext = useCallback(() => {
    if (!nextLevel) {
      return;
    }
    Taro.redirectTo({ url: `/pages/challenge/game/index?levelId=${nextLevel.id}` });
  }, [nextLevel]);

  const handleBack = useCallback(() => {
    Taro.redirectTo({ url: '/pages/challenge/levels/index' });
  }, []);

  if (!level) {
    return (
      <View className={styles.page}>
        <Text className={styles.title}>成绩已失效</Text>
        <View className={styles.primaryBtn} onClick={handleBack}>
          <Text className={styles.primaryBtnText}>返回关卡</Text>
        </View>
      </View>
    );
  }

  const best = bestTimes[level.id];

  return (
    <View className={styles.page}>
      {/* 墨晕用独立元素：page-center-block 占着 ::before/::after 做 flex 占位 */}
      <View className={styles.wash} />

      <View className={styles.head}>
        <Text className={styles.seal}>{failed ? '断' : '记'}</Text>
        <Text className={styles.title}>{failed ? '记忆断裂' : '盘面复原'}</Text>
        <Text className={styles.subtitle}>
          第 {level.globalIndex} 关 · {level.segmentTitle} · {level.layoutLabel}
        </Text>
      </View>

      <View className={styles.stars}>
        <StarRating stars={failed ? 0 : stars} max={3} size="lg" animated />
        <Text className={styles.starHint}>
          {failed ? `点到第 ${done} 个，命用完了` : getStarHint(stars, errors, peeked)}
        </Text>
      </View>

      {/* 窥看只在真用过时才出现：没偷看是「本来如此」，不值得摆一个「没用」占位 */}
      <View className={styles.dataRow}>
        <View className={styles.dataItem}>
          <Text className={styles.dataValue}>{formatSeconds(elapsed, 2)}</Text>
          <Text className={styles.dataLabel}>用时</Text>
        </View>
        <View className={styles.dataDivider} />
        <View className={styles.dataItem}>
          <Text className={styles.dataValue}>{errors}</Text>
          <Text className={styles.dataLabel}>失误</Text>
        </View>
        {peeked && (
          <>
            <View className={styles.dataDivider} />
            <View className={styles.dataItem}>
              <Text className={styles.dataValue}>1 次</Text>
              <Text className={styles.dataLabel}>窥看</Text>
            </View>
          </>
        )}
      </View>

      {best !== undefined && !failed && (
        <Text className={styles.bestLine}>
          本关最佳 {formatSeconds(best, 1)}
          {elapsed <= best ? ' · 刚刚刷新' : ''}
        </Text>
      )}

      {run && run.levelId === level.id && run.cells.length > 0 && (
        <View className={styles.answer}>
          <View className={styles.answerHead}>
            <Text className={styles.answerTitle}>这一局的答案</Text>
            <Text className={styles.answerHint}>看一眼，下次就记住了</Text>
          </View>
          <View className={styles.sheet}>
            <MemoryGrid
              cols={run.cols}
              shape={run.shape}
              cells={run.cells.map((cell) => ({ ...cell, status: 'idle' as const }))}
              revealed
              frozen
              onTapCell={noop}
            />
          </View>
        </View>
      )}

      <View className={styles.actions}>
        {!failed && nextLevel && (
          <View className={styles.primaryBtn} onClick={handleNext}>
            <Text className={styles.primaryBtnText}>下一关</Text>
          </View>
        )}
        <View className={classnames(failed ? styles.primaryBtn : styles.ghostBtn)} onClick={handleRetry}>
          <Text className={failed ? styles.primaryBtnText : styles.ghostBtnText}>再来一次</Text>
        </View>
        <View className={styles.ghostBtn} onClick={handleBack}>
          <Text className={styles.ghostBtnText}>返回关卡</Text>
        </View>
      </View>
    </View>
  );
};

export default ChallengeResultPage;
