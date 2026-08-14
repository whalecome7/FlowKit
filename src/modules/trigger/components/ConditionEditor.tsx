import React, { useMemo } from 'react';
import { View, Text, TextInput, StyleSheet, TouchableOpacity } from 'react-native';
import { useTheme } from '../../../theme';
import type { TriggerCondition } from '../types';

const FIELDS: Array<{ value: TriggerCondition['field']; label: string }> = [
  { value: 'sender', label: '发件人' },
  { value: 'body', label: '正文' },
];

const MATCH_TYPES: Array<{ value: TriggerCondition['matchType']; label: string }> = [
  { value: 'contains', label: '包含' },
  { value: 'equals', label: '等于' },
  { value: 'regex', label: '正则' },
];

interface Props {
  condition: TriggerCondition;
  onChange: (condition: TriggerCondition) => void;
  onRemove: () => void;
}

function Segmented<T extends string>({
  options,
  value,
  onSelect,
}: {
  options: Array<{ value: T; label: string }>;
  value: T;
  onSelect: (v: T) => void;
}) {
  const { colors } = useTheme();
  const styles = useMemo(
    () =>
      StyleSheet.create({
        segRow: {
          flexDirection: 'row',
          flexWrap: 'wrap',
          gap: 8,
          marginBottom: 10,
        },
        segItem: {
          paddingHorizontal: 12,
          paddingVertical: 6,
          borderRadius: 16,
          backgroundColor: colors.surfaceAlt,
        },
        segItemActive: {
          backgroundColor: colors.primary,
        },
        segText: {
          fontSize: 13,
          color: colors.textSecondary,
        },
        segTextActive: {
          color: '#fff',
          fontWeight: '600',
        },
      }),
    [colors],
  );

  return (
    <View style={styles.segRow}>
      {options.map((opt) => (
        <TouchableOpacity
          key={opt.value}
          style={[styles.segItem, value === opt.value && styles.segItemActive]}
          onPress={() => onSelect(opt.value)}>
          <Text
            style={[styles.segText, value === opt.value && styles.segTextActive]}>
            {opt.label}
          </Text>
        </TouchableOpacity>
      ))}
    </View>
  );
}

export default function ConditionEditor({ condition, onChange, onRemove }: Props) {
  const { colors } = useTheme();
  const isRegex = condition.matchType === 'regex';
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
        input: {
          backgroundColor: colors.surfaceAlt,
          borderRadius: 8,
          padding: 10,
          fontSize: 15,
          color: colors.text,
          borderWidth: 1,
          borderColor: colors.border,
        },
        remove: {
          fontSize: 16,
          color: colors.danger,
          padding: 4,
        },
      }),
    [colors],
  );

  return (
    <View style={styles.card}>
      <View style={styles.row}>
        <Segmented
          options={FIELDS}
          value={condition.field}
          onSelect={(field) => onChange({ ...condition, field })}
        />
        <TouchableOpacity onPress={onRemove} hitSlop={8}>
          <Text style={styles.remove}>✕</Text>
        </TouchableOpacity>
      </View>
      <Segmented
        options={MATCH_TYPES}
        value={condition.matchType}
        onSelect={(matchType) => onChange({ ...condition, matchType })}
      />
      <TextInput
        style={styles.input}
        value={condition.value}
        onChangeText={(value) => onChange({ ...condition, value })}
        placeholder={isRegex ? '正则表达式，如 \\d{6}' : '匹配内容'}
        placeholderTextColor={colors.textMuted}
        autoCapitalize="none"
        autoCorrect={false}
      />
    </View>
  );
}
