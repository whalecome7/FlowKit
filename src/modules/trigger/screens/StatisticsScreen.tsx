import { useMemo } from 'react';
import { View, Text, StyleSheet, ScrollView } from 'react-native';
import { useTheme } from '../../../theme';
import { useTriggerStore } from '../store';
import { computeStats } from '../services/triggerStats';

/** 触发统计报表：汇总 / 7天分布柱状图 / 按规则排行 */
export default function StatisticsScreen() {
  const { colors } = useTheme();
  const { logs } = useTriggerStore();
  const stats = useMemo(() => computeStats(logs), [logs]);

  const maxDaily = Math.max(1, ...stats.daily.map((d) => d.count));
  const maxRule = Math.max(1, ...stats.byRule.map((r) => r.count));

  const summary = [
    { label: '总触发', value: String(stats.total) },
    { label: '近 30 天', value: String(stats.last30Days) },
    { label: '动作成功率', value: `${Math.round(stats.successRate * 100)}%` },
  ];

  return (
    <ScrollView style={[styles.container, { backgroundColor: colors.background }]}>
      {/* 汇总 */}
      <View style={styles.summaryRow}>
        {summary.map((s) => (
          <View key={s.label} style={[styles.summaryCard, { backgroundColor: colors.surface }]}>
            <Text style={[styles.summaryValue, { color: colors.text }]}>{s.value}</Text>
            <Text style={[styles.summaryLabel, { color: colors.textSecondary }]}>{s.label}</Text>
          </View>
        ))}
      </View>

      {/* 7 天分布 */}
      <View style={[styles.card, { backgroundColor: colors.surface }]}>
        <Text style={[styles.cardTitle, { color: colors.text }]}>近 7 天分布</Text>
        <View style={styles.chart}>
          {stats.daily.map((d, i) => (
            <View key={i} style={styles.barCol}>
              <View style={styles.barTrack}>
                <View
                  style={[
                    styles.bar,
                    { height: `${Math.max(4, (d.count / maxDaily) * 100)}%` },
                  ]}
                />
              </View>
              <Text style={[styles.barLabel, { color: colors.textSecondary }]}>{d.key}</Text>
              <Text style={[styles.barCount, { color: colors.textSecondary }]}>{d.count}</Text>
            </View>
          ))}
        </View>
      </View>

      {/* 按规则 */}
      <View style={[styles.card, { backgroundColor: colors.surface }]}>
        <Text style={[styles.cardTitle, { color: colors.text }]}>按规则</Text>
        {stats.byRule.length === 0 && (
          <Text style={{ color: colors.textSecondary, fontSize: 13 }}>暂无触发记录</Text>
        )}
        {stats.byRule.map((r) => (
          <View key={r.name} style={styles.ruleRow}>
            <Text style={{ color: colors.text, flex: 1 }}>{r.name}</Text>
            <View style={styles.ruleBarTrack}>
              <View style={[styles.ruleBar, { width: `${(r.count / maxRule) * 100}%` }]} />
            </View>
            <Text style={{ color: colors.textSecondary, marginLeft: 8, width: 36, textAlign: 'right' }}>
              {r.count}
            </Text>
          </View>
        ))}
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 16 },
  summaryRow: { flexDirection: 'row', gap: 8, marginBottom: 12 },
  summaryCard: { flex: 1, borderRadius: 12, padding: 14, alignItems: 'center' },
  summaryValue: { fontSize: 20, fontWeight: '700' },
  summaryLabel: { fontSize: 11, marginTop: 2 },
  card: { borderRadius: 12, padding: 16, marginBottom: 12 },
  cardTitle: { fontSize: 15, fontWeight: '600', marginBottom: 12 },
  chart: { flexDirection: 'row', alignItems: 'flex-end', height: 140, gap: 6 },
  barCol: { flex: 1, alignItems: 'center', justifyContent: 'flex-end' },
  barTrack: { flex: 1, width: '100%', justifyContent: 'flex-end' },
  bar: { backgroundColor: '#4f9eff', borderRadius: 4, width: '70%', alignSelf: 'center' },
  barLabel: { fontSize: 10, marginTop: 4 },
  barCount: { fontSize: 10 },
  ruleRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 8 },
  ruleBarTrack: { flex: 1, height: 8, backgroundColor: 'rgba(128,128,128,0.15)', borderRadius: 4, overflow: 'hidden', marginLeft: 8 },
  ruleBar: { height: 8, backgroundColor: '#4f9eff', borderRadius: 4 },
});
