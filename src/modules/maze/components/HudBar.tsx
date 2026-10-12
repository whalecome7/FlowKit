import React from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useTheme } from '../../../theme';
import { DIFF_ORDER, DIFFS, type Palette } from '../constants';
import type { MazeDifficulty } from '../types';

interface Props {
  difficulty: MazeDifficulty;
  seed: number;
  steps: number;
  timeText: string;
  bestText: string;
  palette: Palette;
  onPickDifficulty: (d: MazeDifficulty) => void;
  onPressSeed: () => void;
}

export default function HudBar({
  difficulty,
  seed,
  steps,
  timeText,
  bestText,
  palette,
  onPickDifficulty,
  onPressSeed,
}: Props) {
  const { colors } = useTheme();
  return (
    <View style={[styles.wrap, { backgroundColor: palette.bg }]}>
      <View style={styles.diffRow}>
        {DIFF_ORDER.map((key) => {
          const active = key === difficulty;
          return (
            <TouchableOpacity
              key={key}
              onPress={() => onPickDifficulty(key)}
              style={[
                styles.chip,
                { backgroundColor: active ? palette.wall : colors.surfaceAlt },
              ]}>
              <Text style={[styles.chipText, { color: active ? '#fff' : colors.textSecondary }]}>
                {DIFFS[key].label}
              </Text>
            </TouchableOpacity>
          );
        })}
      </View>
      <View style={styles.statsRow}>
        <TouchableOpacity onPress={onPressSeed} style={styles.stat}>
          <Text style={[styles.statText, { color: colors.textSecondary }]}>
            🌱 <Text style={{ color: colors.text }}>{seed}</Text>
          </Text>
        </TouchableOpacity>
        <View style={styles.stat}>
          <Text style={[styles.statText, { color: colors.textSecondary }]}>
            ⏱ <Text style={{ color: colors.text }}>{timeText}</Text>
          </Text>
        </View>
        <View style={styles.stat}>
          <Text style={[styles.statText, { color: colors.textSecondary }]}>
            👣 <Text style={{ color: colors.text }}>{steps}</Text>
          </Text>
        </View>
        <View style={styles.stat}>
          <Text style={[styles.statText, { color: colors.textSecondary }]}>
            🏆 <Text style={{ color: colors.text }}>{bestText}</Text>
          </Text>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { paddingHorizontal: 12, paddingTop: 8, paddingBottom: 6 },
  diffRow: { flexDirection: 'row', gap: 6, marginBottom: 8 },
  chip: { flex: 1, alignItems: 'center', paddingVertical: 6, borderRadius: 10 },
  chipText: { fontSize: 12.5, fontWeight: '600' },
  statsRow: { flexDirection: 'row', gap: 6 },
  stat: { flex: 1, alignItems: 'center', paddingVertical: 3, borderRadius: 8 },
  statText: { fontSize: 11.5, fontVariant: ['tabular-nums'] },
});
