import React from 'react';
import { View, Text, TextInput, StyleSheet, TouchableOpacity } from 'react-native';
import type { TriggerAction } from '../types';
import { ACTION_META, getActionMeta } from '../types';

interface Props {
  action: TriggerAction;
  onChange: (action: TriggerAction) => void;
  onRemove: () => void;
}

export default function ActionEditor({ action, onChange, onRemove }: Props) {
  const meta = getActionMeta(action.type) ?? ACTION_META[0];

  return (
    <View style={styles.card}>
      <View style={styles.row}>
        <Text style={styles.label}>动作类型</Text>
        <TouchableOpacity onPress={onRemove} hitSlop={8}>
          <Text style={styles.remove}>✕</Text>
        </TouchableOpacity>
      </View>
      <View style={styles.typeRow}>
        {ACTION_META.map((m) => (
          <TouchableOpacity
            key={m.type}
            style={[styles.typeItem, action.type === m.type && styles.typeItemActive]}
            onPress={() => onChange({ type: m.type as TriggerAction['type'], params: {} })}>
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
            placeholderTextColor="#ccc"
            keyboardType={param.numeric ? 'numeric' : 'default'}
            autoCapitalize="none"
            autoCorrect={false}
          />
        </View>
      ))}
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
  label: {
    fontSize: 14,
    fontWeight: '600',
    color: '#555',
  },
  remove: {
    fontSize: 16,
    color: '#c62828',
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
    backgroundColor: '#f0f0f0',
  },
  typeItemActive: {
    backgroundColor: '#4a90d9',
  },
  typeText: {
    fontSize: 13,
    color: '#555',
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
    color: '#888',
    marginBottom: 4,
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
});
