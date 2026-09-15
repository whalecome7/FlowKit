import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { useTheme } from '../../../theme';

interface Props {
  items: { label: string; value: number }[];
}

/** 维度条形画像：指数 60–140 映射为条宽（纯 View，不引图表库） */
export default function ResultChart({ items }: Props) {
  const { colors } = useTheme();
  return (
    <View>
      {items.map((item) => {
        const ratio = Math.min(1, Math.max(0.05, (item.value - 60) / 80));
        return (
          <View key={item.label} style={styles.row}>
            <Text style={[styles.label, { color: colors.textSecondary }]}>{item.label}</Text>
            <View style={[styles.track, { backgroundColor: colors.surfaceAlt }]}>
              <View style={[styles.bar, { width: `${ratio * 100}%`, backgroundColor: colors.primary }]} />
            </View>
            <Text style={[styles.value, { color: colors.text }]}>{item.value}</Text>
          </View>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', marginBottom: 10 },
  label: { width: 68, fontSize: 13 },
  track: { flex: 1, height: 10, borderRadius: 5, overflow: 'hidden' },
  bar: { height: 10, borderRadius: 5 },
  value: { width: 36, textAlign: 'right', fontSize: 13, fontVariant: ['tabular-nums'] },
});
