import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Text, View } from '@tarojs/components';
import Taro, { useDidHide, useUnload } from '@tarojs/taro';
import classnames from 'classnames';
import Disc from '@/components/Disc';
import { LEVELS } from '@/data/levels';
import { SONGS } from '@/data/songs';
import { useSaveStore } from '@/store/useSaveStore';
import { isSongReachable } from '@/utils/progress';
import { SongBeats, pickSongBeats } from '@/utils/beats';
import { playSong, stopAllNotes } from '@/services/audio';
import { GRADE_LABELS } from '@/utils/scoring';
import { PerformanceGrade } from '@/types/game';
import styles from './index.module.scss';

/** 隐藏曲需要的音符碎片 */
const ENCORE_FRAGMENTS = 10;

/** 曲目序号：曲集按收录顺序排，用汉字序号更像一本谱册 */
const NUMERALS = ['壹', '贰', '叁', '肆', '伍', '陆', '柒'];

const TIER_LABELS: Record<number, string> = { 1: '小令 · 八音盒', 2: '中调 · 钢琴', 3: '长调 · 电钢' };

const GRADE_ORDER: Record<PerformanceGrade, number> = { S: 4, A: 3, B: 2, C: 1 };

interface RecordItem {
  id: string;
  numeral: string;
  title: string;
  tier: number;
  bpm: number;
  total: number;
  collected: number;
  maxStars: number;
  stars: number;
  grade: PerformanceGrade | null;
  /** 是否已经走到这首（第一段解锁）：顺序解锁后，曲目也是一首一首开 */
  reachable: boolean;
  /** 玩家自己的击键记录（没有则回放原曲） */
  beats: SongBeats | null;
  /** 这首曲子一共多少个音（64），用来判断玩家的记录是否已经覆盖整首 */
  songTotal: number;
}

