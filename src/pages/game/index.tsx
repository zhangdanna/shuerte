import React, { useCallback, useEffect, useState } from 'react';
import { Text, View } from '@tarojs/components';
import Taro, { useDidHide, useDidShow, useRouter } from '@tarojs/taro';
import classnames from 'classnames';
import GameGrid from '@/components/GameGrid';
import TimerRing from '@/components/TimerRing';
import { EndPayload, useGameEngine } from '@/hooks/useGameEngine';
import { MODE_LABELS, getLevelById } from '@/data/levels';
import { getSongOrDefault } from '@/data/songs';
import { useSaveStore } from '@/store/useSaveStore';
import { calcStars, ERROR_PENALTY } from '@/utils/scoring';
import { getCurrentTarget, getDoneCount } from '@/utils/gameEngine';
import { formatSeconds } from '@/utils/format';
import { initAudio, playSound, resumeAudio, suspendAudio } from '@/services/audio';
import { GameResult, LevelConfig } from '@/types/game';
import styles from './index.module.scss';

/** 每档关数：顶栏的「3/12」 */
const LEVELS_PER_CHAPTER = 12;

/** 小节进度条数：把 N² 拆成 8 个乐句，点亮 = 弹过这一小节 */
const SEGMENTS = 8;

/** 第一关 id：引子通关后直接进这一关 */
const FIRST_LEVEL_ID = '1-1';

const buildModeHint = (level: LevelConfig): string => {
  if (level.tutorial) {
    return '按 1 → 9 顺序点，点对了会响一个音';
  }
  if (level.mode === 'reverse') {
    return `倒序：从 ${level.total} 点回 1，听到的仍是正着走的旋律`;
  }
  if (level.mode === 'alternate') {
    return '双色交替：奇数格是旋律，偶数格是低音';
  }
  return `按 1 → ${level.total} 顺序点击，每点对一个音`;
};

/** 指引关的引导语：跟着进度换一句，不靠首页常驻长文案 */
const buildGuideHint = (doneCount: number, errors: number, target: number): string => {
  if (errors > 0 && doneCount < 4) {
    return `点错要罚 ${formatSeconds(ERROR_PENALTY, 2)}，慢一点也没关系`;
  }
  if (doneCount === 0) {
    return '先找到 1 —— 点对了会响一个音';
  }
  if (doneCount < 5) {
    return `接着找 ${target}，数字按顺序点`;
  }
  return '最后几个，一气点到 9';
};

