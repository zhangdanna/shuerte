import React, { useEffect } from 'react';
import { Text, View } from '@tarojs/components';
import Taro, { useRouter, useShareAppMessage, useShareTimeline, useUnload } from '@tarojs/taro';
import classnames from 'classnames';
import RunReplay from '@/components/RunReplay';
import StarRating from '@/components/StarRating';
import { getChapterById, getLevelById, getNextLevel, LEVELS } from '@/data/levels';
import { getSongOrDefault } from '@/data/songs';
import {
  getAudioTime,
  initAudio,
  playNote,
  playSound,
  releaseSounds,
  stopAllNotes,
  unlockAudio
} from '@/services/audio';
import { useRunStore } from '@/store/useRunStore';
import { useSaveStore } from '@/store/useSaveStore';
import { getNoteForValue } from '@/utils/music';
import { isLevelUnlocked } from '@/utils/progress';
import { ReplayCue } from '@/utils/replay';
import { ERROR_PENALTY, GRADE_LABELS } from '@/utils/scoring';
import { getResultShare, getResultTimeline } from '@/utils/share';
import { formatSeconds } from '@/utils/format';
import { PerformanceGrade } from '@/types/game';
import styles from './index.module.scss';

const isGrade = (value: string): value is PerformanceGrade =>
  value === 'S' || value === 'A' || value === 'B' || value === 'C';

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
  const gradeParam = router.params.grade ?? '';
  const grade = isGrade(gradeParam) ? gradeParam : null;

  const starsMap = useSaveStore((state) => state.stars);
  const bestTimes = useSaveStore((state) => state.bestTimes);
  const runSnapshot = useRunStore((state) => state.run);

  useEffect(() => {
    // 回放要出声，先把合成器预热（对局页已经建过，这里是幂等的兜底：
    // 从分享/历史直接进结算页时，AudioContext 可能还是 suspended）
    initAudio();
    // 失败时引擎已经播过错误音，这里只在通关时播胜利音
    if (!failed) {
      playSound('success');
    }
  }, [failed]);

  // 离开结算页时释放音频实例，避免常驻内存
  useUnload(() => {
    releaseSounds();
  });

  // 分享要在下面「参数非法」的提前 return 之前无条件调用；level 缺失时文案自动退回通用版
  const shareInput = { levelId: level?.id ?? '', stars, elapsed, errors, done, grade, failed };
  useShareAppMessage(() => getResultShare(shareInput));
  useShareTimeline(() => getResultTimeline(shareInput));

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

  const song = getSongOrDefault(level.songId);
  // 交接数据只对「刚打完的这一关」有效：从历史/分享链接进来时 store 里可能是别的关卡
  const replayRun = runSnapshot && runSnapshot.levelId === level.id ? runSnapshot : null;

  /**
   * 回放发声：拿到整条发声表后**一次性按绝对时间**排进音频图。
   *
   * 为什么不逐个 setTimeout：结算页的音没有用户手势托底，iOS 微信 / 浏览器会把
   * AudioContext 挂成 suspended，且碎片动画最卡的那几百毫秒正好落在回放后半段，
   * 定时器会挤成一团甚至丢音 —— 表现就是"动画在跑、没声音"。
   * 绝对时间排程把时序交给音频硬件，主线程怎么卡都不影响。
   */
  const cueVelocity = Math.max(0.4, Math.min(0.72, 0.72 * Math.pow(10 / level.total, 0.25)));
  const handlePlan = (cues: ReplayCue[]) => {
    if (cues.length === 0) {
      return;
    }
    // 重播前先掐掉上一轮还没响完的音
    stopAllNotes();
    const startedAt = Date.now();
    void (async () => {
      const ready = await unlockAudio();
      const base = getAudioTime();
      if (!ready || base === null) {
        // 极端降级：没有 WebAudio，退回定时器逐个敲（playNote 内部会退成 click 提示音）
        cues.forEach((cue) =>
          setTimeout(() => playNote(getNoteForValue(song, level, cue.value), cueVelocity), cue.atMs)
        );
        return;
      }
      // resume 花掉的时间补回来，声画才不会越走越偏
      const lag = (Date.now() - startedAt) / 1000;
      cues.forEach((cue) => {
        const when = base + cue.atMs / 1000 - lag + 0.06;
        playNote(getNoteForValue(song, level, cue.value), cueVelocity, Math.max(base + 0.02, when));
      });
      console.info('[Result] 回放排音', { cues: cues.length, lagMs: Math.round(lag * 1000) });
    })();
  };

  const songLevels = LEVELS.filter((item) => item.songId === song.id);
  const collected = songLevels.filter((item) => (starsMap[item.id] ?? 0) > 0).length;
  const songFull = collected === songLevels.length;

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
      {/* 唱片：星级环绕它，曲名写在标签上 */}
      <View className={classnames(styles.discWrap, failed && styles.discWrapFail)}>
        <View className={styles.disc}>
          <View className={styles.discGroove} />
          <View className={styles.discLabel}>
            <Text className={styles.discTitle}>{song.title}</Text>
          </View>
        </View>
        {!failed && (
          <View className={styles.starRow}>
            <StarRating stars={stars} max={level.maxStars} size="lg" animated />
          </View>
        )}
      </View>

      <Text className={styles.chapter}>
        {level.chapterTitle} · 第 {level.globalIndex} 关 · {level.size}×{level.size}
      </Text>

      {/* 这一遍的演奏：按你的点击顺序重放盘面（整段连着出声），播完碎掉。没有交接数据时不渲染 */}
      {replayRun && <RunReplay run={replayRun} onPlan={handlePlan} />}

      {failed ? (
        <View className={styles.failBlock}>
          <Text className={styles.failTitle}>时间到 · 挑战失败</Text>
          <Text className={styles.failDesc}>
            限时 {formatSeconds(level.timeLimit, 0)} 内完成 {done} / {level.total}，本关未通过
          </Text>
        </View>
      ) : (
        <View className={styles.gradeRow}>
          <View className={styles.gradeBadge}>
            <Text className={styles.gradeLetter}>{grade ?? 'C'}</Text>
          </View>
          <View className={styles.gradeMeta}>
            <Text className={styles.gradeLabel}>{grade ? GRADE_LABELS[grade] : '演奏完成'}</Text>
            <Text className={styles.gradeHint}>按节拍点击可提升评级 · 不影响星级</Text>
          </View>
          {isBest && (
            <View className={styles.recordTag}>
              <Text className={styles.recordTagText}>新纪录</Text>
            </View>
          )}
        </View>
      )}

      <View className={styles.metrics}>
        <View className={styles.metric}>
          <Text className={styles.metricLabel}>用时</Text>
          <Text className={styles.metricValue}>{formatSeconds(elapsed)}</Text>
        </View>
        <View className={styles.metricDivider} />
        <View className={styles.metric}>
          <Text className={styles.metricLabel}>失误</Text>
          <Text className={styles.metricValue}>{errors}</Text>
        </View>
        <View className={styles.metricDivider} />
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

      {/* 收集进度：这首曲子的 6 段拼图 */}
      <View className={styles.collect}>
        <View className={styles.collectHead}>
          <Text className={styles.collectTitle}>《{song.title}》</Text>
          <Text className={styles.collectCount}>
            {collected} / {songLevels.length} 段{songFull ? ' · 已完整收录' : ''}
          </Text>
        </View>
        <View className={styles.collectSegments}>
          {songLevels.map((item) => {
            const value = starsMap[item.id] ?? 0;
            return (
              <View
                key={item.id}
                className={classnames(
                  styles.collectSegment,
                  value > 0 && styles.collectSegmentOn,
                  item.id === level.id && styles.collectSegmentCurrent
                )}
              />
            );
          })}
        </View>
        <Text className={styles.collectHint}>
          {songFull
            ? '去曲集听听这首曲子 —— 回放的就是你这一遍的弹法'
            : `打完这首曲子的 ${songLevels.length} 个关卡，就能在曲集里回放整首`}
        </Text>
      </View>

      {/* 星级评定规则不向玩家展示，只在失败时说明「为什么没过」 */}
      {failed && (
        <Text className={styles.hint}>
          失误 {errors} 次累计罚时 {formatSeconds(errors * ERROR_PENALTY, 2)}，重打本关才能继续推进
        </Text>
      )}

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
        <View className={styles.ghostBtn} onClick={() => Taro.switchTab({ url: '/pages/collection/index' })}>
          <Text className={styles.ghostBtnText}>去曲集</Text>
        </View>
        <View className={styles.textBtn} onClick={() => Taro.switchTab({ url: '/pages/levels/index' })}>
          <Text className={styles.textBtnText}>返回关卡地图</Text>
        </View>
      </View>
    </View>
  );
};

export default ResultPage;
