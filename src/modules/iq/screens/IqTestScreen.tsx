import React, { useEffect, useRef, useState } from 'react';
import { AppState, View, Text, TouchableOpacity, StyleSheet, Alert, ScrollView } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useTheme } from '../../../theme';
import { useIqStore, practiceUnit } from '../store';
import { isMemoryPass } from '../services/scoring';
import { buildVerbalPrompt, PRACTICE_TIPS, SECTION_LABELS } from '../services/texts';
import { speakText } from '../services/tts';
import MatrixItemView, { glyphOf } from '../components/MatrixItemView';
import VerbalItemView from '../components/VerbalItemView';
import DigitSpanView from '../components/DigitSpanView';
import SymbolSearchView from '../components/SymbolSearchView';
import PracticeIntro from '../components/PracticeIntro';
import type { Session, SessionStep } from '../types';

type Nav = NativeStackNavigationProp<any>;

function progressText(session: Session, step: SessionStep): string {
  if (step.kind !== 'test') return '';
  const count =
    step.section === 'fluid'
      ? session.paper.fluidItems.length
      : step.section === 'verbal'
        ? session.paper.verbalItems.length
        : step.section === 'memory'
          ? session.paper.memoryTrials.length
          : 1;
  return `${step.index + 1}/${count}`;
}

