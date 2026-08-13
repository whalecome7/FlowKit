import React from 'react';
import { View, Text, TextInput, StyleSheet, TouchableOpacity } from 'react-native';
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
  const isRegex = condition.matchType === 'regex';
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
        placeholderTextColor="#ccc"
        autoCapitalize="none"
        autoCorrect={false}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: '#fff',
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
    backgroundColor: '#f0f0f0',
  },
  segItemActive: {
    backgroundColor: '#4a90d9',
  },
  segText: {
    fontSize: 13,
    color: '#555',
  },
  segTextActive: {
    color: '#fff',
    fontWeight: '600',
  },
  input: {
    backgroundColor: '#f7f7f7',
    borderRadius: 8,
    padding: 10,
    fontSize: 15,
    color: '#1a1a1a',
    borderWidth: 1,
    borderColor: '#e0e0e0',
  },
  remove: {
    fontSize: 16,
    color: '#c62828',
    padding: 4,
  },
});
