import React, { useMemo } from 'react';
import { View } from '@tarojs/components';
import classnames from 'classnames';
import { MemoryCell, MemoryShape } from '@/types/challenge';
import { buildCircleCells } from '@/utils/circleLayout';
import GridCell from '@/components/GridCell';
import styles from './index.module.scss';

interface MemoryGridProps {
  /**
   * 方形盘面 = 列数（格子宽度 = 100% / cols，高度同宽）；
   * 圆形盘面 = 圈数（总格数恒等于 cols²，几何见 `utils/circleLayout`）。
   */
  cols: number;
  /** 盘面造型，缺省方形 */
  shape?: MemoryShape;
  cells: MemoryCell[];
  /** 数字是否可见：记忆阶段与窥看期间为 true，回忆阶段为 false */
  revealed: boolean;
  frozen?: boolean;
  onTapCell: (index: number) => void;
}

/** 冻结时的点击落点：保持函数引用稳定，避免破坏 GridCell 的 memo */
const NOOP = () => undefined;

/**
 * 挑战版盘面。
 *
 * 与经典版 `GameGrid` 的差别只有两点，所以没有复用 ——
 *   1. 方形盘面的列数与行数分开（经典版永远是 n×n），数字个数 = cols × rows，不留空格；
 *   2. 支持「数字隐去」：格子（底 + 边框）必须一直在，隐去的只有数字本身。
 *      这是整个玩法成立的前提 —— 玩家记的是「第 2 行第 3 格」，不是「一片白」。
 *
 * 圆形盘面直接复用经典版的 `buildCircleCells`（半径分圈、角度分格、带缝隙的圆角扇环），
 * 所以两版的圆长得一模一样；差别只在配色，以及「数字会隐去」。
 *
 * 格子本身复用 `GridCell`（多传 `masked` / `rice`），点对后的 ♪、红闪、按压反馈全都沿用。
 */
const MemoryGrid: React.FC<MemoryGridProps> = ({
  cols,
  shape = 'square',
  cells,
  revealed,
  frozen = false,
  onTapCell
}) => {
  const isCircle = shape === 'circle';
  // 圆形几何要算一堆三角函数 + 拼 clip-path 字符串，别在每次点击时重算
  const circleCells = useMemo(() => (isCircle ? buildCircleCells(cols) : null), [isCircle, cols]);

  // 点对的格子永远显示数字：那是玩家自己挣回来的进度，藏起来只会更慌
  const maskOf = (cell: MemoryCell): boolean => !revealed && cell.status !== 'done';

  if (isCircle && circleCells !== null) {
    return (
      <View
        className={classnames(
          styles.circleBoard,
          styles[`circle${cols}`],
          frozen && styles.frozen
        )}
      >
        <View className={styles.circleArea}>
          {circleCells.map((geometry, index) => {
            const cell = cells[index];
            if (!cell) {
              return null;
            }
            return (
              <GridCell
                key={cell.value}
                value={cell.value}
                status={cell.status}
                index={index}
                clipPath={geometry.clipPath}
                labelPosition={geometry}
                absolute
                rice
                masked={maskOf(cell)}
                onTap={frozen ? NOOP : onTapCell}
              />
            );
          })}
        </View>
      </View>
    );
  }

  return (
    <View className={classnames(styles.grid, styles[`cols${cols}`], frozen && styles.frozen)}>
      {cells.map((cell, index) => (
        <View
          key={cell.value}
          className={styles.slot}
          style={{ width: `${100 / cols}%`, paddingBottom: `${100 / cols}%` }}
        >
          <View className={styles.inner}>
            <GridCell
              value={cell.value}
              status={cell.status}
              index={index}
              rice
              masked={maskOf(cell)}
              onTap={frozen ? NOOP : onTapCell}
            />
          </View>
        </View>
      ))}
    </View>
  );
};

export default MemoryGrid;
