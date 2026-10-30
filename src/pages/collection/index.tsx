import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Text, View } from '@tarojs/components';
import Taro, { useDidHide, useUnload } from '@tarojs/taro';
import classnames from 'classnames';
import Disc from '@/components/Disc';
import { LEVELS } from '@/data/levels';
import { SONGS } from '@/data/songs';
import { CLASSICS } from '@/data/classics';
import { useSaveStore } from '@/store/useSaveStore';
import { isSongReachable } from '@/utils/progress';
import { SongBeats, pickSongBeats } from '@/utils/beats';
import { getClassicProgress } from '@/utils/classics';
import { playSong, stopAllNotes } from '@/services/audio';
import { GRADE_LABELS } from '@/utils/scoring';
import { ClassicSong, PerformanceGrade, SongConfig, TimbreKey } from '@/types/game';
import styles from './index.module.scss';

/** 曲目序号：曲集按收录顺序排，用汉字序号更像一本谱册 */
const NUMERALS = ['壹', '贰', '叁', '肆', '伍', '陆', '柒'];
const CLASSIC_NUMERALS = ['一', '二', '三', '四', '五', '六'];

const TIER_NAMES: Record<number, string> = { 1: '小令', 2: '中调', 3: '长调' };

/** 音色文案由 song.style 派生 —— 写死在档位上会和实际发声对不上 */
const STYLE_LABELS: Record<TimbreKey, string> = {
  musicbox: '八音盒',
  piano: '钢琴',
  epiano: '电钢'
};

const GRADE_ORDER: Record<PerformanceGrade, number> = { S: 4, A: 3, B: 2, C: 1 };

interface RecordItem {
  id: string;
  numeral: string;
  title: string;
  meta: string;
  total: number;
  collected: number;
  maxStars: number;
  stars: number;
  grade: PerformanceGrade | null;
  /** 是否已经走到这首（第一段解锁）：顺序解锁后，曲目也是一首一首开 */
  reachable: boolean;
  /** 玩家自己的击键记录（没有则回放原曲） */
  beats: SongBeats | null;
  song: SongConfig;
}

