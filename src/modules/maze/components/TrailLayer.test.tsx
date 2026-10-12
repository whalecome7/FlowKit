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
});
