import React, { useEffect, useRef, useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { useTheme } from '../../../theme';
import type { MemoryTrial } from '../types';

const READY_MS = 800; // 准备时间
const SHOW_MS = 700; // 每位显示时长
const GAP_MS = 250; // 位间隔

interface Props {
  trial: MemoryTrial;
  /** 暂停时中断闪示/作答（回前台由上层 3-2-1 倒计时后恢复） */
  paused: boolean;
  onDone: (input: number[], elapsedMs: number) => void;
}

/** 数字广度作答：固定节奏闪示数字 → 数字键盘按序点出（倒背则逆序）。
 *  不显示目标长度；用「提交」结束作答。 */
export default function DigitSpanView({ trial, paused, onDone }: Props) {
  const { colors } = useTheme();
  const [visibleIndex, setVisibleIndex] = useState(-1); // >=0 时显示 digits[visibleIndex]
  const [inputReady, setInputReady] = useState(false);
  const [input, setInput] = useState<number[]>([]);
  const inputStartRef = useRef(0);

  useEffect(() => {
    if (paused) return; // 暂停中不重放；恢复时本 effect 重跑
    setVisibleIndex(-1);
    setInputReady(false);
    setInput([]);
    const timers: ReturnType<typeof setTimeout>[] = [];
    trial.digits.forEach((_, i) => {
      timers.push(setTimeout(() => setVisibleIndex(i), READY_MS + i * (SHOW_MS + GAP_MS)));
      timers.push(setTimeout(() => setVisibleIndex(-1), READY_MS + i * (SHOW_MS + GAP_MS) + SHOW_MS));
    });
    const total = READY_MS + trial.digits.length * (SHOW_MS + GAP_MS);
    timers.push(
      setTimeout(() => {
        inputStartRef.current = Date.now();
        setInputReady(true);
      }, total),
    );
    return () => timers.forEach(clearTimeout);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [trial.id, paused]);

  const appendDigit = (d: number) => {
    if (!inputReady) return;
    setInput((prev) => [...prev, d]);
  };

  const undo = () => setInput((prev) => prev.slice(0, -1));

  const submit = () => {
    if (!inputReady || input.length === 0) return;
    onDone(input, Date.now() - inputStartRef.current);
  };

  return (
    <View style={styles.container}>
      <View style={[styles.flashBox, { borderColor: colors.border, backgroundColor: colors.surface }]}>
        <Text style={[styles.flashDigit, { color: colors.text }]}>
          {visibleIndex >= 0 ? String(trial.digits[visibleIndex]) : ''}
        </Text>
      </View>
      <Text style={[styles.hint, { color: colors.textSecondary }]}>
        {inputReady
          ? trial.mode === 'forward'
            ? '按刚才的顺序点出数字'
            : '倒着点出刚才的数字'
          : '请记住闪过的数字…'}
      </Text>
      <View style={styles.pad}>
        {[1, 2, 3, 4, 5, 6, 7, 8, 9, 0].map((d) => (
          <TouchableOpacity
            key={d}
            disabled={!inputReady}
            onPress={() => appendDigit(d)}
            style={[styles.key, { borderColor: colors.border, backgroundColor: colors.surface }]}>
            <Text style={[styles.keyText, { color: colors.text }]}>{d}</Text>
          </TouchableOpacity>
        ))}
      </View>
      <View style={styles.actions}>
        <TouchableOpacity onPress={undo} disabled={!inputReady || input.length === 0}>
          <Text style={{ color: colors.textSecondary, fontSize: 16, padding: 12 }}>删除</Text>
        </TouchableOpacity>
        <TouchableOpacity
          onPress={submit}
          disabled={!inputReady || input.length === 0}
          style={[
            styles.submit,
            { backgroundColor: inputReady && input.length > 0 ? '#30A46C' : colors.surfaceAlt },
          ]}>
          <Text style={{ color: inputReady && input.length > 0 ? '#fff' : colors.textMuted, fontSize: 16 }}>
            提交
          </Text>
        </TouchableOpacity>
      </View>
      <Text style={[styles.inputPreview, { color: colors.textMuted }]}>
        {input.length > 0 ? `已输入 ${input.length} 位` : ' '}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { alignItems: 'center' },
  flashBox: {
    width: 120,
    height: 120,
    borderWidth: 1,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  flashDigit: { fontSize: 56, fontWeight: '700' },
  hint: { fontSize: 14, marginTop: 12 },
  pad: { flexDirection: 'row', flexWrap: 'wrap', width: 260, justifyContent: 'center', marginTop: 16 },
  key: {
    width: 72,
    height: 52,
    borderWidth: 1,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    margin: 4,
  },
  keyText: { fontSize: 22, fontWeight: '600' },
  actions: { flexDirection: 'row', alignItems: 'center', marginTop: 8 },
  submit: { paddingHorizontal: 28, paddingVertical: 12, borderRadius: 22, marginLeft: 8 },
  inputPreview: { fontSize: 12, marginTop: 8 },
});
