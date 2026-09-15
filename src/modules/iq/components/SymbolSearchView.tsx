import React, { useEffect, useRef, useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { useTheme } from '../../../theme';
import { glyphOf } from './MatrixItemView';
import type { SpeedTask } from '../types';

type Phase = 'ready' | 'run' | 'end';

interface Props {
  task: SpeedTask;
  /** 暂停时冻结倒计时与作答（恢复由上层 3-2-1 倒计时控制） */
  paused: boolean;
  onDone: (correct: number, wrong: number) => void;
}

/** 符号检索：3-2-1 倒计时 → 行流逐行判断「是否含目标符号」→ 到时限自动结束。
 *  计分 = 正确数 − 错误数（由上层计分引擎折算）。 */
export default function SymbolSearchView({ task, paused, onDone }: Props) {
  const { colors } = useTheme();
  const [phase, setPhase] = useState<Phase>('ready');
  const [count, setCount] = useState(3);
  const [remainingMs, setRemainingMs] = useState(task.durationMs);
  const [rowIndex, setRowIndex] = useState(0);
  const [correct, setCorrect] = useState(0);
  const [wrong, setWrong] = useState(0);
  const doneRef = useRef(false);
  // 计数用 ref 镜像：倒计时 effect 不因每次作答而重启（避免 200ms 计时累积误差）
  const correctRef = useRef(0);
  const wrongRef = useRef(0);

  const finish = (c: number, w: number) => {
    if (doneRef.current) return;
    doneRef.current = true;
    setPhase('end');
    onDone(c, w);
  };

  useEffect(() => {
    if (phase !== 'ready' || paused) return;
    if (count <= 0) {
      setPhase('run');
      return;
    }
    const t = setTimeout(() => setCount((c) => c - 1), 800);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase, count, paused]);

  useEffect(() => {
    if (phase !== 'run' || paused) return;
    if (remainingMs <= 0) {
      finish(correctRef.current, wrongRef.current);
      return;
    }
    const t = setTimeout(() => setRemainingMs((r) => r - 200), 200);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase, paused, remainingMs]);

  const answer = (saidHas: boolean) => {
    if (phase !== 'run' || paused) return;
    const row = task.rows[rowIndex];
    if (!row) return;
    if (row.hasTarget === saidHas) {
      correctRef.current += 1;
      setCorrect(correctRef.current);
    } else {
      wrongRef.current += 1;
      setWrong(wrongRef.current);
    }
    if (rowIndex + 1 >= task.rows.length) {
      finish(correctRef.current, wrongRef.current);
    } else {
      setRowIndex(rowIndex + 1);
    }
  };

  const row = task.rows[rowIndex];
  const targetGlyph = glyphOf(task.target);

  if (phase === 'ready') {
    return (
      <View style={styles.center}>
        <Text style={[styles.count, { color: colors.text }]}>{count > 0 ? count : '开始'}</Text>
        <Text style={{ color: colors.textSecondary, marginTop: 8 }}>准备好，不要提前点按</Text>
      </View>
    );
  }

  return (
    <View style={styles.center}>
      <View style={styles.topRow}>
        <Text style={[styles.timer, { color: colors.textSecondary }]}>
          {Math.max(0, Math.ceil(remainingMs / 1000))} 秒
        </Text>
        <View style={styles.targetBox}>
          <Text style={{ color: colors.textSecondary, fontSize: 12 }}>目标符号</Text>
          <Text style={[styles.targetGlyph, { color: colors.text }]}>{targetGlyph}</Text>
        </View>
        <Text style={[styles.timer, { color: colors.textSecondary }]}>
          ✓{correct} ✗{wrong}
        </Text>
      </View>
      <View style={[styles.rowBox, { borderColor: colors.border, backgroundColor: colors.surface }]}>
        {row ? (
          row.symbols.map((s, i) => (
            <Text key={i} style={[styles.rowGlyph, { color: colors.text }]}>
              {glyphOf(s)}
            </Text>
          ))
        ) : (
          <Text style={{ color: colors.textMuted }}>—</Text>
        )}
      </View>
      <View style={styles.buttons}>
        <TouchableOpacity
          onPress={() => answer(true)}
          style={[styles.answerBtn, { backgroundColor: '#30A46C' }]}>
          <Text style={styles.answerText}>有</Text>
        </TouchableOpacity>
        <TouchableOpacity
          onPress={() => answer(false)}
          style={[styles.answerBtn, { backgroundColor: colors.danger }]}>
          <Text style={styles.answerText}>无</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  center: { alignItems: 'center', paddingVertical: 24 },
  count: { fontSize: 72, fontWeight: '700' },
  topRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    width: '100%',
    paddingHorizontal: 8,
  },
  timer: { fontSize: 15, fontVariant: ['tabular-nums'] },
  targetBox: { alignItems: 'center' },
  targetGlyph: { fontSize: 34 },
  rowBox: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderRadius: 12,
    paddingVertical: 18,
    paddingHorizontal: 12,
    marginTop: 14,
    width: '100%',
  },
  rowGlyph: { fontSize: 34, marginHorizontal: 6 },
  buttons: { flexDirection: 'row', marginTop: 22, gap: 16 },
  answerBtn: { paddingHorizontal: 44, paddingVertical: 16, borderRadius: 26 },
  answerText: { color: '#fff', fontSize: 20, fontWeight: '700' },
});