const GameContent: React.FC<{ level: LevelConfig }> = ({ level }) => {
  const song = getSongOrDefault(level.songId);
  const settings = useSaveStore((state) => state.settings);
  const setSetting = useSaveStore((state) => state.setSetting);
  const [guideDone, setGuideDone] = useState(false);

  const handleEnd = useCallback(
    (payload: EndPayload) => {
      // 引子不评星、不写档、不进结算页：只记一个「已走过」的标记
      if (level.tutorial) {
        if (payload.kind === 'finished') {
          useSaveStore.getState().completeTutorial();
          playSound('success');
          setGuideDone(true);
          console.info('[Game] 引子通关', { elapsed: payload.elapsed, errors: payload.errors });
        }
        return;
      }
      const grade = payload.performance.grade;
      // 限时内未完成：不写存档、不解锁下一关，只能重打本关
      if (payload.kind === 'failed') {
        Taro.redirectTo({
          url: `/pages/result/index?levelId=${level.id}&elapsed=${payload.elapsed}&errors=${payload.errors}&stars=0&isBest=0&failed=1&done=${payload.done}&grade=${grade}`
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
        playedAt: new Date().toISOString(),
        grade
      };
      saveStore.submitResult(result, grade, payload.beats);
      console.info('[Game] 结算', result, payload.performance);
      Taro.redirectTo({
        url: `/pages/result/index?levelId=${level.id}&elapsed=${payload.elapsed}&errors=${payload.errors}&stars=${stars}&isBest=${isBest ? 1 : 0}&failed=0&done=${payload.done}&grade=${grade}`
      });
    },
    [level]
  );

  const { state, countdown, getCurrentElapsed, tap, pause, resume, restart } = useGameEngine(level, handleEnd);

  // 切后台自动暂停：否则切出去等几秒回来，成绩就被刷快了
  useDidHide(() => {
    pause();
    suspendAudio();
  });
  useDidShow(() => {
    resumeAudio();
  });

  useEffect(() => {
    initAudio();
  }, []);

  const { phase, cells, errors } = state;
  const total = level.total;
  const currentTarget = getCurrentTarget(state);
  const doneCount = getDoneCount(state);
  const modeTag = level.mode === 'forward' || level.tutorial ? '' : ` · ${MODE_LABELS[level.mode]}`;
  const subtitle = level.tutorial
    ? '引子 · 点 1 → 9'
    : `${level.chapterTitle} ${level.index}/${LEVELS_PER_CHAPTER}${modeTag}`;

  // 小节进度：8 段，按已完成数量逐段点亮
  const segments = Array.from({ length: SEGMENTS }, (_, index) => {
    const start = (total * index) / SEGMENTS;
    const end = (total * (index + 1)) / SEGMENTS;
    return Math.min(1, Math.max(0, (doneCount - start) / (end - start)));
  });

  const toggleMusic = () => {
    setSetting('music', !settings.music);
  };

  return (
    <View className={styles.page}>
      <View className={styles.topbar}>
        <View className={styles.titleRow}>
          <Text className={styles.songTitle}>{song.title}</Text>
          <Text className={styles.songSub}>· {subtitle}</Text>
        </View>
        <View className={styles.topActions}>
          <View
            className={classnames(styles.iconBtn, !settings.music && styles.iconBtnOff)}
            onClick={toggleMusic}
          >
            <Text className={styles.iconText}>♪</Text>
          </View>
          <View className={styles.iconBtn} onClick={pause}>
            <Text className={styles.iconText}>❚❚</Text>
          </View>
        </View>
      </View>

      <View className={styles.hud}>
        <TimerRing
          getElapsed={getCurrentElapsed}
          timeLimit={level.timeLimit}
          running={phase === 'playing'}
          target={currentTarget}
          errors={errors}
          untimed={level.tutorial}
        />
      </View>

      <View className={styles.segments}>
        {segments.map((fill, index) => (
          <View key={index} className={styles.segment}>
            <View className={styles.segmentFill} style={{ width: `${fill * 100}%` }} />
          </View>
        ))}
      </View>

      <View className={styles.gridArea}>
        <GameGrid
          size={level.size}
          cardStyle={level.cardStyle}
          patternIndex={level.patternIndex}
          mode={level.mode}
          cells={cells}
          frozen={phase !== 'playing'}
          colorful={settings.colorful}
          onTapCell={tap}
        />
      </View>

      {/* 引子：按进度换一句引导，替代首页的常驻文字说明 */}
      {level.tutorial && phase === 'playing' && (
        <View className={styles.guideBubble}>
          <Text className={styles.guideText}>{buildGuideHint(doneCount, errors, currentTarget)}</Text>
        </View>
      )}

      {phase === 'countdown' && (
        <View className={styles.overlay}>
          <Text className={styles.overlaySong}>{level.tutorial ? '引子' : `《${song.title}》`}</Text>
          <Text key={countdown} className={styles.countdown}>
            {countdown}
          </Text>
          <Text className={styles.overlayTip}>{buildModeHint(level)}</Text>
          {!level.tutorial && (
            <Text className={styles.overlayLimit}>限时 {formatSeconds(level.timeLimit, 0)}</Text>
          )}
        </View>
      )}

      {phase === 'paused' && (
        <View className={styles.overlay}>
          <View className={styles.pauseCard}>
            <View className={styles.disc}>
              <View className={styles.discLabel} />
            </View>
            <Text className={styles.pauseTitle}>唱片停转</Text>
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

      {guideDone && (
        <View className={styles.overlay}>
          <View className={styles.pauseCard}>
            <View className={styles.seal}>
              <Text className={styles.sealText}>引</Text>
            </View>
            <Text className={styles.pauseTitle}>引子 · 已通</Text>
            <Text className={styles.pauseDesc}>九个数字，九个音。往后的关卡就照这个节奏来</Text>
            <View
              className={styles.primaryBtn}
              onClick={() => Taro.redirectTo({ url: `/pages/game/index?levelId=${FIRST_LEVEL_ID}` })}
            >
              <Text className={styles.primaryBtnText}>进入第一关</Text>
            </View>
            <View className={styles.ghostBtn} onClick={() => Taro.switchTab({ url: '/pages/home/index' })}>
              <Text className={styles.ghostBtnText}>回到演奏台</Text>
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
