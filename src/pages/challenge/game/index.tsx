import React, { useCallback, useEffect, useMemo, useRef } from 'react';
import { Text, View } from '@tarojs/components';
import Taro, { useDidHide, useRouter, useShareAppMessage, useShareTimeline } from '@tarojs/taro';
import classnames from 'classnames';
import MemoryBar from '@/components/MemoryBar';
import MemoryGrid from '@/components/MemoryGrid';
import { getMemoryLevelById } from '@/data/challengeLevels';
import { MemoryEndPayload, useMemoryEngine } from '@/hooks/useMemoryEngine';
import { setChallengeSoundEnabled, initChallengeAudio } from '@/services/challengeAudio';
import { useChallengeStore } from '@/store/useChallengeStore';
import { useMemoryRunStore } from '@/store/useMemoryRunStore';
import { calcMemoryStars } from '@/utils/challengeScoring';
import { getDoneCount } from '@/utils/memoryEngine';
import { formatSeconds } from '@/utils/format';
import { MemoryLevel } from '@/types/challenge';
import styles from './index.module.scss';

/** 结算前停留：让玩家看清「整盘答案浮出来」的那一下，再跳走 */
const SETTLE_DELAY = 700;

const MemoryGameContent: React.FC<{ level: MemoryLevel }> = ({ level }) => {
  const settings = useChallengeStore((state) => state.settings);
  const setSetting = useChallengeStore((state) => state.setSetting);
  // 结算前的停留定时器：玩家在这 700ms 里主动退出时不能再被弹去结算页
  const settleTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useShareAppMessage(() => ({
    title: `第 ${level.globalIndex} 关 ${level.layoutLabel}，数字只亮 ${(level.flashMs / 1000).toFixed(1)} 秒`,
    path: '/pages/challenge/home/index'
  }));
  useShareTimeline(() => ({
    title: '数字亮几秒就隐去，靠记忆按顺序点回来'
  }));

  const handleEnd = useCallback(
    (payload: MemoryEndPayload) => {
      const stars =
        payload.kind === 'failed'
          ? 0
          : calcMemoryStars(payload.elapsed, payload.errors, payload.peeked, level);

      // 把这一局的盘面交给结算页做「答案复盘」（只走内存，不进存档）
      useMemoryRunStore.getState().setRun({
        levelId: level.id,
        shape: level.shape,
        cols: level.cols,
        cells: payload.cells,
        elapsed: payload.elapsed,
        errors: payload.errors,
        peeked: payload.peeked,
        failed: payload.kind === 'failed'
      });

      if (payload.kind === 'finished') {
        const store = useChallengeStore.getState();
        const prevBest = store.bestTimes[level.id];
        store.submit({
          levelId: level.id,
          segmentId: level.segmentId,
          index: level.index,
          cols: level.cols,
          rows: level.rows,
          elapsed: payload.elapsed,
          errors: payload.errors,
          stars,
          peeked: payload.peeked,
          isBest: prevBest === undefined || payload.elapsed < prevBest,
          playedAt: new Date().toISOString()
        });
      }

      const query = `levelId=${level.id}&elapsed=${payload.elapsed}&errors=${payload.errors}&stars=${stars}&failed=${
        payload.kind === 'failed' ? 1 : 0
      }&done=${payload.done}&peeked=${payload.peeked ? 1 : 0}`;

      settleTimerRef.current = setTimeout(() => {
        Taro.redirectTo({ url: `/pages/challenge/result/index?${query}` });
      }, SETTLE_DELAY);
    },
    [level]
  );

  // 上一局的盘面：结算页「再来一次」是 redirectTo 重挂载，只能从这里拿，
  // 否则 2 格关卡会有一半概率原样重来（只有两种排列）
  const avoidValues = useMemo(() => {
    const previous = useMemoryRunStore.getState().run;
    return previous && previous.levelId === level.id
      ? previous.cells.map((cell) => cell.value)
      : undefined;
  }, [level.id]);

  const { state, countdown, elapsed, tap, peek, pause, resume, restart } = useMemoryEngine(
    level,
    handleEnd,
    avoidValues
  );

  // 切后台 = 记忆中断。回来必须重看一遍，否则截图就能作弊
  useDidHide(() => {
    pause();
  });

  useEffect(() => {
    initChallengeAudio();
    setChallengeSoundEnabled(settings.sound);
  }, [settings.sound]);

  // 页面卸载时清掉结算定时器：玩家在停留窗口内退出，不该再被弹去结算页
  useEffect(
    () => () => {
      if (settleTimerRef.current) {
        clearTimeout(settleTimerRef.current);
        settleTimerRef.current = null;
      }
    },
    []
  );

  const { phase, cells, errors, lives, peekLeft } = state;
  const done = getDoneCount(state);
  const total = level.total;
  const progress = total > 0 ? done / total : 0;
  const isMemorizing = phase === 'memorize';

  const toggleSound = () => {
    setSetting('sound', !settings.sound);
  };

  return (
    <View className={styles.page}>
      {/* 顶部一团淡墨：把视线压在盘面上，而不是让整页均匀发亮 */}
      <View className={styles.wash} />

      <View className={styles.topbar}>
        <View className={styles.backBtn} onClick={() => Taro.navigateBack()}>
          <Text className={styles.backIcon}>‹</Text>
        </View>
        <View className={styles.titleBox}>
          <Text className={styles.levelTitle}>第 {level.globalIndex} 关</Text>
          <Text className={styles.levelSub}>
            {level.segmentTitle} · {level.layoutLabel}
          </Text>
        </View>
        <View
          className={classnames(styles.iconBtn, !settings.sound && styles.iconBtnOff)}
          onClick={toggleSound}
        >
          <Text className={styles.iconText}>♪</Text>
        </View>
      </View>

      <View className={styles.hud}>
        <View className={styles.targetBox}>
          <Text className={styles.targetLabel}>{isMemorizing ? '记住它们' : '现在点'}</Text>
          <Text className={styles.targetValue}>{isMemorizing ? '—' : state.target}</Text>
        </View>
        <View className={styles.hudRight}>
          <Text className={styles.hudTime}>{formatSeconds(elapsed, 1)}</Text>
          <Text className={styles.hudProgress}>
            {done}/{total}
          </Text>
        </View>
      </View>

      <View className={styles.lives}>
        {Array.from({ length: level.lives }, (_, index) => (
          <View key={index} className={classnames(styles.life, index >= lives && styles.lifeLost)} />
        ))}
        <Text className={styles.livesText}>
          {errors > 0 ? `已错 ${errors} 次` : '命全在'}
        </Text>
      </View>

      <View className={styles.barArea}>
        <MemoryBar mode={isMemorizing ? 'memorize' : 'recall'} duration={level.flashMs} progress={progress} />
        <Text className={styles.barHint}>
          {isMemorizing
            ? '数字隐去后，按 1 到 ' + total + ' 的顺序点回去'
            : `闪 ${(level.flashMs / 1000).toFixed(1)}″ 已过 · 靠记忆找下一个`}
        </Text>
      </View>

      <View className={styles.gridArea}>
        <View className={styles.sheet}>
          <MemoryGrid
            cols={level.cols}
            shape={level.shape}
            cells={cells}
            revealed={state.revealed}
            frozen={phase !== 'recall'}
            onTapCell={tap}
          />
        </View>
      </View>

      <View className={styles.bottom}>
        <View
          className={classnames(
            styles.peekBtn,
            (peekLeft <= 0 || phase !== 'recall') && styles.peekBtnDisabled
          )}
          onClick={peek}
        >
          <Text className={styles.peekText}>窥看 · 剩 {peekLeft} 次</Text>
        </View>
        <Text className={styles.peekHint}>看一次 +4 秒，且拿不到满星</Text>
      </View>

      {phase === 'countdown' && (
        <View className={styles.overlay}>
          <Text className={styles.overlayTitle}>第 {level.globalIndex} 关</Text>
          <Text key={countdown} className={styles.countdown}>
            {countdown}
          </Text>
          <Text className={styles.overlayTip}>
            {total} 个数字会亮 {(level.flashMs / 1000).toFixed(1)} 秒
          </Text>
          <Text className={styles.overlaySub}>记位置，别记数字</Text>
        </View>
      )}

      {phase === 'paused' && (
        <View className={styles.overlay}>
          <View className={styles.pauseCard}>
            <Text className={styles.pauseTitle}>记忆中断</Text>
            <Text className={styles.pauseDesc}>
              切出去再回来，得重新看一遍 —— 时间照走，已用 {formatSeconds(elapsed, 1)}
            </Text>
            <View className={styles.primaryBtn} onClick={resume}>
              <Text className={styles.primaryBtnText}>重新记忆</Text>
            </View>
            <View className={styles.ghostBtn} onClick={restart}>
              <Text className={styles.ghostBtnText}>重新开始</Text>
            </View>
            <View className={styles.ghostBtn} onClick={() => Taro.navigateBack()}>
              <Text className={styles.ghostBtnText}>退出</Text>
            </View>
          </View>
        </View>
      )}
    </View>
  );
};

const ChallengeGamePage: React.FC = () => {
  const router = useRouter();
  const level = getMemoryLevelById(router.params.levelId ?? '');

  if (!level) {
    console.error('[Memory] 关卡参数非法', router.params.levelId);
    return (
      <View className={styles.emptyPage}>
        <Text className={styles.emptyTitle}>关卡不存在</Text>
        <Text className={styles.emptyDesc}>请返回关卡地图重新选择</Text>
        <View
          className={styles.primaryBtn}
          onClick={() => Taro.redirectTo({ url: '/pages/challenge/levels/index' })}
        >
          <Text className={styles.primaryBtnText}>返回关卡</Text>
        </View>
      </View>
    );
  }

  return <MemoryGameContent level={level} />;
};

export default ChallengeGamePage;
