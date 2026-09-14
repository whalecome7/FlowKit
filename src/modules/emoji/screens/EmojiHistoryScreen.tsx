import React, { useEffect } from 'react';
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  StyleSheet,
  Alert,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useTheme } from '../../../theme';
import { useEmojiStore } from '../store';
import type { HistoryItem } from '../types';

type Nav = NativeStackNavigationProp<any>;

function formatTime(ts: number): string {
  const d = new Date(ts);
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
}

/** 历史记录：点击回填主页重新生成，可删除单条或清空 */
export default function EmojiHistoryScreen() {
  const { colors } = useTheme();
  const navigation = useNavigation<Nav>();
  const { history, loadHistory, removeHistory, clearHistory } = useEmojiStore();

  useEffect(() => {
    loadHistory();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const onClear = () => {
    if (history.length === 0) return;
    Alert.alert('清空历史', '确定删除全部历史记录？', [
      { text: '取消', style: 'cancel' },
      { text: '清空', style: 'destructive', onPress: () => clearHistory() },
    ]);
  };

  const renderItem = ({ item }: { item: HistoryItem }) => (
    <TouchableOpacity
      style={[styles.card, { backgroundColor: colors.surface }]}
      activeOpacity={0.7}
      onPress={() =>
        // popTo：pop 掉历史页回到栈中已有的编辑器（不在栈中则替换当前页），
        // 使编辑页返回直达首页；popTo 参数为整体替换，必须始终带 text
        navigation.popTo('EmojiTranslator', { text: item.text })
      }>
      <View style={{ flex: 1 }}>
        <Text style={[styles.text, { color: colors.text }]} numberOfLines={2}>
          {item.text}
        </Text>
        <Text style={[styles.time, { color: colors.textMuted }]}>
          {formatTime(item.createdAt)}
        </Text>
      </View>
      <TouchableOpacity
        onPress={() => removeHistory(item.id)}
        hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
        <Text style={{ color: colors.textMuted, fontSize: 16 }}>✕</Text>
      </TouchableOpacity>
    </TouchableOpacity>
  );

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <FlatList
        data={history}
        keyExtractor={(item) => item.id}
        renderItem={renderItem}
        contentContainerStyle={styles.list}
        ListEmptyComponent={
          <Text style={[styles.empty, { color: colors.textMuted }]}>暂无历史记录</Text>
        }
      />
      {history.length > 0 && (
        <TouchableOpacity style={styles.clearBtn} onPress={onClear}>
          <Text style={{ color: '#d9534f', fontSize: 14 }}>清空全部</Text>
        </TouchableOpacity>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  list: { padding: 16 },
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 12,
    padding: 14,
    marginBottom: 10,
  },
  text: { fontSize: 15, fontWeight: '500' },
  time: { fontSize: 12, marginTop: 4 },
  empty: { textAlign: 'center', marginTop: 60, fontSize: 14 },
  clearBtn: { alignItems: 'center', paddingVertical: 14 },
});