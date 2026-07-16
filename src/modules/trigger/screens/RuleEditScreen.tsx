import React, { useState } from 'react';
import {
  View,
  Text,
  TextInput,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Alert,
} from 'react-native';
import { useNavigation, useRoute } from '@react-navigation/native';
import type { RouteProp } from '@react-navigation/native';
import { useTriggerStore } from '../store';

type RouteParams = {
  TriggerRuleEdit: { ruleId?: string };
};

export default function RuleEditScreen() {
  const navigation = useNavigation();
  const route = useRoute<RouteProp<RouteParams, 'TriggerRuleEdit'>>();
  const { rules, addRule, updateRule } = useTriggerStore();

  const ruleId = route.params?.ruleId;
  const existingRule = ruleId ? rules.find((r) => r.id === ruleId) : undefined;
  const isEditing = !!existingRule;

  const [name, setName] = useState(existingRule?.name ?? '');

  const handleSave = async () => {
    if (!name.trim()) {
      Alert.alert('提示', '请输入规则名称');
      return;
    }

    try {
      if (isEditing && existingRule) {
        await updateRule(existingRule.id, { name: name.trim() });
      } else {
        await addRule({
          name: name.trim(),
          enabled: true,
          conditions: [],
          actions: [],
        });
      }
      navigation.goBack();
    } catch {
      Alert.alert('错误', '保存失败');
    }
  };

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <Text style={styles.sectionTitle}>规则名称</Text>
      <TextInput
        style={styles.input}
        value={name}
        onChangeText={setName}
        placeholder="例如：银行验证码"
        placeholderTextColor="#ccc"
      />

      <View style={styles.notice}>
        <Text style={styles.noticeText}>
          条件和动作配置将在后续版本中完善
        </Text>
      </View>

      <TouchableOpacity style={styles.saveButton} onPress={handleSave}>
        <Text style={styles.saveButtonText}>
          {isEditing ? '更新规则' : '创建规则'}
        </Text>
      </TouchableOpacity>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f5f5f5' },
  content: { padding: 16 },
  sectionTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: '#888',
    marginBottom: 8,
    marginTop: 8,
  },
  input: {
    backgroundColor: '#fff',
    borderRadius: 10,
    padding: 14,
    fontSize: 16,
    color: '#1a1a1a',
    borderWidth: 1,
    borderColor: '#e0e0e0',
  },
  notice: {
    backgroundColor: '#e8f4fd',
    borderRadius: 8,
    padding: 12,
    marginTop: 20,
  },
  noticeText: { fontSize: 14, color: '#4a90d9' },
  saveButton: {
    backgroundColor: '#4a90d9',
    borderRadius: 10,
    padding: 16,
    alignItems: 'center',
    marginTop: 24,
  },
  saveButtonText: { color: '#fff', fontSize: 16, fontWeight: '600' },
});
