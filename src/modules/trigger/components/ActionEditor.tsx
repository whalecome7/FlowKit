import React, { useMemo } from 'react';
import {
  View,
  Text,
  TextInput,
  StyleSheet,
  TouchableOpacity,
  Switch,
} from 'react-native';
import { useTheme } from '../../../theme';
import type { TriggerAction } from '../types';
import { ACTION_META, getActionMeta } from '../types';

interface Props {
  action: TriggerAction;
  onChange: (action: TriggerAction) => void;
  onRemove: () => void;
  /** 动作是否启用 */
  enabled: boolean;
  /** 切换启用状态 */
  onToggleEnabled: (v: boolean) => void;
  /** 是否显示删除按钮（Modal 内编辑时隐藏） */
  showDelete?: boolean;
}

export default function ActionEditor({
  action,
  onChange,
  onRemove,
  enabled,
  onToggleEnabled,
  showDelete = true,
}: Props) {
  const { colors } = useTheme();
  const meta = getActionMeta(action.type) ?? ACTION_META[0];
  const styles = useMemo(
    () =>
      StyleSheet.create({
        card: {
          backgroundColor: colors.surface,
          borderRadius: 12,
          padding: 14,
          marginBottom: 10,
        },
        row: {
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'space-between',
          marginBottom: 10,
        },
        switchRow: {
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'space-between',
          marginBottom: 10,
        },
        label: {
          fontSize: 14,
          fontWeight: '600',
          color: colors.textSecondary,
        },
        remove: {
          fontSize: 16,
          color: colors.danger,
          padding: 4,
        },
        typeRow: {
          flexDirection: 'row',
          flexWrap: 'wrap',
          gap: 8,
          marginBottom: 12,
        },
        typeItem: {
          paddingHorizontal: 12,
          paddingVertical: 6,
          borderRadius: 16,
          backgroundColor: colors.surfaceAlt,
        },
        typeItemActive: {
          backgroundColor: colors.primary,
        },
        typeText: {
          fontSize: 13,
          color: colors.textSecondary,
        },
        typeTextActive: {
          color: '#fff',
          fontWeight: '600',
        },
        paramRow: {
          marginBottom: 8,
        },
        paramLabel: {
          fontSize: 13,
          color: colors.textMuted,
          marginBottom: 4,
        },
        input: {
          backgroundColor: colors.surfaceAlt,
          borderRadius: 8,
          padding: 10,
          fontSize: 15,
          color: colors.text,
          borderWidth: 1,
          borderColor: colors.border,
        },
      }),
    [colors],
  );

  return (
    <View style={styles.card}>
      <View style={styles.switchRow}>
        <Text style={styles.label}>启用</Text>
        <Switch
          value={enabled}
          onValueChange={onToggleEnabled}
          trackColor={{ false: colors.border, true: colors.primary }}
          thumbColor={colors.primary}
        />
      </View>
      <View style={styles.row}>
        <Text style={styles.label}>动作类型</Text>
        {showDelete && (
          <TouchableOpacity onPress={onRemove} hitSlop={8}>
            <Text style={styles.remove}>✕</Text>
          </TouchableOpacity>
        )}
      </View>
      <View style={styles.typeRow}>
        {ACTION_META.map((m) => (
          <TouchableOpacity
            key={m.type}
            style={[styles.typeItem, action.type === m.type && styles.typeItemActive]}
            onPress={() => onChange({ type: m.type, params: {} })}>
            <Text
              style={[styles.typeText, action.type === m.type && styles.typeTextActive]}>
              {m.label}
            </Text>
          </TouchableOpacity>
        ))}
      </View>
      {meta.params.map((param) => (
        <View key={param.key} style={styles.paramRow}>
          <Text style={styles.paramLabel}>{param.label}</Text>
          <TextInput
            style={styles.input}
            value={action.params?.[param.key] != null ? String(action.params[param.key]) : ''}
            onChangeText={(text) =>
              onChange({
                ...action,
                params: {
                  ...action.params,
                  [param.key]: param.numeric
                    ? (Number(text) || 0)
                    : text,
                },
              })
            }
            placeholder={param.placeholder}
            placeholderTextColor={colors.textMuted}
            keyboardType={param.numeric ? 'numeric' : 'default'}
            autoCapitalize="none"
            autoCorrect={false}
          />
        </View>
      ))}
    </View>
  );
}
