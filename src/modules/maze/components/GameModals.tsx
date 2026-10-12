import React from 'react';
import { Modal, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useTheme } from '../../../theme';
import type { Palette } from '../constants';

interface WinModalProps {
  visible: boolean;
  timeText: string;
  steps: number;
  bestText: string;
  palette: Palette;
  onAgain: () => void;
  onNewMaze: () => void;
}

export function WinModal({ visible, timeText, steps, bestText, palette, onAgain, onNewMaze }: WinModalProps) {
  const { colors } = useTheme();
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onAgain}>
      <View style={styles.mask}>
        <View style={[styles.card, { backgroundColor: colors.surface }]}>
          <Text style={[styles.title, { color: colors.text }]}>🎉 通关！</Text>
          <Text style={[styles.time, { color: colors.text }]}>{timeText}</Text>
          <Text style={[styles.sub, { color: colors.textSecondary }]}>
            步数 {steps} · 最佳 {bestText}
          </Text>
          <View style={styles.row}>
            <TouchableOpacity style={[styles.btn, { backgroundColor: colors.surfaceAlt }]} onPress={onAgain}>
              <Text style={[styles.btnText, { color: colors.text }]}>再来一次</Text>
            </TouchableOpacity>
            <TouchableOpacity style={[styles.btn, { backgroundColor: palette.wall }]} onPress={onNewMaze}>
              <Text style={[styles.btnText, { color: '#fff' }]}>新迷宫</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  mask: { flex: 1, backgroundColor: 'rgba(35,28,60,0.38)', alignItems: 'center', justifyContent: 'center', padding: 24 },
  card: { width: '100%', maxWidth: 320, borderRadius: 20, padding: 22 },
  title: { fontSize: 17, fontWeight: '600', textAlign: 'center', marginBottom: 12 },
  time: { fontSize: 40, fontWeight: '800', textAlign: 'center', fontVariant: ['tabular-nums'] },
  sub: { fontSize: 13, textAlign: 'center', marginTop: 6, marginBottom: 18 },
  row: { flexDirection: 'row', gap: 10 },
  btn: { flex: 1, alignItems: 'center', paddingVertical: 12, borderRadius: 12 },
  btnText: { fontSize: 14, fontWeight: '600' },
});
