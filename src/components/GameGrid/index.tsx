import React, { useMemo } from 'react';
import { Image, View } from '@tarojs/components';
import classnames from 'classnames';
import { CardStyle, CellData, GameMode } from '@/types/game';
import { buildCircleCells } from '@/utils/circleLayout';
import { PATTERN_SHAPES, buildPatternInk, buildSilhouetteCells } from '@/utils/silhouette';
import GridCell from '@/components/GridCell';
import styles from './index.module.scss';

/** 格位占宽：百分比撑正方形，只依赖容器宽度（inline style 里不写 rpx） */
const gridSlotStyle = (size: number): { width: string; paddingBottom: string } => {
  const basis = `${100 / size}%`;
  return { width: basis, paddingBottom: basis };
};

interface GameGridProps {
  /** 数字数量维度：方格边长 3 ~ 8 */
  size: number;
  /** 卡片造型：方形 / 圆形 / 不规则图案，与 size 自由组合 */
  cardStyle: CardStyle;
  /** 图案造型时的主题图案下标 */
  patternIndex: number | null;
  /** 玩法：双色交替时格子按奇偶上色 */
  mode: GameMode;
  cells: CellData[];
  /** 非对局中（倒计时/暂停）时冻结点击 */
  frozen?: boolean;
  /** 亲子模式：格子 6 色循环（默认纸面单色） */
  colorful?: boolean;
  onTapCell: (index: number) => void;
}

/**
 * 整张卡片 + 内部数字格，三种造型共用一套数据。
 *   方形卡：常规方块网格
 *   圆形卡：整块圆盘按半径分圈、角度分格，格子是扇环（沿圆边排一圈）
 *   图案卡：整张卡片被裁成不规则图案，数字格在轮廓内部按 Voronoi 划分成不规则多边形
 * 「尺寸 × 造型」任意组合都由几何函数算出布局，组件只负责摆放。
 */
const GameGrid: React.FC<GameGridProps> = ({
  size,
  cardStyle,
  patternIndex,
  mode,
  cells,
  frozen = false,
  colorful = false,
  onTapCell
}) => {
  const alternate = mode === 'alternate';
  const circleCells = useMemo(
    () => (cardStyle === 'circle' ? buildCircleCells(size) : null),
    [cardStyle, size]
  );
  const shape = cardStyle === 'pattern' && patternIndex !== null ? PATTERN_SHAPES[patternIndex] : null;
  // 线条层：一张 SVG（图案面 + 外轮廓 + 所有格线），格子本身完全透明
  const patternInk = useMemo(
    () => (shape === null ? null : buildPatternInk(shape, size)),
    [shape, size]
  );
  const patternCells = useMemo(
    () => (shape === null ? null : buildSilhouetteCells(shape, size)),
    [shape, size]
  );

  // 圆形卡的格子是互不重叠的圆角扇环，不需要再按圈层排序遮挡
  const circleOrder = useMemo(
    () => (circleCells ?? []).map((geometry, index) => ({ geometry, index })),
    [circleCells]
  );

  if (cardStyle === 'circle') {
    return (
      <View
        className={classnames(
          styles.card,
          styles.cardCircle,
          styles[`circle${size}`],
          frozen && styles.frozen
        )}
      >
        <View className={styles.circleArea}>
          {circleOrder.map(({ geometry, index }) => {
            const cell = cells[index];
            return (
              <GridCell
                key={cell.value}
                value={cell.value}
                status={cell.status}
                index={index}
                clipPath={geometry.clipPath}
                labelPosition={geometry}
                absolute
                alternate={alternate}
                colorful={colorful}
                onTap={onTapCell}
              />
            );
          })}
        </View>
      </View>
    );
  }

  if (shape !== null && patternInk !== null && patternCells !== null) {
    return (
      <View
        className={classnames(
          styles.card,
          styles.cardPattern,
          styles[`pattern${size}`],
          frozen && styles.frozen
        )}
      >
        {/* 图案面与所有线条都在这张 SVG 里：线只描一次，宽度绝对均匀 */}
        <Image className={styles.patternInk} src={patternInk} mode="scaleToFill" />
        {cells.map((cell, index) => {
          const geometry = patternCells[index];
          return (
            <GridCell
              key={cell.value}
              value={cell.value}
              status={cell.status}
              index={index}
              clipPath={geometry.clipPath}
              labelPosition={geometry}
              absolute
              ghost
              alternate={alternate}
              colorful={colorful}
              onTap={onTapCell}
            />
          );
        })}
      </View>
    );
  }

  return (
    <View className={classnames(styles.card, styles.cardSquare, frozen && styles.frozen)}>
      <View className={classnames(styles.grid, styles[`size${size}`])}>
        {cells.map((cell, index) => (
          <View key={cell.value} className={styles.cellWrap} style={gridSlotStyle(size)}>
            <View className={styles.cellInner}>
              <GridCell
                value={cell.value}
                status={cell.status}
                index={index}
                alternate={alternate}
                colorful={colorful}
                onTap={onTapCell}
              />
            </View>
          </View>
        ))}
      </View>
    </View>
  );
};

export default GameGrid;
