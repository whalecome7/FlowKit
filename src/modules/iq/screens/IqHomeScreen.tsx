import React, { useEffect, useState } from 'react';
import { ScrollView, View, Text, TouchableOpacity, StyleSheet, Alert } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useTheme } from '../../../theme';
import { useIqStore } from '../store';
import { AGE_BANDS } from '../types';
import type { AgeBand, TestMode } from '../types';
import { AGE_BAND_LABELS, CHILD_BAND_TIP, HOME_NOTE, MODE_LABELS } from '../services/texts';

type Nav = NativeStackNavigationProp<any>;

const MODES: { key: TestMode; icon: string; desc: string }[] = [
  { key: 'pro', icon: '🧠', desc: '约 30–35 分钟 · 图形推理/言语类比/数字记忆/符号检索 · 输出 IQ 估算区间与四维画像' },
  { key: 'light', icon: '⚡', desc: '约 5–8 分钟 · 图形规律 + 限时速配 · 星级评价' },
];

/** IQ 测试入口：选择模式与年龄档后开始 */
export default function IqHomeScreen() {
  const { colors } = useTheme();
  const navigation = useNavigation<Nav>();
  const start = useIqStore((s) => s.start);
  const [mode, setMode] = useState<TestMode | null>(null);
  const [band, setBand] = useState<AgeBand | null>(null);

  useEffect(() => {
    navigation.setOptions({
      headerRight: () => (
        <TouchableOpacity onPress={() => navigation.navigate('IqHistory')}>
          <Text style={{ color: colors.primary, fontSize: 14 }}>历史</Text>
        </TouchableOpacity>
      ),
    });
  }, [navigation, colors]);

  const onStart = () => {
    if (!mode || !band) return;
    const go = () => {
      start(mode, band);
      navigation.navigate('IqTest');
    };
    if (band === '6-8') {
      Alert.alert('家长提示', CHILD_BAND_TIP, [
        { text: '知道了', onPress: go },
      ]);
    } else {
      go();
    }
  };

  return (
    <ScrollView style={[styles.container, { backgroundColor: colors.background }]}>
      <Text style={[styles.title, { color: colors.text }]}>🧠 IQ 测试</Text>
      <Text style={[styles.subtitle, { color: colors.textSecondary }]}>
        认知能力自测参考 · 非医学诊断
      </Text>

      <Text style={[styles.section, { color: colors.text }]}>选择模式</Text>
      {MODES.map((m) => (
        <TouchableOpacity
          key={m.key}
          onPress={() => setMode(m.key)}
          style={[
            styles.card,
            {
              backgroundColor: colors.surface,
              borderColor: mode === m.key ? colors.primary : colors.border,
              borderWidth: mode === m.key ? 2 : 1,
            },
          ]}>
          <Text style={styles.icon}>{m.icon}</Text>
          <View style={{ flex: 1 }}>
            <Text style={[styles.cardTitle, { color: colors.text }]}>{MODE_LABELS[m.key]}</Text>
            <Text style={[styles.cardDesc, { color: colors.textSecondary }]}>{m.desc}</Text>
          </View>
        </TouchableOpacity>
      ))}

      <Text style={[styles.section, { color: colors.text }]}>选择年龄</Text>
      <View style={styles.bands}>
        {AGE_BANDS.map((b) => (
          <TouchableOpacity
            key={b}
            onPress={() => setBand(b)}
            style={[
              styles.band,
              {
                backgroundColor: band === b ? colors.primary : colors.surface,
                borderColor: band === b ? colors.primary : colors.border,
              },
            ]}>
            <Text style={{ color: band === b ? '#fff' : colors.text, fontSize: 13 }}>
              {AGE_BAND_LABELS[b]}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      <TouchableOpacity
        onPress={onStart}
        disabled={!mode || !band}
        style={[
          styles.startBtn,
          { backgroundColor: mode && band ? '#30A46C' : colors.surfaceAlt },
        ]}>
        <Text style={{ color: mode && band ? '#fff' : colors.textMuted, fontSize: 16, fontWeight: '600' }}>
          开始测试
        </Text>
      </TouchableOpacity>

      <Text style={[styles.note, { color: colors.textMuted }]}>{HOME_NOTE}</Text>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 16 },
  title: { fontSize: 22, fontWeight: '700', marginBottom: 4 },
  subtitle: { fontSize: 13, marginBottom: 16 },
  section: { fontSize: 15, fontWeight: '600', marginTop: 12, marginBottom: 8 },
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 14,
    padding: 16,
    marginBottom: 12,
  },
  icon: { fontSize: 30, marginRight: 14 },
  cardTitle: { fontSize: 16, fontWeight: '600' },
  cardDesc: { fontSize: 12, marginTop: 4, lineHeight: 18 },
  bands: { flexDirection: 'row', flexWrap: 'wrap' },
  band: {
    borderWidth: 1,
    borderRadius: 18,
    paddingHorizontal: 14,
    paddingVertical: 9,
    marginRight: 10,
    marginBottom: 10,
  },
  startBtn: {
    marginTop: 18,
    borderRadius: 24,
    paddingVertical: 15,
    alignItems: 'center',
  },
  note: { fontSize: 12, lineHeight: 18, marginTop: 20, marginBottom: 24 },
});
