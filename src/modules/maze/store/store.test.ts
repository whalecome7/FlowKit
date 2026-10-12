import { useMazeStore } from './index';

beforeEach(() => {
  useMazeStore.setState(useMazeStore.getInitialState(), true);
});

describe('maze store', () => {
  it('初始状态', () => {
    const s = useMazeStore.getState();
    expect(s.difficulty).toBe('easy');
    expect(s.phase).toBe('ready');
    expect(s.steps).toBe(0);
    expect(s.trailStyle).toBe('rainbow');
  });

  it('切换难度与种子', () => {
    useMazeStore.getState().setDifficulty('hard');
    useMazeStore.getState().setSeed(1234567);
    const s = useMazeStore.getState();
    expect(s.difficulty).toBe('hard');
    expect(s.seed).toBe(1234567);
  });

  it('计步与阶段流转', () => {
    useMazeStore.getState().startGame(1000);
    useMazeStore.getState().addStep();
    useMazeStore.getState().addStep();
    let s = useMazeStore.getState();
    expect(s.phase).toBe('playing');
    expect(s.steps).toBe(2);
    expect(s.startedAt).toBe(1000);
    useMazeStore.getState().winGame(45000);
    s = useMazeStore.getState();
    expect(s.phase).toBe('won');
    expect(s.elapsedMs).toBe(45000);
  });

  it('重置一局（保留难度与种子）', () => {
    useMazeStore.getState().setDifficulty('normal');
    useMazeStore.getState().setSeed(7654321);
    useMazeStore.getState().startGame(0);
    useMazeStore.getState().addStep();
    useMazeStore.getState().resetGame();
    const s = useMazeStore.getState();
    expect(s.phase).toBe('ready');
    expect(s.steps).toBe(0);
    expect(s.difficulty).toBe('normal');
    expect(s.seed).toBe(7654321);
  });

  it('轨迹样式循环切换', () => {
    useMazeStore.getState().cycleTrailStyle();
    expect(useMazeStore.getState().trailStyle).toBe('mono');
    useMazeStore.getState().cycleTrailStyle();
    expect(useMazeStore.getState().trailStyle).toBe('fade');
    useMazeStore.getState().cycleTrailStyle();
    expect(useMazeStore.getState().trailStyle).toBe('rainbow');
  });
});
