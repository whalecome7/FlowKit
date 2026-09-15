import React, { useCallback, useEffect, useState } from 'react';
import { View, Text, FlatList, TouchableOpacity, StyleSheet, Alert } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useTheme } from '../../../theme';
import { clearResults, loadResults, removeResult } from '../services/resultStorage';
import { AGE_BAND_LABELS, MODE_LABELS } from '../services/texts';
import type { TestResult } from '../types';

type Nav = NativeStackNavigationProp<any>;

function formatTime(ts: number): string {
  const d = new Date(ts);
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
}

/** 结果摘要文案（专业版区间 / 轻量版星级） */
function summaryOf(r: TestResult): string {
  return r.report.kind === 'pro'
    ? `${r.report.total.iqLow}–${r.report.total.iqHigh}`
    : `${'★'.repeat(r.report.starLevel)}${'☆'.repeat(5 - r.report.starLevel)}`;
}

/** 同模式同年龄档、更早一条的差值指示（↑/↓/→） */
function deltaOf(list: TestResult[], index: number): string {
  const current = list[index];
  const prev = list.slice(index + 1).find(
    (r) => r.mode === current.mode && r.ageBand === current.ageBand,
  );
  if (!prev) return '';
  const value = (r: TestResult) =>
    r.report.kind === 'pro' ? r.report.total.estimate : r.report.starLevel * 10;
  const diff = value(current) - value(prev);
  return diff > 0 ? ' ↑' : diff < 0 ? ' ↓' : ' →';
}

/** 历史记录：结果列表（同档对比）、回看报告、删除/清空 */
export default function IqHistoryScreen() {
  const { colors } = useTheme();
  const navigation = useNavigation<Nav>();
  const [list, setList] = useState<TestResult[]>([]);

  const refresh = useCallback(() => {
    void loadResults().then(setList);
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const onClear = () => {
    if (list.length === 0) return;
    Alert.alert('清空记录', '确定删除全部测试记录？', [
      { text: '取消', style: 'cancel' },
      {
        text: '清空',
        style: 'destructive',
        onPress: () => {
          void clearResults().then(refresh);
        },
      },
    ]);
  };

  const renderItem = ({ item, index }: { item: TestResult; index: number }) => (
    <TouchableOpacity
      style={[styles.card, { backgroundColor: colors.surface }]}
      activeOpacity={0.7}
      onPress={() => navigation.navigate('IqResult', { resultId: item.id })}>
      <View style={{ flex: 1 }}>
        <Text style={[styles.value, { color: colors.text }]}>
          {summaryOf(item)}
          <Text style={{ color: item.report.kind === 'pro' ? colors.textSecondary : '#ffb020' }}>
            {deltaOf(list, index)}
          </Text>
        </Text>
        <Text style={[styles.meta, { color: colors.textMuted }]}>
          {MODE_LABELS[item.mode]} · {AGE_BAND_LABELS[item.ageBand]} · {formatTime(item.createdAt)}
        </Text>
      </View>
      <TouchableOpacity
        onPress={() => {
          void removeResult(item.id).then(setList);
        }}
        hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
        <Text style={{ color: colors.textMuted, fontSize: 16 }}>✕</Text>
      </TouchableOpacity>
    </TouchableOpacity>
  );

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <FlatList
        data={list}
        keyExtractor={(item) => item.id}
        renderItem={renderItem}
        contentContainerStyle={styles.listContent}
        ListEmptyComponent={
          <Text style={[styles.empty, { color: colors.textMuted }]}>暂无测试记录</Text>
        }
      />
      {list.length > 0 && (
        <TouchableOpacity style={styles.clearBtn} onPress={onClear}>
          <Text style={{ color: '#d9534f', fontSize: 14 }}>清空全部</Text>
        </TouchableOpacity>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  listContent: { padding: 16 },
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 12,
    padding: 14,
    marginBottom: 10,
  },
  value: { fontSize: 18, fontWeight: '600', fontVariant: ['tabular-nums'] },
  meta: { fontSize: 12, marginTop: 4 },
  empty: { textAlign: 'center', marginTop: 60, fontSize: 14 },
  clearBtn: { alignItems: 'center', paddingVertical: 14 },
});
