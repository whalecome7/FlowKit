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

type RootStackParamList = {
  Home: undefined;
};

type HomeNavigationProp = NativeStackNavigationProp<RootStackParamList, 'Home'>;

export default function HomeScreen() {
  const navigation = useNavigation<HomeNavigationProp>();
  const { cycleMode, mode, colors } = useTheme();
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
      <TouchableOpacity
        onPress={cycleMode}
        style={{ padding: 8, alignSelf: 'flex-end', marginRight: 16 }}>
        <Text style={{ color: colors.primary, fontSize: 14 }}>
          {mode === 'light' ? '浅色' : mode === 'dark' ? '深色' : '自适应'}
        </Text>
      </TouchableOpacity>
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
