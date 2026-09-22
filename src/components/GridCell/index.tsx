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
}

/**
 * 单元格。
 * 方形卡是普通方块；圆形卡/生肖卡传入 clipPath，裁成扇环或不规则四边形。
 * 用 React.memo 包住：一次点击只改变两个格子的 props，其余格子引用不变，直接跳过重渲染
 * （clipPath 与 labelPosition 都由 useMemo 产出，引用稳定，不会破坏 memo）。
 */
const GridCell: React.FC<GridCellProps> = React.memo(
  ({ value, status, index, onTap, clipPath, labelPosition, absolute = false }) => {
    const tone = ((value - 1) % TONE_COUNT) + 1;
    const isAbsolute = absolute && labelPosition !== undefined;
    return (
      <View
        className={classnames(
          styles.cell,
          styles[`tone${tone}`],
          clipPath !== undefined && styles.clipped,
          isAbsolute && styles.absolute,
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
