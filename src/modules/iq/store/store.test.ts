import { useIqStore } from './index';
import * as resultStorage from '../services/resultStorage';

jest.mock('../services/resultStorage', () => ({
  saveResult: jest.fn().mockResolvedValue([]),
  loadResults: jest.fn().mockResolvedValue([]),
  removeResult: jest.fn().mockResolvedValue([]),
  clearResults: jest.fn().mockResolvedValue(undefined),
}));

beforeEach(() => {
  useIqStore.setState({ session: null, lastResult: null });
  (resultStorage.saveResult as jest.Mock).mockClear();
});

describe('useIqStore 施测流程', () => {
  it('start 专业版：首步为图形练习，末步为速度作答，题量与卷面一致', () => {
    useIqStore.getState().start('pro', 'adult');
    const s = useIqStore.getState().session!;
    expect(s.paper.mode).toBe('pro');
    expect(s.steps[0]).toEqual({ kind: 'practice', section: 'fluid', index: 0 });
    expect(s.steps[s.steps.length - 1]).toEqual({ kind: 'test', section: 'speed', index: 0 });
    expect(s.steps.filter((x) => x.kind === 'test' && x.section === 'fluid')).toHaveLength(
      s.paper.fluidItems.length,
    );
    expect(s.steps.filter((x) => x.kind === 'test' && x.section === 'memory').length).toBeGreaterThan(0);
  });

  it('start 轻量版：无言语/记忆步骤', () => {
    useIqStore.getState().start('light', '6-8');
    const s = useIqStore.getState().session!;
    expect(s.paper.verbalItems).toHaveLength(0);
    expect(s.paper.memoryTrials).toHaveLength(0);
    expect(s.steps.some((x) => x.kind !== 'speed-ready' && x.section === 'verbal')).toBe(false);
    expect(s.steps.some((x) => x.kind !== 'speed-ready' && x.section === 'memory')).toBe(false);
    expect(s.steps.some((x) => x.kind === 'speed-ready')).toBe(true);
  });

  it('finishPractice 依次推进练习与正式题', () => {
    useIqStore.getState().start('pro', 'adult');
    useIqStore.getState().finishPractice();
    expect(useIqStore.getState().session!.steps[useIqStore.getState().session!.stepIndex]).toEqual({
      kind: 'practice',
      section: 'fluid',
      index: 1,
    });
    useIqStore.getState().finishPractice();
    expect(useIqStore.getState().session!.steps[useIqStore.getState().session!.stepIndex]).toEqual({
      kind: 'test',
      section: 'fluid',
      index: 0,
    });
  });

  it('recordChoice：记录选项与用时并前进', () => {
    useIqStore.getState().start('pro', 'adult');
    useIqStore.getState().finishPractice();
    useIqStore.getState().finishPractice();
    const first = useIqStore.getState().session!.paper.fluidItems[0];
    useIqStore.getState().recordChoice(first.id, 2, 1500);
    const s = useIqStore.getState().session!;
    expect(s.responses.choice[first.id]).toEqual({ optionIndex: 2, elapsedMs: 1500 });
    expect(s.steps[s.stepIndex]).toEqual({ kind: 'test', section: 'fluid', index: 1 });
  });

  it('recordMemory 天花板：同长度两试皆错跳过该模式剩余', () => {
    useIqStore.getState().start('pro', 'adult');
    const s0 = useIqStore.getState().session!;
    const memStart = s0.steps.findIndex((x) => x.kind === 'test' && x.section === 'memory');
    useIqStore.setState({ session: { ...s0, stepIndex: memStart } });

    // 第 1 试失败 → 推进到同长度第 2 试
    const t1 = s0.paper.memoryTrials[(s0.steps[memStart] as { index: number }).index];
    useIqStore.getState().recordMemory(t1.id, [0], 100);
    let s = useIqStore.getState().session!;
    let step = s.steps[s.stepIndex] as { kind: 'test'; index: number };
    expect(step.kind).toBe('test');
    expect(s.paper.memoryTrials[step.index].mode).toBe('forward');

    // 第 2 试再失败 → 跳过顺背剩余，直接进入倒背第一试
    const t2 = s.paper.memoryTrials[step.index];
    useIqStore.getState().recordMemory(t2.id, [0], 100);
    s = useIqStore.getState().session!;
    step = s.steps[s.stepIndex] as { kind: 'test'; index: number };
    expect(step.kind).toBe('test');
    expect(s.paper.memoryTrials[step.index].mode).toBe('backward');
  });

  it('recordMemory 通过：正常推进到下一试', () => {
    useIqStore.getState().start('pro', 'adult');
    const s0 = useIqStore.getState().session!;
    const memStart = s0.steps.findIndex((x) => x.kind === 'test' && x.section === 'memory');
    useIqStore.setState({ session: { ...s0, stepIndex: memStart } });
    const trial = s0.paper.memoryTrials[(s0.steps[memStart] as { index: number }).index];
    useIqStore.getState().recordMemory(trial.id, trial.digits, 100);
    const s = useIqStore.getState().session!;
    expect(s.steps[s.stepIndex]).toEqual({
      kind: 'test',
      section: 'memory',
      index: (s0.steps[memStart] as { index: number }).index + 1,
    });
  });

  it('beginSpeed 推进到速配作答，finishSpeed 产出结果并写存储', async () => {
    useIqStore.getState().start('pro', 'adult');
    const s0 = useIqStore.getState().session!;
    const readyIndex = s0.steps.findIndex((x) => x.kind === 'speed-ready');
    useIqStore.setState({ session: { ...s0, stepIndex: readyIndex } });

    useIqStore.getState().beginSpeed();
    let s = useIqStore.getState().session!;
    expect(s.steps[s.stepIndex]).toEqual({ kind: 'test', section: 'speed', index: 0 });

    await useIqStore.getState().finishSpeed(20, 3);
    s = useIqStore.getState().session!;
    expect(s.stepIndex).toBe(s.steps.length);
    expect(s.responses.speed).toEqual({ correct: 20, wrong: 3 });
    const { lastResult } = useIqStore.getState();
    expect(lastResult?.report.kind).toBe('pro');
    expect(lastResult?.ageBand).toBe('adult');
    expect(resultStorage.saveResult).toHaveBeenCalledTimes(1);
  });

  it('abort 清空会话', () => {
    useIqStore.getState().start('light', 'adult');
    useIqStore.getState().abort();
    expect(useIqStore.getState().session).toBeNull();
  });

  it('非法调用为 no-op：无会话 / 练习步 / 非速度步均无副作用', async () => {
    await useIqStore.getState().finishSpeed(1, 0); // 无会话
    useIqStore.getState().start('pro', 'adult'); // 首步 = 图形练习
    const before = useIqStore.getState().session!;
    useIqStore.getState().recordChoice('x', 1, 10); // 练习步 → 忽略
    useIqStore.getState().recordMemory('x', [0], 10); // 练习步 → 忽略
    useIqStore.getState().beginSpeed(); // 非 speed-ready → 忽略
    await useIqStore.getState().finishSpeed(1, 0); // 非速度步 → 忽略
    const after = useIqStore.getState().session!;
    expect(after.stepIndex).toBe(before.stepIndex);
    expect(after.responses).toEqual(before.responses);
    expect(useIqStore.getState().lastResult).toBeNull();
    expect(resultStorage.saveResult).not.toHaveBeenCalled();
  });

  it('recordMemory 天花板：末段两试皆错后落到 speed-ready', () => {
    useIqStore.getState().start('pro', 'adult');
    const s0 = useIqStore.getState().session!;
    const trials = s0.paper.memoryTrials;
    const last = trials[trials.length - 1];
    const pairFirst = trials.findIndex((t) => t.mode === last.mode && t.length === last.length);
    const stepOf = (ti: number) =>
      s0.steps.findIndex((x) => x.kind === 'test' && x.section === 'memory' && x.index === ti);
    useIqStore.setState({ session: { ...s0, stepIndex: stepOf(pairFirst) } });

    const t1 = trials[pairFirst];
    useIqStore.getState().recordMemory(t1.id, [0], 100); // 第 1 试错
    const s1 = useIqStore.getState().session!;
    const step1 = s1.steps[s1.stepIndex] as { index: number };
    const t2 = trials[step1.index];
    useIqStore.getState().recordMemory(t2.id, [0], 100); // 第 2 试错 → 天花板
    const s = useIqStore.getState().session!;
    expect(s.steps[s.stepIndex]).toEqual({ kind: 'speed-ready' });
    expect(Object.keys(s.responses.memory)).toHaveLength(2);
  });

  it('finishSpeed：存储抛错时仍产出结果并进入完成态（light）', async () => {
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
    (resultStorage.saveResult as jest.Mock).mockRejectedValueOnce(new Error('disk'));
    useIqStore.getState().start('light', 'adult');
    const s0 = useIqStore.getState().session!;
    useIqStore.setState({ session: { ...s0, stepIndex: s0.steps.length - 1 } });
    await useIqStore.getState().finishSpeed(3, 1);
    expect(useIqStore.getState().session!.stepIndex).toBe(s0.steps.length);
    expect(useIqStore.getState().lastResult?.report.kind).toBe('light');
    warn.mockRestore();
  });
});
