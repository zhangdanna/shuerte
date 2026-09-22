/** Fisher-Yates 洗牌，返回新数组，保证每个位置等概率 */
export const shuffle = <T>(list: T[]): T[] => {
  const result = list.slice();
  for (let i = result.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    const temp = result[i];
    result[i] = result[j];
    result[j] = temp;
  }
  return result;
};

/** 生成 1..size² 的乱序数字序列 */
export const buildNumbers = (size: number): number[] => {
  const values: number[] = [];
  for (let i = 1; i <= size * size; i += 1) {
    values.push(i);
  }
  return shuffle(values);
};
