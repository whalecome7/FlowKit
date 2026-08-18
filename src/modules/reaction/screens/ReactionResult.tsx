import { useEffect, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { useRoute, useNavigation } from '@react-navigation/native';
import type { RouteProp } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useTheme } from '../../../theme';
import { loadBest, updateBest } from '../services/bestStore';

type Mode = 'reaction' | 'sequence' | 'tracking';

interface RoundResult {
  timeMs: number;
  isFault: boolean;
}

const MODE_LABEL: Record<Mode, string> = {
  reaction: '经典反应', sequence: '序列反应', tracking: '追踪反应',
};

function rating(avg: number): { label: string; color: string } {
  if (avg < 200) return { label: '🏆 优秀', color: '#30A46C' };
  if (avg < 280) return { label: '👍 良好', color: '#4f9eff' };
  if (avg < 380) return { label: '😐 一般', color: '#ffb020' };
  return { label: '💪 需练习', color: '#E5484D' };
}

/** 反应力测试：结果页 */
export default function ReactionResult() {
  const { colors } = useTheme();
  const route = useRoute<RouteProp<{ params: { mode: Mode; results: RoundResult[] } }, 'params'>>();
  const navigation = useNavigation<NativeStackNavigationProp<any>>();
  const params = route.params as { mode?: Mode; results?: RoundResult[] } | undefined;
  const mode = params?.mode ?? 'reaction';
  const results = params?.results ?? [];

  const [best, setBest] = useState<number | null>(null);
  const [isRecord, setIsRecord] = useState(false);

  useEffect(() => {
    const valid = results.filter((r) => !r.isFault);
    if (valid.length === 0) return;
    const fastest = Math.min(...valid.map((r) => r.timeMs));
    void updateBest(mode, fastest).then((rec) => {
      setIsRecord(rec);
      return loadBest(mode);
    }).then(setBest);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const valid = results.filter((r) => !r.isFault);
  const faults = results.filter((r) => r.isFault).length;
  const avg = valid.length > 0
    ? Math.round(valid.reduce((a, r) => a + r.timeMs, 0) / valid.length)
    : 0;
  const fastest = valid.length > 0 ? Math.min(...valid.map((r) => r.timeMs)) : 0;
  const slowest = valid.length > 0 ? Math.max(...valid.map((r) => r.timeMs)) : 0;
  const rate = rating(avg);

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <Text style={[styles.title, { color: colors.text }]}>测试完成</Text>
      <Text style={[styles.mode, { color: colors.textSecondary }]}>{MODE_LABEL[mode]}</Text>

      {isRecord && <Text style={styles.record}>🎉 新纪录！</Text>}

      <View style={[styles.card, { backgroundColor: colors.surface }]}>
        <View style={styles.ratingRow}>
          <Text style={[styles.rating, { color: rate.color }]}>{rate.label}</Text>
          <Text style={[styles.avg, { color: colors.text }]}>{avg} ms</Text>
        </View>
        <View style={styles.stats}>
          <Stat label="最快" value={`${fastest} ms`} colors={colors} />
          <Stat label="最慢" value={`${slowest} ms`} colors={colors} />
          <Stat label="失误" value={`${faults} 次`} colors={colors} />
          <Stat label="历史最佳" value={best ? `${best} ms` : '—'} colors={colors} />
        </View>
      </View>

      <TouchableOpacity
        onPress={() => navigation.replace('ReactionGame', { mode })}
        style={[styles.btn, { backgroundColor: '#30A46C' }]}>
        <Text style={styles.btnText}>再玩一次</Text>
      </TouchableOpacity>
      <TouchableOpacity
        onPress={() => navigation.popToTop()}
        style={{ padding: 12 }}>
        <Text style={{ color: colors.textSecondary }}>返回模式选择</Text>
      </TouchableOpacity>
    </View>
  );
}

function Stat({ label, value, colors }: { label: string; value: string; colors: any }) {
  return (
    <View style={styles.stat}>
      <Text style={[styles.statLabel, { color: colors.textSecondary }]}>{label}</Text>
      <Text style={[styles.statValue, { color: colors.text }]}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 24, alignItems: 'center' },
  title: { fontSize: 22, fontWeight: '700', marginTop: 24 },
  mode: { fontSize: 14, marginTop: 4 },
  record: { color: '#ffb020', fontSize: 16, fontWeight: '700', marginTop: 8 },
  card: { borderRadius: 16, padding: 20, width: '100%', marginTop: 20, alignItems: 'center' },
  ratingRow: { flexDirection: 'row', alignItems: 'baseline', gap: 12 },
  rating: { fontSize: 24, fontWeight: '700' },
  avg: { fontSize: 20, fontWeight: '700' },
  stats: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginTop: 16, width: '100%' },
  stat: { width: '47%', backgroundColor: 'rgba(128,128,128,0.08)', borderRadius: 10, padding: 12, alignItems: 'center' },
  statLabel: { fontSize: 12 },
  statValue: { fontSize: 18, fontWeight: '600', marginTop: 2 },
  btn: { paddingHorizontal: 40, paddingVertical: 14, borderRadius: 24, marginTop: 24 },
  btnText: { color: '#fff', fontSize: 16, fontWeight: '600' },
});
