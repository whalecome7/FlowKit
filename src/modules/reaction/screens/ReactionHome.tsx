import { View, Text, StyleSheet, ScrollView, TouchableOpacity } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useTheme } from '../../../theme';

const MODES = [
  { key: 'reaction', icon: '⚡', title: '经典反应', desc: '等信号变绿，最快点击', tip: '最基础的反应力' },
  { key: 'sequence', icon: '🎯', title: '序列反应', desc: '2×2 四格，随机一格高亮，点对应格', tip: '反应 + 视觉定位' },
  { key: 'tracking', icon: '🎮', title: '追踪反应', desc: '目标随机跳位，点击命中', tip: '反应 + 瞄准' },
] as const;

type ModeKey = (typeof MODES)[number]['key'];

/** 反应力测试：模式选择 */
export default function ReactionHome() {
  const { colors } = useTheme();
  const navigation = useNavigation<NativeStackNavigationProp<any>>();

  return (
    <ScrollView style={[styles.container, { backgroundColor: colors.background }]}>
      <Text style={[styles.title, { color: colors.text }]}>⚡ 反应力测试</Text>
      <Text style={[styles.subtitle, { color: colors.textSecondary }]}>
        原生级计时，结果最接近真实 · 每个模式 5 轮
      </Text>
      {MODES.map((m) => (
        <TouchableOpacity
          key={m.key}
          onPress={() => navigation.navigate('ReactionGame', { mode: m.key })}
          style={[styles.card, { backgroundColor: colors.surface }]}>
          <Text style={styles.icon}>{m.icon}</Text>
          <View style={{ flex: 1 }}>
            <Text style={[styles.cardTitle, { color: colors.text }]}>{m.title}</Text>
            <Text style={[styles.cardDesc, { color: colors.textSecondary }]}>{m.desc}</Text>
            <Text style={[styles.cardTip, { color: colors.textMuted }]}>{m.tip}</Text>
          </View>
          <Text style={{ color: colors.textMuted, fontSize: 20 }}>›</Text>
        </TouchableOpacity>
      ))}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 16 },
  title: { fontSize: 22, fontWeight: '700', marginBottom: 4 },
  subtitle: { fontSize: 13, marginBottom: 16 },
  card: { flexDirection: 'row', alignItems: 'center', borderRadius: 14, padding: 16, marginBottom: 12 },
  icon: { fontSize: 32, marginRight: 14 },
  cardTitle: { fontSize: 16, fontWeight: '600' },
  cardDesc: { fontSize: 13, marginTop: 2 },
  cardTip: { fontSize: 12, marginTop: 4 },
});
