import React, { useMemo } from 'react';
import {
  View,
  Text,
  FlatList,
  StyleSheet,
  TouchableOpacity,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { moduleRegistry } from '../module-registry';
import { useTheme } from '../../theme';
import type { ThemeMode } from '../../theme';

type RootStackParamList = {
  Home: undefined;
};

type HomeNavigationProp = NativeStackNavigationProp<RootStackParamList, 'Home'>;

const THEME_OPTIONS: { key: ThemeMode; label: string }[] = [
  { key: 'light', label: '浅色' },
  { key: 'dark', label: '深色' },
  { key: 'system', label: '自适应' },
];

export default function HomeScreen() {
  const navigation = useNavigation<HomeNavigationProp>();
  const { mode, setMode, colors } = useTheme();
  const modules = moduleRegistry.getEnabledModules();

  const styles = useMemo(
    () =>
      StyleSheet.create({
        container: {
          flex: 1,
          backgroundColor: colors.background,
          paddingTop: 60,
        },
        title: {
          fontSize: 28,
          fontWeight: '700',
          textAlign: 'center',
          color: colors.text,
        },
        subtitle: {
          fontSize: 14,
          textAlign: 'center',
          color: colors.textMuted,
          marginTop: 4,
          marginBottom: 24,
        },
        list: {
          paddingHorizontal: 16,
        },
        card: {
          backgroundColor: colors.surface,
          borderRadius: 12,
          padding: 20,
          marginBottom: 12,
          shadowColor: '#000',
          shadowOffset: { width: 0, height: 1 },
          shadowOpacity: 0.08,
          shadowRadius: 4,
          elevation: 2,
        },
        cardTitle: {
          fontSize: 17,
          fontWeight: '600',
          color: colors.text,
        },
        empty: {
          textAlign: 'center',
          color: colors.textMuted,
          fontSize: 15,
          marginTop: 40,
        },
      }),
    [colors],
  );

  return (
    <View style={styles.container}>
      {/* 主题切换：分段选择器 */}
      <View
        style={{
          flexDirection: 'row',
          alignSelf: 'flex-end',
          marginRight: 16,
          marginTop: 8,
          backgroundColor: colors.surfaceAlt,
          borderRadius: 18,
          padding: 3,
        }}>
        {THEME_OPTIONS.map((opt) => {
          const active = mode === opt.key;
          return (
            <TouchableOpacity
              key={opt.key}
              onPress={() => setMode(opt.key)}
              style={{
                paddingHorizontal: 12,
                paddingVertical: 5,
                borderRadius: 15,
                backgroundColor: active ? colors.primary : 'transparent',
              }}>
              <Text
                style={{
                  fontSize: 12,
                  color: active ? '#fff' : colors.textSecondary,
                }}>
                {opt.label}
              </Text>
            </TouchableOpacity>
          );
        })}
      </View>
      <Text style={styles.title}>FlowKit</Text>
      <Text style={styles.subtitle}>流光 · 日常工具集</Text>
      <FlatList
        data={modules}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.list}
        renderItem={({ item }) => (
          <TouchableOpacity
            style={styles.card}
            activeOpacity={0.7}
            onPress={() => {
              navigation.navigate(item.homeRoute as never);
            }}>
            <Text style={styles.cardTitle}>{item.name}</Text>
          </TouchableOpacity>
        )}
        ListEmptyComponent={
          <Text style={styles.empty}>暂无可用模块</Text>
        }
      />
    </View>
  );
}
