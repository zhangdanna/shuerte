import React from 'react';
import { Text, View } from '@tarojs/components';
import classnames from 'classnames';
import { CellStatus } from '@/types/game';
import styles from './index.module.scss';

/** 数字配色循环数，必须与 index.module.scss 的 $tone-count 保持一致 */
const TONE_COUNT = 6;

interface GridCellProps {
  value: number;
  status: CellStatus;
  index: number;
  onTap: (index: number) => void;
  /** 异形格子的剪裁路径（相对格子自身），方形卡不传 */
  clipPath?: string;
  /** 数字相对格子的位置；配合 absolute 用于整卡铺满的分区格（圆形卡） */
  labelPosition?: { labelX: number; labelY: number };
  /** true = 用绝对定位铺满整张卡片（圆形卡）；不传 = 落在自己的格位里 */
  absolute?: boolean;
  /** true = 双色交替玩法：按数字奇偶上色（奇数暖橙 / 偶数靛青），不走 6 色循环 */
  alternate?: boolean;
  /** 亲子模式：按 6 色循环上色。默认 false —— 单色纸面，把注意力还给玩法 */
  colorful?: boolean;
  /**
   * true = 格子完全透明（图案卡）：图案面与格线都由底层的 SVG 线条层负责，
   * 格子只剩「点击热区 + 数字」两个职责，所以不能再有底色、描边、圆角或阴影，
   * 否则又变回「一堆小卡片」。
   */
  ghost?: boolean;
}

/**
 * 单元格。
 * 方形卡是普通方块；圆形卡/图案卡传入 clipPath，裁成扇环或不规则多边形。
 * 点过的格子落一枚 ♪（数字颜色不变），像一页被标记过的乐谱。
 * 用 React.memo 包住：一次点击只改变两个格子的 props，其余格子引用不变，直接跳过重渲染
 * （clipPath 与 labelPosition 都由 useMemo 产出，引用稳定，不会破坏 memo）。
 */
const GridCell: React.FC<GridCellProps> = React.memo(
  ({
    value,
    status,
    index,
    onTap,
    clipPath,
    labelPosition,
    absolute = false,
    alternate = false,
    colorful = false,
    ghost = false
  }) => {
    const tone = ((value - 1) % TONE_COUNT) + 1;
    // 双色关必须上色（那是玩法），亲子模式才走 6 色循环，其余一律纸面单色
    const toneClass = alternate
      ? value % 2 === 1
        ? styles.toneOdd
        : styles.toneEven
      : colorful
        ? styles[`tone${tone}`]
        : undefined;
    const isAbsolute = absolute && labelPosition !== undefined;
    return (
      <View
        className={classnames(
          styles.cell,
          toneClass,
          clipPath !== undefined && styles.clipped,
          isAbsolute && styles.absolute,
          ghost && styles.ghost,
          status === 'done' && styles.done,
          status === 'error' && styles.error
        )}
        style={clipPath === undefined ? undefined : { clipPath }}
        onClick={() => onTap(index)}
      >
        <Text
          className={classnames(styles.value, isAbsolute && styles.floatingValue)}
          style={
            isAbsolute && labelPosition !== undefined
              ? { left: `${labelPosition.labelX}%`, top: `${labelPosition.labelY}%`, transform: 'translate(-50%, -50%)' }
              : undefined
          }
        >
          {value}
        </Text>
      </View>
    );
  }
);

GridCell.displayName = 'GridCell';

export default GridCell;