const CollectionPage: React.FC = () => {
  const starsMap = useSaveStore((state) => state.stars);
  const grades = useSaveStore((state) => state.grades);
  const fragments = useSaveStore((state) => state.fragments);
  const bestRuns = useSaveStore((state) => state.bestRuns);

  const totalStars = Object.values(starsMap).reduce((sum, value) => sum + value, 0);

  const [playingId, setPlayingId] = useState<string | null>(null);
  const [step, setStep] = useState(-1);
  const stopRef = useRef<(() => void) | null>(null);

  const records = useMemo<RecordItem[]>(
    () =>
      SONGS.map((song, index) => {
        const levels = LEVELS.filter((level) => level.songId === song.id);
        let grade: PerformanceGrade | null = null;
        levels.forEach((level) => {
          const current = grades[level.id];
          if (current && (!grade || GRADE_ORDER[current] > GRADE_ORDER[grade])) {
            grade = current;
          }
        });
        return {
          id: song.id,
          numeral: NUMERALS[index] ?? `${index + 1}`,
          title: song.title,
          tier: song.tier,
          bpm: song.bpm,
          total: levels.length,
          collected: levels.filter((level) => (starsMap[level.id] ?? 0) > 0).length,
          maxStars: levels.reduce((sum, level) => sum + level.maxStars, 0),
          stars: levels.reduce((sum, level) => sum + (starsMap[level.id] ?? 0), 0),
          grade,
          reachable: isSongReachable(levels, starsMap, totalStars),
          beats: pickSongBeats(levels, bestRuns),
          songTotal: song.melody.length
        };
      }),
    [starsMap, grades, totalStars, bestRuns]
  );

  const stop = () => {
    stopRef.current?.();
    stopRef.current = null;
    setPlayingId(null);
    setStep(-1);
  };

  // 离开页面必须停掉定时器，否则回放会在后台一直跑
  useUnload(() => {
    stopRef.current?.();
    stopAllNotes();
  });
  useDidHide(() => {
    stopRef.current?.();
    stopAllNotes();
  });
  useEffect(
    () => () => {
      stopRef.current?.();
    },
    []
  );

  const handlePlay = (record: RecordItem) => {
    if (!record.reachable) {
      Taro.showToast({ title: '先通关上一首，这一首才开卷', icon: 'none' });
      return;
    }
    if (record.collected === 0) {
      Taro.showToast({ title: '先通关这首曲子的任意一段', icon: 'none' });
      return;
    }
    if (playingId === record.id) {
      stop();
      return;
    }
    stop();
    const song = SONGS.find((item) => item.id === record.id);
    if (!song) {
      return;
    }
    setPlayingId(record.id);
    stopRef.current = playSong(song, {
      // 有击键记录就按玩家自己的快慢播（这是「我的演奏」）；没有则按曲目 BPM 播原曲
      beats: record.beats?.beats,
      onStep: (index) => {
        if (index < 0) {
          setPlayingId(null);
          setStep(-1);
          return;
        }
        setStep(index);
      }
    });
  };

  const totalCollected = records.filter((record) => record.collected > 0).length;
  const goldCount = records.filter(
    (record) => record.collected === record.total && record.stars >= record.maxStars
  ).length;

  return (
    <View className={styles.page}>
      <View className={styles.header}>
        <Text className={styles.title}>曲集</Text>
        <Text className={styles.subtitle}>
          已收录 {totalCollected} / {records.length} 首 · 金唱片 {goldCount} 张
        </Text>
      </View>

      <View className={styles.list}>
        {records.map((record) => {
          const complete = record.collected === record.total;
          const gold = complete && record.stars >= record.maxStars;
          const playing = playingId === record.id;
          const progress = playing && step >= 0 ? ((step + 1) / record.songTotal) * 100 : 0;
          return (
            <View
              key={record.id}
              className={classnames(
                styles.record,
                !record.reachable && styles.recordLocked,
                gold && styles.recordGold,
                playing && styles.recordPlaying
              )}
              onClick={() => handlePlay(record)}
            >
              <View className={styles.discSlot}>
                <Disc spinning={playing} speed={3.6} gold={gold} />
              </View>

              <View className={styles.info}>
                <View className={styles.titleRow}>
                  <Text className={styles.numeral}>{record.numeral}</Text>
                  <Text className={styles.recordTitle}>{record.title}</Text>
                  {gold && <Text className={styles.goldTag}>金唱片</Text>}
                  {!gold && complete && <Text className={styles.doneTag}>已收录</Text>}
                </View>
                <Text className={styles.recordMeta}>
                  {TIER_LABELS[record.tier] ?? '曲目'} · {record.bpm} BPM
                </Text>
                <View className={styles.segments}>
                  {Array.from({ length: record.total }, (_, index) => (
                    <View
                      key={index}
                      className={classnames(styles.segment, index < record.collected && styles.segmentOn)}
                    />
                  ))}
                </View>
                {playing && (
                  <View className={styles.progress}>
                    <View className={styles.progressFill} style={{ width: `${progress}%` }} />
                  </View>
                )}
              </View>

              <View className={styles.right}>
                {!record.reachable ? (
                  <Text className={styles.lockText}>未至</Text>
                ) : record.collected === 0 ? (
                  <Text className={styles.lockText}>未收录</Text>
                ) : (
                  <>
                    <Text className={styles.gradeLetter}>{record.grade ?? '—'}</Text>
                    <Text className={styles.gradeText}>
                      {record.grade ? GRADE_LABELS[record.grade] : '演奏'}
                    </Text>
                  </>
                )}
                <Text className={styles.playHint}>
                  {!record.reachable
                    ? '先演奏完上一首'
                    : playing
                      ? '停止'
                      : record.collected === 0
                        ? '—'
                        : record.beats
                          ? '回放我的'
                          : '回放原曲'}
                </Text>
              </View>
            </View>
          );
        })}

        {/* 隐藏曲：给收集留一个可见的"下一件想做的事" */}
        <View className={classnames(styles.record, styles.recordLocked, styles.encore)}>
          <View className={styles.discSlot}>
            <Disc />
          </View>
          <View className={styles.info}>
            <View className={styles.titleRow}>
              <Text className={styles.numeral}>安</Text>
              <Text className={styles.recordTitle}>？？？</Text>
              <Text className={styles.encoreTag}>安可曲</Text>
            </View>
            <Text className={styles.recordMeta}>集齐 6 张金唱片，或攒够 {ENCORE_FRAGMENTS} 枚碎片</Text>
            <View className={styles.segments}>
              {Array.from({ length: ENCORE_FRAGMENTS }, (_, index) => (
                <View
                  key={index}
                  className={classnames(styles.segment, index < fragments && styles.segmentOn)}
                />
              ))}
            </View>
          </View>
          <View className={styles.right}>
            <Text className={styles.lockText}>
              {fragments}/{ENCORE_FRAGMENTS}
            </Text>
            <Text className={styles.gradeText}>碎片</Text>
          </View>
        </View>
      </View>

      <Text className={styles.footer}>
        回放的是你最好那一次的弹奏；还没弹到的音，按原曲续上
      </Text>
    </View>
  );
};

export default CollectionPage;
