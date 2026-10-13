import React from 'react';
import { Modal, Share, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
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

interface SeedModalProps {
  visible: boolean;
  seed: number;
  palette: Palette;
  onClose: () => void;
  onGenerate: (seed: number) => void;
}

export function SeedModal({ visible, seed, palette, onClose, onGenerate }: SeedModalProps) {
  const { colors } = useTheme();
  const [input, setInput] = React.useState(String(seed));
  React.useEffect(() => {
    if (visible) setInput(String(seed));
  }, [visible, seed]);
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.mask}>
        <View style={[styles.card, { backgroundColor: colors.surface }]}>
          <Text style={[styles.title, { color: colors.text }]}>🌱 随机种子</Text>
          <TextInput
            value={input}
            onChangeText={setInput}
            keyboardType="number-pad"
            maxLength={8}
            style={[styles.seedInput, { color: colors.text, borderColor: colors.border }]}
          />
          <View style={styles.row}>
            <TouchableOpacity
              style={[styles.btn, { backgroundColor: colors.surfaceAlt }]}
              onPress={() => setInput(String(1000000 + Math.floor(Math.random() * 9000000)))}>
              <Text style={[styles.btnText, { color: colors.text }]}>随机</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.btn, { backgroundColor: colors.surfaceAlt }]}
              onPress={() => {
                void Share.share({ message: `迷境迷宫种子：${seed}` }).catch(() => {
                  // 分享失败静默
                });
              }}>
              <Text style={[styles.btnText, { color: colors.text }]}>分享</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.btn, { backgroundColor: palette.wall }]}
              onPress={() => {
                if (/^\d{6,8}$/.test(input)) onGenerate(parseInt(input, 10));
              }}>
              <Text style={[styles.btnText, { color: '#fff' }]}>生成</Text>
            </TouchableOpacity>
          </View>
          <TouchableOpacity
            style={[styles.btn, styles.fullBtn, { backgroundColor: colors.surfaceAlt }]}
            onPress={onClose}>
            <Text style={[styles.btnText, { color: colors.text }]}>取消</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
}

interface ViewBannerProps {
  visible: boolean;
  text: string;
  pathShown: boolean;
  palette: Palette;
  onTogglePath: () => void;
  onRechallenge: () => void;
  onClose: () => void;
}

export function ViewBanner({ visible, text, pathShown, palette, onTogglePath, onRechallenge, onClose }: ViewBannerProps) {
  if (!visible) return null;
  return (
    <View style={styles.banner} pointerEvents="box-none">
      <Text style={styles.bannerText}>{text}</Text>
      <View style={styles.bannerRow}>
        <TouchableOpacity style={styles.bannerBtn} onPress={onTogglePath}>
          <Text style={styles.bannerBtnText}>{pathShown ? '🙈 隐藏路径' : '📏 最短路径'}</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.bannerBtn, { backgroundColor: palette.wallDark }]}
          onPress={onRechallenge}>
          <Text style={styles.bannerBtnText}>重新挑战</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.bannerBtn} onPress={onClose}>
          <Text style={styles.bannerBtnText}>关闭</Text>
        </TouchableOpacity>
      </View>
    </View>
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
  seedInput: {
    borderWidth: 2,
    borderRadius: 12,
    padding: 12,
    fontSize: 18,
    textAlign: 'center',
    letterSpacing: 2,
    marginBottom: 14,
    fontVariant: ['tabular-nums'],
  },
  fullBtn: { marginTop: 10 },
  banner: {
    position: 'absolute',
    left: 12,
    right: 12,
    bottom: 10,
    backgroundColor: 'rgba(255,248,225,0.96)',
    borderColor: '#f2ddab',
    borderWidth: 1,
    borderRadius: 12,
    padding: 10,
    gap: 8,
    zIndex: 50,
  },
  bannerText: { color: '#7a5c10', fontSize: 12 },
  bannerRow: { flexDirection: 'row', gap: 6 },
  bannerBtn: {
    flex: 1,
    alignItems: 'center',
    backgroundColor: '#7a5c10',
    borderRadius: 8,
    paddingVertical: 6,
  },
  bannerBtnText: { color: '#fff', fontSize: 11, fontWeight: '600' },
});
