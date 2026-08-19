import { useRef, useState } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, requireNativeComponent,
} from 'react-native';
import { useRoute, useNavigation } from '@react-navigation/native';
import type { RouteProp } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useTheme } from '../../../theme';

// 原生信号区组件（Fabric legacy interop）
const SignalAreaNative = requireNativeComponent<any>('SignalAreaView');

type Mode = 'reaction' | 'sequence' | 'tracking';

interface RoundResult {
  timeMs: number;
  isFault: boolean;
}

const TOTAL_ROUNDS = 5;

const MODE_LABEL: Record<Mode, string> = {
  reaction: '经典反应',
  sequence: '序列反应',
  tracking: '追踪反应',
};

/** 反应力测试：游戏页（5 轮，原生计时） */
export default function ReactionGame() {
  const { colors } = useTheme();
  const route = useRoute<RouteProp<{ params: { mode: Mode } }, 'params'>>();
  const navigation = useNavigation<NativeStackNavigationProp<any>>();
  const mode = route.params?.mode ?? 'reaction';

  const [round, setRound] = useState(0);          // 已完成轮数
  const [running, setRunning] = useState(false);  // 信号区是否运行
  const [lastResult, setLastResult] = useState<RoundResult | null>(null);
  const resultsRef = useRef<RoundResult[]>([]);

  const onRoundResult = (e: { nativeEvent: RoundResult }) => {
    const r = e.nativeEvent;
    const next = [...resultsRef.current, r];
    resultsRef.current = next;
    setLastResult(r);
    setRound(next.length);
    setRunning(false);  // 复位，等待用户点色块继续
    if (next.length >= TOTAL_ROUNDS) {
      navigation.navigate('ReactionResult', { mode, results: next });
    }
  };

  /** 色块区点击「开始/继续」：开始第一轮或下一轮 */
  const onContinue = () => {
    if (resultsRef.current.length >= TOTAL_ROUNDS) return;
    setLastResult(null);
    setRunning(true);
  };

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      {/* 顶部状态区 */}
      <View style={styles.statusBar}>
        <Text style={[styles.modeLabel, { color: colors.text }]}>{MODE_LABEL[mode]}</Text>
        <Text style={[styles.roundText, { color: colors.textSecondary }]}>
          第 {Math.min(round + 1, TOTAL_ROUNDS)} / {TOTAL_ROUNDS} 轮
        </Text>
        {lastResult && (
          <Text style={[styles.resultText, { color: lastResult.isFault ? '#E5484D' : '#30A46C' }]}>
            {lastResult.isFault ? '失误！' : `${lastResult.timeMs} ms`}
          </Text>
        )}
      </View>

      {/* 信号区（原生，触摸计时 + 点击继续） */}
      <View style={styles.signalWrap}>
        <SignalAreaNative
          style={{ flex: 1 }}
          mode={mode}
          running={running}
          onRoundResult={onRoundResult}
          onContinue={onContinue}
        />
      </View>

      {/* 底部控制区：仅退出（开始/继续在色块区完成） */}
      <View style={styles.controlBar}>
        <Text style={{ color: colors.textSecondary, fontSize: 13 }}>
          {running ? '等待信号…' : '点击色块开始 / 继续'}
        </Text>
        <TouchableOpacity onPress={() => navigation.goBack()} style={{ padding: 8 }}>
          <Text style={{ color: colors.textSecondary }}>退出</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  statusBar: { padding: 12, paddingTop: 8, alignItems: 'center', gap: 2 },
  modeLabel: { fontSize: 16, fontWeight: '600' },
  roundText: { fontSize: 13 },
  resultText: { fontSize: 20, fontWeight: '700', marginTop: 2 },
  signalWrap: { flex: 1, margin: 12, borderRadius: 16, overflow: 'hidden' },
  controlBar: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    padding: 16, gap: 16,
  },
  btn: { paddingHorizontal: 32, paddingVertical: 12, borderRadius: 24 },
  btnText: { color: '#fff', fontSize: 16, fontWeight: '600' },
});
