import React from 'react';
import ReactTestRenderer from 'react-test-renderer';
import { Text } from 'react-native';
import { ThemeProvider } from '../../../theme';
import MazeGameScreen from './MazeGameScreen';
import { useMazeStore } from '../store';

jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest'),
);

describe('MazeGameScreen', () => {
  beforeEach(() => {
    useMazeStore.setState(useMazeStore.getInitialState(), true);
  });

  it('渲染难度 chips 与迷宫视图不崩溃', async () => {
    let tree!: ReactTestRenderer.ReactTestRenderer;
    await ReactTestRenderer.act(() => {
      tree = ReactTestRenderer.create(
        <ThemeProvider>
          <MazeGameScreen />
        </ThemeProvider>,
      );
    });
    expect(tree).toBeTruthy();
    // HUD 难度 chips 全部渲染
    const texts = tree.root
      .findAllByType(Text)
      .map((n) => n.props.children)
      .filter((c): c is string => typeof c === 'string');
    expect(texts).toEqual(expect.arrayContaining(['轻松', '普通', '困难', '地狱']));
    // 卸载以清理屏幕内 100ms 计时器，避免 teardown 后 setInterval 回调触发报错
    await ReactTestRenderer.act(() => {
      tree.unmount();
    });
  });
});
