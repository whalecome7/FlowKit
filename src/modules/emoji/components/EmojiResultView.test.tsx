import React from 'react';
import ReactTestRenderer from 'react-test-renderer';
import { Text } from 'react-native';
import { ThemeProvider } from '../../../theme';
import EmojiResultView from './EmojiResultView';
import { translate } from '../services/translator';

describe('EmojiResultView', () => {
  it('渲染黄金用例的 emoji 与标点', async () => {
    const tokens = translate('青梅竹马，狗急跳墙。');
    let tree!: ReactTestRenderer.ReactTestRenderer;
    await ReactTestRenderer.act(() => {
      tree = ReactTestRenderer.create(
        <ThemeProvider>
          <EmojiResultView tokens={tokens} mode="exact" picks={[]} onPick={() => {}} />
        </ThemeProvider>,
      );
    });
    const texts = tree.root
      .findAllByType(Text)
      .map((n) => n.props.children)
      .filter((c): c is string => typeof c === 'string')
      .join('');
    expect(texts).toContain('🍏');
    expect(texts).toContain('，');
    expect(texts).toContain('🐶');
  });
});
