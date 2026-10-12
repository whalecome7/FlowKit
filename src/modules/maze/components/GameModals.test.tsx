import React from 'react';
import ReactTestRenderer from 'react-test-renderer';
import { Text, TextInput, TouchableOpacity } from 'react-native';
import { ThemeProvider } from '../../../theme';
import { SeedModal, WinModal } from './GameModals';
import { PALETTES } from '../constants';

// 文本节点的 children 可能为字符串、数字或嵌套数组（如「步数 {steps} · 最佳 {bestText}」会拆成多段），
// 这里按节点拼接为完整字符串，便于用 includes 断言内容。
function renderChildren(children: unknown): string {
  if (Array.isArray(children)) return children.map(renderChildren).join('');
  if (typeof children === 'number') return String(children);
  if (typeof children === 'string') return children;
  return '';
}

function texts(tree: ReactTestRenderer.ReactTestRenderer): string[] {
  return tree.root.findAllByType(Text).map((n) => renderChildren(n.props.children));
}

describe('WinModal', () => {
  it('visible=false 时不渲染内容', async () => {
    let tree!: ReactTestRenderer.ReactTestRenderer;
    await ReactTestRenderer.act(() => {
      tree = ReactTestRenderer.create(
        <ThemeProvider>
          <WinModal
            visible={false}
            timeText="00:45.0"
            steps={12}
            bestText="00:50.0"
            palette={PALETTES[0]}
            onAgain={() => {}}
            onNewMaze={() => {}}
          />
        </ThemeProvider>,
      );
    });
    expect(texts(tree)).not.toContain('🎉 通关！');
    await ReactTestRenderer.act(() => {
      tree.unmount();
    });
  });

  it('visible=true 渲染结算信息与按钮', async () => {
    let tree!: ReactTestRenderer.ReactTestRenderer;
    await ReactTestRenderer.act(() => {
      tree = ReactTestRenderer.create(
        <ThemeProvider>
          <WinModal
            visible
            timeText="00:45.0"
            steps={12}
            bestText="00:50.0"
            palette={PALETTES[0]}
            onAgain={() => {}}
            onNewMaze={() => {}}
          />
        </ThemeProvider>,
      );
    });
    const t = texts(tree);
    expect(t).toContain('🎉 通关！');
    expect(t.some((s) => s.includes('00:45.0'))).toBe(true);
    expect(t.some((s) => s.includes('步数') && s.includes('12'))).toBe(true);
    await ReactTestRenderer.act(() => {
      tree.unmount();
    });
  });
});

describe('SeedModal', () => {
  it('非法输入不触发 onGenerate，合法输入传 parseInt', async () => {
    const onGenerate = jest.fn();
    let tree!: ReactTestRenderer.ReactTestRenderer;
    await ReactTestRenderer.act(() => {
      tree = ReactTestRenderer.create(
        <ThemeProvider>
          <SeedModal visible seed={1000000} palette={PALETTES[0]} onClose={() => {}} onGenerate={onGenerate} />
        </ThemeProvider>,
      );
    });
    const input = tree.root.findByType(TextInput);
    await ReactTestRenderer.act(() => {
      input.props.onChangeText('123');
    });
    const genBtn = tree.root.findAllByType(TouchableOpacity).find((n) => {
      const txt = n.findAllByType(Text).map((t) => t.props.children).flat().join('');
      return txt.includes('生成');
    })!;
    await ReactTestRenderer.act(() => {
      genBtn.props.onPress();
    });
    expect(onGenerate).not.toHaveBeenCalled();
    await ReactTestRenderer.act(() => {
      input.props.onChangeText('3141592');
    });
    await ReactTestRenderer.act(() => {
      genBtn.props.onPress();
    });
    expect(onGenerate).toHaveBeenCalledWith(3141592);
    await ReactTestRenderer.act(() => {
      tree.unmount();
    });
  });

  it('visible 从 false 变 true 时重置输入', async () => {
    const tree = ReactTestRenderer.create(
      <ThemeProvider>
        <SeedModal visible={false} seed={1000000} palette={PALETTES[0]} onClose={() => {}} onGenerate={() => {}} />
      </ThemeProvider>,
    );
    await ReactTestRenderer.act(() => {
      tree.update(
        <ThemeProvider>
          <SeedModal visible seed={7654321} palette={PALETTES[0]} onClose={() => {}} onGenerate={() => {}} />
        </ThemeProvider>,
      );
    });
    const input = tree.root.findByType(TextInput);
    expect(input.props.value).toBe('7654321');
    await ReactTestRenderer.act(() => {
      tree.unmount();
    });
  });
});
