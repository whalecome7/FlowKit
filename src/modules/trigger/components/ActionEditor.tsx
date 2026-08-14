import React, { useMemo } from 'react';
import {
  View,
  Text,
  TextInput,
  StyleSheet,
  TouchableOpacity,
  Switch,
  Alert,
  NativeModules,
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
        presetRow: {
          flexDirection: 'row',
          flexWrap: 'wrap',
          gap: 8,
          marginBottom: 8,
        },
        presetChip: {
          borderRadius: 14,
          paddingHorizontal: 10,
          paddingVertical: 5,
        },
        filePickButton: {
          backgroundColor: colors.surfaceAlt,
          borderRadius: 8,
          padding: 12,
          borderWidth: 1,
          borderColor: colors.border,
        },
        filePickText: {
          fontSize: 14,
          color: colors.primary,
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
      {meta.params.map((param) => {
        const current = action.params?.[param.key];
        const currentStr = current != null ? String(current) : '';
        // 文件选择器参数：渲染「选择文件」按钮，替代手动输入
        if (param.filePicker) {
          const pickFile = async () => {
            const module = NativeModules.FilePickerModule;
            if (!module) {
              Alert.alert('不可用', '当前平台不支持文件选择');
              return;
            }
            try {
              const res = await module.pickAudio();
              onChange({
                ...action,
                params: { ...action.params, [param.key]: res.uri },
              });
            } catch (err) {
              // 用户取消不提示；其他错误提示
              if (String((err as { code?: string })?.code ?? err) !== 'CANCELLED') {
                Alert.alert('选择文件失败', '请重试');
              }
            }
          };
          return (
            <View key={param.key} style={styles.paramRow}>
              <Text style={styles.paramLabel}>{param.label}</Text>
              <TouchableOpacity style={styles.filePickButton} onPress={pickFile}>
                <Text style={styles.filePickText}>
                  {currentStr ? `已选择：${currentStr.split('/').pop() || currentStr}` : '选择本地音频文件'}
                </Text>
              </TouchableOpacity>
              {currentStr ? (
                <TouchableOpacity
                  onPress={() =>
                    onChange({
                      ...action,
                      params: { ...action.params, [param.key]: '' },
                    })
                  }
                  style={{ marginTop: 4 }}>
                  <Text style={{ fontSize: 12, color: colors.danger }}>
                    清除（恢复系统默认铃声）
                  </Text>
                </TouchableOpacity>
              ) : (
                <Text style={{ fontSize: 12, color: colors.textMuted, marginTop: 4 }}>
                  可选：不选择则使用系统默认闹钟铃声
                </Text>
              )}
            </View>
          );
        }
        // 输入框显示条件：禁用手填的参数不显示；否则无预制选项、或值是「自定义」标记、或值不是任何内置预制值（自定义内容）时显示
        const showInput =
          !param.disableInput &&
          (!param.presets ||
            currentStr === 'custom' ||
            !param.presets.some((p) => p.value !== 'custom' && p.value === currentStr));
        return (
          <View key={param.key} style={styles.paramRow}>
            <Text style={styles.paramLabel}>{param.label}</Text>
            {param.presets && (
              <View style={styles.presetRow}>
                {param.presets.map((p) => {
                  const active = currentStr === p.value;
                  return (
                    <TouchableOpacity
                      key={p.label}
                      onPress={() =>
                        onChange({
                          ...action,
                          params: {
                            ...action.params,
                            // 「自定义」存字符串标记 custom；其余按类型存储
                            [param.key]:
                              p.value === 'custom'
                                ? 'custom'
                                : param.numeric
                                  ? Number(p.value)
                                  : p.value,
                          },
                        })
                      }
                      style={[
                        styles.presetChip,
                        { backgroundColor: active ? colors.primary : colors.surfaceAlt },
                      ]}>
                      <Text
                        style={{
                          fontSize: 12,
                          color: active ? '#fff' : colors.textSecondary,
                        }}>
                        {p.label}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
            )}
            {showInput && (
              <TextInput
                style={styles.input}
                value={currentStr === 'custom' ? '' : currentStr}
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
                placeholder={param.placeholder ?? '自定义输入'}
                placeholderTextColor={colors.textMuted}
                keyboardType={param.numeric ? 'numeric' : 'default'}
                autoCapitalize="none"
                autoCorrect={false}
              />
            )}
          </View>
        );
      })}
    </View>
  );
}