const CollectionPage: React.FC = () => {
  const starsMap = useSaveStore((state) => state.stars);
  const grades = useSaveStore((state) => state.grades);
  const bestRuns = useSaveStore((state) => state.bestRuns);
  const settings = useSaveStore((state) => state.settings);
  const setSetting = useSaveStore((state) => state.setSetting);

  const totalStars = Object.values(starsMap).reduce((sum, value) => sum + value, 0);

  const [playingId, setPlayingId] = useState<string | null>(null);
  const [step, setStep] = useState(-1);
  const [playingTotal, setPlayingTotal] = useState(64);
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
          meta: `${TIER_NAMES[song.tier] ?? '曲目'} · ${STYLE_LABELS[song.style] ?? '钢琴'} · ${song.bpm} BPM`,
          total: levels.length,
          collected: levels.filter((level) => (starsMap[level.id] ?? 0) > 0).length,
          maxStars: levels.reduce((sum, level) => sum + level.maxStars, 0),
          stars: levels.reduce((sum, level) => sum + (starsMap[level.id] ?? 0), 0),
          grade,
          reachable: isSongReachable(levels, starsMap, totalStars),
          beats: pickSongBeats(levels, bestRuns),
          song
        };
      }),
    [starsMap, grades, totalStars, bestRuns]
  );

  const classics = useMemo(
    () =>
      CLASSICS.map((song: ClassicSong, index) => ({
        song,
        numeral: CLASSIC_NUMERALS[index] ?? `${index + 1}`,
        progress: getClassicProgress(song, { stars: starsMap, grades })
      })),
    [starsMap, grades]
  );

  const stop = () => {
    stopRef.current?.();
    stopRef.current = null;
    setPlayingId(null);
    setStep(-1);
  };

  // 离开页面必须停掉调度循环，否则回放会在后台一直跑
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

  const startPlay = (song: SongConfig, beats?: number[]) => {
    if (playingId === song.id) {
      stop();
      return;
    }
    stop();
    setPlayingId(song.id);
    setPlayingTotal(song.melody.length);
    setStep(0);
    stopRef.current = playSong(song, {
      // 有击键记录就按玩家自己的快慢播（这是「我的演奏」）；没有则按曲目 BPM 播原曲
      beats,
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

  const handlePlayRecord = (record: RecordItem) => {
    if (!record.reachable) {
      Taro.showToast({ title: '先通关上一首，这一首才开卷', icon: 'none' });
      return;
    }
    if (record.collected === 0) {
      Taro.showToast({ title: '先通关这首曲子的任意一段', icon: 'none' });
      return;
    }
    startPlay(record.song, record.beats?.beats);
  };

  const handlePlayClassic = (item: {
    song: ClassicSong;
    progress: { unlocked: boolean; label: string; target: number };
  }) => {
    if (!item.progress.unlocked) {
      Taro.showToast({ title: `还差一点：${item.progress.label} ${item.progress.target}`, icon: 'none' });
      return;
    }
    startPlay(item.song);
  };

  const totalCollected = records.filter((record) => record.collected > 0).length;
  const goldCount = records.filter(
    (record) => record.collected === record.total && record.stars >= record.maxStars
  ).length;
  const unlockedClassics = classics.filter((item) => item.progress.unlocked).length;

  return (
    <View className={styles.page}>
      <View className={styles.headerRow}>
        <View className={styles.header}>
          <Text className={styles.title}>曲集</Text>
          <Text className={styles.subtitle}>
            已收录 {totalCollected} / {records.length} 首 · 金唱片 {goldCount} 张
          </Text>
        </View>
        <View
          className={classnames(styles.accompChip, settings.accompaniment && styles.accompChipOn)}
          onClick={() => setSetting('accompaniment', !settings.accompaniment)}
        >
          <Text className={classnames(styles.accompText, settings.accompaniment && styles.accompTextOn)}>
            伴奏 {settings.accompaniment ? '开' : '关'}
          </Text>
        </View>
      </View>

      <View className={styles.list}>
        {records.map((record) => {
          const complete = record.collected === record.total;
          const gold = complete && record.stars >= record.maxStars;
          const playing = playingId === record.id;
          const progress = playing && step >= 0 ? ((step + 1) / playingTotal) * 100 : 0;
          return (
            <View
              key={record.id}
              className={classnames(
                styles.record,
                !record.reachable && styles.recordLocked,
                gold && styles.recordGold,
                playing && styles.recordPlaying
              )}
              onClick={() => handlePlayRecord(record)}
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
                <Text className={styles.recordMeta}>{record.meta}</Text>
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
                    ? '先演奏上一首'
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
      </View>

      {/* 名曲拾遗：公有领域作品，按战绩解锁 */}
      <View className={styles.sectionHead}>
        <Text className={styles.sectionTitle}>名曲拾遗</Text>
        <Text className={styles.sectionHint}>
          {unlockedClassics} / {classics.length} 首 · 按战绩解锁
        </Text>
      </View>

      <View className={styles.list}>
        {classics.map((item) => {
          const { song, progress } = item;
          const playing = playingId === song.id;
          const percent = playing && step >= 0 ? ((step + 1) / playingTotal) * 100 : 0;
          const unlockPercent = Math.min(100, (progress.current / progress.target) * 100);
          return (
            <View
              key={song.id}
              className={classnames(
                styles.record,
                !progress.unlocked && styles.recordLocked,
                playing && styles.recordPlaying
              )}
              onClick={() => handlePlayClassic(item)}
            >
              <View className={styles.discSlot}>
                <Disc spinning={playing} speed={3.6} />
              </View>

              <View className={styles.info}>
                <View className={styles.titleRow}>
                  <Text className={styles.numeral}>{item.numeral}</Text>
                  <Text className={styles.recordTitle}>{song.title}</Text>
                  {progress.unlocked ? (
                    <Text className={styles.classicTag}>名曲</Text>
                  ) : (
                    <Text className={styles.encoreTag}>待解锁</Text>
                  )}
                </View>
                <Text className={styles.recordMeta}>
                  {song.composer} · {STYLE_LABELS[song.style] ?? '钢琴'} · {song.bpm} BPM
                </Text>
                {!progress.unlocked && (
                  <View className={styles.unlockBar}>
                    <View className={styles.unlockBarFill} style={{ width: `${unlockPercent}%` }} />
                  </View>
                )}
                {playing && (
                  <View className={styles.progress}>
                    <View className={styles.progressFill} style={{ width: `${percent}%` }} />
                  </View>
                )}
              </View>

              <View className={styles.right}>
                {progress.unlocked ? (
                  <Text className={styles.playHint}>{playing ? '停止' : '播放'}</Text>
                ) : (
                  <>
                    <Text className={styles.lockText}>
                      {Math.min(progress.current, progress.target)}/{progress.target}
                    </Text>
                    <Text className={styles.gradeText}>{progress.label}</Text>
                  </>
                )}
              </View>
            </View>
          );
        })}
      </View>

      <Text className={styles.footer}>
        回放的是你最好那一次的弹奏；名曲按原谱速度演奏，配伴奏
      </Text>
    </View>
  );
};

export default CollectionPage;
