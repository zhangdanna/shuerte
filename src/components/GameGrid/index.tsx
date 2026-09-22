import React, { useMemo } from 'react';
import { View } from '@tarojs/components';
import classnames from 'classnames';
import { CardStyle, CellData } from '@/types/game';
import { buildCircleCells } from '@/utils/circleLayout';
import { ZODIAC_SHAPES, buildSilhouetteCells, getShapeOutline, toClipPolygon } from '@/utils/silhouette';
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
  /** 卡片造型：方形 / 圆形 / 生肖，与 size 自由组合 */
  cardStyle: CardStyle;
  /** 生肖造型时的主题生肖下标 */
  zodiacIndex: number | null;
  cells: CellData[];
  /** 非对局中（倒计时/暂停）时冻结点击 */
  frozen?: boolean;
  onTapCell: (index: number) => void;
}

/**
 * 整张卡片 + 内部数字格，三种造型共用一套数据。
 *   方形卡：常规方块网格
 *   圆形卡：整块圆盘按半径分圈、角度分格，格子是扇环（沿圆边排一圈）
 *   生肖卡：整张卡片被裁成生肖轮廓，数字格在轮廓内部按 Voronoi 划分成不规则多边形
 * 「尺寸 × 造型」任意组合都由几何函数算出布局，组件只负责摆放。
 */
const GameGrid: React.FC<GameGridProps> = ({
  size,
  cardStyle,
  zodiacIndex,
  cells,
  frozen = false,
  onTapCell
}) => {
  const circleCells = useMemo(
    () => (cardStyle === 'circle' ? buildCircleCells(size) : null),
    [cardStyle, size]
  );
  const shape = cardStyle === 'zodiac' && zodiacIndex !== null ? ZODIAC_SHAPES[zodiacIndex] : null;
  const silhouetteClip = useMemo(
    () => (shape === null ? null : toClipPolygon(getShapeOutline(shape))),
    [shape]
  );
  const silhouetteCells = useMemo(
    () => (shape === null ? null : buildSilhouetteCells(shape, size)),
    [shape, size]
  );

  // 圆形卡必须外圈先画、内圈后画，内圈才能盖住外圈延伸到圆心的部分
  const circleOrder = useMemo(() => {
    if (!circleCells) {
      return [];
    }
    return circleCells
      .map((geometry, index) => ({ geometry, index }))
      .sort((a, b) => (b.geometry.ring ?? 0) - (a.geometry.ring ?? 0));
  }, [circleCells]);

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
                onTap={onTapCell}
              />
            );
          })}
        </View>
      </View>
    );
  }

  if (shape !== null && silhouetteClip !== null && silhouetteCells !== null) {
    return (
      <View
        className={classnames(
          styles.card,
          styles.cardSilhouette,
          styles[`silhouette${size}`],
          frozen && styles.frozen
        )}
        style={{ clipPath: silhouetteClip }}
      >
        {cells.map((cell, index) => {
          const geometry = silhouetteCells[index];
          return (
            <GridCell
              key={cell.value}
              value={cell.value}
              status={cell.status}
              index={index}
              clipPath={geometry.clipPath}
              labelPosition={geometry}
              absolute
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
              <GridCell value={cell.value} status={cell.status} index={index} onTap={onTapCell} />
            </View>
          </View>
        ))}
      </View>
    </View>
  );
};

export default GameGrid;