/** 施测主流程：按步骤机渲染练习/正式题/速配；支持退出确认与后台暂停 */
export default function IqTestScreen() {
  const { colors } = useTheme();
  const navigation = useNavigation<Nav>();
  const session = useIqStore((s) => s.session);
  const lastResult = useIqStore((s) => s.lastResult);
  const { finishPractice, recordChoice, recordMemory, beginSpeed, finishSpeed, abort } =
    useIqStore();

  // 练习反馈本地态
  const [practicePick, setPracticePick] = useState<number | null>(null);
  const [practiceFeedback, setPracticeFeedback] = useState<string | null>(null);
  const [autoAdvance, setAutoAdvance] = useState(false);
  const [retryKey, setRetryKey] = useState(0);
  // 暂停态
  const [paused, setPaused] = useState(false);
  const [resumeCount, setResumeCount] = useState<number | null>(null);
  const itemStartRef = useRef(Date.now());

  const step = session ? session.steps[session.stepIndex] : undefined;
  const finished = !session || session.stepIndex >= session.steps.length;

  // 退出确认
  useEffect(() => {
    const unsub = navigation.addListener('beforeRemove', (e) => {
      const s = useIqStore.getState().session;
      if (!s || s.stepIndex >= s.steps.length) return;
      e.preventDefault();
      Alert.alert('退出测试', '退出将丢弃本次进度，确定吗？', [
        { text: '取消', style: 'cancel' },
        {
          text: '退出',
          style: 'destructive',
          onPress: () => {
            abort();
            navigation.dispatch(e.data.action);
          },
        },
      ]);
    });
    return unsub;
  }, [navigation, abort]);

  // 后台暂停（记忆闪示与速配计时必须公平）
  useEffect(() => {
    const sub = AppState.addEventListener('change', (state) => {
      if (state !== 'active') setPaused(true);
    });
    return () => sub.remove();
  }, []);

  // 暂停恢复：点「继续」后 3-2-1 倒计时
  useEffect(() => {
    if (resumeCount === null) return;
    if (resumeCount <= 0) {
      setPaused(false);
      setResumeCount(null);
      return;
    }
    const t = setTimeout(() => setResumeCount((c) => (c ?? 1) - 1), 1000);
    return () => clearTimeout(t);
  }, [resumeCount]);

  // 步骤切换：重置练习态与作答计时起点
  useEffect(() => {
    setPracticePick(null);
    setPracticeFeedback(null);
    setAutoAdvance(false);
    itemStartRef.current = Date.now();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session?.stepIndex]);

  // 练习答对 → 自动进入下一步
  useEffect(() => {
    if (!autoAdvance) return;
    const t = setTimeout(() => {
      setAutoAdvance(false);
      finishPractice();
    }, 700);
    return () => clearTimeout(t);
  }, [autoAdvance, finishPractice]);

  // 6–8 档言语题自动朗读（练习与正式题都读）
  const kidBand = session?.paper.ageBand === '6-8';
  useEffect(() => {
    if (!session || !step || !kidBand) return;
    if (step.kind !== 'practice' && step.kind !== 'test') return;
    if (step.section !== 'verbal') return;
    const item =
      step.kind === 'practice'
        ? practiceUnit('verbal', 0)
        : session.paper.verbalItems[step.index];
    if (item) speakText(buildVerbalPrompt(item.a, item.b, item.c));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session?.stepIndex, kidBand]);

  // 完成 → 跳转结果页
  useEffect(() => {
    if (finished && lastResult) {
      navigation.replace('IqResult', { resultId: lastResult.id });
    }
  }, [finished, lastResult, navigation]);

  if (!session) {
    return (
      <View style={[styles.center, { backgroundColor: colors.background }]}>
        <Text style={{ color: colors.textSecondary }}>会话已结束</Text>
        <TouchableOpacity onPress={() => navigation.navigate('IqHome')} style={{ marginTop: 12 }}>
          <Text style={{ color: colors.primary }}>返回入口</Text>
        </TouchableOpacity>
      </View>
    );
  }
  if (finished || !step) {
    return <View style={[styles.center, { backgroundColor: colors.background }]} />;
  }
  const paper = session.paper;

  const renderStep = () => {
    if (!step) return null;

    if (step.kind === 'practice') {
      if (step.section === 'fluid') {
        const item = practiceUnit('fluid', step.index);
        return (
          <PracticeIntro tip={PRACTICE_TIPS.fluid} feedback={practiceFeedback}>
            <MatrixItemView
              item={item}
              selected={practicePick}
              onSelect={(i) => {
                setPracticePick(i);
                if (i === item.answerIndex) {
                  setPracticeFeedback('答对了！');
                  setAutoAdvance(true);
                } else {
                  setPracticeFeedback('再想一想，换一个试试');
                }
              }}
            />
          </PracticeIntro>
        );
      }
      if (step.section === 'verbal') {
        const item = practiceUnit('verbal', 0);
        return (
          <PracticeIntro tip={PRACTICE_TIPS.verbal} feedback={practiceFeedback}>
            <VerbalItemView
              item={item}
              selected={practicePick}
              showSpeaker
              onSelect={(i) => {
                setPracticePick(i);
                if (i === item.answerIndex) {
                  setPracticeFeedback('答对了！');
                  setAutoAdvance(true);
                } else {
                  setPracticeFeedback('再想一想，换一个试试');
                }
              }}
            />
          </PracticeIntro>
        );
      }
      const trial = practiceUnit('memory', 0);
      return (
        <PracticeIntro tip={PRACTICE_TIPS.memory} feedback={practiceFeedback}>
          <DigitSpanView
            key={`prac-${retryKey}`}
            trial={trial}
            paused={paused}
            onDone={(input) => {
              if (isMemoryPass(trial, input)) {
                setPracticeFeedback('答对了！');
                setAutoAdvance(true);
              } else {
                setPracticeFeedback('再看一遍，注意点出顺序');
                setRetryKey((k) => k + 1);
              }
            }}
          />
        </PracticeIntro>
      );
    }

    if (step.kind === 'speed-ready') {
      const target = glyphOf(paper.speed.target);
      return (
        <View>
          <Text style={[styles.sectionTitle, { color: colors.text }]}>符号检索</Text>
          <Text style={[styles.speedDesc, { color: colors.textSecondary }]}>
            屏幕上方是目标符号，下面每行会出现 5 个符号。行里含有目标符号 → 点「有」，没有 → 点「无」。
          </Text>
          <Text style={[styles.speedDesc, { color: colors.textSecondary }]}>
            限时 {Math.round(paper.speed.durationMs / 1000)} 秒；计分 = 正确数 − 错误数。
          </Text>
          <View style={[styles.speedSample, { borderColor: colors.border, backgroundColor: colors.surface }]}>
            <Text style={{ color: colors.textSecondary, fontSize: 12 }}>示例</Text>
            <Text style={{ fontSize: 24, color: colors.text, marginTop: 4 }}>
              目标 {target}　行：● ■ ▲ {target} ★ → 点「有」
            </Text>
          </View>
          <TouchableOpacity
            onPress={beginSpeed}
            style={[styles.startBtn, { backgroundColor: '#30A46C' }]}>
            <Text style={{ color: '#fff', fontSize: 16, fontWeight: '600' }}>开始</Text>
          </TouchableOpacity>
        </View>
      );
    }

    if (step.section === 'fluid') {
      const item = paper.fluidItems[step.index];
      return (
        <MatrixItemView
          item={item}
          onSelect={(i) => recordChoice(item.id, i, Date.now() - itemStartRef.current)}
        />
      );
    }
    if (step.section === 'verbal') {
      const item = paper.verbalItems[step.index];
      return (
        <VerbalItemView
          item={item}
          showSpeaker={!kidBand}
          onSelect={(i) => recordChoice(item.id, i, Date.now() - itemStartRef.current)}
        />
      );
    }
    if (step.section === 'memory') {
      const trial = paper.memoryTrials[step.index];
      return (
        <DigitSpanView
          key={trial.id}
          trial={trial}
          paused={paused}
          onDone={(input, ms) => recordMemory(trial.id, input, ms)}
        />
      );
    }
    // speed
    return (
      <SymbolSearchView
        task={paper.speed}
        paused={paused}
        onDone={(c, w) => {
          void finishSpeed(c, w);
        }}
      />
    );
  };

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <View style={styles.headerRow}>
        <Text style={[styles.sectionTitle, { color: colors.text }]}>
          {step.kind === 'speed-ready' ? SECTION_LABELS.speed : SECTION_LABELS[step.section]}
        </Text>
        <Text style={{ color: colors.textMuted, fontSize: 13 }}>{progressText(session, step)}</Text>
      </View>
      <ScrollView contentContainerStyle={styles.body}>{renderStep()}</ScrollView>
      {paused && (
        <View style={styles.pauseOverlay}>
          <Text style={[styles.pauseTitle, { color: colors.text }]}>
            {resumeCount === null ? '已暂停' : resumeCount > 0 ? resumeCount : '继续'}
          </Text>
          {resumeCount === null && (
            <TouchableOpacity
              onPress={() => setResumeCount(3)}
              style={[styles.startBtn, { backgroundColor: '#30A46C', paddingHorizontal: 40 }]}>
              <Text style={{ color: '#fff', fontSize: 16, fontWeight: '600' }}>继续</Text>
            </TouchableOpacity>
          )}
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 10,
  },
  sectionTitle: { fontSize: 17, fontWeight: '700' },
  body: { padding: 16, paddingBottom: 40 },
  speedDesc: { fontSize: 14, lineHeight: 22, marginTop: 8 },
  speedSample: { borderWidth: 1, borderRadius: 12, padding: 14, marginTop: 16 },
  startBtn: { marginTop: 20, borderRadius: 24, paddingVertical: 14, alignItems: 'center' },
  pauseOverlay: {
    ...StyleSheet.absoluteFill,
    backgroundColor: 'rgba(0,0,0,0.55)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  pauseTitle: { fontSize: 44, fontWeight: '700', marginBottom: 20 },
});
