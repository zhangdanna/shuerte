import React from 'react';
import { Text, View } from '@tarojs/components';
import classnames from 'classnames';
import styles from './index.module.scss';

interface StarRatingProps {
  /** 已获得星数 */
  stars: number;
  max?: number;
  size?: 'sm' | 'md' | 'lg';
  /** 结算页使用：获得的星星依次弹出 */
  animated?: boolean;
}

const StarRating: React.FC<StarRatingProps> = ({ stars, max = 3, size = 'md', animated = false }) => (
  <View className={classnames(styles.rating, styles[size])}>
    {Array.from({ length: max }, (_, index) => {
      const filled = index < stars;
      return (
        <Text
          key={index}
          className={classnames(
            styles.star,
            filled ? styles.filled : styles.empty,
            animated && filled && styles.pop
          )}
          style={animated && filled ? { animationDelay: `${index * 0.18}s` } : undefined}
        >
          ★
        </Text>
      );
    })}
  </View>
);

export default StarRating;
