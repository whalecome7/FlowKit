import React from 'react';
import ReactTestRenderer from 'react-test-renderer';
import { Path } from 'react-native-svg';
import TrailLayer from './TrailLayer';
import { generateMaze } from '../services/generator';

describe('TrailLayer（回顾层：幽灵轨迹 + 最短路径）', () => {
  const maze = generateMaze(1234567, 'easy');
  const trail = [
    [3, 3],
    [4, 3],
    [5, 3],
    [5, 4],
  ] as [number, number][];

  it('无幽灵且无最短路径：渲染为空', async () => {
    let tree!: ReactTestRenderer.ReactTestRenderer;
    await ReactTestRenderer.act(() => {
      tree = ReactTestRenderer.create(
        <TrailLayer maze={maze} cellPx={12} ghost={null} shortestPath={null} />,
      );
    });
    expect(tree.root.findAllByType(Path).length).toBe(0);
  });

  it('幽灵与最短路径各一条 Path（含正确线段数）', async () => {
    let tree!: ReactTestRenderer.ReactTestRenderer;
    await ReactTestRenderer.act(() => {
      tree = ReactTestRenderer.create(
        <TrailLayer maze={maze} cellPx={12} ghost={trail} shortestPath={trail} />,
      );
    });
    const paths = tree.root.findAllByType(Path);
    expect(paths.length).toBe(2);
    // 4 点格折线 → 3 段（M + 3L 合并于一条 d）
    const mCount = paths
      .map((n) => ((n.props.d as string).match(/M /g) ?? []).length)
      .reduce((a, b) => a + b, 0);
    expect(mCount).toBe(6); // 2 条 Path × 3 段
  });
});
