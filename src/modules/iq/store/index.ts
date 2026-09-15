import { create } from 'zustand';
import { buildPaper } from '../services/paperBuilder';
import { computeReport, isMemoryPass } from '../services/scoring';
import { saveResult } from '../services/resultStorage';
import { generateId } from '../../../shared/types';
import { PRACTICE_MATRIX, PRACTICE_MEMORY, PRACTICE_VERBAL } from '../data/practiceItems';
import type {
  AgeBand,
  Dimension,
  MatrixItem,
  MemoryTrial,
  Paper,
  Responses,
  Session,
  SessionStep,
  TestMode,
  TestResult,
  VerbalItem,
} from '../types';

function emptyResponses(): Responses {
  return { choice: {}, memory: {}, speed: null };
}

/** 练习题目按维度索引（step.kind === 'practice' 时用；重载保证返回类型精确） */
export function practiceUnit(section: 'fluid', index: number): MatrixItem;
export function practiceUnit(section: 'verbal', index: number): VerbalItem;
export function practiceUnit(section: 'memory', index: number): MemoryTrial;
export function practiceUnit(
  section: Dimension,
  index: number,
): MatrixItem | VerbalItem | MemoryTrial {
  if (section === 'fluid') return PRACTICE_MATRIX[Math.min(index, PRACTICE_MATRIX.length - 1)];
  if (section === 'verbal') return PRACTICE_VERBAL;
  return PRACTICE_MEMORY;
}

/** 构建施测步骤：每段「练习 → 正式题」，速度段的练习并入 speed-ready 页 */
function buildSteps(paper: Paper): SessionStep[] {
  const isPro = paper.mode === 'pro';
  const sections: Dimension[] = isPro ? ['fluid', 'verbal', 'memory', 'speed'] : ['fluid', 'speed'];
  const practiceCounts: Record<Dimension, number> = isPro
    ? { fluid: 2, verbal: 1, memory: 1, speed: 0 }
    : { fluid: 1, verbal: 0, memory: 0, speed: 0 };
  const testCounts: Record<Dimension, number> = {
    fluid: paper.fluidItems.length,
    verbal: paper.verbalItems.length,
    memory: paper.memoryTrials.length,
    speed: 1,
  };

  const steps: SessionStep[] = [];
  for (const section of sections) {
    for (let i = 0; i < practiceCounts[section]; i++) {
      steps.push({ kind: 'practice', section, index: i });
    }
    if (section === 'speed') {
      steps.push({ kind: 'speed-ready' });
      steps.push({ kind: 'test', section, index: 0 });
    } else {
      for (let i = 0; i < testCounts[section]; i++) {
        steps.push({ kind: 'test', section, index: i });
      }
    }
  }
  return steps;
}

interface IqState {
  session: Session | null;
  lastResult: TestResult | null;
  /** 开始一次施测（覆盖旧会话） */
  start: (mode: TestMode, ageBand: AgeBand) => void;
  /** 练习完成，推进下一步 */
  finishPractice: () => void;
  /** 正式选择题作答（图形/言语），自动进入下一题 */
  recordChoice: (optionIndex: number, elapsedMs: number) => void;
  /** 数字广度作答（含天花板判定：同模式同长度两试皆错则跳过该模式剩余） */
  recordMemory: (input: number[], elapsedMs: number) => void;
  /** 速配说明页 → 开始作答 */
  beginSpeed: () => void;
  /** 速配结束：产出报告、写存储、进入完成态 */
  finishSpeed: (correct: number, wrong: number) => Promise<void>;
  /** 放弃施测（退出确认后调用） */
  abort: () => void;
}

export const useIqStore = create<IqState>((set, get) => ({
  session: null,
  lastResult: null,

  start(mode, ageBand) {
    const paper = buildPaper(mode, ageBand);
    set({
      lastResult: null,
      session: {
        paper,
        steps: buildSteps(paper),
        stepIndex: 0,
        startedAt: Date.now(),
        responses: emptyResponses(),
      },
    });
  },

  finishPractice() {
    const { session } = get();
    if (!session) return;
    const step = session.steps[session.stepIndex];
    if (!step || step.kind !== 'practice') return;
    set({ session: { ...session, stepIndex: session.stepIndex + 1 } });
  },

  recordChoice(optionIndex, elapsedMs) {
    const { session } = get();
    if (!session) return;
    const step = session.steps[session.stepIndex];
    if (!step || step.kind !== 'test' || (step.section !== 'fluid' && step.section !== 'verbal')) return;
    const items = step.section === 'fluid' ? session.paper.fluidItems : session.paper.verbalItems;
    const item = items[step.index];
    if (!item) return;
    set({
      session: {
        ...session,
        stepIndex: session.stepIndex + 1,
        responses: {
          ...session.responses,
          choice: { ...session.responses.choice, [item.id]: { optionIndex, elapsedMs } },
        },
      },
    });
  },

  recordMemory(input, elapsedMs) {
    const { session } = get();
    if (!session) return;
    const step = session.steps[session.stepIndex];
    if (!step || step.kind !== 'test' || step.section !== 'memory') return;
    const trial = session.paper.memoryTrials[step.index];
    if (!trial) return;

    const memory = { ...session.responses.memory, [trial.id]: { input, elapsedMs } };
    let nextIndex = session.stepIndex + 1;

    if (!isMemoryPass(trial, input)) {
      // 天花板：同模式同长度的另一试「已作答且失败」→ 跳过该模式剩余全部试次
      const sibling = session.paper.memoryTrials.find(
        (t) => t.id !== trial.id && t.mode === trial.mode && t.length === trial.length,
      );
      const siblingResponse = sibling ? memory[sibling.id] : undefined;
      if (sibling && siblingResponse && !isMemoryPass(sibling, siblingResponse.input)) {
        for (let i = session.stepIndex + 1; i < session.steps.length; i++) {
          const s = session.steps[i];
          const stillSameMode =
            s.kind === 'test' &&
            s.section === 'memory' &&
            session.paper.memoryTrials[s.index].mode === trial.mode;
          if (!stillSameMode) {
            nextIndex = i;
            break;
          }
        }
      }
    }

    set({
      session: {
        ...session,
        stepIndex: nextIndex,
        responses: { ...session.responses, memory },
      },
    });
  },

  beginSpeed() {
    const { session } = get();
    if (!session) return;
    const step = session.steps[session.stepIndex];
    if (!step || step.kind !== 'speed-ready') return;
    set({ session: { ...session, stepIndex: session.stepIndex + 1 } });
  },

  async finishSpeed(correct, wrong) {
    const { session } = get();
    if (!session) return;
    const step = session.steps[session.stepIndex];
    if (!step || step.kind !== 'test' || step.section !== 'speed') return;

    const responses: Responses = { ...session.responses, speed: { correct, wrong } };
    const report = computeReport(session.paper, responses);
    const result: TestResult = {
      id: generateId(),
      mode: session.paper.mode,
      ageBand: session.paper.ageBand,
      createdAt: Date.now(),
      durationMs: Date.now() - session.startedAt,
      report,
    };
    try {
      await saveResult(result);
    } catch {
      console.warn('iq: 结果保存失败');
    }
    set({
      lastResult: result,
      session: { ...session, stepIndex: session.steps.length, responses },
    });
  },

  abort() {
    set({ session: null });
  },
}));
