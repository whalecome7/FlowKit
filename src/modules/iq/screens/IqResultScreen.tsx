import React, { useEffect, useState } from 'react';
import { ScrollView, View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { useNavigation, useRoute } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useTheme } from '../../../theme';
import { useIqStore } from '../store';
import { loadResults } from '../services/resultStorage';
import ResultChart from '../components/ResultChart';
import {
  AGE_BAND_LABELS,
  dimensionComment,
  DISCLAIMER_ADULT,
  DISCLAIMER_CHILD,
  MODE_LABELS,
  SECTION_LABELS,
  totalComment,
} from '../services/texts';
import type { TestResult } from '../types';

type Nav = NativeStackNavigationProp<any>;

/** 结果报告页：专业版（区间+百分位+四维画像）/ 轻量版（星级+评语）；可从历史回看 */
export default function IqResultScreen() {
  const { colors } = useTheme();
  const navigation = useNavigation<Nav>();
  const route = useRoute<any>();
  const params = route.params as { resultId?: string } | undefined;
  const lastResult = useIqStore((s) => s.lastResult);
  const [record, setRecord] = useState<TestResult | null>(
    params?.resultId && lastResult?.id === params.resultId ? lastResult : null,
  );

  useEffect(() => {
    if (record || !params?.resultId) return;
    void loadResults().then((list) => {
      setRecord(list.find((r) => r.id === params.resultId) ?? null);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params?.resultId]);

  if (!record) {
    return (
      <View style={[styles.center, { backgroundColor: colors.background }]}>
        <Text style={{ color: colors.textSecondary }}>未找到该记录</Text>
      </View>
    );
  }

  const isChild = record.ageBand !== 'adult';
  const disclaimer = isChild ? DISCLAIMER_CHILD : DISCLAIMER_ADULT;
  const report = record.report;

  return (
    <ScrollView style={[styles.container, { backgroundColor: colors.background }]}>
      <Text style={[styles.meta, { color: colors.textMuted }]}>
        {MODE_LABELS[record.mode]} · {AGE_BAND_LABELS[record.ageBand]}
      </Text>

      {report.kind === 'pro' ? (
        <>
          <View style={[styles.heroCard, { backgroundColor: colors.surface }]}>
            <Text style={[styles.heroLabel, { color: colors.textSecondary }]}>IQ 估算区间（非诊断）</Text>
            <Text style={[styles.heroValue, { color: colors.text }]}>
              {report.total.iqLow} – {report.total.iqHigh}
            </Text>
            <Text style={[styles.heroSub, { color: colors.textSecondary }]}>
              百分位参考：约 {Math.round(report.total.percentile)}%
            </Text>
          </View>

          <Text style={[styles.blockTitle, { color: colors.text }]}>维度画像</Text>
          <ResultChart
            items={(['fluid', 'verbal', 'memory', 'speed'] as const).map((d) => ({
              label: SECTION_LABELS[d],
              value: report.dimensionIndices[d],
            }))}
          />
          {(['fluid', 'verbal', 'memory', 'speed'] as const).map((d) => (
            <Text key={d} style={[styles.comment, { color: colors.textSecondary }]}>
              {SECTION_LABELS[d]}：{dimensionComment(d, report.dimensionIndices[d])}
            </Text>
          ))}
          <Text style={[styles.totalComment, { color: colors.text }]}>
            {totalComment(report.total.estimate)}
          </Text>
        </>
      ) : (
        <>
          <View style={[styles.heroCard, { backgroundColor: colors.surface }]}>
            <Text style={[styles.heroLabel, { color: colors.textSecondary }]}>认知敏捷度</Text>
            <Text style={[styles.stars, { color: '#ffb020' }]}>
              {'★'.repeat(report.starLevel)}
              {'☆'.repeat(5 - report.starLevel)}
            </Text>
            <Text style={[styles.heroSub, { color: colors.textSecondary }]}>{report.summary}</Text>
          </View>
          <Text style={[styles.comment, { color: colors.textSecondary }]}>
            图形正确 {report.detail.matrixCorrect}/{report.detail.matrixTotal} · 速配净正确{' '}
            {Math.max(0, report.detail.speedCorrect - report.detail.speedWrong)}
          </Text>
        </>
      )}

      <View style={[styles.disclaimer, { borderColor: colors.border }]}>
        <Text style={{ color: colors.textMuted, fontSize: 12, lineHeight: 18 }}>{disclaimer}</Text>
      </View>

      <TouchableOpacity
        onPress={() => navigation.navigate('IqHome')}
        style={[styles.primaryBtn, { backgroundColor: '#30A46C' }]}>
        <Text style={{ color: '#fff', fontSize: 15, fontWeight: '600' }}>
          {report.kind === 'pro' ? '再测一次' : '挑战专业版'}
        </Text>
      </TouchableOpacity>
      <TouchableOpacity
        onPress={() => navigation.navigate('IqHistory')}
        style={{ alignItems: 'center', padding: 14 }}>
        <Text style={{ color: colors.textSecondary }}>查看历史记录</Text>
      </TouchableOpacity>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 16 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  meta: { fontSize: 13, marginBottom: 10 },
  heroCard: { borderRadius: 16, padding: 20, alignItems: 'center' },
  heroLabel: { fontSize: 13 },
  heroValue: { fontSize: 40, fontWeight: '700', marginTop: 6, fontVariant: ['tabular-nums'] },
  heroSub: { fontSize: 13, marginTop: 6 },
  stars: { fontSize: 34, marginTop: 8 },
  blockTitle: { fontSize: 15, fontWeight: '600', marginTop: 20, marginBottom: 12 },
  comment: { fontSize: 13, lineHeight: 20, marginTop: 6 },
  totalComment: { fontSize: 14, lineHeight: 22, marginTop: 14, fontWeight: '500' },
  disclaimer: { borderWidth: 1, borderRadius: 10, padding: 12, marginTop: 20 },
  primaryBtn: { marginTop: 18, borderRadius: 24, paddingVertical: 14, alignItems: 'center' },
});
