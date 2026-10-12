import React, { useCallback, useEffect, useState } from 'react';
import { FlatList, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useTheme } from '../../../theme';
import { DIFFS, PALETTES } from '../constants';
import { loadMazeHistory, removeHistoryRecord } from '../services/storage';
import { useMazeStore } from '../store';
import type { HistoryRecord } from '../types';

export type MazeStackParamList = {
  MazeGame: { viewRecord?: HistoryRecord } | undefined;
  MazeHistory: undefined;
};

function fmtTime(ms: number): string {
  const total = Math.round(ms / 100) / 10; // 先量化到 0.1s，避免 59.95s 舍入出 "60.0"
  const m = Math.floor(total / 60);
  const s = total - m * 60;
  return `${String(m).padStart(2, '0')}:${s.toFixed(1).padStart(4, '0')}`;
}

function fmtDate(ts: number): string {
  const d = new Date(ts);
  return `${d.getMonth() + 1}/${d.getDate()} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

export default function MazeHistoryScreen() {
  const { colors } = useTheme();
  const navigation = useNavigation<NativeStackNavigationProp<MazeStackParamList>>();
  const history = useMazeStore((s) => s.history);
  const setHistory = useMazeStore((s) => s.setHistory);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    loadMazeHistory().then((list) => {
      setHistory(list);
      setLoaded(true);
    });
  }, [setHistory]);

  const onDelete = useCallback(
    (at: number) => {
      void removeHistoryRecord(at).then(setHistory).catch(() => {
        // 删除失败静默（存储异常）
      });
    },
    [setHistory],
  );

  return (
    <View style={[styles.root, { backgroundColor: colors.background }]}>
      <FlatList
        data={history}
        keyExtractor={(item) => String(item.at)}
        contentContainerStyle={styles.list}
        ListEmptyComponent={
          loaded ? (
            <Text style={[styles.empty, { color: colors.textMuted }]}>
              还没有通关记录{'\n'}通关后会自动出现在这里
            </Text>
          ) : null
        }
        renderItem={({ item }) => (
          <TouchableOpacity
            style={[styles.item, { backgroundColor: colors.surface }]}
            onPress={() => navigation.navigate('MazeGame', { viewRecord: item })}>
            <View style={[styles.badge, { backgroundColor: PALETTES[item.seed % PALETTES.length].wall }]}>
              <Text style={styles.badgeText}>{DIFFS[item.difficulty].label}</Text>
            </View>
            <View style={styles.main}>
              <Text style={[styles.mainTitle, { color: colors.text }]}>
                {fmtTime(item.timeMs)} · {item.steps} 步
              </Text>
              <Text style={[styles.mainSub, { color: colors.textSecondary }]}>
                种子 {item.seed} · {fmtDate(item.at)}
              </Text>
            </View>
            <TouchableOpacity
              onPress={() => onDelete(item.at)}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
              <Text style={[styles.del, { color: colors.textMuted }]}>×</Text>
            </TouchableOpacity>
          </TouchableOpacity>
        )}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  list: { padding: 16, gap: 10 },
  empty: { textAlign: 'center', marginTop: 60, fontSize: 14, lineHeight: 22 },
  item: { flexDirection: 'row', alignItems: 'center', gap: 10, borderRadius: 12, padding: 12 },
  badge: { borderRadius: 7, paddingHorizontal: 7, paddingVertical: 3 },
  badgeText: { color: '#fff', fontSize: 11, fontWeight: '700' },
  main: { flex: 1 },
  mainTitle: { fontSize: 13, fontWeight: '600', fontVariant: ['tabular-nums'] },
  mainSub: { fontSize: 12, marginTop: 2, fontVariant: ['tabular-nums'] },
  del: { fontSize: 18, paddingHorizontal: 4 },
});
