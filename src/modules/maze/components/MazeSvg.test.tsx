import React from 'react';
import ReactTestRenderer from 'react-test-renderer';
import Svg, { Circle, Path, Rect } from 'react-native-svg';
import MazeSvg from './MazeSvg';
import { generateMaze } from '../services/generator';
import { PALETTES } from '../constants';

describe('MazeSvg', () => {
  it('渲染墙块与起终点标记', async () => {
    const maze = generateMaze(1234567, 'easy');
    let tree!: ReactTestRenderer.ReactTestRenderer;
    await ReactTestRenderer.act(() => {
      tree = ReactTestRenderer.create(
        <MazeSvg maze={maze} palette={PALETTES[0]} cellPx={12} />,
      );
    });
    // 有墙块（行合并后矩形数为连续墙段数，>10 防止完全空渲染回归）
    expect(tree.root.findAllByType(Rect).length).toBeGreaterThan(10);
    // 起点虚线环 + 终点柔光底（Circle）
    expect(tree.root.findAllByType(Circle).length).toBeGreaterThanOrEqual(2);
    // 旗帜：旗杆 + 旗面（Path）
    expect(tree.root.findAllByType(Path).length).toBeGreaterThanOrEqual(2);
    // 只有一个 Svg 根
    expect(tree.root.findAllByType(Svg).length).toBe(1);
  });
});
