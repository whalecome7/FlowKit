import React from 'react';
import ReactTestRenderer from 'react-test-renderer';
import { Text, TouchableOpacity } from 'react-native';
import { ThemeProvider } from '../../../theme';
import MatrixItemView from './MatrixItemView';
import { PRACTICE_MATRIX } from '../data/practiceItems';

describe('MatrixItemView', () => {
  it('渲染问号格与全部选项', async () => {
    let tree!: ReactTestRenderer.ReactTestRenderer;
    await ReactTestRenderer.act(() => {
      tree = ReactTestRenderer.create(
        <ThemeProvider>
          <MatrixItemView item={PRACTICE_MATRIX[0]} onSelect={() => {}} />
        </ThemeProvider>,
      );
    });
    const texts = tree.root
      .findAllByType(Text)
      .map((n) => n.props.children)
      .filter((c): c is string => typeof c === 'string');
    expect(texts).toContain('?');
    // 6 个选项按钮
    expect(tree.root.findAllByType(TouchableOpacity).length).toBeGreaterThanOrEqual(6);
  });
});
