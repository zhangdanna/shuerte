import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Text, View } from '@tarojs/components';
import classnames from 'classnames';
import { RunSnapshot } from '@/store/useRunStore';
import { buildReplayPlan, ReplayCell, ReplayCue } from '@/utils/replay';
import styles from './index.module.scss';

/** 格子弹出动画时长（ms），与 scss 的 replayPop 一致 */
const POP_MS = 240;
/**
 * 回放前的空拍（ms）：进结算页时先播一个通关音、星级也在一个个弹出来，
 * 回放紧跟着上会打架。这个值同时也是动画的起始偏移 —— 声画必须一起延后。
 */
const LEAD_MS = 560;

interface RunReplayProps {
  run: RunSnapshot;
  /**
   * 每次开始回放时把**整条发声表**交给页面（含 LEAD 偏移，单位 ms）。
   * 页面拿到后一次性按绝对时间排进音频图，不再逐个 setTimeout —— 那会在主线程卡顿时丢音。
   * 不传就是静音回放。
   */
  onPlan?: (cues: ReplayCue[]) => void;
}

/**
 * 演奏回放：把这一局的盘面按「你的点击顺序」重放一遍，播完碎掉。
 *
 * 几个刻意的实现选择：
 *   1. **不用 JS 定时器逐格 setState** —— 64 格 × 64 次渲染在小程序里就是 64 次 setData，
 *      会明显卡顿。视觉改成一次性给每格写 animation-delay，全部交给 CSS 合成层，只渲染一次。
 *   2. **声音必须用定时器** —— 动画在合成层里跑，JS 拿不到它的进度，只能在同一份 delay 上
 *      另起定时器逐个触发 onCue；声画共用 delay，误差只有一帧。组件本身不碰音频服务（分层）。
 *   3. **尺寸全走 class 与 flex 均分，inline style 里不写 rpx** —— rpx 是编译期单位，
 *      inline style 在 H5 端不会被转换（项目约定，见 GameGrid 的注释），写了等于没写。
 *   4. **碎裂只在 shatter 阶段挂载** —— 碎片节点（每格 3 片）是整页最重的部分，
 *      常驻会让对局页→结算页的切换变慢，所以它只在真正要炸的那 0.6 秒里存在。
 */
const RunReplay: React.FC<RunReplayProps> = ({ run, onPlan }) => {
  const plan = useMemo(() => buildReplayPlan(run.values, run.beats, run.mode), [run]);
  const [round, setRound] = useState(0);
  const [shattered, setShattered] = useState(false);
  // 碎片飞完再把空盘收成一行，避免结算页顶部留一块空洞
  const [collapsed, setCollapsed] = useState(false);

  // 父组件每次渲染都会给新的 onPlan，但排音只该在开播和重播时发生一次
  const planRef = useRef(onPlan);
  planRef.current = onPlan;

  const size = run.size;

  // 按行切分：行用 flex:1 均分高度、格用 flex:1 均分宽度。
  // 比「百分比宽 + flex-wrap」稳 —— 100/6 这类除不尽的值会把最后一格挤到下一行
  const rows = useMemo(() => {
    const list: ReplayCell[][] = [];
    for (let index = 0; index < plan.cells.length; index += size) {
      list.push(plan.cells.slice(index, index + size));
    }
    return list;
  }, [plan.cells, size]);

  useEffect(() => {
    if (plan.playMs <= 0) {
      return undefined;
    }
    const timer = setTimeout(() => setShattered(true), LEAD_MS + plan.playMs);
    return () => clearTimeout(timer);
  }, [plan.playMs, round]);

  // 开播：把整条发声表一次性交出去（含 LEAD 偏移），页面自己按绝对时间排
  useEffect(() => {
    if (plan.playedCount === 0) {
      return;
    }
    planRef.current?.(plan.cues.map((cue) => ({ value: cue.value, atMs: LEAD_MS + cue.atMs })));
  }, [plan, round]);

  // 碎裂 0.62s + 余量，收成一行
  useEffect(() => {
    if (!shattered) {
      return undefined;
    }
    const timer = setTimeout(() => setCollapsed(true), 900);
    return () => clearTimeout(timer);
  }, [shattered, round]);

  // 这一局没有可播的内容（比如开局就超时），整块不渲染
  if (plan.playedCount === 0) {
    return null;
  }

  const replay = () => {
    // 先复位再换 key：否则重播的第一帧还会带着上一轮的碎片
    setShattered(false);
    setCollapsed(false);
    setRound((value) => value + 1);
  };

  const renderCell = (item: ReplayCell) => {
    const played = item.delay >= 0;
    return (
      <View className={styles.slot} key={item.value}>
        <View
          className={classnames(
            styles.cell,
            !played && styles.cellIdle,
            played && shattered && styles.cellGone
          )}
          style={{ animationDelay: played ? `${LEAD_MS + item.delay}ms` : undefined }}
        >
          <Text className={styles.num}>{item.value}</Text>

          {played && (
            <Text
              className={styles.note}
              style={{ animationDelay: `${LEAD_MS + item.delay + POP_MS * 0.6}ms` }}
            >
              ♪
            </Text>
          )}

          {played &&
            shattered &&
            [0, 1, 2].map((shard) => {
              // 用数字本身做伪随机种子：同一格每轮飞散方向一致，不会闪来闪去
              const seed = ((item.value * 37 + shard * 11) % 19) / 19;
              const angle = seed * Math.PI * 2 + shard * 2.1;
              // 位移用百分比（相对碎片自身 = 格子尺寸），避免 inline style 写 rpx
              const distance = 60 + seed * 55;
              return (
                <View
                  key={shard}
                  className={classnames(styles.shard, styles[`shard${shard + 1}`])}
                  style={
                    {
                      '--dx': `${Math.round(Math.cos(angle) * distance)}%`,
                      // 整体往下偏：碎屑该落，别糊到上面的标题上
                      '--dy': `${Math.round(Math.sin(angle) * distance + 30)}%`,
                      '--rot': `${Math.round((seed - 0.5) * 70)}deg`,
                      animationDelay: `${((item.value * 7) % 9) * 14}ms`
                    } as React.CSSProperties
                  }
                />
              );
            })}
        </View>
      </View>
    );
  };

  return (
    <View className={styles.replay}>
      <View className={styles.head}>
        <Text className={styles.title}>这一遍的演奏</Text>
        <Text className={styles.meta}>
          {run.failed ? `弹到 ${plan.playedCount} / ${run.values.length}` : '按你的节奏'}
        </Text>
      </View>

      <View
        className={classnames(styles.boardWrap, styles[`size${size}`], collapsed && styles.collapsed)}
        onClick={replay}
      >
        <View key={round} className={classnames(styles.board, collapsed && styles.boardHide)}>
          {rows.map((row, rowIndex) => (
            <View className={styles.row} key={rowIndex}>
              {row.map(renderCell)}
            </View>
          ))}
        </View>

        {/* 收起之后再出这句话：碎片还在飞的时候压上去，两个都看不清 */}
        {collapsed && <Text className={styles.done}>♪ 弹完了 · 点一下重播</Text>}
      </View>
    </View>
  );
};

export default RunReplay;
