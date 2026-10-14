import React, { useCallback } from 'react';
import { Text, View } from '@tarojs/components';
import Taro, { useDidHide, useRouter } from '@tarojs/taro';
import GameGrid from '@/components/GameGrid';
import TimerBar from '@/components/TimerBar';
import { EndPayload, useGameEngine } from '@/hooks/useGameEngine';
import { MODE_LABELS, getLevelById } from '@/data/levels';
import { useSaveStore } from '@/store/useSaveStore';
import { calcStars, ERROR_PENALTY } from '@/utils/scoring';
import { getCurrentTarget, getDoneCount } from '@/utils/gameEngine';
import { formatSeconds } from '@/utils/format';
import { GameResult, LevelConfig } from '@/types/game';
import styles from './index.module.scss';

/** 倒计时遮罩里的玩法提示：先讲清怎么点，再报限时 */
const buildCountdownTip = (level: LevelConfig): string => {
  const limit = formatSeconds(level.timeLimit, 0);
  if (level.mode === 'reverse') {
    return `按倒序点击：从 ${level.total} 点回 1 · 限时 ${limit}`;
  }
  if (level.mode === 'alternate') {
    return `奇数格红、偶数格蓝 · 依次点击 1 到 ${level.total} · 限时 ${limit}`;
  }
  return `按顺序点击 1 到 ${level.total} · 限时 ${limit}`;
};

const GameContent: React.FC<{ level: LevelConfig }> = ({ level }) => {
  const handleEnd = useCallback(
    (payload: EndPayload) => {
      // 限时内未完成：不写存档、不解锁下一关，只能重打本关
      if (payload.kind === 'failed') {
        Taro.redirectTo({
          url: `/pages/result/index?levelId=${level.id}&elapsed=${payload.elapsed}&errors=${payload.errors}&stars=0&isBest=0&failed=1&done=${payload.done}`
        });
        return;
      }
      const stars = calcStars(payload.elapsed, payload.errors, level.thresholds, level.maxStars);
      const saveStore = useSaveStore.getState();
      const prevBest = saveStore.bestTimes[level.id];
      const isBest = prevBest === undefined || payload.elapsed < prevBest;
      const result: GameResult = {
        levelId: level.id,
        chapterId: level.chapterId,
        index: level.index,
        size: level.size,
        elapsed: payload.elapsed,
        errors: payload.errors,
        stars,
        isBest,
        playedAt: new Date().toISOString()
      };
      saveStore.submitResult(result);
      console.info('[Game] 结算', result);
      Taro.redirectTo({
        url: `/pages/result/index?levelId=${level.id}&elapsed=${payload.elapsed}&errors=${payload.errors}&stars=${stars}&isBest=${isBest ? 1 : 0}&failed=0&done=${payload.done}`
      });
    },
    [level]
  );

  const { state, countdown, getCurrentElapsed, tap, pause, resume, restart } = useGameEngine(level, handleEnd);

  // 切后台自动暂停：否则切出去等几秒回来，成绩就被刷快了
  useDidHide(() => {
    pause();
  });

  const { phase, cells, errors } = state;
  const total = level.total;
  const currentTarget = getCurrentTarget(state);
  const doneCount = getDoneCount(state);
  const modeTag = level.mode === 'forward' ? '' : ` · ${MODE_LABELS[level.mode]}`;

  return (
    <View className={styles.page}>
      <View className={styles.hud}>
        <View className={styles.targetBlock}>
          <Text className={styles.hudLabel}>当前目标</Text>
          <Text className={styles.targetValue}>{currentTarget}</Text>
        </View>
        <TimerBar getElapsed={getCurrentElapsed} timeLimit={level.timeLimit} running={phase === 'playing'} />
      </View>

      <View className={styles.metaRow}>
        <Text className={styles.metaText}>
          已完成 {doneCount} / {total} · 失误 <Text className={styles.errorCount}>{errors}</Text> 次
        </Text>
        <View className={styles.pauseBtn} onClick={pause}>
          <Text className={styles.pauseBtnText}>暂停</Text>
        </View>
      </View>

      <View className={styles.gridArea}>
        <GameGrid
          size={level.size}
          cardStyle={level.cardStyle}
          zodiacIndex={level.zodiacIndex}
          mode={level.mode}
          cells={cells}
          frozen={phase !== 'playing'}
          onTapCell={tap}
        />
      </View>

      <Text className={styles.hint}>
        {level.chapterTitle} · 第 {level.globalIndex} 关{modeTag} · 限时{' '}
        {formatSeconds(level.timeLimit, 0)} · 每次失误罚时 {formatSeconds(ERROR_PENALTY, 2)}
      </Text>

      {phase === 'countdown' && (
        <View className={styles.overlay}>
          <Text key={countdown} className={styles.countdown}>
            {countdown}
          </Text>
          <Text className={styles.overlayTip}>{buildCountdownTip(level)}</Text>
        </View>
      )}

      {phase === 'paused' && (
        <View className={styles.overlay}>
          <View className={styles.pauseCard}>
            <Text className={styles.pauseTitle}>已暂停</Text>
            <Text className={styles.pauseDesc}>计时已停止，休息一下</Text>
            <View className={styles.primaryBtn} onClick={resume}>
              <Text className={styles.primaryBtnText}>继续挑战</Text>
            </View>
            <View className={styles.ghostBtn} onClick={restart}>
              <Text className={styles.ghostBtnText}>重新开始</Text>
            </View>
            <View className={styles.ghostBtn} onClick={() => Taro.navigateBack()}>
              <Text className={styles.ghostBtnText}>退出挑战</Text>
            </View>
          </View>
        </View>
      )}
    </View>
  );
};

const GamePage: React.FC = () => {
  const router = useRouter();
  const level = getLevelById(router.params.levelId ?? '');

  // 页面参数属于外部输入边界：非法或缺失直接暴露，不用默认关卡兜底
  if (!level) {
    console.error('[Game] 关卡参数非法', router.params.levelId);
    return (
      <View className={styles.emptyPage}>
        <Text className={styles.emptyTitle}>关卡不存在</Text>
        <Text className={styles.emptyDesc}>请返回关卡地图重新选择</Text>
        <View className={styles.primaryBtn} onClick={() => Taro.switchTab({ url: '/pages/levels/index' })}>
          <Text className={styles.primaryBtnText}>返回关卡地图</Text>
        </View>
      </View>
    );
  }

  return <GameContent level={level} />;
};

export default GamePage;
