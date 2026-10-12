import React from 'react';
import ReactTestRenderer from 'react-test-renderer';
import { Circle, Path, Rect } from 'react-native-svg';
import MazeSmokeTest from './MazeSmokeTest';

describe('MazeSmokeTest（react-native-svg 冒烟）', () => {
  it('渲染基础图元不崩溃', async () => {
    let tree!: ReactTestRenderer.ReactTestRenderer;
    await ReactTestRenderer.act(() => {
      tree = ReactTestRenderer.create(<MazeSmokeTest />);
    });
    expect(tree.root.findAllByType(Rect).length).toBe(25);
    expect(tree.root.findAllByType(Circle).length).toBe(1);
    expect(tree.root.findAllByType(Path).length).toBe(1);
  });
});
