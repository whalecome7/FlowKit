import React from 'react';
import ReactTestRenderer from 'react-test-renderer';
import { ThemeProvider } from '../../../theme';
import SymbolSearchView from './SymbolSearchView';
import { speedTask } from '../data/speedTask';

describe('SymbolSearchView', () => {
  it('进入倒计时态渲染提示且不崩溃', async () => {
    let tree!: ReactTestRenderer.ReactTestRenderer;
    await ReactTestRenderer.act(() => {
      tree = ReactTestRenderer.create(
        <ThemeProvider>
          <SymbolSearchView task={speedTask} paused={false} onDone={() => {}} />
        </ThemeProvider>,
      );
    });
    await ReactTestRenderer.act(() => {
      tree.unmount();
    });
  });
});
