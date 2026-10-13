import React from 'react';
import ReactTestRenderer from 'react-test-renderer';
import { Path } from 'react-native-svg';
import TrailLayer from './TrailLayer';
import { generateMaze } from '../services/generator';
import { PALETTES } from '../constants';

describe('TrailLayer', () => {
  const maze = generateMaze(1234567, 'easy');

  it('空轨迹渲染为空', async () => {
    let tree!: ReactTestRenderer.ReactTestRenderer;
    await ReactTestRenderer.act(() => {
      tree = ReactTestRenderer.create(
        <TrailLayer
          maze={maze}
          cellPx={12}
          palette={PALETTES[0]}
          trailStyle="rainbow"
          trail={[]}
          ghost={null}
          shortestPath={null}
        />,
      );
    });
    expect(tree.root.findAllByType(Path).length).toBe(0);
  });

  it('彩虹模式按桶生成 Path，幽灵与最短路径各一条', async () => {
    const trail = [
      [3, 3],
      [4, 3],
      [5, 3],
      [5, 4],
    ] as [number, number][];
    let tree!: ReactTestRenderer.ReactTestRenderer;
    await ReactTestRenderer.act(() => {
      tree = ReactTestRenderer.create(
        <TrailLayer
          maze={maze}
          cellPx={12}
          palette={PALETTES[0]}
          trailStyle="rainbow"
          trail={trail}
          ghost={trail}
          shortestPath={trail}
        />,
      );
    });
    // 轨迹桶 + 幽灵 1 + 最短路径 1
    expect(tree.root.findAllByType(Path).length).toBeGreaterThanOrEqual(3);
  });

  it('静态折线只画到倒数第二个格（最后一段由实时尾巴层负责）', async () => {
    const trail = [
      [3, 3],
      [4, 3],
      [5, 3],
      [5, 4],
    ] as [number, number][];
    let tree!: ReactTestRenderer.ReactTestRenderer;
    await ReactTestRenderer.act(() => {
      tree = ReactTestRenderer.create(
        <TrailLayer
          maze={maze}
          cellPx={12}
          palette={PALETTES[0]}
          trailStyle="rainbow"
          trail={trail}
          ghost={null}
          shortestPath={null}
        />,
      );
    });
    // 4 点轨迹完整应为 3 段；静态层去掉最后一段 → 全部 Path 的 "M " 合计 2
    const mCount = tree.root
      .findAllByType(Path)
      .map((n) => ((n.props.d as string).match(/M /g) ?? []).length)
      .reduce((a, b) => a + b, 0);
    expect(mCount).toBe(2);
  });
});
