import React from 'react';
import ReactTestRenderer from 'react-test-renderer';
import Joystick from './Joystick';

describe('Joystick', () => {
  it('渲染底座与旋钮', async () => {
    let tree!: ReactTestRenderer.ReactTestRenderer;
    await ReactTestRenderer.act(() => {
      tree = ReactTestRenderer.create(<Joystick onMove={() => {}} />);
    });
    // RN jest preset 将 View mock 为"复合组件 + 宿主组件"两层，props 均含 testID；
    // 仅统计宿主节点（type 为字符串）以保证数量断言精确
    const hostNodes = (testID: string) =>
      tree.root.findAll((n) => typeof n.type === 'string' && n.props.testID === testID);
    expect(hostNodes('joy-base').length).toBe(1);
    expect(hostNodes('joy-knob').length).toBe(1);
  });
});
